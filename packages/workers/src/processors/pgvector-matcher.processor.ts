/**
 * PGVECTOR MATCHER — engine determinística que substitui ai-triage.
 *
 * Roda em paralelo ao ai-triage (shadow mode) inicialmente, gravando
 * matches com `match_source='pgvector_rules'`. Depois de validar
 * precision via dashboard, ai-triage pode ser desligado ou restrito
 * só pra casos borderline.
 *
 * Fluxo:
 *   1. Recebe tenderId via queue
 *   2. Chama RPC match_companies_for_tender (pgvector + rules SQL)
 *   3. Filtra tier 'auto_high' (>= 0.70) pra inserir matches direto
 *   4. Para tier 'borderline' (0.45-0.70), opcionalmente enqueue ai-triage
 *   5. Tier 'auto_low' (<0.45) é descartado
 *
 * Sem LLM. Sem rate limit. Latência típica: 100-300ms por tender.
 */
import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { PgvectorMatchingJobData } from '../queues/pgvector-matching.queue'
import { aiTriageQueue } from '../queues/ai-triage.queue'
// IMPORTANT: usa Supabase authoritative (não db router com mirror local),
// porque embedding é column nova que só existe em Supabase — mirror_tenders
// ainda não tem. RPC e matches.upsert sempre vão pra Supabase de qualquer jeito.
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const AUTO_HIGH_THRESHOLD = 0.70
const BORDERLINE_MIN = 0.45
const SCORE_TO_PERCENT = 100

// Feature flag: se 'true', enfileira casos borderline pro ai-triage LLM-based.
// Senão, borderlines também são criados com match_source='pgvector_rules'.
const ENABLE_AI_BORDERLINE = process.env.PGVECTOR_ENABLE_AI_BORDERLINE === 'true'

interface RpcMatchRow {
  company_id: string
  score: number
  score_semantic: number
  score_cnae: number
  score_keyword: number
  score_valor: number
  score_modalidade: number
  score_uf: number
  match_tier: 'auto_high' | 'borderline' | 'auto_low'
  reasons: Record<string, unknown>
}

async function processPgvectorMatching(job: Job<PgvectorMatchingJobData>) {
  const { tenderId } = job.data
  const started = Date.now()

  // Verifica se tender tem embedding (pré-requisito)
  const { data: tender, error: tenderErr } = await supabase
    .from('tenders')
    .select('id, embedding, objeto, data_publicacao')
    .eq('id', tenderId)
    .single()

  if (tenderErr || !tender) {
    logger.warn({ tenderId, err: tenderErr?.message }, 'pgvector: tender não encontrado')
    return { skipped: true, reason: 'tender_not_found' }
  }

  if (!tender.embedding) {
    logger.info({ tenderId }, 'pgvector: tender sem embedding, pulando (backfill posterior)')
    return { skipped: true, reason: 'no_embedding' }
  }

  // Chama RPC com scoring composto
  const { data: matches, error: matchErr } = await supabase.rpc(
    'match_companies_for_tender',
    { p_tender_id: tenderId, p_limit: 200, p_min_score: 0.45 },
  )

  if (matchErr) {
    logger.error({ tenderId, err: matchErr.message }, 'pgvector: RPC falhou')
    throw new Error(`RPC failed: ${matchErr.message}`)
  }

  const rows = (matches ?? []) as RpcMatchRow[]
  if (rows.length === 0) {
    logger.info({ tenderId, durationMs: Date.now() - started }, 'pgvector: 0 matches acima do threshold')
    return { matched: 0, borderline: 0, autoHigh: 0, durationMs: Date.now() - started }
  }

  // Separa por tier
  const autoHigh = rows.filter((r) => r.match_tier === 'auto_high')
  const borderline = rows.filter((r) => r.match_tier === 'borderline')

  // Inserts em lote — upsert com match_source='pgvector_rules'
  // Unique(company_id, tender_id) = se já existe outro source, atualiza só o pgvector fields.
  const toInsert = [...autoHigh, ...(!ENABLE_AI_BORDERLINE ? borderline : [])].map((r) => ({
    company_id: r.company_id,
    tender_id: tenderId,
    score: Math.round(r.score * SCORE_TO_PERCENT),
    breakdown: r.reasons,
    match_source: 'pgvector_rules',
    match_tier: r.match_tier,
    score_semantic: r.score_semantic,
    score_cnae: r.score_cnae,
    score_keyword: r.score_keyword,
    score_valor: r.score_valor,
    score_modalidade: r.score_modalidade,
    score_uf: r.score_uf,
    status: 'new',
  }))

  if (toInsert.length > 0) {
    // Upsert com onConflict — se ai-triage já criou match, preserva mas adiciona
    // nossos scores detalhados pra comparação no dashboard.
    const { error: insErr } = await supabase
      .from('matches')
      .upsert(toInsert, {
        onConflict: 'company_id,tender_id',
        ignoreDuplicates: false,
      })
    if (insErr) {
      logger.error({ tenderId, err: insErr.message, rows: toInsert.length }, 'pgvector: upsert falhou')
      throw new Error(`upsert failed: ${insErr.message}`)
    }
  }

  // Borderlines → enfileira pro ai-triage pra revisão LLM (opcional)
  if (ENABLE_AI_BORDERLINE && borderline.length > 0) {
    // Agrupa borderlines por empresa pra batchar no mesmo job ai-triage
    const matchIds: string[] = []
    for (const r of borderline) {
      // precisa do match.id que acabamos de upsert — re-query
      const { data: m } = await supabase
        .from('matches')
        .select('id')
        .eq('company_id', r.company_id)
        .eq('tender_id', tenderId)
        .single()
      if (m?.id) matchIds.push(m.id)
    }
    // Agrupa por companyId (ai-triage aceita matchIds de uma mesma empresa)
    const byCompany = new Map<string, string[]>()
    for (const r of borderline) {
      const arr = byCompany.get(r.company_id) ?? []
      byCompany.set(r.company_id, arr)
    }
    // Enqueue (simplificado — pega o primeiro match por empresa)
    for (const [companyId] of byCompany.entries()) {
      const ids = matchIds.slice(0, 50)  // limite por job
      if (ids.length === 0) continue
      await aiTriageQueue.add(
        'triage-borderline',
        { companyId, matchIds: ids },
        {
          jobId: `borderline-${companyId}-${tenderId}`,
          removeOnComplete: { count: 100 },
        },
      )
    }
  }

  const durationMs = Date.now() - started
  logger.info(
    {
      tenderId,
      autoHigh: autoHigh.length,
      borderline: borderline.length,
      inserted: toInsert.length,
      durationMs,
    },
    'pgvector-matcher: processado',
  )

  return {
    matched: toInsert.length,
    autoHigh: autoHigh.length,
    borderline: borderline.length,
    durationMs,
  }
}

export const pgvectorMatcherWorker = new Worker<PgvectorMatchingJobData>(
  'pgvector-matching',
  processPgvectorMatching,
  {
    connection,
    // Matching determinístico é I/O bound (SQL query). Concurrency alto OK.
    concurrency: Number(process.env.CONCURRENCY_PGVECTOR_MATCHING ?? 8),
    limiter: { max: 60, duration: 60_000 }, // 60/min (conservador)
    lockDuration: 300_000, // 5min
    stalledInterval: 300_000,
  },
)

pgvectorMatcherWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'pgvector-matcher failed')
})

pgvectorMatcherWorker.on('completed', (_job, result) => {
  logger.debug({ result }, 'pgvector-matcher done')
})
