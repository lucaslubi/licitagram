import { z } from 'zod'
import { isValidCnpj } from '@/lib/cnpj/lookup'

export const cnpjSchema = z
  .string({ required_error: 'Informe o CNPJ do órgão' })
  .trim()
  .refine((v) => isValidCnpj(v), { message: 'CNPJ inválido' })

export const orgaoConfirmSchema = z.object({
  cnpj: cnpjSchema,
  razaoSocial: z.string().min(2, 'Razão social muito curta').max(500),
  nomeFantasia: z.string().max(500).optional().nullable(),
  esfera: z.enum(['federal', 'estadual', 'municipal', 'distrital'], {
    errorMap: () => ({ message: 'Selecione uma esfera válida' }),
  }),
  poder: z.enum(['executivo', 'legislativo', 'judiciario', 'autonomo']).optional().nullable(),
  uf: z
    .string()
    .length(2, 'UF tem 2 letras')
    .toUpperCase()
    .optional()
    .nullable(),
  municipio: z.string().max(200).optional().nullable(),
  codigoIbge: z.string().max(7).optional().nullable(),
  naturezaJuridica: z.string().max(4).optional().nullable(),
})
export type OrgaoConfirmInput = z.infer<typeof orgaoConfirmSchema>

export const perfilSchema = z.object({
  nomeCompleto: z.string().trim().min(2, 'Nome muito curto').max(200),
  cargo: z.string().trim().max(120).optional().nullable(),
  papel: z.enum([
    'requisitante',
    'agente_contratacao',
    'coordenador',
    'assessor_juridico',
    'ordenador_despesa',
    'admin',
  ]),
})
export type PerfilInput = z.infer<typeof perfilSchema>

export const objetivoSchema = z.enum(['pca_2027', 'criar_etp', 'importar_processo', 'explorar'], {
  errorMap: () => ({ message: 'Escolha um objetivo' }),
})
export type Objetivo = z.infer<typeof objetivoSchema>

export const completeOnboardingSchema = orgaoConfirmSchema.merge(perfilSchema).extend({
  objetivo: objetivoSchema,
})
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>
