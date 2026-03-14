import { Queue } from 'bullmq'
import { connection } from './connection'

export interface FornecedorEnrichmentJobData {
  /** Process a batch of competitors to enrich with fornecedor data */
  batch: number
}

export const fornecedorEnrichmentQueue = new Queue<FornecedorEnrichmentJobData>(
  'fornecedor-enrichment',
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
    },
  },
)
