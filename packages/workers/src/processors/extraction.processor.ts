import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type ExtractionJobData } from '../queues/extraction.queue'
import { aiTriageQueue } from '../queues/ai-triage.queue'
import { extractTextFromPDF } from '../scrapers/pdf-extractor'
import { runKeywordMatching } from './keyword-matcher'
import { classifyTenderCNAEs } from '../ai/cnae-classifier'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { invalidateTenderCaches, invalidateTenderDetail, incrementStat } from '../lib/redis-cache'

const extractionWorker = new Worker<ExtractionJobData>(
  'extraction',
  async (job) => {
    const { tenderId } = job.data
    logger.info({ tenderId }, 'Starting extraction')

    // 1. Fetch pending documents for this tender
    const { data: docs, error: docsErr } = await supabase
      .from('tender_documents')
      .select('id, url')
      .eq('tender_id', tenderId)
      .eq('status', 'pending')

    if (docsErr) {
      logger.error({ tenderId, error: docsErr }, 'Failed to fetch tender documents')
    }

    // 2. Extract text from each PDF (free, no AI tokens)
    for (const doc of docs || []) {
      try {
        const text = await extractTextFromPDF(doc.url)
        await supabase
          .from('tender_documents')
          .update({ texto_extraido: text, status: 'done' })
          .eq('id', doc.id)
      } catch (err) {
        logger.error({ docId: doc.id, err }, 'PDF extraction failed')
        await supabase
          .from('tender_documents')
          .update({ status: 'error' })
          .eq('id', doc.id)
      }
    }

    // 3. Extract dates/values from PDF text when API metadata is missing
    const { data: tender } = await supabase
      .from('tenders')
      .select('data_abertura, data_encerramento, valor_estimado')
      .eq('id', tenderId)
      .single()

    if (tender) {
      // Get all extracted texts
      const { data: extractedDocs } = await supabase
        .from('tender_documents')
        .select('texto_extraido')
        .eq('tender_id', tenderId)
        .eq('status', 'done')

      const allText = (extractedDocs || [])
        .map(d => d.texto_extraido || '')
        .join(' ')
        .slice(0, 50000)

      if (allText.length > 100) {
        const updates: Record<string, unknown> = {}

        // Extract dates when missing — look for common patterns in PT-BR editais
        if (!tender.data_encerramento) {
          const encPatterns = [
            /(?:encerramento|limite|prazo final|data limite|recebimento das propostas)[^.]*?(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i,
            /(?:at[ée]\s+(?:\d{2}:\d{2}\s+(?:de\s+|h\s+)?)?)?(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*[.,]?\s*(?:hor[aá]|prazo|encerramento|limite)/i,
          ]
          for (const pattern of encPatterns) {
            const match = allText.match(pattern)
            if (match) {
              const [, day, month, year] = match
              const dateStr = `${year}-${month}-${day}`
              const parsed = new Date(dateStr)
              if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2024) {
                updates.data_encerramento = dateStr
                logger.info({ tenderId, date: dateStr }, 'Extracted data_encerramento from PDF')
                break
              }
            }
          }
        }

        if (!tender.data_abertura) {
          const aberturaPatterns = [
            /(?:abertura|sessão pública|início da sessão|sess[aã]o)[^.]*?(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i,
            /(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*[.,]?\s*(?:abertura|sess[aã]o|in[ií]cio)/i,
          ]
          for (const pattern of aberturaPatterns) {
            const match = allText.match(pattern)
            if (match) {
              const [, day, month, year] = match
              const dateStr = `${year}-${month}-${day}`
              const parsed = new Date(dateStr)
              if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2024) {
                updates.data_abertura = dateStr
                logger.info({ tenderId, date: dateStr }, 'Extracted data_abertura from PDF')
                break
              }
            }
          }
        }

        // Extract valor_estimado from PDF when missing or was nullified
        if (!tender.valor_estimado) {
          const valorPatterns = [
            /valor\s+(?:total\s+)?(?:estimado|global|m[aá]ximo)[^R]*R\$\s*([\d.,]+)/i,
            /R\$\s*([\d.,]+)\s*\(?(?:estimado|global|total|m[aá]ximo)/i,
          ]
          for (const pattern of valorPatterns) {
            const match = allText.match(pattern)
            if (match) {
              const cleaned = match[1].replace(/\./g, '').replace(',', '.')
              const valor = parseFloat(cleaned)
              if (!isNaN(valor) && valor > 0 && valor < 50_000_000_000) {
                updates.valor_estimado = valor
                logger.info({ tenderId, valor }, 'Extracted valor_estimado from PDF')
                break
              }
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          updates.status = 'analyzed'
          await supabase.from('tenders').update(updates).eq('id', tenderId)
          logger.info({ tenderId, updates: Object.keys(updates) }, 'Updated tender with PDF-extracted data')
        } else {
          await supabase.from('tenders').update({ status: 'analyzed' }).eq('id', tenderId)
        }
      } else {
        await supabase.from('tenders').update({ status: 'analyzed' }).eq('id', tenderId)
      }
    } else {
      await supabase.from('tenders').update({ status: 'analyzed' }).eq('id', tenderId)
    }

    // 4. Classify tender CNAEs (AI-powered, uses Gemini Flash Lite)
    try {
      await classifyTenderCNAEs(tenderId)
    } catch (err) {
      logger.warn({ tenderId, err }, 'CNAE classification failed (will retry in sweep)')
    }

    // 5. Embed tender for semantic matching (non-blocking)
    if (process.env.JINA_API_KEY || process.env.OPENAI_API_KEY) {
      try {
        const { embedTender } = await import('./company-profiler')
        await embedTender(tenderId)
      } catch (err) {
        logger.warn({ tenderId, err }, 'Tender embedding failed (will retry in sweep)')
      }
    }

    // 6. Run CNAE-first keyword matching
    let newMatchesByCompany = new Map<string, string[]>()
    try {
      newMatchesByCompany = await runKeywordMatching(tenderId)
    } catch (err) {
      logger.warn({ tenderId, err }, 'Keyword matching failed')
    }

    // 7. Enqueue AI triage for new keyword matches (background, non-blocking)
    for (const [companyId, matchIds] of newMatchesByCompany) {
      try {
        await aiTriageQueue.add(
          `triage-${companyId}-${tenderId}`,
          { companyId, matchIds },
          { jobId: `triage-${companyId}-${tenderId}` },
        )
      } catch (err) {
        logger.warn({ companyId, tenderId, err }, 'Failed to enqueue AI triage (non-critical)')
      }
    }

    // 8. Invalidate caches so web app sees fresh data
    await invalidateTenderDetail(tenderId)
    await invalidateTenderCaches()
    await incrementStat('extractions-today')

    logger.info({ tenderId }, 'Extraction complete (PDF text + CNAE classification + CNAE-first matching)')
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 10, duration: 60_000 },
    stalledInterval: 180_000,
  },
)

extractionWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Extraction job failed')
})

export { extractionWorker }
