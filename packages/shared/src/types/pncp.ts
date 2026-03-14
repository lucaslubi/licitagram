export interface PNCPOrgao {
  cnpj: string
  razaoSocial: string
  esferaId: string
  poderId: string
}

export interface PNCPUnidadeOrgao {
  ufSigla: string | null
  ufNome: string | null
  municipioNome: string | null
  nomeUnidade: string | null
  codigoUnidade: string | null
  codigoIbge: string | null
}

export interface PNCPContratacao {
  orgaoEntidade: PNCPOrgao
  unidadeOrgao: PNCPUnidadeOrgao | null
  anoCompra: number
  sequencialCompra: number
  numeroCompra: string
  objetoCompra: string
  modalidadeId: number
  modalidadeNome: string
  dataPublicacaoPncp: string
  dataAberturaProposta: string | null
  dataEncerramentoProposta: string | null
  valorTotalEstimado: number | null
  valorTotalHomologado: number | null
  linkSistemaOrigem: string | null
  situacaoCompraId: number
  situacaoCompraNome: string
}

export interface PNCPResponse {
  data: PNCPContratacao[]
  totalRegistros: number
  totalPaginas: number
  paginaAtual: number
}

export interface PNCPDocumento {
  tipo: string
  titulo: string
  url: string
  dataPublicacao: string
}
