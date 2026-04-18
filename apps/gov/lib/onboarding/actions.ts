'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { lookupCnpj, CnpjLookupError, type CnpjLookupResult } from '@/lib/cnpj/lookup'
import { lookupNatureza } from '@/lib/utils/natureza-juridica'
import { sendWelcomeEmail } from '@/lib/email/welcome'
import {
  cnpjSchema,
  completeOnboardingSchema,
  type CompleteOnboardingInput,
} from '@/lib/validations/onboarding'

type LookupSuccess = {
  ok: true
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  esfera: 'federal' | 'estadual' | 'municipal' | 'distrital' | null
  poder: 'executivo' | 'legislativo' | 'judiciario' | 'autonomo' | null
  uf: string | null
  municipio: string | null
  codigoIbge: string | null
  naturezaCodigo: string | null
  naturezaJuridica: string | null
  isPublicOrgan: boolean
}
type LookupError = { ok: false; error: string }
export type LookupResult = LookupSuccess | LookupError

/** Server action for the CNPJ step. Validates and queries BrasilAPI. */
export async function lookupCnpjAction(rawCnpj: string): Promise<LookupResult> {
  try {
    const cnpj = cnpjSchema.parse(rawCnpj)
    const data: CnpjLookupResult = await lookupCnpj(cnpj)
    const natureza = lookupNatureza(data.naturezaCodigo)
    return {
      ok: true,
      cnpj: data.cnpj,
      razaoSocial: data.razaoSocial,
      nomeFantasia: data.nomeFantasia,
      esfera: natureza?.esfera ?? null,
      poder: natureza?.poder ?? null,
      uf: data.uf,
      municipio: data.municipio,
      codigoIbge: data.codigoIbge,
      naturezaCodigo: data.naturezaCodigo,
      naturezaJuridica: data.naturezaJuridica,
      isPublicOrgan: natureza !== null,
    }
  } catch (e) {
    if (e instanceof CnpjLookupError) return { ok: false, error: e.message }
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? 'CNPJ inválido' }
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'lookupCnpjAction failed')
    return { ok: false, error: 'Falha ao consultar CNPJ' }
  }
}

type CompleteResult = { ok: true } | { ok: false; error: string; field?: string }

export async function completeOnboardingAction(
  input: CompleteOnboardingInput,
): Promise<CompleteResult> {
  let parsed: CompleteOnboardingInput
  try {
    parsed = completeOnboardingSchema.parse(input)
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0]
      return { ok: false, error: first?.message ?? 'Dados inválidos', field: first?.path?.[0]?.toString() }
    }
    return { ok: false, error: 'Dados inválidos' }
  }

  let orgaoId: string | null = null
  try {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('bootstrap_orgao', {
      p_cnpj: parsed.cnpj,
      p_razao_social: parsed.razaoSocial,
      p_nome_fantasia: parsed.nomeFantasia ?? '',
      p_esfera: parsed.esfera,
      p_poder: parsed.poder ?? '',
      p_uf: parsed.uf ?? '',
      p_municipio: parsed.municipio ?? '',
      p_codigo_ibge: parsed.codigoIbge ?? '',
      p_natureza_juridica: parsed.naturezaJuridica ?? '',
      p_nome_completo: parsed.nomeCompleto,
      p_cargo: parsed.cargo ?? '',
      p_papel: parsed.papel,
      p_objetivo: parsed.objetivo,
    })
    if (error) {
      logger.error({ err: error.message, code: error.code }, 'bootstrap_orgao RPC failed')
      return { ok: false, error: error.message }
    }
    orgaoId = (data as string | null) ?? null
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'completeOnboardingAction failed')
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao salvar onboarding' }
  }

  // Welcome email is fire-and-forget. Failure does NOT block onboarding.
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.email) {
      const origin =
        headers().get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://gov.licitagram.com'
      await sendWelcomeEmail({
        to: user.email,
        nomeCompleto: parsed.nomeCompleto,
        orgaoRazaoSocial: parsed.razaoSocial,
        objetivo: parsed.objetivo,
        appUrl: origin,
      })
    }
  } catch {
    // already logged inside sendWelcomeEmail
  }

  revalidatePath('/', 'layout')

  // Redirect server-side after success.
  if (orgaoId) {
    redirect('/dashboard')
  }
  return { ok: true }
}
