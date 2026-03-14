import { logger } from '../lib/logger'

/**
 * Client for the new dadosabertos.compras.gov.br API
 *
 * Replaces the old compras.dados.gov.br/licitacoes/v1 API which is defunct.
 *
 * Swagger UI:  https://dadosabertos.compras.gov.br/swagger-ui/index.html
 * OpenAPI spec: https://dadosabertos.compras.gov.br/v3/api-docs
 *
 * Main modules used:
 *   07 - CONTRATAÇÕES (Lei 14.133)  → consultarContratacoes_PNCP_14133  ✅
 *   06 - LEGADO (Lei 8.666)         → consultarPregoes, consultarLicitacao
 *   08 - ARP (Atas Registro Preço)  → consultarARP  ✅ (slow ~22s)
 *   09 - CONTRATOS                  → consultarContratos  ✅
 *   10 - FORNECEDOR                 → consultarFornecedor  ✅ (competitive intel)
 *   04 - PGC (Planejamento)         → consultarPgcDetalhe (requires orgao param)
 *   03 - PESQUISA PREÇO             → consultarMaterial, consultarServico
 */

const BASE_URL = 'https://dadosabertos.compras.gov.br'
const RATE_LIMIT_MS = 1000
const PAGE_SIZE = 500 // API supports 10-500
const REQUEST_TIMEOUT_MS = 30_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await sleep(RATE_LIMIT_MS)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (response.ok) return response

      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 3000
        logger.warn({ url, status: response.status, attempt, delay }, 'Retrying dadosabertos request')
        await sleep(delay)
        continue
      }

      const body = await response.text().catch(() => '')
      throw new Error(`dadosabertos API error: ${response.status} ${response.statusText} — ${body}`)
    } catch (error) {
      if (attempt === retries - 1) throw error
      const delay = Math.pow(2, attempt) * 3000
      logger.warn({ url, attempt, delay, error }, 'Retrying dadosabertos request after error')
      await sleep(delay)
    }
  }
  throw new Error('Max retries exceeded')
}

// ─── Types ──────────────────────────────────────────────────────────

/** Response DTO from consultarContratacoes_PNCP_14133 (52 fields) */
export interface DadosAbertosContratacao {
  idCompra: string
  numeroControlePNCP: string
  anoCompraPncp: number
  sequencialCompraPncp: number
  orgaoEntidadeCnpj: string
  orgaoEntidadeRazaoSocial: string
  orgaoEntidadeEsferaId: string
  orgaoEntidadePoderId: string
  unidadeOrgaoCodigoUnidade: string
  unidadeOrgaoNomeUnidade: string
  unidadeOrgaoUfSigla: string
  unidadeOrgaoMunicipioNome: string
  unidadeOrgaoCodigoIbge: number
  numeroCompra: string
  modalidadeIdPncp: number
  codigoModalidade: number
  modalidadeNome: string
  srp: boolean
  modoDisputaIdPncp: number
  codigoModoDisputa: number
  amparoLegalCodigoPncp: number
  amparoLegalNome: string
  amparoLegalDescricao: string
  informacaoComplementar: string
  processo: string
  objetoCompra: string
  existeResultado: boolean
  situacaoCompraIdPncp: number
  situacaoCompraNomePncp: string
  valorTotalEstimado: number | null
  valorTotalHomologado: number | null
  dataInclusaoPncp: string
  dataAtualizacaoPncp: string
  dataPublicacaoPncp: string
  dataAberturaPropostaPncp: string | null
  dataEncerramentoPropostaPncp: string | null
  contratacaoExcluida: boolean
}

export interface DadosAbertosResponse<T> {
  resultado: T[]
  totalRegistros: number
  totalPaginas: number
  paginasRestantes: number
}

