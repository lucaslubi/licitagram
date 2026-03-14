import { z } from 'zod'
import { cleanCNPJ, validateCNPJ } from '../utils/cnpj'

export const companySchema = z.object({
  cnpj: z
    .string()
    .min(14)
    .transform(cleanCNPJ)
    .refine(validateCNPJ, { message: 'CNPJ inválido' }),
  razao_social: z.string().min(2, 'Razão social é obrigatória'),
  nome_fantasia: z.string().nullable().optional(),
  cnae_principal: z.string().nullable().optional(),
  cnaes_secundarios: z.array(z.string()).default([]),
  descricao_servicos: z.string().nullable().optional(),
  porte: z.enum(['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE']).nullable().optional(),
  uf: z.string().length(2).nullable().optional(),
  municipio: z.string().nullable().optional(),
  capacidade_tecnica: z.array(z.string()).default([]),
  certificacoes: z.array(z.string()).default([]),
  palavras_chave: z.array(z.string()).default([]),
  faturamento_anual: z.number().nullable().optional(),
  num_funcionarios: z.number().int().nullable().optional(),
})

export type CompanyInput = z.infer<typeof companySchema>
