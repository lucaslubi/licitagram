import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { FornecedorEnrichmentJobData } from '../queues/fornecedor-enrichment.queue'
import { fetchFornecedor } from '../scrapers/comprasgov-client'
import { competitionAnalysisQueue } from '../queues/competition-analysis.queue'
import { contactEnrichmentQueue } from '../queues/contact-enrichment.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const BATCH_SIZE = 50
const PARALLEL = 3 // Process 3 CNPJs concurrently

/**
 * Enriches competitor records with fornecedor data from dadosabertos API.
 * Adds CNAE code, porte (size), natureza juridica, municipio, and UF
 * to the competitors table for better competitive intelligence.
 */
async function processFornecedorEnrichment(job: Job<FornecedorEnrichmentJobData>) {
  let currentBatch = job.data.batch ?? 0
  let totalEnriched = 0
  const MAX_BATCHES = 200 // Safety limit

  for (let iteration = 0; iteration < MAX_BATCHES; iteration++) {
    // Find competitors with CNPJ that haven't been enriched yet
    const { data: competitors } = await supabase
      .from('competitors')
      .select('cnpj')
      .not('cnpj', 'is', null)
      .is('cnae_codigo', null) // Not yet enriched
      .order('created_at', { ascending: false })
      .range(0, BATCH_SIZE - 1) // Always fetch first batch of unenriched

    if (!competitors || competitors.length === 0) {
      logger.info({ totalEnriched }, 'All competitors enriched with fornecedor data')
      break
    }

    // Get unique CNPJs to avoid duplicate API calls
    const uniqueCnpjs = [...new Set(competitors.map((c) => c.cnpj).filter(Boolean))]

    // Process CNPJs in parallel chunks
    for (let i = 0; i < uniqueCnpjs.length; i += PARALLEL) {
      const chunk = uniqueCnpjs.slice(i, i + PARALLEL)

      await Promise.allSettled(
        chunk.map(async (cnpj) => {
          try {
            const fornecedor = await fetchFornecedor(cnpj)
            if (!fornecedor) {
              // Mark as enriched with empty data to avoid re-processing
              await supabase
                .from('competitors')
                .update({ cnae_codigo: 0 })
                .eq('cnpj', cnpj)
              return
            }

            // Update all competitors with this CNPJ
            const { error } = await supabase
              .from('competitors')
              .update({
                cnae_codigo: fornecedor.codigoCnae,
                cnae_nome: fornecedor.nomeCnae,
                porte: fornecedor.porteEmpresaNome,
                natureza_juridica: fornecedor.naturezaJuridicaNome,
                uf_fornecedor: fornecedor.ufSigla,
                municipio_fornecedor: fornecedor.nomeMunicipio,
              })
              .eq('cnpj', cnpj)

            if (error) {
              if (error.code === '42703') {
                logger.warn({ cnpj }, 'Competitors table missing enrichment columns — run migration')
                return
              }
              logger.error({ error, cnpj }, 'Error enriching competitor')
              return
            }

            totalEnriched++
          } catch (err) {
            logger.error({ cnpj, err }, 'Error fetching fornecedor data')
          }
        }),
      )

      // Rate limit between parallel chunks — respect API limits
      await new Promise((r) => setTimeout(r, 500))
    }

    currentBatch++
    await job.updateProgress(currentBatch)

    if (iteration % 10 === 0) {
      logger.info({ iteration, totalEnriched }, 'Fornecedor enrichment progress')
    }
  }

  // Immediately re-materialize competitor_stats so enriched CNAE/UF data
  // appears in competitive intelligence pages without waiting for the 12h cycle
  if (totalEnriched > 0) {
    try {
      const ts = Date.now()
      await competitionAnalysisQueue.add(
        `post-enrichment-${ts}`,
        { mode: 'incremental' },
        { jobId: `post-enrichment-${ts}` },
      )
      logger.info({ totalEnriched }, 'Enqueued competition analysis after fornecedor enrichment')

      // Also enrich contacts (email/telefone) from BrasilAPI
      await contactEnrichmentQueue.add(
        `post-enrichment-contacts-${ts}`,
        { batch: 0 },
        { jobId: `post-enrichment-contacts-${ts}` },
      )
      logger.info('Enqueued contact enrichment after fornecedor enrichment')
    } catch (err) {
      logger.warn({ err }, 'Failed to enqueue post-enrichment jobs')
    }
  }

  logger.info(
    { totalEnriched },
    'Fornecedor enrichment completed',
  )
}

export const fornecedorEnrichmentWorker = new Worker<FornecedorEnrichmentJobData>(
  'fornecedor-enrichment',
  processFornecedorEnrichment,
  {
    connection,
    concurrency: 1,
    stalledInterval: 600_000,
    lockDuration: 600_000,
  },
)

fornecedorEnrichmentWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Fornecedor enrichment job completed')
})

fornecedorEnrichmentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Fornecedor enrichment job failed')
})
