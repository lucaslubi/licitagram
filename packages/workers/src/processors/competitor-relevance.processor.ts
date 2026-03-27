/**
 * Competitor Relevance Processor
 *
 * BullMQ worker that analyzes competitor relevance using AI.
 * For each company in the system:
 *   1. Get company profile (CNAEs, services, keywords)
 *   2. Get top 100 competitors from competitors table
 *   3. Discover additional competitors via CNAE overlap
 *   4. Get shared tender objects for context
 *   5. Call AI relevance engine in batches of 8 (with retry)
 *   6. Upsert results into competitor_relevance table
 *
 * Runs every 4 hours. Skips companies analyzed in last 12h.
 * Processes max 5 companies per job run.
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

const MAX_COMPANIES_PER_RUN = 5
const MAX_COMPETITORS_PER_COMPANY = 100
const SKIP_IF_ANALYZED_WITHIN_MS = 12 * 60 * 60 * 1000 // 12 hours

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

/**
 * Discover additional competitors via CNAE division overlap.
 * Finds companies in the same CNAE divisions (first 2 digits) that may not
 * have appeared in the same tenders yet.
 */
async function discoverCompetitorsByCNAE(
  company: {
    id: string
    cnae_principal: string | null
    cnaes_secundarios: string[] | null
  },
  existingCnpjs: Set<string>,
): Promise<Array<{ cnpj: string; razao_social: string | null; cnae_divisao: string | null }>> {
  // Extract CNAE groups (first 4 digits) for precise competitor matching
  // Falls back to divisions (2 digits) only if 4-digit data is unavailable
  const cnaeGrupos = new Set<string>()
  const cnaeDivisoes = new Set<string>()

  if (company.cnae_principal && company.cnae_principal.length >= 4) {
    cnaeGrupos.add(company.cnae_principal.substring(0, 4))
    cnaeDivisoes.add(company.cnae_principal.substring(0, 2))
  } else if (company.cnae_principal && company.cnae_principal.length >= 2) {
    cnaeDivisoes.add(company.cnae_principal.substring(0, 2))
  }

  if (company.cnaes_secundarios) {
    for (const cnae of company.cnaes_secundarios) {
      if (cnae && cnae.length >= 4) {
        cnaeGrupos.add(cnae.substring(0, 4))
        cnaeDivisoes.add(cnae.substring(0, 2))
      } else if (cnae && cnae.length >= 2) {
        cnaeDivisoes.add(cnae.substring(0, 2))
      }
    }
  }

  if (cnaeGrupos.size === 0 && cnaeDivisoes.size === 0) {
    return []
  }

  const allCnaeCompetitors: Array<{ cnpj: string; razao_social: string | null; cnae_divisao: string | null }> = []

  // First: try 4-digit CNAE group matching (most precise)
  if (cnaeGrupos.size > 0) {
    const grupoList = [...cnaeGrupos]
    for (const grupo of grupoList) {
      const { data, error } = await supabase
        .from('competitor_stats')
        .select('cnpj, razao_social, cnae_divisao')
        .eq('cnae_grupo', grupo)
        .order('total_participacoes', { ascending: false })
        .limit(50)

      if (!error && data) {
        for (const row of data) {
          if (row.cnpj && !existingCnpjs.has(row.cnpj)) {
            allCnaeCompetitors.push(row)
          }
        }
      }
    }
  }

  // If 4-digit match found enough competitors, skip 2-digit fallback
  if (allCnaeCompetitors.length < 10) {
    const divisaoList = [...cnaeDivisoes]
    for (const divisao of divisaoList) {
      const { data, error } = await supabase
        .from('competitor_stats')
        .select('cnpj, razao_social, cnae_divisao')
        .eq('cnae_divisao', divisao)
        .order('total_participacoes', { ascending: false })
        .limit(50)

      if (!error && data) {
        for (const row of data) {
          if (row.cnpj && !existingCnpjs.has(row.cnpj)) {
            allCnaeCompetitors.push(row)
          }
        }
      }
    }
  }

  // Deduplicate by cnpj and take top 30
  const seen = new Set<string>()
  const unique: typeof allCnaeCompetitors = []
  for (const c of allCnaeCompetitors) {
    if (!seen.has(c.cnpj)) {
      seen.add(c.cnpj)
      unique.push(c)
    }
    if (unique.length >= 30) break
  }

  return unique
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

  // 3. Find competitors that appeared in the same tenders as this company
  // Step A: Get tender IDs this company was matched to (ordered by most recent first)
  const { data: companyMatches, error: matchError } = await supabase
    .from('matches')
    .select('tender_id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (matchError || !companyMatches || companyMatches.length === 0) {
    logger.info({ companyId }, 'No matches found for company, skipping relevance analysis')
    return
  }

  const companyTenderIds = [...new Set(companyMatches.map(m => m.tender_id))]

  // Step B: Get all competitors that participated in those same tenders
  // Paginate to handle large result sets
  let allCompetitors: Array<{ cnpj: string; tender_id: string }> = []
  const BATCH_SIZE = 100
  for (let i = 0; i < companyTenderIds.length; i += BATCH_SIZE) {
    const batch = companyTenderIds.slice(i, i + BATCH_SIZE)
    const { data: batchCompetitors, error: batchErr } = await supabase
      .from('competitors')
      .select('cnpj, tender_id')
      .in('tender_id', batch)
      .not('cnpj', 'is', null)

    if (!batchErr && batchCompetitors) {
      allCompetitors = allCompetitors.concat(batchCompetitors)
    }
  }

  const competitors = allCompetitors
  if (competitors.length === 0) {
    logger.info({ companyId, tenderCount: companyTenderIds.length }, 'No competitors found in company tenders')
    return
  }

  logger.info({ companyId, tenderCount: companyTenderIds.length, competitorRows: competitors.length }, 'Found competitors for relevance analysis')

  // Count occurrences per CNPJ and track tender IDs
  const cnpjCounts = new Map<string, { count: number; tenderIds: string[] }>()
  for (const c of competitors) {
    if (!c.cnpj) continue
    const existing = cnpjCounts.get(c.cnpj) || { count: 0, tenderIds: [] }
    existing.count++
    if (existing.tenderIds.length < 20) {
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

  // Discover additional competitors via CNAE overlap
  const existingCnpjSet = new Set(topCnpjs.map(([cnpj]) => cnpj))
  const cnaeDiscoveries = await discoverCompetitorsByCNAE(company, existingCnpjSet)

  if (cnaeDiscoveries.length > 0) {
    logger.info(
      { companyId, cnaeDiscoveryCount: cnaeDiscoveries.length },
      'Discovered additional competitors via CNAE overlap',
    )
    // Add CNAE discoveries to the topCnpjs list with count 0
    for (const discovery of cnaeDiscoveries) {
      topCnpjs.push([discovery.cnpj, { count: 0, tenderIds: [] }])
    }
  }

  // 4. Get competitor profiles from competitor_stats + competitors table
  const cnpjList = topCnpjs.map(([cnpj]) => cnpj)
  const { data: competitorStats } = await supabase
    .from('competitor_stats')
    .select('cnpj, razao_social, cnae_divisao, cnae_grupo, porte, uf')
    .in('cnpj', cnpjList)

  // Also get CNAE details from competitors table (has cnae_codigo and cnae_nome)
  const { data: competitorDetails } = await supabase
    .from('competitors')
    .select('cnpj, cnae_codigo, cnae_nome')
    .in('cnpj', cnpjList)
    .not('cnae_codigo', 'is', null)

  const detailsMap = new Map<string, { cnae_codigo: string; cnae_nome: string }>()
  for (const d of (competitorDetails || [])) {
    if (d.cnpj && !detailsMap.has(d.cnpj)) {
      detailsMap.set(d.cnpj, { cnae_codigo: String(d.cnae_codigo || ''), cnae_nome: d.cnae_nome || '' })
    }
  }

  const statsMap = new Map((competitorStats || []).map((s) => [s.cnpj, s]))

  // Track which CNPJs came from CNAE discovery
  const cnaeDiscoveryCnpjs = new Set(cnaeDiscoveries.map(d => d.cnpj))

  // Build competitor profiles
  const competitorProfiles: CompetitorProfile[] = topCnpjs.map(([cnpj, data]) => {
    const stats = statsMap.get(cnpj)
    const details = detailsMap.get(cnpj)
    return {
      cnpj,
      razao_social: stats?.razao_social || null,
      cnae_codigo: details?.cnae_codigo || (stats?.cnae_grupo ? String(stats.cnae_grupo) : (stats?.cnae_divisao ? String(stats.cnae_divisao) : null)),
      cnae_nome: details?.cnae_nome || null,
      porte: stats?.porte || null,
      uf: stats?.uf || null,
      sharedTenderCount: data.count,
    }
  })

  // 5. Get shared tender objects for context
  const allTenderIds = new Set<string>()
  for (const [, data] of topCnpjs) {
    for (const tid of data.tenderIds) {
      allTenderIds.add(tid)
    }
  }

  const tenderIdList = [...allTenderIds].slice(0, 500)
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

  let results = await analyzeCompetitorRelevanceBatch({
    companyProfile,
    competitors: competitorProfiles,
    sharedTenderObjectsMap,
  })

  // Retry once if results are empty or much smaller than expected (< 50% of input)
  const expectedMinResults = Math.floor(competitorProfiles.length * 0.5)
  if (results.length < expectedMinResults) {
    logger.warn(
      {
        companyId,
        resultCount: results.length,
        expectedMin: expectedMinResults,
        competitorCount: competitorProfiles.length,
      },
      'AI analysis returned fewer results than expected, retrying once',
    )

    const retryResults = await analyzeCompetitorRelevanceBatch({
      companyProfile,
      competitors: competitorProfiles,
      sharedTenderObjectsMap,
    })

    // Use whichever attempt returned more results
    if (retryResults.length > results.length) {
      logger.info(
        { companyId, originalCount: results.length, retryCount: retryResults.length },
        'Retry returned more results, using retry results',
      )
      results = retryResults
    } else {
      logger.info(
        { companyId, originalCount: results.length, retryCount: retryResults.length },
        'Retry did not improve results, keeping original',
      )
    }
  }

  // 7. Upsert results into competitor_relevance table
  let upserted = 0
  for (const result of results) {
    const competitorData = topCnpjs.find(([cnpj]) => cnpj === result.cnpj)
    const sharedCount = competitorData ? competitorData[1].count : 0
    const sharedObjects = (sharedTenderObjectsMap[result.cnpj] || []).slice(0, 10)
    const stats = statsMap.get(result.cnpj)
    const isCnaeDiscovery = cnaeDiscoveryCnpjs.has(result.cnpj)

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
          discovery_source: isCnaeDiscovery ? 'cnae_discovery' : 'shared_tenders',
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
      cnaeDiscoveries: cnaeDiscoveries.length,
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