/** Response DTO from consultarFornecedor */
export interface DadosAbertosFornecedor {
  cnpj: string | null
  cpf: string | null
  nomeRazaoSocialFornecedor: string
  ativo: boolean
  habilitadoLicitar: boolean
  codigoCnae: number | null
  nomeCnae: string | null
  nomeMunicipio: string
  naturezaJuridicaId: number | null
  naturezaJuridicaNome: string | null
  porteEmpresaId: number | null
  porteEmpresaNome: string | null
  ufSigla: string
}

/** Response DTO from consultarResultadoItensContratacoes */
export interface DadosAbertosResultadoItem {
  idCompraItem: string
  idCompra: string
  niFornecedor: string
  nomeRazaoSocialFornecedor: string
  valorUnitarioHomologado: number
  valorTotalHomologado: number
  percentualDesconto: number
  situacaoCompraItemResultadoId: number
  situacaoCompraItemResultadoNome: string
  porteFornecedorId: number
  porteFornecedorNome: string
  naturezaJuridicaNome: string
  dataResultadoPncp: string
  orgaoEntidadeCnpj: string
  numeroControlePNCPCompra: string
}

// ─── Legacy types (kept for backward compat with processor) ─────

export type ComprasGovLicitacao = DadosAbertosContratacao

export interface ComprasGovResponse {
  resultado: DadosAbertosContratacao[]
  totalRegistros: number
  totalPaginas: number
  paginasRestantes: number
}

// ─── All modalidades to scrape (Lei 14.133 codes) ──────────────

/**
 * Modalidade codes used in the dadosabertos API (Lei 14.133):
 *  1=Leilão, 2=Diálogo, 3=Concurso, 4=Concorrência, 5=Pregão,
 *  6=Dispensa, 7=Inexigibilidade, 8=Credenciamento, 9=Pré-qualificação,
 * 12=Manifestação de Interesse, 13=Leilão Eletrônico
 */
const ALL_MODALIDADES_14133 = [4, 5, 6, 7, 8]

// ─── Core fetch functions ───────────────────────────────────────

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}

/**
 * Fetch contratações from the new dadosabertos API (Lei 14.133).
 * This replaces the old compras.dados.gov.br/licitacoes/v1 endpoint.
 */
export async function fetchLicitacoes(params: {
  pagina?: number
  uf?: string
  modalidade?: number
  dataInicial?: string
  dataFinal?: string
}): Promise<{ data: DadosAbertosContratacao[]; hasMore: boolean; total: number }> {
  const pagina = params.pagina || 1
  const today = formatDate(new Date())
  const thirtyDaysAgo = formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

  const dataInicial = params.dataInicial || thirtyDaysAgo
  const dataFinal = params.dataFinal || today

  // If no specific modalidade, fetch ALL relevant modalidades and merge
  const modalidades = params.modalidade ? [params.modalidade] : ALL_MODALIDADES_14133
  const allResults: DadosAbertosContratacao[] = []
  let totalRecords = 0
  let hasMore = false

  for (const mod of modalidades) {
    const searchParams = new URLSearchParams({
      dataPublicacaoPncpInicial: dataInicial,
      dataPublicacaoPncpFinal: dataFinal,
      codigoModalidade: String(mod),
      pagina: String(pagina),
      tamanhoPagina: String(PAGE_SIZE),
    })

    if (params.uf) searchParams.set('unidadeOrgaoUfSigla', params.uf)

    const url = `${BASE_URL}/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?${searchParams}`
    logger.info({ url, modalidade: mod }, 'Fetching dadosabertos contratacoes')

    try {
      const response = await fetchWithRetry(url)
      const json = (await response.json()) as DadosAbertosResponse<DadosAbertosContratacao>

      allResults.push(...json.resultado)
      totalRecords += json.totalRegistros

      if (json.paginasRestantes > 0) {
        hasMore = true
      }
    } catch (error) {
      logger.error({ url, modalidade: mod, error }, 'Failed to fetch dadosabertos contratacoes')
      // Continue with other modalidades even if one fails
    }
  }

  logger.info(
    { total: totalRecords, fetched: allResults.length, hasMore },
    'dadosabertos contratacoes batch complete',
  )

  return { data: allResults, hasMore, total: totalRecords }
}

