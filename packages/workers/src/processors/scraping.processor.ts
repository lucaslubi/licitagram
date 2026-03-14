import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { extractionQueue } from '../queues/extraction.queue'
import { scrapingQueue, type ScrapingJobData } from '../queues/scraping.queue'
import { fetchContratacoes, fetchDocumentos, buildPncpId } from '../scrapers/pncp-client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import type { PNCPContratacao } from '@licitagram/shared'

async function upsertTender(contratacao: PNCPContratacao): Promise<{ id: string; isNew: boolean }> {
  const pncpId = buildPncpId(contratacao)
  const cnpj = contratacao.orgaoEntidade.cnpj.replace(/\D/g, '')

  const { data: existing } = await supabase
    .from('tenders')
    .select('id')
    .eq('pncp_id', pncpId)
    .single()

  if (existing) {
    return { id: existing.id, isNew: false }
  }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('tenders').insert({
    id,
    pncp_id: pncpId,
    numero_compra: contratacao.numeroCompra,
    ano_compra: contratacao.anoCompra,
    sequencial_compra: contratacao.sequencialCompra,
    orgao_cnpj: cnpj,
    orgao_nome: contratacao.orgaoEntidade.razaoSocial,
    orgao_esfera: contratacao.orgaoEntidade.esferaId,
    modalidade_id: contratacao.modalidadeId,
    modalidade_nome: contratacao.modalidadeNome,
    objeto: contratacao.objetoCompra,
    valor_estimado: contratacao.valorTotalEstimado,
    valor_homologado: contratacao.valorTotalHomologado,
    data_publicacao: contratacao.dataPublicacaoPncp,
    data_abertura: contratacao.dataAberturaProposta,
    data_encerramento: contratacao.dataEncerramentoProposta,
    link_sistema_origem: contratacao.linkSistemaOrigem,
    situacao_id: contratacao.situacaoCompraId,
    situacao_nome: contratacao.situacaoCompraNome,
    uf: contratacao.unidadeOrgao?.ufSigla || null,
    municipio: contratacao.unidadeOrgao?.municipioNome || null,
    status: 'new',
    raw_data: contratacao as unknown as Record<string, unknown>,
  })

  if (error) {
    if (error.code === '23505') {
      const { data: existing2 } = await supabase
        .from('tenders')
        .select('id')
        .eq('pncp_id', pncpId)
        .single()
      return { id: existing2!.id, isNew: false }
    }
    throw error
  }

  return { id, isNew: true }
}

async function processContratacao(contratacao: PNCPContratacao) {
  const { id, isNew } = await upsertTender(contratacao)

  if (!isNew) return { tenderId: id, isNew: false }

  const cnpj = contratacao.orgaoEntidade.cnpj.replace(/\D/g, '')
  const docs = await fetchDocumentos(cnpj, contratacao.anoCompra, contratacao.sequencialCompra)

  for (const doc of docs) {
    await supabase.from('tender_documents').insert({
      tender_id: id,
      titulo: doc.titulo,
      tipo: doc.tipo,
      url: doc.url,
      status: 'pending',
    })
  }

  await extractionQueue.add('extract', { tenderId: id })

  return { tenderId: id, isNew: true }
}

async function processScrapingJob(job: Job<ScrapingJobData>) {
  const { modalidadeId, dataInicial, dataFinal, pagina, uf } = job.data

  const jobRecord = await supabase
    .from('scraping_jobs')
    .insert({
      job_type: 'scrape',
      status: 'running',
      started_at: new Date().toISOString(),
      params: job.data,
    })
    .select('id')
    .single()

  if (jobRecord.error || !jobRecord.data) {
    logger.error({ error: jobRecord.error }, 'Failed to create scraping job record')
    throw new Error('Failed to create scraping job record')
  }

  const jobId = jobRecord.data.id

  try {
    const result = await fetchContratacoes({
      dataInicial,
      dataFinal,
      codigoModalidadeContratacao: modalidadeId,
      pagina,
      uf,
    })

    let newCount = 0
    for (const contratacao of result.data) {
      try {
        const { isNew } = await processContratacao(contratacao)
        if (isNew) newCount++
      } catch (err) {
        logger.error({ contratacao: contratacao.objetoCompra, err }, 'Error processing contratacao')
      }
    }

    if (result.totalPaginas > pagina) {
      await scrapingQueue.add('scrape-next-page', {
        modalidadeId,
        dataInicial,
        dataFinal,
        pagina: pagina + 1,
        uf,
      })
    }

    const { error: updateErr } = await supabase
      .from('scraping_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: {
          totalFound: result.data.length,
          newTenders: newCount,
          totalPages: result.totalPaginas,
        },
      })
      .eq('id', jobId)

    if (updateErr) logger.error({ error: updateErr }, 'Failed to update scraping job as completed')

    logger.info(
      { modalidadeId, pagina, found: result.data.length, new: newCount },
      'Scraping page completed',
    )
  } catch (error) {
    const { error: failErr } = await supabase
      .from('scraping_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: String(error),
      })
      .eq('id', jobId)
    if (failErr) logger.error({ error: failErr }, 'Failed to update scraping job as failed')
    throw error
  }
}

export const scrapingWorker = new Worker<ScrapingJobData>('scraping', processScrapingJob, {
  connection,
  concurrency: 2,
})

scrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Scraping job completed')
})

scrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Scraping job failed')
})
