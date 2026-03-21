/** Shared result type for certidão scrapers */
export interface CertidaoResult {
  tipo: string
  label: string
  situacao: 'regular' | 'irregular' | 'error' | 'pending' | 'manual'
  detalhes: string
  numero: string | null
  emissao: string | null
  validade: string | null
  pdf_url: string | null
  consulta_url: string | null
}