/**
 * Fetch a single page for a specific modalidade (used by the processor for pagination)
 */
export async function fetchContratacoesPagina(params: {
  modalidade: number
  dataInicial: string
  dataFinal: string
  pagina: number
  uf?: string
}): Promise<{ data: DadosAbertosContratacao[]; hasMore: boolean; total: number; totalPaginas: number }> {
  const searchParams = new URLSearchParams({
    dataPublicacaoPncpInicial: params.dataInicial,
    dataPublicacaoPncpFinal: params.dataFinal,
    codigoModalidade: String(params.modalidade),
    pagina: String(params.pagina),
    tamanhoPagina: String(PAGE_SIZE),
  })

  if (params.uf) searchParams.set('unidadeOrgaoUfSigla', params.uf)

  const url = `${BASE_URL}/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?${searchParams}`
  logger.info({ url }, 'Fetching dadosabertos contratacoes page')

  const response = await fetchWithRetry(url)
  const json = (await response.json()) as DadosAbertosResponse<DadosAbertosContratacao>

  return {
    data: json.resultado,
    hasMore: json.paginasRestantes > 0,
    total: json.totalRegistros,
    totalPaginas: json.totalPaginas,
  }
}

/**
 * Fetch fornecedor (supplier) info by CNPJ — for competitive intelligence
 */
export async function fetchFornecedor(cnpj: string): Promise<DadosAbertosFornecedor | null> {
  const cleanCnpj = cnpj.replace(/\D/g, '')
  const url = `${BASE_URL}/modulo-fornecedor/1_consultarFornecedor?ativo=true&cnpj=${cleanCnpj}&pagina=1&tamanhoPagina=10`

  logger.info({ cnpj: cleanCnpj }, 'Fetching fornecedor from dadosabertos')

  try {
    const response = await fetchWithRetry(url)
    const json = (await response.json()) as DadosAbertosResponse<DadosAbertosFornecedor>
    return json.resultado[0] || null
  } catch (error) {
    logger.error({ cnpj: cleanCnpj, error }, 'Failed to fetch fornecedor')
    return null
  }
}

/**
 * Fetch resultado (winners/proposals) for competitive intelligence.
 * Note: This endpoint can be slow (30s+). Use with generous timeout.
 */
export async function fetchResultados(params: {
  dataInicial: string
  dataFinal: string
  pagina?: number
  fornecedorCnpj?: string
}): Promise<{ data: DadosAbertosResultadoItem[]; hasMore: boolean; total: number }> {
  const searchParams = new URLSearchParams({
    dataResultadoPncpInicial: params.dataInicial,
    dataResultadoPncpFinal: params.dataFinal,
    pagina: String(params.pagina || 1),
    tamanhoPagina: String(PAGE_SIZE),
  })

  if (params.fornecedorCnpj) {
    searchParams.set('niFornecedor', params.fornecedorCnpj.replace(/\D/g, ''))
  }

  const url = `${BASE_URL}/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133?${searchParams}`
  logger.info({ url }, 'Fetching dadosabertos resultados')

  try {
    const response = await fetchWithRetry(url)
    const json = (await response.json()) as DadosAbertosResponse<DadosAbertosResultadoItem>
    return {
      data: json.resultado,
      hasMore: json.paginasRestantes > 0,
      total: json.totalRegistros,
    }
  } catch (error) {
    logger.error({ url, error }, 'Failed to fetch dadosabertos resultados')
    throw error
  }
}

// ─── Module 09: Contratos ────────────────────────────────────────

