import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { extractionQueue } from '../queues/extraction.queue'
import { scrapingQueue, type ScrapingJobData } from '../queues/scraping.queue'
import { fetchContratacoes, fetchDocumentos, buildPncpId, fetchContratacaoItens } from '../scrapers/pncp-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import type { PNCPContratacao } from '@licitagram/shared'

/**
 * Sanitize monetary value — PNCP API sometimes returns corrupted values.
 * Cap at R$ 50 billion; anything above is clearly a data error.
 */
function sanitizeValor(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  const num = typeof valor === 'string' ? parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) : valor
  if (isNaN(num) || num < 0) return null
  if (num > 50_000_000_000) return null
  return num
}

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
    valor_estimado: sanitizeValor(contratacao.valorTotalEstimado),
    valor_homologado: sanitizeValor(contratacao.valorTotalHomologado),
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
  
  // Scrape Items & Quantities for Intelligence (PNCP)
  try {
    const items = await fetchContratacaoItens(cnpj, contratacao.anoCompra, contratacao.sequencialCompra)
    if (items && items.length > 0) {
      const itemRows = items.map((item: any) => ({
        tender_id: id,
        numero_item: item.numeroItem,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade_medida: item.unidadeMedida,
        valor_unitario_estimado: item.valorUnitarioEstimado,
        valor_total_estimado: item.valorTotalEstimado,
        situacao_id: item.situacaoItem,
        situacao_nome: item.situacaoItemNome,
        categoria_nome: item.itemCategoriaNome,
        criterio_julgamento_nome: item.criterioJulgamentoNome
      }))
      
      const { error: itemError } = await supabase.from('tender_items').insert(itemRows)
      if (itemError) {
        logger.error({ tenderId: id, error: itemError }, 'Failed to save tender items')
      } else {
        logger.info({ tenderId: id, count: items.length }, 'Saved tender items for intelligence')
      }
    }
  } catch (err) {
    logger.warn({ tenderId: id, err }, 'Failed to fetch/save items for tender (non-critical)')
  }

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

    // Smart pagination: only continue to next page if this page had new tenders.
    // If ALL tenders on this page already exist in DB, we've caught up — stop paginating.
    // This dramatically reduces queue size (from ~8K to ~500 jobs) without missing anything,
    // because new tenders always appear on the first pages (sorted by date desc).
    const hasNewContent = newCount > 0
    const isFirstPage = pagina <= 1

    if (result.totalPaginas > pagina && (hasNewContent || isFirstPage)) {
      await scrapingQueue.add('scrape-next-page', {
        modalidadeId,
        dataInicial,
        dataFinal,
        pagina: pagina + 1,
        uf,
      })
    } else if (!hasNewContent && pagina > 1) {
      logger.info(
        { modalidadeId, pagina, uf },
        'Early stop: no new tenders on this page, caught up with existing data',
      )
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
  concurrency: 8,
})

scrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Scraping job completed')
})

scrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Scraping job failed')
})
