import { logger } from '../lib/logger'

const PNCP_URL = 'https://pncp.gov.br/api/consulta/v1'

interface PNCPResultado {
  niFornecedor: string // CNPJ fornecedor
  nomeRazaoSocialFornecedor: string
  tipoPessoa: string
  valorProposta: number | null
  valorFinal: number | null
  situacaoCompraItemResultadoNome: string // 'Homologado', 'Desclassificado', etc
  dataResultado: string
}

export interface CompetitorResult {
  cnpj: string
  nome: string
  valor_proposta: number | null
  valor_final: number | null
  situacao: string
  data_resultado: string
  vencedor: boolean
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      })
      if (response.ok) return response
      if (response.status === 404) return response
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 5000 * (i + 1)))
        continue
      }
      logger.warn({ url, status: response.status }, 'PNCP results fetch non-OK status')
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)))
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`)
}

/**
 * Fetch results/proposals for a tender from PNCP.
 * pncp_id format: "cnpj-ano-sequencial" e.g. "12345678000190-2025-42"
 */
export async function fetchTenderResults(pncpId: string): Promise<CompetitorResult[]> {
  // Parse pncp_id: cnpj-ano-sequencial
  const parts = pncpId.split('-')
  if (parts.length < 3) return []

  const cnpj = parts[0]
  const ano = parts[1]
  const sequencial = parts.slice(2).join('-')

  const url = `${PNCP_URL}/orgaos/${cnpj}/compras/${ano}/${sequencial}/resultados`

  try {
    const response = await fetchWithRetry(url)
    if (response.status === 404) return []

    const json = (await response.json()) as Record<string, unknown>
    const items = Array.isArray(json) ? json : (Array.isArray((json as Record<string, unknown>)?.data) ? (json as Record<string, unknown>).data as PNCPResultado[] : [])

    return items.map((item: PNCPResultado) => ({
      cnpj: (item.niFornecedor || '').replace(/\D/g, ''),
      nome: item.nomeRazaoSocialFornecedor || '',
      valor_proposta: item.valorProposta,
      valor_final: item.valorFinal,
      situacao: item.situacaoCompraItemResultadoNome || '',
      data_resultado: item.dataResultado || '',
      vencedor: (item.situacaoCompraItemResultadoNome || '').toLowerCase().includes('homologad'),
    }))
  } catch (error) {
    logger.warn({ pncpId, error }, 'Failed to fetch PNCP results')
    return []
  }
}
