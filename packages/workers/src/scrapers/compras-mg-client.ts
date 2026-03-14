import * as cheerio from 'cheerio'
import { logger } from '../lib/logger'

/**
 * Portal de Compras MG (Minas Gerais) scraper.
 *
 * Scrapes pregões eletrônicos from the public listing at
 * www.compras.mg.gov.br. MG is the 3rd largest state economy
 * and has significant procurement volume.
 *
 * Falls back gracefully if the portal is unavailable.
 */

const MG_BASE_URL = 'https://www.compras.mg.gov.br'
const RATE_LIMIT_MS = 3000
const REQUEST_TIMEOUT_MS = 20_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchMGPage(path: string, retries = 2): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await sleep(RATE_LIMIT_MS)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const response = await fetch(`${MG_BASE_URL}${path}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        redirect: 'follow',
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Portal MG error: ${response.status}`)
      }

      return await response.text()
    } catch (error) {
      if (attempt === retries - 1) throw error
      logger.warn({ path, attempt, error }, 'Portal MG fetch failed, retrying...')
      await sleep(Math.pow(2, attempt) * 5000)
    }
  }
  throw new Error('Portal MG: Max retries exceeded')
}

export interface MGLicitacao {
  numero: string
  objeto: string
  orgao: string
  valor: number | null
  dataAbertura: string | null
  dataPublicacao: string | null
  situacao: string
  url: string
  tipo: string // 'pregao', 'concorrencia', etc.
}

/**
 * Scrape Portal MG pregões eletrônicos listing
 */
export async function fetchMGPregoes(): Promise<MGLicitacao[]> {
  logger.info('Fetching Portal MG pregoes')

  try {
    const html = await fetchMGPage('/pregao-eletronico-listagem')
    return parseMGListing(html, 'pregao')
  } catch (error) {
    logger.warn({ error }, 'Portal MG pregoes unavailable')
    return []
  }
}

/**
 * Scrape Portal MG concorrências listing
 */
export async function fetchMGConcorrencias(): Promise<MGLicitacao[]> {
  logger.info('Fetching Portal MG concorrencias')

  try {
    const html = await fetchMGPage('/concorrencia-eletronica-listagem')
    return parseMGListing(html, 'concorrencia')
  } catch (error) {
    logger.warn({ error }, 'Portal MG concorrencias unavailable')
    return []
  }
}

function parseMGListing(html: string, tipo: string): MGLicitacao[] {
  const $ = cheerio.load(html)
  const results: MGLicitacao[] = []

  // Portal MG uses various table layouts and card-based lists
  $('table tbody tr, .lista-item, .card-licitacao, [class*="licitacao"] .item, .list-group-item').each(
    (_, el) => {
      try {
        const $el = $(el)
        const text = $el.text().trim()
        if (!text || text.length < 20) return

        const cells = $el.find('td')
        if (cells.length >= 3) {
          const numero = cells.eq(0).text().trim()
          const objeto = cells.eq(1).text().trim()
          const orgao = cells.length > 3 ? cells.eq(2).text().trim() : 'Estado de Minas Gerais'
          const dataText = cells.length > 4 ? cells.eq(3).text().trim() : ''
          const linkEl = $el.find('a[href]').first()
          const href = linkEl.attr('href') || ''

          if (objeto && objeto.length > 10) {
            results.push({
              numero: numero || crypto.randomUUID().slice(0, 8),
              objeto,
              orgao: orgao || 'Estado de Minas Gerais',
              valor: extractValor(text),
              dataAbertura: parseDate(dataText),
              dataPublicacao: new Date().toISOString(),
              situacao: 'aberto',
              url: href.startsWith('http') ? href : `${MG_BASE_URL}${href}`,
              tipo,
            })
          }
        } else {
          // Card/div-based layout fallback
          const titleEl = $el.find('h3, h4, .titulo, .title, strong').first()
          const titulo = titleEl.text().trim()
          const linkEl = $el.find('a[href]').first()
          const href = linkEl.attr('href') || ''

          if (titulo && titulo.length > 10) {
            results.push({
              numero: extractNumero(text) || crypto.randomUUID().slice(0, 8),
              objeto: titulo,
              orgao: extractOrgao(text) || 'Estado de Minas Gerais',
              valor: extractValor(text),
              dataAbertura: parseDate(text),
              dataPublicacao: new Date().toISOString(),
              situacao: 'aberto',
              url: href.startsWith('http') ? href : `${MG_BASE_URL}${href}`,
              tipo,
            })
          }
        }
      } catch {
        // Skip malformed entries
      }
    },
  )

  logger.info({ tipo, count: results.length }, 'Portal MG listing parsed')
  return results
}

function extractValor(text: string): number | null {
  const match = text.match(/R\$\s*([\d.,]+)/i)
  if (!match) return null
  return parseFloat(match[1].replace(/\./g, '').replace(',', '.'))
}

function parseDate(text: string): string | null {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}T00:00:00`
}

function extractNumero(text: string): string | null {
  const match = text.match(/(?:n[uú]mero|pregão|pe)\s*[:.]?\s*(\d[\d./-]+)/i)
  return match ? match[1].trim() : null
}

function extractOrgao(text: string): string | null {
  const match = text.match(/(?:órgão|orgao|secretaria|entidade)\s*[:.]?\s*(.+?)(?:\n|$)/i)
  return match ? match[1].trim() : null
}

export function normalizeMGToTender(lic: MGLicitacao) {
  const modalidade =
    lic.tipo === 'pregao'
      ? { id: 6, nome: 'Pregão Eletrônico' }
      : lic.tipo === 'concorrencia'
        ? { id: 2, nome: 'Concorrência' }
        : { id: 0, nome: lic.tipo }

  return {
    pncp_id: `mg-${lic.tipo}-${lic.numero}`,
    orgao_cnpj: null as string | null, // Portal MG HTML scraping doesn't provide CNPJ
    orgao_nome: lic.orgao,
    orgao_esfera: 'E', // Estadual
    modalidade_id: modalidade.id,
    modalidade_nome: modalidade.nome,
    objeto: lic.objeto,
    valor_estimado: lic.valor,
    data_publicacao: lic.dataPublicacao,
    data_abertura: lic.dataAbertura,
    situacao_nome: lic.situacao,
    uf: 'MG',
    municipio: null as string | null,
    link_sistema_origem: lic.url,
    status: 'new' as const,
    source: 'portal_mg' as const,
    raw_data: lic as unknown as Record<string, unknown>,
  }
}
