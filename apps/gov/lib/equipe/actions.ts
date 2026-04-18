'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { generateSecureToken, hashToken } from '@/lib/crypto/token'
import { logger } from '@/lib/logger'
import { Resend } from 'resend'
import { PAPEIS, PAPEL_LABEL, type Papel } from './constants'

type ActionResult = { ok: true; url?: string } | { ok: false; error: string }

const EXPIRA_DIAS = 7

export async function inviteMemberAction(email: string, papel: Papel): Promise<ActionResult> {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'Email inválido' }
  }
  if (!PAPEIS.includes(papel)) {
    return { ok: false, error: 'Papel inválido' }
  }

  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode convidar' }
  }

  const { token, hash } = generateSecureToken()
  const expira = new Date(Date.now() + EXPIRA_DIAS * 24 * 3600 * 1000)

  const supabase = createClient()
  const { error } = await supabase.rpc('create_convite_equipe', {
    p_email: email.toLowerCase().trim(),
    p_papel: papel,
    p_token_hash: hash,
    p_expira_em: expira.toISOString(),
  })
  if (error) return { ok: false, error: error.message }

  // Envia email via Resend (fire-and-forget; link em claro vai só aqui)
  const origin = headers().get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://gov.licitagram.com'
  const inviteUrl = `${origin}/convite/${token}`

  try {
    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      const resend = new Resend(apiKey)
      const from = process.env.EMAIL_FROM || 'LicitaGram Gov <noreply@licitagram.com>'
      await resend.emails.send({
        from,
        to: email,
        subject: `Convite para ${profile.orgao.razaoSocial} no LicitaGram Gov`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
            <h1 style="font-size: 20px; margin: 0 0 12px 0;">Você foi convidado(a) pro LicitaGram Gov</h1>
            <p style="line-height: 1.6; color: #475569;">
              <strong>${escapeHtml(profile.orgao.razaoSocial)}</strong> convidou você para participar da fase interna de licitações como <strong>${PAPEL_LABEL[papel]}</strong>.
            </p>
            <div style="margin: 20px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Aceitar convite →
              </a>
            </div>
            <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
              Este convite expira em 7 dias. Se o link acima não funcionar:<br/>
              <code style="word-break: break-all; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 11px;">${inviteUrl}</code>
            </p>
          </div>
        `,
        replyTo: profile.email,
      })
    }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'invite email failed (non-blocking)')
  }

  revalidatePath('/configuracoes/equipe')
  return { ok: true, url: inviteUrl }
}

export async function revokeConviteAction(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.rpc('revoke_convite_equipe', { p_id: id })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/equipe')
  return { ok: true }
}

export async function removeMembroAction(userId: string, novoPapel: Papel = 'requisitante'): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.rpc('remove_membro_equipe', {
    p_user_id: userId,
    p_novo_papel: novoPapel,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/equipe')
  return { ok: true }
}

export async function acceptConviteAction(token: string): Promise<{ ok: true; orgaoId: string } | { ok: false; error: string }> {
  if (!token || token.length < 16) return { ok: false, error: 'Token inválido' }
  const supabase = createClient()
  const hash = hashToken(token)
  const { data, error } = await supabase.rpc('accept_convite_equipe', { p_token_hash: hash })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/', 'layout')
  return { ok: true, orgaoId: data as string }
}

export async function resolveConviteAction(token: string) {
  if (!token || token.length < 16) return null
  const supabase = createClient()
  const hash = hashToken(token)
  const { data, error } = await supabase.rpc('resolve_convite_equipe', { p_token_hash: hash })
  if (error) return null
  const rows = (data ?? []) as Record<string, unknown>[]
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id as string,
    email: row.email as string,
    papel: row.papel as Papel,
    orgaoRazaoSocial: row.orgao_razao_social as string,
    orgaoNomeFantasia: (row.orgao_nome_fantasia as string | null) ?? null,
    expiraEm: row.expira_em as string,
    aceitoEm: (row.aceito_em as string | null) ?? null,
  }
}

export interface MembroRow {
  id: string
  email: string
  nomeCompleto: string
  cargo: string | null
  papel: string
  mfaHabilitado: boolean
  ultimoAcessoEm: string | null
  criadoEm: string
}
export async function listEquipe(): Promise<MembroRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_equipe')
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    email: r.email as string,
    nomeCompleto: r.nome_completo as string,
    cargo: (r.cargo as string | null) ?? null,
    papel: r.papel as string,
    mfaHabilitado: Boolean(r.mfa_habilitado),
    ultimoAcessoEm: (r.ultimo_acesso_em as string | null) ?? null,
    criadoEm: r.criado_em as string,
  }))
}

export interface ConviteRow {
  id: string
  email: string
  papel: string
  expiraEm: string
  criadoEm: string
  aceitoEm: string | null
  revogado: boolean
}
export async function listConvites(): Promise<ConviteRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_convites_pendentes')
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    email: r.email as string,
    papel: r.papel as string,
    expiraEm: r.expira_em as string,
    criadoEm: r.criado_em as string,
    aceitoEm: (r.aceito_em as string | null) ?? null,
    revogado: Boolean(r.revogado),
  }))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