/** Response DTO from consultarContratos (module 09) */
export interface DadosAbertosContrato {
  codigoOrgao: string
  nomeOrgao: string
  codigoUnidadeGestora: string
  nomeUnidadeGestora: string
  codigoUnidadeGestoraOrigemContrato: string
  nomeUnidadeGestoraOrigemContrato: string
  receitaDespesa: string
  numeroContrato: string
  codigoUnidadeRealizadoraCompra: string
  nomeUnidadeRealizadoraCompra: string
  numeroCompra: string
  codigoModalidadeCompra: string
  nomeModalidadeCompra: string
  codigoTipo: string
  nomeTipo: string
  codigoCategoria: string
  nomeCategoria: string
  niFornecedor: string
  nomeRazaoSocialFornecedor: string
  processo: string
  objeto: string
  informacoesComplementares: string
  dataVigenciaInicial: string
  dataVigenciaFinal: string
  valorGlobal: number | null
  numeroParcelas: number | null
  valorParcela: number | null
  dataHoraInclusao: string
  numeroControlePncpContrato: string | null
  idCompra: string
  contratoExcluido: boolean
}

/**
 * Fetch contratos (module 09) — ongoing government contracts.
 * Useful for competitive intelligence: who has current contracts, values, etc.
 */
export async function fetchContratos(params: {
  dataVigenciaInicialMin: string // YYYY-MM-DD (required)
  dataVigenciaInicialMax: string // YYYY-MM-DD (required)
  pagina?: number
  niFornecedor?: string
  codigoModalidadeCompra?: string
}): Promise<{ data: DadosAbertosContrato[]; hasMore: boolean; total: number }> {
  const searchParams = new URLSearchParams({
    dataVigenciaInicialMin: params.dataVigenciaInicialMin,
    dataVigenciaInicialMax: params.dataVigenciaInicialMax,
    pagina: String(params.pagina || 1),
    tamanhoPagina: String(PAGE_SIZE),
  })

  if (params.niFornecedor) searchParams.set('niFornecedor', params.niFornecedor.replace(/\D/g, ''))
  if (params.codigoModalidadeCompra) searchParams.set('codigoModalidadeCompra', params.codigoModalidadeCompra)

  const url = `${BASE_URL}/modulo-contratos/1_consultarContratos?${searchParams}`
  logger.info({ url }, 'Fetching dadosabertos contratos')

  try {
    const response = await fetchWithRetry(url)
    const json = (await response.json()) as DadosAbertosResponse<DadosAbertosContrato>
    return {
      data: json.resultado,
      hasMore: json.paginasRestantes > 0,
      total: json.totalRegistros,
    }
  } catch (error) {
    logger.error({ url, error }, 'Failed to fetch dadosabertos contratos')
    throw error
  }
}

// ─── Module 08: ARP (Atas de Registro de Preço) ─────────────────

const ARP_TIMEOUT_MS = 45_000 // ARP endpoint is slow (~22s avg)

/** Response DTO from consultarARP (module 08) */
export interface DadosAbertosARP {
  numeroAtaRegistroPreco: string
  codigoUnidadeGerenciadora: string
  nomeUnidadeGerenciadora: string
  codigoOrgao: number | null
  nomeOrgao: string | null
  linkAtaPNCP: string
  linkCompraPNCP: string
  numeroCompra: string
  anoCompra: string
  codigoModalidadeCompra: string
  nomeModalidadeCompra: string
  dataAssinatura: string
  dataVigenciaInicial: string
  dataVigenciaFinal: string
  valorTotal: number | null
  statusAta: string
  objeto: string
  quantidadeItens: number | null
  dataHoraInclusao: string
  dataHoraExclusao: string | null
  ataExcluido: boolean
  numeroControlePncpAta: string
  numeroControlePncpCompra: string
  idCompra: string
}

/**
 * Fetch Atas de Registro de Preço (module 08) — active price registrations.
 * Companies can "piggyback" on these to get pre-negotiated prices.
 * NOTE: This endpoint is slow (~22s). Uses extended timeout.
 */
