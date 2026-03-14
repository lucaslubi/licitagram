import pdf from 'pdf-parse'
import { logger } from '../lib/logger'

export async function extractTextFromPDF(url: string): Promise<string | null> {
  try {
    logger.info({ url }, 'Downloading PDF')
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Licitagram/1.0; +https://licitagram.com.br)',
        'Accept': 'application/pdf, */*',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to download PDF')
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const data = await pdf(buffer)

    const text = data.text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    logger.info({ url, pages: data.numpages, chars: text.length }, 'PDF text extracted')
    return text
  } catch (error) {
    logger.error({ url, error }, 'Failed to extract PDF text')
    return null
  }
}
