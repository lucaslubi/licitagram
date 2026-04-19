'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'

type Result = { ok: true } | { ok: false; error: string }

export async function updateOrgaoLogoAction(logoUrl: string): Promise<Result> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode alterar a logomarca' }
  }
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) {
    return { ok: false, error: 'URL inválida' }
  }
  const supabase = createClient()
  const { error } = await supabase.rpc('update_orgao_logo', { p_logo_url: logoUrl })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/orgao')
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function removeOrgaoLogoAction(): Promise<Result> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode alterar a logomarca' }
  }
  const supabase = createClient()
  const { error } = await supabase.rpc('update_orgao_logo', { p_logo_url: null })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/orgao')
  revalidatePath('/', 'layout')
  return { ok: true }
}