export async function fetchARP(params: {
  dataVigenciaInicialMin: string // YYYY-MM-DD (required)
  dataVigenciaInicialMax: string // YYYY-MM-DD (required)
  pagina?: number
  codigoModalidadeCompra?: string
}): Promise<{ data: DadosAbertosARP[]; hasMore: boolean; total: number }> {
  const searchParams = new URLSearchParams({
    dataVigenciaInicialMin: params.dataVigenciaInicialMin,
    dataVigenciaInicialMax: params.dataVigenciaInicialMax,
    pagina: String(params.pagina || 1),
    tamanhoPagina: String(PAGE_SIZE),
  })

  if (params.codigoModalidadeCompra) searchParams.set('codigoModalidadeCompra', params.codigoModalidadeCompra)

  const url = `${BASE_URL}/modulo-arp/1_consultarARP?${searchParams}`
  logger.info({ url }, 'Fetching dadosabertos ARP (atas)')

  try {
    // Use extended timeout for ARP (it's slow)
    await sleep(RATE_LIMIT_MS)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ARP_TIMEOUT_MS)

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`ARP API error: ${response.status} ${response.statusText}`)
    }

    const json = (await response.json()) as DadosAbertosResponse<DadosAbertosARP>
    return {
      data: json.resultado,
      hasMore: json.paginasRestantes > 0,
      total: json.totalRegistros,
    }
  } catch (error) {
    logger.error({ url, error }, 'Failed to fetch dadosabertos ARP')
    throw error
  }
}

// ─── Module 06: Legado (Lei 8.666) ──────────────────────────────

/** Response DTO from consultarPregoes (module 06 - legacy) */
export interface DadosAbertosPregaoLegado {
  co_uasg: number
  no_uasg: string
  co_orgao: number
  no_orgao: string
  numero: number
  ds_tipo_pregao_compra: string
  dt_data_edital: string
  dt_inicio_proposta: string | null
  dt_fim_proposta: string | null
  ds_objeto: string
  vl_estimado_total_item: number | null
  situacao: string
  ds_uf: string | null
  ds_municipio: string | null
  pertence14133: boolean
}

/**
 * Fetch pregões legados (Lei 8.666 — module 06).
 * These are older-format procurement processes still in the system.
 * Volume is declining as Lei 14.133 takes over.
 */
export async function fetchPregoesLegado(params: {
  dataInicial: string // YYYY-MM-DD (required)
  dataFinal: string   // YYYY-MM-DD (required)
  pagina?: number
}): Promise<{ data: DadosAbertosPregaoLegado[]; hasMore: boolean; total: number }> {
  const searchParams = new URLSearchParams({
    dt_data_edital_inicial: params.dataInicial,
    dt_data_edital_final: params.dataFinal,
    pagina: String(params.pagina || 1),
    tamanhoPagina: String(PAGE_SIZE),
    pertence14133: 'false', // Exclude Lei 14.133 (already covered by module 07)
  })

  const url = `${BASE_URL}/modulo-legado/3_consultarPregoes?${searchParams}`
  logger.info({ url }, 'Fetching dadosabertos pregoes legado')

  try {
    const response = await fetchWithRetry(url)
    const json = (await response.json()) as DadosAbertosResponse<DadosAbertosPregaoLegado>
    return {
      data: json.resultado,
      hasMore: json.paginasRestantes > 0,
      total: json.totalRegistros,
    }
  } catch (error) {
    logger.error({ url, error }, 'Failed to fetch dadosabertos pregoes legado')
    throw error
  }
}

/**
 * Normalize a legacy pregão to the standard tender format.
 */
export function normalizePregaoLegadoToTender(pregao: DadosAbertosPregaoLegado) {
  return {
    pncp_id: `legado-pregao-${pregao.co_uasg}-${pregao.numero}`,
    orgao_cnpj: null as string | null,
    orgao_nome: pregao.no_orgao || pregao.no_uasg || '',
    orgao_esfera: 'F' as const,
    modalidade_id: 5, // Pregão
    modalidade_nome: pregao.ds_tipo_pregao_compra || 'Pregão',
    objeto: pregao.ds_objeto || '',
    valor_estimado: sanitizeValor(pregao.vl_estimado_total_item),
    data_publicacao: pregao.dt_data_edital || null,
    data_abertura: pregao.dt_inicio_proposta || null,
    data_encerramento: pregao.dt_fim_proposta || null,
    situacao_nome: pregao.situacao || null,
    uf: pregao.ds_uf || null,
    municipio: pregao.ds_municipio || null,
    link_pncp: null as string | null,
    status: 'new' as const,
    source: 'comprasgov' as const,
    raw_data: pregao as unknown as Record<string, unknown>,
  }
}

