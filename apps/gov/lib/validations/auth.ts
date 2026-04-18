import { z } from 'zod'

export const emailSchema = z
  .string({ required_error: 'Informe seu email' })
  .trim()
  .toLowerCase()
  .email('Email inválido')

export const passwordSchema = z
  .string({ required_error: 'Informe a senha' })
  .min(12, 'A senha precisa ter ao menos 12 caracteres')
  .max(128, 'Senha muito longa')

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})
export type LoginInput = z.infer<typeof loginSchema>

export const signupSchema = z
  .object({
    nomeCompleto: z
      .string({ required_error: 'Informe seu nome' })
      .trim()
      .min(2, 'Nome muito curto')
      .max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    aceitouTermos: z.literal(true, {
      errorMap: () => ({ message: 'Você precisa aceitar os termos para continuar' }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem',
  })
export type SignupInput = z.infer<typeof signupSchema>

export const forgotPasswordSchema = z.object({ email: emailSchema })
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem',
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const mfaChallengeSchema = z.object({
  code: z
    .string({ required_error: 'Informe o código MFA' })
    .trim()
    .regex(/^\d{6}$/, 'O código tem 6 dígitos'),
})
export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>
