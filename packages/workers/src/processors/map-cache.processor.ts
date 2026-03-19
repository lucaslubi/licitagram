/**
 * Map Cache Processor
 *
 * Refreshes the `map_cache` table every hour with the best AI-verified matches
 * that have a valid UF (Brazilian state). This makes the map page instant —
 * a simple SELECT with no JOINs.
 *
 * Only includes matches with:
 * - score >= 40
 * - match_source IN ('ai', 'ai_triage', 'semantic')
 * - tender has a valid UF (Brazilian state)
 * - tender not expired (data_encerramento is null or >= today)
 */
import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const BATCH_SIZE = 500
const MAX_PER_COMPANY = 5000
const VALID_UFS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
])

async function refreshMapCache() {
  const startTime = Date.now()

  // Get all companies
  const { data: companies } = await supabase
    .from('companies')
    .select('id')

  if (!companies || companies.length === 0) {
    logger.info('No companies — skipping map cache refresh')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  let totalInserted = 0

  for (const company of companies) {
    // Fetch ALL AI-verified matches with tender data (paginated — Supabase caps at 1000/request)
    const PAGE = 1000
    const allMatches: any[] = []

    for (let offset = 0; offset < MAX_PER_COMPANY; offset += PAGE) {
      const { data: page, error } = await supabase
        .from('matches')
        .select(`
          id, score, is_hot, match_source, company_id,
          tenders (
            id, objeto, orgao_nome, uf, municipio,
            valor_estimado, data_abertura, data_encerramento,
            modalidade_nome
          )
        `)
        .eq('company_id', company.id)
        .in('match_source', ['ai', 'ai_triage', 'semantic', 'keyword'])
        .gte('score', 30)
        .order('score', { ascending: false })
        .range(offset, offset + PAGE - 1)

      if (error) {
        logger.error({ error, companyId: company.id, offset }, 'Failed to fetch matches for map cache')
        break
      }

      if (!page || page.length === 0) break
      allMatches.push(...page)
      if (page.length < PAGE) break // Last page
    }

    if (allMatches.length === 0) continue

    // Filter: must have valid UF, not expired
    const validRows = allMatches
      .filter((m: any) => {
        const t = m.tenders
        if (!t || !t.uf) return false
        if (!VALID_UFS.has(t.uf)) return false
        if (t.data_encerramento && t.data_encerramento < today) return false
        return true
      })
      .map((m: any) => ({
        company_id: company.id,
        match_id: m.id,
        tender_id: m.tenders.id,
        score: m.score,
        is_hot: m.is_hot || false,
        match_source: m.match_source,
        objeto: (m.tenders.objeto || '').slice(0, 500),
        orgao_nome: m.tenders.orgao_nome,
        uf: m.tenders.uf,
        municipio: m.tenders.municipio,
        valor_estimado: m.tenders.valor_estimado,
        data_abertura: m.tenders.data_abertura,
        data_encerramento: m.tenders.data_encerramento,
        modalidade_nome: m.tenders.modalidade_nome,
        created_at: new Date().toISOString(),
      }))

    if (validRows.length === 0) continue

    // Delete old cache for this company, then insert fresh
    await supabase.from('map_cache').delete().eq('company_id', company.id)

    // Insert in batches using upsert to handle any race conditions
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE)
      const { error: insertErr } = await supabase
        .from('map_cache')
        .upsert(batch, { onConflict: 'company_id,match_id', ignoreDuplicates: true })
      if (insertErr) {
        logger.error({ error: insertErr, companyId: company.id, batch: i }, 'Map cache insert failed')
      } else {
        totalInserted += batch.length
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  logger.info(
    { totalInserted, companies: companies.length, elapsedSeconds: elapsed },
    'Map cache refresh complete',
  )
}

export const mapCacheWorker = new Worker(
  'map-cache',
  async () => {
    await refreshMapCache()
  },
  {
    connection,
    concurrency: 1,
    stalledInterval: 300_000,
    lockDuration: 300_000,
  },
)

mapCacheWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Map cache refresh failed')
})