// ─── Module 03: Pesquisa de Preço ────────────────────────────────

/** Response DTO from consultarMaterial (module 03) — price research */
export interface DadosAbertosPesquisaPreco {
  codigoItemCatmat: number
  descricaoItem: string
  codigoGrupo: number
  nomeGrupo: string
  codigoClasse: number
  nomeClasse: string
  codigoPdm: number
  nomePdm: string
  mediaPrecoCompra: number | null
  menorPrecoCompra: number | null
  maiorPrecoCompra: number | null
  quantidadeComprasConsideradas: number
}

/**
 * Fetch historical price data for a material/item (module 03).
 * Useful for pricing intelligence — helps users formulate competitive bids.
 */
export async function fetchPesquisaPrecoMaterial(params: {
  codigoItemCatmat: number
  pagina?: number
}): Promise<{ data: DadosAbertosPesquisaPreco[]; total: number }> {
  const searchParams = new URLSearchParams({
    codigoItemCatmat: String(params.codigoItemCatmat),
    pagina: String(params.pagina || 1),
    tamanhoPagina: String(PAGE_SIZE),
  })

  const url = `${BASE_URL}/modulo-pesquisa-preco/1_consultarMaterial?${searchParams}`
  logger.info({ url }, 'Fetching dadosabertos pesquisa preco material')

  try {
    const response = await fetchWithRetry(url)
    const json = (await response.json()) as DadosAbertosResponse<DadosAbertosPesquisaPreco>
    return { data: json.resultado, total: json.totalRegistros }
  } catch (error) {
    logger.error({ url, error }, 'Failed to fetch pesquisa preco')
    return { data: [], total: 0 }
  }
}

// ─── Normalization ──────────────────────────────────────────────

/**
 * Sanitize monetary value from API.
 * The PNCP DadosAbertos API sometimes returns corrupted values (e.g., 4 trillion).
 * Max reasonable valor for Brazilian public procurement: R$ 50 billion.
 */
function sanitizeValor(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  const num = typeof valor === 'string' ? parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) : valor
  if (isNaN(num) || num < 0) return null
  // Cap at R$ 50 billion — anything above is clearly a data error
  if (num > 50_000_000_000) return null
  return num
}

export function normalizeToTender(contratacao: DadosAbertosContratacao) {
  const cnpj = contratacao.orgaoEntidadeCnpj?.replace(/\D/g, '') || ''

  return {
    pncp_id: contratacao.numeroControlePNCP || `dadosabertos-${contratacao.idCompra}`,
    numero_compra: contratacao.numeroCompra || null,
    ano_compra: contratacao.anoCompraPncp || null,
    sequencial_compra: contratacao.sequencialCompraPncp || null,
    orgao_cnpj: cnpj,
    orgao_nome: contratacao.orgaoEntidadeRazaoSocial || '',
    orgao_esfera: contratacao.orgaoEntidadeEsferaId || 'F',
    modalidade_id: contratacao.codigoModalidade || contratacao.modalidadeIdPncp,
    modalidade_nome: contratacao.modalidadeNome || '',
    objeto: contratacao.objetoCompra || '',
    valor_estimado: sanitizeValor(contratacao.valorTotalEstimado),
    valor_homologado: sanitizeValor(contratacao.valorTotalHomologado),
    data_publicacao: contratacao.dataPublicacaoPncp || null,
    data_abertura: contratacao.dataAberturaPropostaPncp || null,
    data_encerramento: contratacao.dataEncerramentoPropostaPncp || null,
    situacao_id: contratacao.situacaoCompraIdPncp || null,
    situacao_nome: contratacao.situacaoCompraNomePncp || null,
    uf: contratacao.unidadeOrgaoUfSigla || null,
    municipio: contratacao.unidadeOrgaoMunicipioNome || null,
    link_pncp: contratacao.numeroControlePNCP
      ? `https://pncp.gov.br/app/editais/${contratacao.numeroControlePNCP}`
      : null,
    status: 'new' as const,
    source: 'comprasgov' as const,
    raw_data: contratacao as unknown as Record<string, unknown>,
  }
}

