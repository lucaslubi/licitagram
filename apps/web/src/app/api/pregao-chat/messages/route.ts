import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasFeature, hasActiveSubscription } from '@/lib/auth-helpers'

/**
 * GET /api/pregao-chat/messages?pregao_id=<uuid>&limit=50&offset=0
 * Paginated messages for a monitored pregão, newest first.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasActiveSubscription(user)) return NextResponse.json({ error: 'Assinatura ativa necessária' }, { status: 403 })
    if (!hasFeature(user, 'pregao_chat_monitor')) return NextResponse.json({ error: 'Recurso disponível no plano Profissional+' }, { status: 403 })

    const pregaoId = req.nextUrl.searchParams.get('pregao_id')
    if (!pregaoId) {
      return NextResponse.json({ error: 'pregao_id é obrigatório' }, { status: 400 })
    }

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10), 200)
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10)

    const supabase = await createClient()

    // RLS ensures only company's own messages are returned
    const { data: messages, error, count } = await supabase
      .from('pregao_mensagens')
      .select('*', { count: 'exact' })
      .eq('pregao_id', pregaoId)
      .order('data_hora_portal', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('[API pregao-chat/messages] GET error:', error)
      return NextResponse.json({ error: 'Erro ao listar mensagens' }, { status: 500 })
    }

    return NextResponse.json({
      messages: messages ?? [],
      total: count ?? 0,
      limit,
      offset,
    })
  } catch (err) {
    console.error('[API pregao-chat/messages] GET error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
