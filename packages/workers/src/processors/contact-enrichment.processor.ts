import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { ContactEnrichmentJobData } from '../queues/contact-enrichment.queue'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

const BATCH_SIZE = 100
const MAX_BATCHES = 200 // Safety: max 20k per run
const PARALLEL = 5 // 5 concurrent enrichment calls

// ─── Tier 0: Local Data API (KVM4 — 40M empresas, instant, no rate limit) ───

const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3997'

interface LocalEnrichmentResult {
  razao_social?: string
  porte_empresa?: string
  capital_social?: string
  natureza_juridica?: string
  // Estabelecimentos fields (available when RFB data is imported)
  telefone1?: string
  telefone2?: string
  email?: string
  municipio?: string
  uf?: string
  cnae_fiscal?: string
}

async function fetchLocalAPI(cnpj: string): Promise<LocalEnrichmentResult | null> {
  const clean = cnpj.replace(/\D/g, '')
  try {
    const res = await fetch(`${DATA_API_URL}/api/empresa/${clean}`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return null
    return (await res.json()) as LocalEnrichmentResult
  } catch {
    return null
  }
}

// ─── Tier 1: BrasilAPI (free, rate-limited) ─────────────────────────────────

interface BrasilAPICNPJ {
  email: string | null
  ddd_telefone_1: string | null
  ddd_telefone_2: string | null
  municipio: string | null
  natureza_juridica: string | null
}

async function fetchBrasilAPI(cnpj: string): Promise<BrasilAPICNPJ | null> {
  const clean = cnpj.replace(/\D/g, '')
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 5000))
        const retry = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
          signal: AbortSignal.timeout(15_000),
        })
        if (!retry.ok) return null
        return (await retry.json()) as BrasilAPICNPJ
      }
      return null
    }
    return (await res.json()) as BrasilAPICNPJ
  } catch {
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(ddd: string | null | undefined): string | null {
  if (!ddd || ddd.trim().length < 8) return null
  const clean = ddd.replace(/\D/g, '')
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  return clean
}

// ─── Main Processor ─────────────────────────────────────────────────────────

async function processContactEnrichment(job: Job<ContactEnrichmentJobData>) {
  let totalEnriched = 0
  let totalProcessed = 0
  let localHits = 0
  let brasilApiHits = 0

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: rows } = await supabase
      .from('competitor_stats')
      .select('cnpj')
      .is('email', null)
      .order('total_participacoes', { ascending: false })
      .range(0, BATCH_SIZE - 1) // Always first batch of unenriched

    if (!rows || rows.length === 0) {
      logger.info({ totalEnriched, totalProcessed, localHits, brasilApiHits }, 'All competitor contacts enriched')
      break
    }

    // Process in parallel chunks
    for (let i = 0; i < rows.length; i += PARALLEL) {
      const chunk = rows.slice(i, i + PARALLEL)

      await Promise.allSettled(
        chunk.map(async (row: { cnpj: string }) => {
          try {
            let email = ''
            let telefone = ''
            let municipio: string | null = null
            let natureza_juridica: string | null = null
            let source = 'none'

            // Tier 0: Try local Data API first (instant, no rate limit)
            const localData = await fetchLocalAPI(row.cnpj)
            if (localData) {
              // Check if local has contact data (from estabelecimentos)
              if (localData.email && localData.email.trim() && localData.email !== '0') {
                email = localData.email.trim().toLowerCase()
              }
              if (localData.telefone1 || localData.telefone2) {
                telefone = formatPhone(localData.telefone1) || formatPhone(localData.telefone2) || ''
              }
              if (localData.municipio) municipio = localData.municipio
              if (localData.natureza_juridica) natureza_juridica = localData.natureza_juridica

              if (email || telefone) {
                localHits++
                source = 'local'
              }
            }

            // Tier 1: If local didn't have contact data, try BrasilAPI
            if (!email && !telefone) {
              const brasilData = await fetchBrasilAPI(row.cnpj)
              if (brasilData) {
                email = brasilData.email && brasilData.email.trim() && brasilData.email !== '0'
                  ? brasilData.email.trim().toLowerCase()
                  : ''
                telefone = formatPhone(brasilData.ddd_telefone_1) || formatPhone(brasilData.ddd_telefone_2) || ''
                if (!municipio) municipio = brasilData.municipio || null
                if (!natureza_juridica) natureza_juridica = brasilData.natureza_juridica || null

                if (email || telefone) {
                  brasilApiHits++
                  source = 'brasilapi'
                }
              }
            }

            // Update competitor_stats (empty string = processed, null = not yet processed)
            await supabase
              .from('competitor_stats')
              .update({
                email: email || '',
                telefone: telefone || null,
                municipio,
                natureza_juridica,
              })
              .eq('cnpj', row.cnpj)

            if (email || telefone) totalEnriched++
            totalProcessed++

            if (source !== 'none' && totalEnriched % 50 === 0) {
              logger.debug({ cnpj: row.cnpj, source, email: !!email, telefone: !!telefone }, 'Contact enriched')
            }
          } catch (err) {
            logger.error({ cnpj: row.cnpj, err }, 'Contact enrichment error')
            // Mark as processed to avoid infinite retries
            await supabase.from('competitor_stats').update({ email: '' }).eq('cnpj', row.cnpj)
            totalProcessed++
          }
        }),
      )

      // Brief pause between parallel chunks
      await new Promise((r) => setTimeout(r, 200))
    }

    if (batch % 5 === 0) {
      logger.info({ batch, totalEnriched, totalProcessed, localHits, brasilApiHits }, 'Contact enrichment progress')
      await job.updateProgress(batch)
    }
  }

  logger.info({ totalEnriched, totalProcessed, localHits, brasilApiHits }, 'Contact enrichment completed')
}

export const contactEnrichmentWorker = new Worker<ContactEnrichmentJobData>(
  'contact-enrichment',
  processContactEnrichment,
  {
    connection,
    concurrency: 1,
    stalledInterval: 600_000,
    lockDuration: 600_000,
  },
)

contactEnrichmentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Contact enrichment job failed')
})
