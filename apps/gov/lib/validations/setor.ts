import { z } from 'zod'

export const setorSchema = z.object({
  nome: z.string({ required_error: 'Informe o nome do setor' }).trim().min(2, 'Nome muito curto').max(200),
  sigla: z.string().trim().max(20).optional().nullable(),
  responsavelId: z.string().uuid().optional().nullable(),
})
export type SetorInput = z.infer<typeof setorSchema>
