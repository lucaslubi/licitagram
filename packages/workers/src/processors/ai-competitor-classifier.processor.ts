import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { AiCompetitorClassifierJobData } from '../queues/ai-competitor-classifier.queue'
import { callLLM, parseJsonResponse } from '../ai/llm-client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const MAX_PER_RUN = 50
const BATCH_SIZE = 10

const SYSTEM_PROMPT = `Voce e um analista de inteligencia competitiva especializado em licitacoes publicas brasileiras.
Sua funcao e classificar empresas em segmentos de mercado e avaliar seu nivel de ameaca competitiva.

Classifique estas empresas brasileiras em segmentos de mercado para licitacoes publicas.
Para cada empresa, retorne um JSON com: segmento (ex: "Tecnologia da Informação", "Consultoria e Treinamento", "Engenharia Civil", etc),
nivel_ameaca ("alto", "medio", "baixo") baseado no win_rate e volume.

Criterios para nivel_ameaca:
- "alto": win_rate > 30% E total_participacoes > 10, OU total_vitorias > 5
- "medio": win_rate entre 15-30% OU total_participacoes entre 5-10
- "baixo": win_rate < 15% OU total_participacoes < 5

Retorne APENAS um JSON valido (sem markdown), no formato:
[
  {
    "cnpj": "00000000000000",
    "segmento": "Nome do Segmento",
    "nivel_ameaca": "alto|medio|baixo"
  }
]`

interface CompetitorRow {
  cnpj: string
  razao_social: string | null
  cnae_divisao: number | null
  cnae_nome: string | null
  porte: string | null
  total_participacoes: number | null
  total_vitorias: number | null
  win_rate: number | null
  valor_total_vitorias: number | null
}

interface ClassificationResult {
  cnpj: string
  segmento: string
  nivel_ameaca: 'alto' | 'medio' | 'baixo'
}

function buildPrompt(competitors: CompetitorRow[]): string {
  const entries = competitors.map((c) => ({
    cnpj: c.cnpj,
    razao_social: c.razao_social || 'Desconhecido',
    cnae_divisao: c.cnae_divisao || null,
    cnae_nome: c.cnae_nome || null,
    porte: c.porte || null,
    total_participacoes: c.total_participacoes || 0,
    total_vitorias: c.total_vitorias || 0,
    win_rate: c.win_rate != null ? `${(c.win_rate * 100).toFixed(1)}%` : '0%',
    valor_total_vitorias: c.valor_total_vitorias || 0,
  }))

  return `Classifique as seguintes empresas:

${JSON.stringify(entries, null, 2)}

Retorne APENAS o JSON com a classificacao de cada empresa.`
}

async function processAiCompetitorClassifier(job: Job<AiCompetitorClassifierJobData>) {
  let totalClassified = 0
  let offset = 0

  while (totalClassified < MAX_PER_RUN) {
    // Fetch competitors without AI classification
    const { data: competitors, error: fetchError } = await supabase
      .from('competitor_stats')
      .select('cnpj, razao_social, cnae_divisao, cnae_nome, porte, total_participacoes, total_vitorias, win_rate, valor_total_vitorias')
      .is('segmento_ia', null)
      .order('total_participacoes', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1)

    if (fetchError) {
      logger.error({ error: fetchError }, 'Failed to fetch competitors for AI classification')
      break
    }

    if (!competitors || competitors.length === 0) {
      logger.info({ totalClassified }, 'No more competitors to classify')
      break
    }

    try {
      const response = await callLLM({
        task: 'classification',
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(competitors as CompetitorRow[]),
        jsonMode: true,
      })

      if (!response || response.trim().length === 0) {
        logger.warn('Empty AI response for competitor classification, skipping batch')
        offset += BATCH_SIZE
        continue
      }

      let classifications: ClassificationResult[]
      try {
        const parsed = parseJsonResponse<ClassificationResult[] | { results: ClassificationResult[] }>(response)
        // Handle both array and object with results key
        classifications = Array.isArray(parsed) ? parsed : (parsed as { results: ClassificationResult[] }).results || []
      } catch (parseErr) {
        logger.warn(
          { responseSnippet: response.slice(0, 300), error: parseErr },
          'Failed to parse AI classification response, skipping batch',
        )
        offset += BATCH_SIZE
        continue
      }

      // Update each competitor with their classification
      for (const classification of classifications) {
        try {
          const validLevels = ['alto', 'medio', 'baixo']
          const nivel = validLevels.includes(classification.nivel_ameaca)
            ? classification.nivel_ameaca
            : 'baixo'

          const segmento = classification.segmento?.trim()
          if (!segmento || !classification.cnpj) {
            logger.warn({ classification }, 'Invalid classification entry, skipping')
            continue
          }

          const { error: updateError } = await supabase
            .from('competitor_stats')
            .update({
              segmento_ia: segmento,
              nivel_ameaca: nivel,
            })
            .eq('cnpj', classification.cnpj)

          if (updateError) {
            logger.error(
              { cnpj: classification.cnpj, error: updateError },
              'Failed to update competitor classification',
            )
            continue
          }

          totalClassified++
        } catch (err) {
          logger.error(
            { cnpj: classification.cnpj, err },
            'Error updating single competitor classification',
          )
        }
      }

      await job.updateProgress(totalClassified)
      logger.info(
        { batchSize: competitors.length, classified: classifications.length, totalClassified },
        'AI competitor classification batch complete',
      )
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 429 || status === 503) {
        logger.warn({ status }, 'Rate limited during competitor classification, will retry later')
        throw err // Let BullMQ retry
      }
      logger.error({ err }, 'Error in AI competitor classification batch')
      offset += BATCH_SIZE
    }

    // Throttle between batches to respect rate limits
    await new Promise((r) => setTimeout(r, 1000))
  }

  logger.info({ totalClassified }, 'AI competitor classification job completed')
}

export const aiCompetitorClassifierWorker = new Worker<AiCompetitorClassifierJobData>(
  'ai-competitor-classifier',
  processAiCompetitorClassifier,
  {
    connection,
    concurrency: 1,
    stalledInterval: 600_000,
    lockDuration: 600_000,
  },
)

aiCompetitorClassifierWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'AI competitor classifier job completed')
})

aiCompetitorClassifierWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'AI competitor classifier job failed')
})
