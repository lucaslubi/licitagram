export type TenderStatus = 'new' | 'analyzing' | 'analyzed' | 'error'

export type TenderModality =
  | 'leilao_eletronico'
  | 'dialogo_competitivo'
  | 'concurso'
  | 'concorrencia_eletronica'
  | 'concorrencia_presencial'
  | 'pregao_eletronico'
  | 'pregao_presencial'
  | 'dispensa'
  | 'inexigibilidade'
  | 'manifestacao_interesse'
  | 'pre_qualificacao'
  | 'credenciamento'
  | 'leilao_presencial'
  | 'inaplicabilidade'
  | 'chamada_publica'

export interface TenderRequirement {
  categoria:
    | 'habilitacao_juridica'
    | 'qualificacao_tecnica'
    | 'qualificacao_economica'
    | 'regularidade_fiscal'
    | 'proposta_tecnica'
    | 'outro'
  descricao: string
  obrigatorio: boolean
  detalhes: string
}

export interface TenderRequirements {
  resumo: string
  requisitos: TenderRequirement[]
  prazo_execucao: string | null
  valor_estimado: number | null
  local_execucao: string | null
  cnae_relacionados: string[]
}

export interface Tender {
  id: string
  pncp_id: string
  numero_compra: string | null
  ano_compra: number | null
  sequencial_compra: number | null
  orgao_cnpj: string | null
  orgao_nome: string | null
  orgao_esfera: string | null
  modalidade_id: number | null
  modalidade_nome: string | null
  objeto: string
  valor_estimado: number | null
  valor_homologado: number | null
  data_publicacao: string | null
  data_abertura: string | null
  data_encerramento: string | null
  link_sistema_origem: string | null
  link_pncp: string | null
  situacao_id: number | null
  situacao_nome: string | null
  uf: string | null
  municipio: string | null
  requisitos: TenderRequirements | null
  resumo: string | null
  status: TenderStatus
  raw_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface TenderDocument {
  id: string
  tender_id: string
  titulo: string | null
  tipo: string | null
  url: string
  storage_path: string | null
  texto_extraido: string | null
  status: 'pending' | 'downloading' | 'extracting' | 'done' | 'error'
  created_at: string
}
