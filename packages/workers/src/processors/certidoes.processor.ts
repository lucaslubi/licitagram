import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { mirrorExternalFileToDrive } from '../lib/drive'
import type { CertidaoResult } from '../scrapers/types'

const CERTIDAO_TYPES = [
  { tipo: 'trabalhista', label: 'Certidao Trabalhista (TST)' },
  { tipo: 'cnd_federal', label: 'CND Federal (Receita/PGFN)' },
  { tipo: 'fgts', label: 'Certidao de Regularidade FGTS' },
] as const

// ─── Helpers ────────────────────────────────────────────────────────────────

function labelForTipo(tipo: string): string {
  return CERTIDAO_TYPES.find(c => c.tipo === tipo)?.label ?? tipo
}

async function getCachedCertidao(companyId: string, tipo: string): Promise<CertidaoResult | null> {
  const { data } = await supabase
    .from('company_documents')
    .select('*')
    .eq('company_id', companyId)
    .eq('tipo', tipo)
    .gt('validade', new Date().toISOString().slice(0, 10))
    .maybeSingle()

  if (!data) return null
  return {
    tipo: data.tipo,
    label: labelForTipo(data.tipo),
    situacao: 'regular',
    detalhes: data.descricao || 'Certidao valida (cache)',
    numero: data.numero,
    emissao: null,
    validade: data.validade,
    pdf_url: data.arquivo_url,
    consulta_url: null,
  }
}

async function saveCertidao(companyId: string, cert: CertidaoResult) {
  if (cert.situacao === 'manual' || cert.situacao === 'error') return

  const { data: existing } = await supabase
    .from('company_documents')
    .select('id')
    .eq('company_id', companyId)
    .eq('tipo', cert.tipo)
    .maybeSingle()

  let finalUrl = cert.pdf_url || cert.consulta_url

  // If we have a PDF URL, mirror it to Licitagram Drive
  if (cert.pdf_url && cert.pdf_url.startsWith('http')) {
    const fileName = `${cert.tipo}_${cert.numero || 'emitida'}.pdf`
    const storagePath = await mirrorExternalFileToDrive(cert.pdf_url, companyId, fileName)
    if (storagePath) {
      // Point to our internal proxy for permanent access
      finalUrl = `/api/drive/proxy?path=${encodeURIComponent(storagePath)}`
    }
  }

  const doc = {
    company_id: companyId,
    tipo: cert.tipo,
    descricao: `[Auto] ${cert.detalhes}`,
    numero: cert.numero,
    validade: cert.validade,
    arquivo_url: finalUrl,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    await supabase.from('company_documents').update(doc).eq('id', existing.id)
  } else {
    await supabase.from('company_documents').insert(doc)
  }
}

// ─── Main processor: polls certidao_jobs for pending work ───────────────────

async function processCertidoesPoller(job: Job) {
  // 1. Query certidao_jobs for the next pending job
  const { data: certJob, error: fetchErr } = await supabase
    .from('certidao_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fetchErr) {
    logger.error({ err: fetchErr.message }, '[certidoes] Failed to query certidao_jobs')
    return
  }

  if (!certJob) return // Nothing to do

  const { id: jobId, company_id: companyId, cnpj } = certJob

  logger.info({ jobId, companyId, cnpj }, '[certidoes] Processing certidao job')

  // 2. Mark as processing
  await supabase
    .from('certidao_jobs')
    .update({ status: 'processing' })
    .eq('id', jobId)

  const results: CertidaoResult[] = []
  const totalTypes = CERTIDAO_TYPES.length

  try {
    // 3. Lazy-load scrapers
    const { scrapeTST } = await import('../scrapers/certidao-tst')
    const { scrapeReceita } = await import('../scrapers/certidao-receita')
    const { scrapeFGTS } = await import('../scrapers/certidao-fgts')

    const scraperMap: Record<string, (cnpj: string) => Promise<CertidaoResult>> = {
      trabalhista: scrapeTST,
      cnd_federal: scrapeReceita,
      fgts: scrapeFGTS,
    }

    // 4. Process each certidao type
    for (let i = 0; i < CERTIDAO_TYPES.length; i++) {
      const { tipo, label } = CERTIDAO_TYPES[i]

      try {
        // 4a. Check cache first
        const cached = await getCachedCertidao(companyId, tipo)
        if (cached) {
          logger.info({ tipo, companyId }, '[certidoes] Using cached certidao')
          results.push(cached)
        } else {
          // 4b. Scrape
          const scraper = scraperMap[tipo]
          if (!scraper) {
            results.push({
              tipo,
              label,
              situacao: 'manual',
              detalhes: 'Scraper nao implementado',
              numero: null,
              emissao: null,
              validade: null,
              pdf_url: null,
              consulta_url: null,
            })
          } else {
            const result = await scraper(cnpj)
            results.push(result)

            // 4c. Save to company_documents (upsert)
            await saveCertidao(companyId, result)
          }
        }
      } catch (err: any) {
        logger.error({ tipo, companyId, err: err.message }, '[certidoes] Scraper failed')
        results.push({
          tipo,
          label,
          situacao: 'error',
          detalhes: err.message || 'Erro desconhecido',
          numero: null,
          emissao: null,
          validade: null,
          pdf_url: null,
          consulta_url: null,
        })
      }

      // 4d. Update progress
      await supabase
        .from('certidao_jobs')
        .update({ progress: { completed: i + 1, total: totalTypes, current: tipo } })
        .eq('id', jobId)
    }

    // 5. Mark as completed
    await supabase
      .from('certidao_jobs')
      .update({
        status: 'completed',
        progress: { completed: totalTypes, total: totalTypes },
        result_json: { certidoes: results },
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    logger.info({ jobId, companyId, resultCount: results.length }, '[certidoes] Job completed')
  } catch (err: any) {
    // 6. Mark as failed
    logger.error({ jobId, companyId, err: err.message }, '[certidoes] Job failed')
    await supabase
      .from('certidao_jobs')
      .update({
        status: 'failed',
        error_message: err.message || 'Erro desconhecido',
        result_json: results.length > 0 ? results : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  }
}

// ─── Worker setup ───────────────────────────────────────────────────────────

export const certidoesWorker = new Worker(
  'certidoes',
  processCertidoesPoller,
  { connection, concurrency: 1, lockDuration: 600_000, stalledInterval: 600_000 },
)

certidoesWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[certidoes] Poll cycle completed')
})
certidoesWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, '[certidoes] Poll cycle failed')
})
