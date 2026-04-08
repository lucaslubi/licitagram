import type { PNCPContratacao, PNCPResponse, PNCPDocumento } from '@licitagram/shared'
import { logger } from '../lib/logger'

const CONSULTA_URL = 'https://pncp.gov.br/api/consulta/v1'
const PNCP_URL = 'https://pncp.gov.br/api/pncp/v1'
const RATE_LIMIT_MS = 500

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await sleep(RATE_LIMIT_MS)
      const response = await fetch(url)

      if (response.ok) return response

      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 2000
        logger.warn({ url, status: response.status, attempt, delay }, 'Retrying PNCP request')
        await sleep(delay)
        continue
      }

      throw new Error(`PNCP API error: ${response.status} ${response.statusText}`)
    } catch (error) {
      if (attempt === retries - 1) throw error
      const delay = Math.pow(2, attempt) * 2000
      logger.warn({ url, attempt, delay, error }, 'Retrying PNCP request after error')
      await sleep(delay)
    }
  }
  throw new Error('Max retries exceeded')
}

export async function fetchContratacoes(params: {
  dataInicial: string
  dataFinal: string
  codigoModalidadeContratacao: number
  pagina?: number
  tamanhoPagina?: number
  uf?: string
}): Promise<PNCPResponse> {
  const searchParams = new URLSearchParams({
    dataInicial: params.dataInicial,
    dataFinal: params.dataFinal,
    codigoModalidadeContratacao: String(params.codigoModalidadeContratacao),
    pagina: String(params.pagina || 1),
    tamanhoPagina: String(params.tamanhoPagina || 50),
  })

  if (params.uf) {
    searchParams.set('uf', params.uf)
  }

  const url = `${CONSULTA_URL}/contratacoes/publicacao?${searchParams}`
  logger.info({ url }, 'Fetching PNCP contratacoes')

  const response = await fetchWithRetry(url)
  const json = (await response.json()) as Record<string, unknown>

  return {
    data: (json.data as PNCPContratacao[]) || [],
    totalRegistros: (json.totalRegistros as number) || 0,
    totalPaginas: (json.totalPaginas as number) || 0,
    paginaAtual: (json.paginaAtual as number) || params.pagina || 1,
  }
}

export async function fetchDocumentos(
  cnpj: string,
  ano: number,
  sequencial: number,
): Promise<PNCPDocumento[]> {
  const cleanCnpj = cnpj.replace(/\D/g, '')
  const url = `${PNCP_URL}/orgaos/${cleanCnpj}/compras/${ano}/${sequencial}/arquivos`

  try {
    logger.info({ url }, 'Fetching PNCP documents')
    const response = await fetchWithRetry(url)
    const json = await response.json()
    const items = Array.isArray(json) ? json : []
    return items.map((item: Record<string, unknown>) => ({
      titulo: (item.titulo as string) || (item.tipoDocumentoNome as string) || 'Documento',
      tipo: (item.tipoDocumentoNome as string) || 'Outros',
      url: (item.url as string) || '',
      dataPublicacao: (item.dataPublicacao as string) || '',
    }))
  } catch (error) {
    logger.warn({ cnpj, ano, sequencial, error }, 'Failed to fetch documents')
    return []
  }
}

export async function fetchContratacaoItens(
  cnpj: string,
  ano: number,
  sequencial: number,
  pagina = 1,
): Promise<any[]> {
  const cleanCnpj = cnpj.replace(/\D/g, '')
  const url = `${PNCP_URL}/orgaos/${cleanCnpj}/compras/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=100`

  try {
    logger.info({ url }, 'Fetching PNCP contratacao items')
    const response = await fetchWithRetry(url)
    const json = await response.json()
    return Array.isArray(json) ? json : (json.data || [])
  } catch (error) {
    logger.warn({ cnpj, ano, sequencial, error }, 'Failed to fetch items')
    return []
  }
}

export function buildPncpId(contratacao: PNCPContratacao): string {
  const cnpj = contratacao.orgaoEntidade.cnpj.replace(/\D/g, '')
  return `${cnpj}-${contratacao.anoCompra}-${contratacao.sequencialCompra}`
}

export function formatDatePNCP(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}
