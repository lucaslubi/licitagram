import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'

/**
 * POST /api/bot/connect-link
 *
 * Gera uma chave única (UUID) válida por 10 minutos associada ao
 * user+company atual. O frontend embute essa chave no bookmarklet.
 *
 * Quando o user clicar no bookmarklet (estando no Compras.gov.br),
 * os tokens capturados são enviados pro /bot/connect-callback JUNTO
 * com essa chave. A callback valida a chave (em vez de cookie de sessão)
 * e identifica a company associada.
 *
 * Isso resolve o bug onde o user clicava no bookmarklet, a aba do
 * licitagram abria sem cookie válido e redirecionava pro login,
 * perdendo os tokens.
 */
export async function POST() {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', planUser.userId)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    // Expira em 10 minutos. Se o user não clicar no bookmarklet nesse
    // tempo, precisa gerar outro.
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('bot_connect_tokens')
      .insert({
        company_id: profile.company_id,
        user_id: planUser.userId,
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[connect-link] insert error', error)
      return NextResponse.json({ error: 'Erro ao gerar chave' }, { status: 500 })
    }

    return NextResponse.json({
      key: data.id,
      expires_at: expiresAt,
      valid_for_minutes: 10,
    })
  } catch (err) {
    console.error('[connect-link] error', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
