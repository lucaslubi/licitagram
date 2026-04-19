import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface UserProfile {
  userId: string
  email: string
  nomeCompleto: string
  cargo: string | null
  papel: string
  mfaHabilitado: boolean
  orgao: {
    id: string
    cnpj: string
    razaoSocial: string
    nomeFantasia: string | null
    esfera: string
    uf: string | null
    municipio: string | null
    logoUrl: string | null
  } | null
  onboardedAt: string | null
}

/**
 * Loads the current user's profile + linked órgão via the
 * `licitagov.get_current_profile()` RPC. Returns null if the user is not
 * authenticated OR has not completed onboarding (no usuarios row yet).
 *
 * Cached per request (React's cache helper) so multiple components on the
 * same page don't hit the DB repeatedly.
 */
export const getCurrentProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('get_current_profile')
  if (error || !data || data.length === 0) return null
  const row = data[0]
  if (!row) return null

  return {
    userId: row.user_id,
    email: row.email,
    nomeCompleto: row.nome_completo,
    cargo: row.cargo,
    papel: row.papel,
    mfaHabilitado: row.mfa_habilitado,
    orgao: row.orgao_id
      ? {
          id: row.orgao_id,
          cnpj: row.orgao_cnpj,
          razaoSocial: row.orgao_razao_social,
          nomeFantasia: row.orgao_nome_fantasia,
          esfera: row.orgao_esfera,
          uf: row.orgao_uf,
          municipio: row.orgao_municipio,
          logoUrl: (row as { orgao_logo_url?: string | null }).orgao_logo_url ?? null,
        }
      : null,
    onboardedAt: row.onboarded_at,
  }
})

/** Returns true when the user has completed onboarding (has an órgão linked). */
export async function hasCompletedOnboarding(): Promise<boolean> {
  const profile = await getCurrentProfile()
  return profile !== null && profile.orgao !== null
}
