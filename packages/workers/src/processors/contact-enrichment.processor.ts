import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { ContactEnrichmentJobData } from '../queues/contact-enrichment.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const BATCH_SIZE = 50
const MAX_BATCHES = 200 // Safety: max 10k per run

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

function formatPhone(ddd: string | null): string | null {
  if (!ddd || ddd.trim().length < 8) return null
  const clean = ddd.replace(/\D/g, '')
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  return clean
}

async function processContactEnrichment(job: Job<ContactEnrichmentJobData>) {
  let totalEnriched = 0
  let totalProcessed = 0

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: rows } = await supabase
      .from('competitor_stats')
      .select('cnpj')
      .is('email', null)
      .order('total_participacoes', { ascending: false })
      .range(0, BATCH_SIZE - 1) // Always first batch of unenriched

    if (!rows || rows.length === 0) {
      logger.info({ totalEnriched, totalProcessed }, 'All competitor contacts enriched')
      break
    }

    for (const row of rows) {
      try {
        const data = await fetchBrasilAPI(row.cnpj)

        if (!data) {
          await supabase.from('competitor_stats').update({ email: '' }).eq('cnpj', row.cnpj)
          totalProcessed++
          continue
        }

        const email = data.email && data.email.trim() && data.email !== '0' ? data.email.trim().toLowerCase() : ''
        const telefone = formatPhone(data.ddd_telefone_1) || formatPhone(data.ddd_telefone_2) || ''

        await supabase
          .from('competitor_stats')
          .update({
            email,
            telefone,
            municipio: data.municipio || null,
            natureza_juridica: data.natureza_juridica || null,
          })
          .eq('cnpj', row.cnpj)

        if (email || telefone) totalEnriched++
        totalProcessed++

        // Rate limit: ~3 req/s
        await new Promise((r) => setTimeout(r, 350))
      } catch (err) {
        logger.error({ cnpj: row.cnpj, err }, 'Contact enrichment error')
        // Mark as processed to avoid infinite retries
        await supabase.from('competitor_stats').update({ email: '' }).eq('cnpj', row.cnpj)
        totalProcessed++
      }
    }

    if (batch % 10 === 0) {
      logger.info({ batch, totalEnriched, totalProcessed }, 'Contact enrichment progress')
      await job.updateProgress(batch)
    }
  }

  logger.info({ totalEnriched, totalProcessed }, 'Contact enrichment completed')
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
