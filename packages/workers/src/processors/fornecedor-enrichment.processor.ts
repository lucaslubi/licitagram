import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { FornecedorEnrichmentJobData } from '../queues/fornecedor-enrichment.queue'
import { fetchFornecedor } from '../scrapers/comprasgov-client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const BATCH_SIZE = 30

/**
 * Enriches competitor records with fornecedor data from dadosabertos API.
 * Adds CNAE code, porte (size), natureza juridica, municipio, and UF
 * to the competitors table for better competitive intelligence.
 */
async function processFornecedorEnrichment(job: Job<FornecedorEnrichmentJobData>) {
  const { batch } = job.data

  // Find competitors with CNPJ that haven't been enriched yet
  const { data: competitors } = await supabase
    .from('competitors')
    .select('cnpj')
    .not('cnpj', 'is', null)
    .is('cnae_codigo', null) // Not yet enriched
    .order('created_at', { ascending: false })
    .range(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE - 1)

  if (!competitors || competitors.length === 0) {
    logger.info({ batch }, 'No more competitors to enrich with fornecedor data')
    return
  }

  // Get unique CNPJs to avoid duplicate API calls
  const uniqueCnpjs = [...new Set(competitors.map((c) => c.cnpj).filter(Boolean))]
  let enriched = 0

  for (const cnpj of uniqueCnpjs) {
    try {
      const fornecedor = await fetchFornecedor(cnpj)
      if (!fornecedor) continue

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
        // If columns don't exist yet, log and continue
        if (error.code === '42703') {
          logger.warn({ cnpj }, 'Competitors table missing enrichment columns — run migration')
          return // Stop processing, migration needed
        }
        logger.error({ error, cnpj }, 'Error enriching competitor')
        continue
      }

      enriched++

      // Rate limit — respect API limits
      await new Promise((r) => setTimeout(r, 1200))
    } catch (err) {
      logger.error({ cnpj, err }, 'Error fetching fornecedor data')
    }
  }

  logger.info(
    { batch, uniqueCnpjs: uniqueCnpjs.length, enriched },
    'Fornecedor enrichment batch completed',
  )
}

export const fornecedorEnrichmentWorker = new Worker<FornecedorEnrichmentJobData>(
  'fornecedor-enrichment',
  processFornecedorEnrichment,
  {
    connection,
    concurrency: 1,
  },
)

fornecedorEnrichmentWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Fornecedor enrichment job completed')
})

fornecedorEnrichmentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Fornecedor enrichment job failed')
})
