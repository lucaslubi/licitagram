declare module 'pdf-parse' {
  interface PDFParseResult {
    numpages: number
    numrender: number
    info: Record<string, unknown>
    metadata: Record<string, unknown> | null
    text: string
    version: string
  }

  function pdfParse(
    dataBuffer: Buffer | ArrayBuffer,
    options?: {
      pagerender?: (pageData: unknown) => string
      max?: number
      version?: string
    },
  ): Promise<PDFParseResult>

  export = pdfParse
}
