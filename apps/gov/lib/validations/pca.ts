import { z } from 'zod'

const TITULO = z.string().trim().min(3, 'Título muito curto').max(200)
const ANO = z.coerce.number().int().min(2024).max(2099)

export const pcaCampanhaSchema = z.object({
  ano: ANO,
  titulo: TITULO,
  prazoResposta: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: 'Prazo precisa estar no futuro',
  }),
  setorIds: z.array(z.string().uuid()).min(1, 'Escolha pelo menos 1 setor'),
})
export type PcaCampanhaInput = z.infer<typeof pcaCampanhaSchema>

export const itemPcaSchema = z.object({
  descricaoLivre: z.string().trim().min(3, 'Descreva o item'),
  quantidade: z.coerce.number().positive().optional().nullable(),
  unidadeMedida: z.string().trim().max(50).optional().nullable(),
  mesDemanda: z.coerce.number().int().min(1).max(12).optional().nullable(),
  justificativa: z.string().trim().max(2000).optional().nullable(),
})
export type ItemPcaInput = z.infer<typeof itemPcaSchema>
