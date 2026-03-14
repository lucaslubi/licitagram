import { z } from 'zod'

export const tenderRequirementSchema = z.object({
  categoria: z.string().transform((v) => {
    const valid = [
      'habilitacao_juridica',
      'qualificacao_tecnica',
      'qualificacao_economica',
      'regularidade_fiscal',
      'proposta_tecnica',
      'outro',
    ]
    return valid.includes(v) ? v : 'outro'
  }),
  descricao: z.string(),
  obrigatorio: z.boolean().catch(true),
  detalhes: z.string().catch(''),
})

export const tenderRequirementsSchema = z.object({
  resumo: z.string(),
  requisitos: z.array(tenderRequirementSchema).catch([]),
  prazo_execucao: z.string().nullable().catch(null),
  valor_estimado: z.union([z.number(), z.string().transform((v) => {
    const n = parseFloat(v.replace(/[^\d.,]/g, '').replace(',', '.'))
    return isNaN(n) ? null : n
  })]).nullable().catch(null),
  local_execucao: z.string().nullable().catch(null),
  cnae_relacionados: z.array(z.string()).catch([]),
})

export const matchResultSchema = z.object({
  score: z.union([
    z.number(),
    z.string().transform((v) => parseInt(v, 10)),
  ]).pipe(z.number().min(0).max(100)).transform((v) => Math.round(v)),
  breakdown: z.array(
    z.object({
      category: z.string().catch('geral'),
      score: z.union([
        z.number(),
        z.string().transform((v) => parseInt(v, 10)),
      ]).pipe(z.number().min(0).max(100)).transform((v) => Math.round(v)).catch(50),
      reason: z.string().catch(''),
    }),
  ).catch([]),
  justificativa: z.string().catch('Avaliação automática'),
  recomendacao: z.string().transform((v) => {
    const valid = ['participar', 'avaliar_melhor', 'nao_recomendado']
    return valid.includes(v) ? v as 'participar' | 'avaliar_melhor' | 'nao_recomendado' : 'avaliar_melhor'
  }).catch('avaliar_melhor' as const),
  riscos: z.array(z.string()).catch([]),
  acoes_necessarias: z.array(z.string()).catch([]),
})

export type TenderRequirementInput = z.infer<typeof tenderRequirementSchema>
export type TenderRequirementsInput = z.infer<typeof tenderRequirementsSchema>
export type MatchResultInput = z.infer<typeof matchResultSchema>
