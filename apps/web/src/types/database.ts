/**
 * Shared frontend types for Supabase query results.
 *
 * These mirror the shapes returned by cache.ts queries and are used
 * across pages/components to replace `any` / `unknown` assertions.
 */

// ─── Tender (from match list / tender list) ─────────────────────────────────

export interface TenderRow {
  id: string
  objeto: string | null
  orgao_nome: string | null
  orgao_cnpj: string | null
  uf: string | null
  municipio: string | null
  valor_estimado: number | null
  valor_homologado: number | null
  data_abertura: string | null
  data_publicacao: string | null
  modalidade_nome: string | null
  modalidade_id: number | null
  status: string | null
  situacao_nome: string | null
  link_sistema_origem: string | null
  link_pncp: string | null
  source: string | null
  tender_documents?: { id: string }[]
}

// ─── Tender Detail (full tender page) ───────────────────────────────────────

export interface TenderDetail extends TenderRow {
  pncp_id: string | null
  resumo: string | null
  requisitos: Record<string, unknown> | null
  tender_documents: TenderDocument[]
}

export interface TenderDocument {
  id: string
  titulo: string | null
  tipo: string | null
  url: string
  texto_extraido: string | null
  status: string
}

// ─── Match (from match list query) ──────────────────────────────────────────

export interface MatchRow {
  id: string
  score: number
  status: string
  ai_justificativa: string | null
  recomendacao: string | null
  match_source: string | null
  created_at: string
  tenders: TenderRow
}

// ─── Match Detail (single match page with full tender) ──────────────────────

export interface MatchDetail {
  id: string
  score: number
  status: string
  ai_justificativa: string | null
  recomendacao: string | null
  match_source: string | null
  breakdown: unknown[]
  riscos: string[]
  acoes_necessarias: string[]
  created_at: string
  tenders: TenderDetail
}

// ─── Company ────────────────────────────────────────────────────────────────

export interface CompanyProfile {
  id: string
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  porte: string | null
  uf: string | null
  municipio: string | null
  cnae_principal: string | null
  cnaes_secundarios: string[]
  descricao_servicos: string | null
  capacidades: string[]
  certificacoes: string[]
  palavras_chave: string[]
}

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export interface DashboardStats {
  totalMatches: number
  totalTenders: number
  avgScore: number
  newMatchesToday: number
}
