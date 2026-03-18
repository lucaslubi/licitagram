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
 * Fetch results/proposals for a tender from PNCP.
 * Results are per-item, so we iterate through item numbers (1, 2, 3...)
 * until we get a 404.
 * pncp_id format: "cnpj-ano-sequencial" e.g. "12345678000190-2025-42"
 */
export async function fetchTenderResults(pncpId: string): Promise<CompetitorResult[]> {
  // Parse pncp_id: cnpj-ano-sequencial
  const parts = pncpId.split('-')
  if (parts.length < 3) return []

  const cnpj = parts[0]
  const ano = parts[1]
  const sequencial = parts.slice(2).join('-')

  const allResults: CompetitorResult[] = []
  const seenCnpjs = new Set<string>()

  // Iterate through items (1, 2, 3, ...) up to a max of 50
  for (let itemNum = 1; itemNum <= 50; itemNum++) {
    const url = `${PNCP_API_URL}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${itemNum}/resultados`

    try {
      const response = await fetchWithRetry(url)
      if (response.status === 404) {
        // No more items — stop iteration
        break
      }

      const json = await response.json()
      const items: PNCPResultado[] = Array.isArray(json) ? json : []

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
      // Continue to next item — don't break on error
    }
  }

  if (allResults.length > 0) {
    logger.info({ pncpId, competitorsFound: allResults.length }, 'Fetched PNCP results')
  }

  return allResults
}
