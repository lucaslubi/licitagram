import pdf from 'pdf-parse'
import AdmZip from 'adm-zip'
import { logger } from '../lib/logger'

/**
 * Extract text from a URL that may be a PDF or a ZIP containing PDFs.
 * Handles PNCP's .zip archives transparently.
 */
export async function extractTextFromPDF(url: string): Promise<string | null> {
  try {
    logger.info({ url }, 'Downloading document')
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Licitagram/1.0; +https://licitagram.com.br)',
        'Accept': 'application/pdf, application/zip, */*',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to download document')
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    if (buffer.length < 100) {
      logger.warn({ url, size: buffer.length }, 'Document too small')
      return null
    }

    // Detect if it's a ZIP file (magic bytes PK\x03\x04)
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04
    const contentType = response.headers.get('content-type') || ''
    const looksLikeZip = isZip || contentType.includes('zip') || url.toLowerCase().endsWith('.zip')

    if (looksLikeZip) {
      return extractFromZip(buffer, url)
    }

    // Regular PDF extraction
    return extractFromPdfBuffer(buffer, url)
  } catch (error) {
    logger.error({ url, error }, 'Failed to extract document text')
    return null
  }
}

/** Extract text from a PDF buffer */
async function extractFromPdfBuffer(buffer: Buffer, source: string): Promise<string | null> {
  try {
    const data = await pdf(buffer)
    const text = data.text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!text || text.length < 50) {
      logger.warn({ source, pages: data.numpages }, 'PDF has no extractable text')
      return null
    }

    logger.info({ source, pages: data.numpages, chars: text.length }, 'PDF text extracted')
    return text
  } catch (err) {
    logger.warn({ source, error: err }, 'Failed to parse PDF buffer')
    return null
  }
}

/** Extract text from all PDFs inside a ZIP archive */
async function extractFromZip(buffer: Buffer, url: string): Promise<string | null> {
  try {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()
    const pdfEntries = entries.filter((e) =>
      !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf'),
    )

    if (pdfEntries.length === 0) {
      logger.warn({ url, totalEntries: entries.length }, 'ZIP contains no PDF files')
      return null
    }

    logger.info({ url, pdfCount: pdfEntries.length }, 'Extracting PDFs from ZIP')

    const texts: string[] = []
    for (const entry of pdfEntries) {
      const pdfBuffer = entry.getData()
      const text = await extractFromPdfBuffer(pdfBuffer, `${url}/${entry.entryName}`)
      if (text) {
        texts.push(`--- ${entry.entryName} ---\n${text}`)
      }
    }

    if (texts.length === 0) {
      logger.warn({ url }, 'No text extracted from any PDF in ZIP')
      return null
    }

    const combined = texts.join('\n\n')
    logger.info({ url, pdfsExtracted: texts.length, totalChars: combined.length }, 'ZIP extraction complete')
    return combined
  } catch (err) {
    logger.error({ url, error: err }, 'Failed to extract ZIP')
    return null
  }
}