/**
 * Normalize a Contrato (module 09) to tender format.
 * Contratos are awarded/active contracts — useful for market intelligence.
 */
export function normalizeContratoToTender(contrato: DadosAbertosContrato) {
  return {
    pncp_id: contrato.numeroControlePncpContrato || `contrato-${contrato.codigoUnidadeGestora}-${contrato.numeroContrato}`,
    orgao_cnpj: contrato.codigoUnidadeGestora || null,
    orgao_nome: contrato.nomeUnidadeGestora || contrato.nomeOrgao || '',
    orgao_esfera: 'F' as const,
    modalidade_id: contrato.codigoModalidadeCompra ? Number(contrato.codigoModalidadeCompra) : null,
    modalidade_nome: contrato.nomeModalidadeCompra || '',
    objeto: contrato.objeto || '',
    valor_estimado: sanitizeValor(contrato.valorGlobal),
    data_publicacao: contrato.dataHoraInclusao || null,
    data_abertura: contrato.dataVigenciaInicial || null,
    data_encerramento: contrato.dataVigenciaFinal || null,
    situacao_nome: contrato.contratoExcluido ? 'Excluído' : 'Vigente',
    uf: null as string | null,
    municipio: null as string | null,
    link_pncp: contrato.numeroControlePncpContrato
      ? `https://pncp.gov.br/app/contratos/${contrato.numeroControlePncpContrato}`
      : null,
    status: 'analyzed' as const, // Contracts are already awarded
    source: 'comprasgov' as const,
    raw_data: contrato as unknown as Record<string, unknown>,
  }
}

/**
 * Normalize an ARP (Ata de Registro de Preço — module 08) to tender format.
 * ARPs are pre-negotiated price agreements companies can join.
 */
export function normalizeARPToTender(arp: DadosAbertosARP) {
  return {
    pncp_id: arp.numeroControlePncpAta || `arp-${arp.numeroAtaRegistroPreco}`,
    orgao_cnpj: arp.codigoUnidadeGerenciadora || null,
    orgao_nome: arp.nomeUnidadeGerenciadora || arp.nomeOrgao || '',
    orgao_esfera: 'F' as const,
    modalidade_id: arp.codigoModalidadeCompra ? Number(arp.codigoModalidadeCompra) : null,
    modalidade_nome: arp.nomeModalidadeCompra || '',
    objeto: arp.objeto || '',
    valor_estimado: sanitizeValor(arp.valorTotal),
    data_publicacao: arp.dataAssinatura || null,
    data_abertura: arp.dataVigenciaInicial || null,
    data_encerramento: arp.dataVigenciaFinal || null,
    situacao_nome: arp.statusAta || null,
    uf: null as string | null,
    municipio: null as string | null,
    link_pncp: arp.linkAtaPNCP || null,
    status: 'new' as const,
    source: 'comprasgov' as const,
    raw_data: arp as unknown as Record<string, unknown>,
  }
}

export function getModalidadeNome(code: number): string {
  const map: Record<number, string> = {
    1: 'Leilão',
    2: 'Diálogo Competitivo',
    3: 'Concurso',
    4: 'Concorrência',
    5: 'Pregão',
    6: 'Dispensa',
    7: 'Inexigibilidade',
    8: 'Credenciamento',
    9: 'Pré-qualificação',
    12: 'Manifestação de Interesse',
    13: 'Leilão Eletrônico',
  }
  return map[code] || `Modalidade ${code}`
}
