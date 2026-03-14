import * as cheerio from 'cheerio'
import { logger } from '../lib/logger'

/**
 * BEC SP (Bolsa Eletrônica de Compras — São Paulo) scraper.
 *
 * NOTE: BEC SP is being migrated to Compras.gov.br (federal).
 * The old URLs no longer work without ASP.NET session cookies.
 * This scraper attempts to fetch via the public pages, but
 * will gracefully degrade if BEC blocks access.
 *
 * São Paulo state procurements increasingly appear on PNCP
 * and dadosabertos.compras.gov.br instead.
 */

const BEC_BASE_URL = 'https://www.bec.sp.gov.br'
const RATE_LIMIT_MS = 2000
const REQUEST_TIMEOUT_MS = 15_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * BEC SP requires session cookies (ASP.NET).
 * We first hit the public home page to obtain a session,
 * then navigate to the listing page.
 */
async function fetchBecWithSession(path: string, retries = 2): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await sleep(RATE_LIMIT_MS)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      // Step 1: Get a session cookie from the home page
      const homeResponse = await fetch(`${BEC_BASE_URL}/Publico/Aspx/Home.aspx`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html',
        },
        redirect: 'follow',
        signal: controller.signal,
      })

      // Extract cookies from the Set-Cookie header
      const cookies = homeResponse.headers.getSetCookie?.() || []
      const cookieString = cookies.map((c) => c.split(';')[0]).join('; ')

      if (!cookieString) {
        logger.warn('BEC SP: No session cookie received from home page')
      }

      await sleep(1000)

      // Step 2: Fetch the actual listing page with the session cookie
      const listingResponse = await fetch(`${BEC_BASE_URL}${path}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html',
          Cookie: cookieString,
          Referer: `${BEC_BASE_URL}/Publico/Aspx/Home.aspx`,
        },
        redirect: 'follow',
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!listingResponse.ok) {
        throw new Error(`BEC SP error: ${listingResponse.status}`)
      }

      const html = await listingResponse.text()

      // Check for session expired page
      if (html.includes('sessão expirou') || html.includes('falha de comunicação')) {
        logger.warn({ path, attempt }, 'BEC SP session expired, retrying...')
        await sleep(3000)
        continue
      }

      return html
    } catch (error) {
      if (attempt === retries - 1) throw error
      logger.warn({ path, attempt, error }, 'BEC SP fetch failed, retrying...')
      await sleep(Math.pow(2, attempt) * 3000)
    }
  }
  throw new Error('BEC SP: Max retries exceeded')
}

export interface BecSpLicitacao {
  numero: string
  objeto: string
  orgao: string
  valor: number | null
  dataAbertura: string | null
  dataPublicacao: string | null
  situacao: string
  url: string
  tipo: string // 'pregao', 'dispensa', 'oferta_compra'
}

/**
 * Scrape BEC SP pregões eletrônicos listing page
 */
export async function fetchBecPregoes(): Promise<BecSpLicitacao[]> {
  logger.info('Fetching BEC SP pregoes')

  try {
    const html = await fetchBecWithSession('/BEC_Pregao_UI/ui/BEC_Pregao_Pesquisa.aspx')
    return parseBecListing(html, 'pregao')
  } catch (error) {
    logger.warn({ error }, 'BEC SP pregoes unavailable (BEC is migrating to Compras.gov.br)')
    return []
  }
}

/**
 * Scrape BEC SP dispensas listing page
 */
export async function fetchBecDispensas(): Promise<BecSpLicitacao[]> {
  logger.info('Fetching BEC SP dispensas')

  try {
    const html = await fetchBecWithSession('/BEC_Dispensa_UI/ui/BEC_DL_Pesquisa.aspx')
    return parseBecListing(html, 'dispensa')
  } catch (error) {
    logger.warn({ error }, 'BEC SP dispensas unavailable (BEC is migrating to Compras.gov.br)')
    return []
  }
}

/**
 * Scrape BEC SP ofertas de compra listing
 */
export async function fetchBecOfertas(): Promise<BecSpLicitacao[]> {
  logger.info('Fetching BEC SP ofertas de compra')

  try {
    const html = await fetchBecWithSession('/BECSP/OC/BEC_OC_Pesquisa.aspx')
    return parseBecListing(html, 'oferta_compra')
  } catch (error) {
    logger.warn({ error }, 'BEC SP ofertas unavailable (BEC is migrating to Compras.gov.br)')
    return []
  }
}

function parseBecListing(html: string, tipo: string): BecSpLicitacao[] {
  const $ = cheerio.load(html)
  const results: BecSpLicitacao[] = []

  // BEC uses ASP.NET GridView / table-based layouts
  $('table tbody tr, .list-group-item, .card, [class*="licitacao"], [class*="pregao"], [id*="grid"] tr').each(
    (_, el) => {
      try {
        const $el = $(el)
        const text = $el.text().trim()
        if (!text || text.length < 20) return

        // Extract data from table cells or divs
        const cells = $el.find('td')
        if (cells.length >= 3) {
          const numero = cells.eq(0).text().trim()
          const objeto = cells.eq(1).text().trim()
          const orgao = cells.length > 3 ? cells.eq(2).text().trim() : ''
          const dataText = cells.length > 4 ? cells.eq(3).text().trim() : ''
          const linkEl = $el.find('a[href]').first()
          const href = linkEl.attr('href') || ''

          if (objeto && objeto.length > 10) {
            results.push({
              numero: numero || crypto.randomUUID().slice(0, 8),
              objeto,
              orgao: orgao || 'Governo do Estado de São Paulo',
              valor: extractValor(text),
              dataAbertura: parseDate(dataText),
              dataPublicacao: new Date().toISOString(),
              situacao: 'aberto',
              url: href.startsWith('http') ? href : `${BEC_BASE_URL}${href}`,
              tipo,
            })
          }
        }
      } catch {
        // Skip malformed rows
      }
    },
  )

  logger.info({ tipo, count: results.length }, 'BEC SP listing parsed')
  return results
}

function extractValor(text: string): number | null {
  const match = text.match(/R\$\s*([\d.,]+)/i)
  if (!match) return null
  return parseFloat(match[1].replace(/\./g, '').replace(',', '.'))
}

function parseDate(text: string): string | null {
  // Try DD/MM/YYYY format
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}T00:00:00`
}

export function normalizeBecToTender(lic: BecSpLicitacao) {
  const modalidade =
    lic.tipo === 'pregao'
      ? { id: 6, nome: 'Pregão Eletrônico' }
      : lic.tipo === 'dispensa'
        ? { id: 8, nome: 'Dispensa de Licitação' }
        : { id: 12, nome: 'Oferta de Compra' }

  return {
    pncp_id: `bec-sp-${lic.tipo}-${lic.numero}`,
    orgao_cnpj: null as string | null, // BEC SP HTML scraping doesn't provide CNPJ
    orgao_nome: lic.orgao,
    orgao_esfera: 'E', // Estadual
    modalidade_id: modalidade.id,
    modalidade_nome: modalidade.nome,
    objeto: lic.objeto,
    valor_estimado: lic.valor,
    data_publicacao: lic.dataPublicacao,
    data_abertura: lic.dataAbertura,
    situacao_nome: lic.situacao,
    uf: 'SP',
    municipio: null as string | null,
    link_sistema_origem: lic.url,
    status: 'new' as const,
    source: 'bec_sp' as const,
    raw_data: lic as unknown as Record<string, unknown>,
  }
}
