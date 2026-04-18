'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { logger } from '@/lib/logger'
import { generateSecureToken } from '@/lib/crypto/token'
import { pcaCampanhaSchema, type PcaCampanhaInput } from '@/lib/validations/pca'
import { sendCampanhaInvite } from '@/lib/email/campanha-invite'
import { listSetoresAction } from '@/lib/setores/actions'

type ActionResult = { ok: true; campanhaId: string } | { ok: false; error: string; field?: string }

export async function createCampanhaAction(input: PcaCampanhaInput): Promise<ActionResult> {
  let parsed: PcaCampanhaInput
  try {
    parsed = pcaCampanhaSchema.parse(input)
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0]
      return { ok: false, error: first?.message ?? 'Entrada inválida', field: first?.path?.[0]?.toString() }
    }
    return { ok: false, error: 'Entrada inválida' }
  }

  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão cadastrado' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode criar campanha' }
  }

  // Busca setores válidos para validar + nome usado no email
  const setores = await listSetoresAction()
  const setoresById = new Map(setores.filter((s) => s.ativo).map((s) => [s.id, s]))
  const valid = parsed.setorIds.filter((id) => setoresById.has(id))
  if (valid.length === 0) {
    return { ok: false, error: 'Setores inválidos ou inativos' }
  }

  // Gera um token por setor + hash correspondente (só enviamos hash pro DB)
  const tokensBySetor = new Map<string, { token: string; hash: string }>()
  for (const setorId of valid) {
    tokensBySetor.set(setorId, generateSecureToken())
  }

  const setoresPayload = valid.map((setorId) => ({
    setor_id: setorId,
    token_hash: tokensBySetor.get(setorId)!.hash,
    expira_em: parsed.prazoResposta.toISOString(),
  }))

  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_pca_campanha', {
    p_ano: parsed.ano,
    p_titulo: parsed.titulo,
    p_prazo_resposta_em: parsed.prazoResposta.toISOString(),
    p_setores: setoresPayload,
  })
  if (error) {
    logger.error({ err: error.message, code: error.code }, 'create_pca_campanha RPC failed')
    return { ok: false, error: error.message }
  }
  const campanhaId = data as string

  // Dispara emails em background (fire-and-forget por setor)
  const origin = headers().get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://gov.licitagram.com'
  await Promise.allSettled(
    valid.map(async (setorId) => {
      const s = setoresById.get(setorId)
      const tokenPair = tokensBySetor.get(setorId)!
      if (!s?.responsavelId) return
      // Precisamos do email do responsável
      const { data: userRow } = await supabase
        .schema('licitagov')
        .from('usuarios')
        .select('email, nome_completo')
        .eq('id', s.responsavelId)
        .single()
      const email = (userRow as { email?: string | null } | null)?.email
      if (!email) return
      await sendCampanhaInvite({
        to: email,
        nomeResponsavel: (userRow as { nome_completo?: string | null } | null)?.nome_completo ?? s.nome,
        orgaoRazaoSocial: profile.orgao!.razaoSocial,
        setorNome: s.nome,
        tituloCampanha: parsed.titulo,
        ano: parsed.ano,
        prazo: parsed.prazoResposta,
        publicUrl: `${origin}/s/${tokenPair.token}`,
      })
    }),
  )

  revalidatePath('/pca')
  revalidatePath('/dashboard')
  return { ok: true, campanhaId }
}

export async function createCampanhaAndRedirectAction(input: PcaCampanhaInput): Promise<void | ActionResult> {
  const res = await createCampanhaAction(input)
  if (!res.ok) return res
  redirect(`/pca/${res.campanhaId}`)
}
