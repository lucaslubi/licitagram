import { logger } from '../lib/logger'

// The PNCP API has results per item, not per compra
// Correct endpoint: /pncp-api/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados
const PNCP_API_URL = 'https://pncp.gov.br/pncp-api/v1'

interface PNCPResultado {
  niFornecedor: string // CNPJ fornecedor
  nomeRazaoSocialFornecedor: string
  tipoPessoa: string
  valorTotalHomologado: number | null
  valorUnitarioHomologado: number | null
  situacaoCompraItemResultadoNome: string // 'Informado', 'Homologado', etc
  dataResultado: string
  porteFornecedorNome: string | null // 'ME', 'EPP', etc
  naturezaJuridicaNome: string | null
  naturezaJuridicaId: string | null
  percentualDesconto: number | null
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
 * Check if a tender has results published via the PNCP consulta API.
 */
async function tenderHasResults(cnpj: string, ano: string, sequencial: string): Promise<boolean> {
  const url = `https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}`
  try {
    const response = await fetchWithRetry(url)
    if (!response.ok) return false
    const data = (await response.json()) as Record<string, unknown>
    return data.existeResultado === true
  } catch {
    return false
  }
}

/**
 * Fetch results/proposals for a tender from PNCP.
 * First checks if the tender has results, then fetches per-item results.
 * pncp_id format: "cnpj-ano-sequencial" e.g. "12345678000190-2025-42"
 */
export async function fetchTenderResults(pncpId: string): Promise<CompetitorResult[]> {
  // Parse pncp_id: cnpj-ano-sequencial
  const parts = pncpId.split('-')
  if (parts.length < 3) return []

  const cnpj = parts[0]
  const ano = parts[1]
  const sequencial = parts.slice(2).join('-')

  // First, check if this tender has published results
  const hasResults = await tenderHasResults(cnpj, ano, sequencial)
  if (!hasResults) return []

  const allResults: CompetitorResult[] = []
  const seenCnpjs = new Set<string>()
  let consecutiveEmpty = 0

  // Iterate through items (1, 2, 3, ...) up to a max of 30
  for (let itemNum = 1; itemNum <= 30; itemNum++) {
    const url = `${PNCP_API_URL}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${itemNum}/resultados`

    try {
      const response = await fetchWithRetry(url)

      // 404 = item doesn't exist, stop
      if (response.status === 404) break

      // 204 = no content (item exists but no results yet), count as empty
      if (response.status === 204 || !response.ok) {
        consecutiveEmpty++
        if (consecutiveEmpty >= 3) break // Stop after 3 consecutive empties
        continue
      }

      const text = await response.text()
      if (!text || text.trim() === '') {
        consecutiveEmpty++
        if (consecutiveEmpty >= 3) break
        continue
      }

      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        consecutiveEmpty++
        if (consecutiveEmpty >= 3) break
        continue
      }

      const items: PNCPResultado[] = Array.isArray(json) ? json : []

      if (items.length === 0) {
        consecutiveEmpty++
        if (consecutiveEmpty >= 3) break
        continue
      }

      // Reset counter when we find results
      consecutiveEmpty = 0

      for (const item of items) {
        const fornecedorCnpj = (item.niFornecedor || '').replace(/\D/g, '')
        if (!fornecedorCnpj || seenCnpjs.has(fornecedorCnpj)) continue
        seenCnpjs.add(fornecedorCnpj)

        const situacao = item.situacaoCompraItemResultadoNome || ''

        allResults.push({
          cnpj: fornecedorCnpj,
          nome: item.nomeRazaoSocialFornecedor || '',
          valor_proposta: item.valorUnitarioHomologado,
          valor_final: item.valorTotalHomologado,
          situacao,
          data_resultado: item.dataResultado || '',
          // "Informado" means the result was recorded (homologated in practice)
          vencedor: situacao.toLowerCase().includes('informado') || situacao.toLowerCase().includes('homologad'),
        })
      }
    } catch (error) {
      logger.warn({ pncpId, itemNum, error }, 'Failed to fetch PNCP item results')
      consecutiveEmpty++
      if (consecutiveEmpty >= 3) break
    }
  }

  if (allResults.length > 0) {
    logger.info({ pncpId, competitorsFound: allResults.length }, 'Fetched PNCP results')
  }

  return allResults
}
