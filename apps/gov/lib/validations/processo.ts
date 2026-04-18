import { z } from 'zod'

export const processoSchema = z.object({
  objeto: z.string().trim().min(5, 'Descreva o objeto (min 5 caracteres)').max(2000),
  tipo: z.enum(['material', 'servico', 'obra', 'servico_engenharia']),
  modalidade: z.enum(['pregao', 'concorrencia', 'dispensa', 'inexigibilidade', 'concurso', 'leilao', 'dialogo_competitivo']).optional().nullable(),
  setorRequisitanteId: z.string().uuid().optional().nullable(),
  valorEstimado: z.coerce.number().nonnegative().optional().nullable(),
  campanhaPcaId: z.string().uuid().optional().nullable(),
})
export type ProcessoInput = z.infer<typeof processoSchema>

export const TIPO_LABEL: Record<ProcessoInput['tipo'], string> = {
  material: 'Material',
  servico: 'Serviço',
  obra: 'Obra',
  servico_engenharia: 'Serviço de engenharia',
}

export const MODALIDADE_LABEL: Record<NonNullable<ProcessoInput['modalidade']>, string> = {
  pregao: 'Pregão',
  concorrencia: 'Concorrência',
  dispensa: 'Dispensa',
  inexigibilidade: 'Inexigibilidade',
  concurso: 'Concurso',
  leilao: 'Leilão',
  dialogo_competitivo: 'Diálogo competitivo',
}

export const FASE_LABEL: Record<string, string> = {
  dfd: 'DFD',
  etp: 'ETP',
  riscos: 'Mapa de Riscos',
  precos: 'Pesquisa de Preços',
  tr: 'Termo de Referência',
  compliance: 'Compliance',
  parecer: 'Parecer Jurídico',
  edital: 'Edital',
  publicacao: 'Publicação',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
}
