/**
 * Competitor Relevance Processor
 *
 * BullMQ worker that analyzes competitor relevance using AI.
 * For each company in the system:
 *   1. Get company profile (CNAEs, services, keywords)
 *   2. Get top 50 competitors from competitors table
 *   3. Get shared tender objects for context
 *   4. Call AI relevance engine in batches of 5
 *   5. Upsert results into competitor_relevance table
 *
 * Runs every 4 hours. Skips companies analyzed in last 24h.
 * Processes max 3 companies per job run.
 */

import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { CompetitorRelevanceJobData } from '../queues/competitor-relevance.queue'
import {
  analyzeCompetitorRelevanceBatch,
  type CompanyProfile,
  type CompetitorProfile,
} from '../ai/competitor-relevance'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const MAX_COMPANIES_PER_RUN = 3
const MAX_COMPETITORS_PER_COMPANY = 50
const SKIP_IF_ANALYZED_WITHIN_MS = 24 * 60 * 60 * 1000 // 24 hours

async function processCompetitorRelevance(job: Job<CompetitorRelevanceJobData>) {
  const startTime = Date.now()
  logger.info('Starting competitor relevance analysis')

  // 1. Get all companies
  const { data: companies, error: compError } = await supabase
    .from('companies')
    .select('id, razao_social, cnae_principal, cnaes_secundarios, descricao_servicos, palavras_chave')

  if (compError || !companies || companies.length === 0) {
    logger.info({ error: compError }, 'No companies found for relevance analysis')
    return
  }

  let companiesProcessed = 0

  for (const company of companies) {
    if (companiesProcessed >= MAX_COMPANIES_PER_RUN) {
      logger.info({ companiesProcessed }, 'Reached max companies per run, stopping')
      break
    }

    // 2. Check if already analyzed recently
    const { data: recentAnalysis } = await supabase
      .from('competitor_relevance')
      .select('analyzed_at')
      .eq('company_id', company.id)
      .order('analyzed_at', { ascending: false })
      .limit(1)

    if (recentAnalysis?.[0]?.analyzed_at) {
      const lastAnalyzed = new Date(recentAnalysis[0].analyzed_at).getTime()
      if (Date.now() - lastAnalyzed < SKIP_IF_ANALYZED_WITHIN_MS) {
        logger.info(
          { companyId: company.id, lastAnalyzed: recentAnalysis[0].analyzed_at },
          'Company recently analyzed, skipping',
        )
        continue
      }
    }

    try {
      await analyzeCompanyCompetitors(company)
      companiesProcessed++
      await job.updateProgress(companiesProcessed)
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 429 || status === 503) {
        logger.warn({ companyId: company.id, status }, 'Rate limited during relevance analysis, will retry later')
        throw err // Let BullMQ retry
      }
      logger.error({ companyId: company.id, err }, 'Failed to analyze company competitors, continuing')
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  logger.info(
    { companiesProcessed, elapsedSeconds: elapsed },
    'Competitor relevance analysis job completed',
  )
}

async function analyzeCompanyCompetitors(company: {
  id: string
  razao_social: string | null
  cnae_principal: string | null
  cnaes_secundarios: string[] | null
  descricao_servicos: string | null
  palavras_chave: string[] | null
}) {
  const companyId = company.id

  // 3. Get top competitors by participation count (from competitor_stats joined with competitors)
  // We need competitors that appeared in the same tenders as this company
  const { data: competitors, error: compError } = await supabase
    .from('competitors')
    .select('cnpj, tender_id')
    .eq('company_id', companyId)
    .not('cnpj', 'is', null)

  if (compError || !competitors || competitors.length === 0) {
    logger.info({ companyId }, 'No competitors found for company')
    return
  }

  // Count occurrences per CNPJ and track tender IDs
  const cnpjCounts = new Map<string, { count: number; tenderIds: string[] }>()
  for (const c of competitors) {
    if (!c.cnpj) continue
    const existing = cnpjCounts.get(c.cnpj) || { count: 0, tenderIds: [] }
    existing.count++
    if (existing.tenderIds.length < 10) {
      existing.tenderIds.push(c.tender_id)
    }
    cnpjCounts.set(c.cnpj, existing)
  }

  // Sort by count descending, take top N
  const topCnpjs = [...cnpjCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_COMPETITORS_PER_COMPANY)

  if (topCnpjs.length === 0) {
    logger.info({ companyId }, 'No unique competitor CNPJs found')
    return
  }

  // 4. Get competitor profiles from competitor_stats
  const cnpjList = topCnpjs.map(([cnpj]) => cnpj)
  const { data: competitorStats } = await supabase
    .from('competitor_stats')
    .select('cnpj, razao_social, cnae_codigo, cnae_nome, porte, uf')
    .in('cnpj', cnpjList)

  const statsMap = new Map((competitorStats || []).map((s) => [s.cnpj, s]))

  // Build competitor profiles
  const competitorProfiles: CompetitorProfile[] = topCnpjs.map(([cnpj]) => {
    const stats = statsMap.get(cnpj)
    return {
      cnpj,
      razao_social: stats?.razao_social || null,
      cnae_codigo: stats?.cnae_codigo ? String(stats.cnae_codigo) : null,
      cnae_nome: stats?.cnae_nome || null,
      porte: stats?.porte || null,
      uf: stats?.uf || null,
    }
  })

  // 5. Get shared tender objects for context
  const allTenderIds = new Set<string>()
  for (const [, data] of topCnpjs) {
    for (const tid of data.tenderIds) {
      allTenderIds.add(tid)
    }
  }

  const tenderIdList = [...allTenderIds].slice(0, 200)
  const { data: tenders } = await supabase
    .from('tenders')
    .select('id, objeto')
    .in('id', tenderIdList)

  const tenderObjectMap = new Map((tenders || []).map((t) => [t.id, t.objeto || '']))

  // Build map: cnpj -> shared tender objects
  const sharedTenderObjectsMap: Record<string, string[]> = {}
  for (const [cnpj, data] of topCnpjs) {
    sharedTenderObjectsMap[cnpj] = data.tenderIds
      .map((tid) => tenderObjectMap.get(tid) || '')
      .filter((o) => o.length > 0)
  }

  // 6. Call AI engine
  const companyProfile: CompanyProfile = {
    razao_social: company.razao_social,
    cnae_principal: company.cnae_principal,
    cnaes_secundarios: company.cnaes_secundarios,
    descricao_servicos: company.descricao_servicos,
    palavras_chave: company.palavras_chave,
  }

  logger.info(
    { companyId, competitorCount: competitorProfiles.length },
    'Analyzing competitor relevance with AI',
  )

  const results = await analyzeCompetitorRelevanceBatch({
    companyProfile,
    competitors: competitorProfiles,
    sharedTenderObjectsMap,
  })

  // 7. Upsert results into competitor_relevance table
  let upserted = 0
  for (const result of results) {
    const competitorData = topCnpjs.find(([cnpj]) => cnpj === result.cnpj)
    const sharedCount = competitorData ? competitorData[1].count : 0
    const sharedObjects = (sharedTenderObjectsMap[result.cnpj] || []).slice(0, 5)
    const stats = statsMap.get(result.cnpj)

    const { error: upsertError } = await supabase
      .from('competitor_relevance')
      .upsert(
        {
          company_id: companyId,
          competitor_cnpj: result.cnpj,
          competitor_nome: stats?.razao_social || null,
          relevance_score: result.relevance_score,
          relationship_type: result.relationship_type,
          reason: result.reason,
          shared_tender_count: sharedCount,
          shared_tender_objects: sharedObjects,
          analyzed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,competitor_cnpj' },
      )

    if (upsertError) {
      logger.error(
        { companyId, cnpj: result.cnpj, error: upsertError },
        'Failed to upsert competitor relevance',
      )
    } else {
      upserted++
    }
  }

  logger.info(
    {
      companyId,
      totalCompetitors: competitorProfiles.length,
      upserted,
      directCount: results.filter((r) => r.relationship_type === 'concorrente_direto').length,
      indirectCount: results.filter((r) => r.relationship_type === 'concorrente_indireto').length,
      partnerCount: results.filter((r) => r.relationship_type === 'potencial_parceiro').length,
      irrelevantCount: results.filter((r) => r.relationship_type === 'irrelevante').length,
    },
    'Competitor relevance analysis complete for company',
  )
}

export const competitorRelevanceWorker = new Worker<CompetitorRelevanceJobData>(
  'competitor-relevance',
  processCompetitorRelevance,
  {
    connection,
    concurrency: 1,
    stalledInterval: 600_000,
    lockDuration: 600_000,
  },
)

competitorRelevanceWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Competitor relevance job completed')
})

competitorRelevanceWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Competitor relevance job failed')
})
