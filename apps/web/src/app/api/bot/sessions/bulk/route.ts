import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'
import { enqueueBotSession } from '@/lib/queues/bot-producer'

/**
 * POST /api/bot/sessions/bulk
 *
 * Cria múltiplas sessões de lance em lote. Cada uma pode ter horário de
 * início próprio (scheduled_at) — se estiver no futuro, sessão fica em
 * status='scheduled' até o watchdog promover pra 'pending' no momento.
 *
 * Body:
 * {
 *   sessions: [
 *     {
 *       config_id: string,
 *       pregao_id: string,          // identificador do pregão no portal
 *       tender_id?: string,          // id da licitação no licitagram
 *       portal?: string,             // opcional — herda do config
 *       scheduled_at?: string,       // ISO-8601, opcional (null = agora)
 *       min_price?: number,          // piso de lance
 *       max_bids?: number,
 *       strategy_config?: object,
 *       mode?: 'supervisor'|'auto_bid'|'shadow',
 *       idempotency_key?: string,
 *     },
 *     ...
 *   ]
 * }
 *
 * Retorna:
 * { results: [{session_id, pregao_id, status: 'created'|'deduped'|'error', error?}, ...],
 *   summary: { total, created, deduped, errors, scheduled, immediate } }
 *
 * Comportamento:
 * - scheduled_at no futuro → status 'scheduled' (watchdog promove no horário)
 * - scheduled_at no passado/ausente → status 'pending' + enqueue imediato
 * - idempotency_key já existente → reusa sessão (status='deduped')
 */
export async function POST(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
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

    const body = await req.json()
    const sessions = Array.isArray(body?.sessions) ? body.sessions : null

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: 'Campo obrigatorio: sessions (array nao vazio)' },
        { status: 400 },
      )
    }
    if (sessions.length > 100) {
      return NextResponse.json(
        { error: 'Maximo 100 sessoes por requisicao' },
        { status: 400 },
      )
    }

    // Validação mínima por item
    const validModes = new Set(['supervisor', 'auto_bid', 'shadow'])
    for (const [idx, s] of sessions.entries()) {
      if (!s?.config_id || !s?.pregao_id) {
        return NextResponse.json(
          { error: `Item ${idx}: config_id e pregao_id obrigatorios` },
          { status: 400 },
        )
      }
      if (s.mode && !validModes.has(s.mode)) {
        return NextResponse.json(
          { error: `Item ${idx}: mode invalido. Use supervisor|auto_bid|shadow` },
          { status: 400 },
        )
      }
      if (s.scheduled_at) {
        const d = new Date(s.scheduled_at)
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: `Item ${idx}: scheduled_at deve ser ISO-8601 valido` },
            { status: 400 },
          )
        }
      }
    }

    // RPC faz o insert transacional + dedup + decide status por item
    const { data: results, error } = await supabase.rpc('bulk_create_bot_sessions', {
      p_company_id: profile.company_id,
      p_sessions: sessions,
    })

    if (error) {
      console.error('[API bot/sessions/bulk] RPC error:', error)
      return NextResponse.json({ error: 'Erro ao criar sessoes em lote' }, { status: 500 })
    }

    // RPC retorna colunas prefixadas (result_*) pra evitar ambiguidade com
    // variáveis PL/pgSQL dentro da função. Renormaliza pra shape da API.
    const rawRows = (results ?? []) as Array<{
      result_session_id: string | null
      result_pregao_id: string
      result_status: 'created' | 'deduped' | 'error'
      result_error: string | null
    }>

    const rows = rawRows.map((r) => ({
      session_id: r.result_session_id,
      pregao_id: r.result_pregao_id,
      status: r.result_status,
      error: r.result_error,
    }))

    // Enfileira execução imediata pra sessões criadas SEM scheduled_at futuro.
    // As "scheduled" são picked up pelo watchdog no horário.
    const summary = { total: rows.length, created: 0, deduped: 0, errors: 0, scheduled: 0, immediate: 0 }

    // Acumula linhas de bot_session_items pra inserir em lote no final
    type ItemInsert = {
      session_id: string
      item_numero: number
      piso: number | null
      ativo: boolean
      descricao: string | null
      valor_estimado: number | null
    }
    const itemsToInsert: ItemInsert[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const input = sessions[i]! as {
        scheduled_at?: string
        items?: Array<{
          numero: number
          piso: number | null
          ativo: boolean
          descricao?: string
          valor_estimado?: number | null
        }>
      }

      if (row.status === 'error' || !row.session_id) {
        summary.errors++
        continue
      }
      if (row.status === 'deduped') {
        summary.deduped++
        continue
      }

      summary.created++

      // Se o user configurou items individualmente, prepara insert
      if (input.items && Array.isArray(input.items) && input.items.length > 0) {
        for (const it of input.items) {
          itemsToInsert.push({
            session_id: row.session_id,
            item_numero: Number(it.numero),
            piso: it.piso != null ? Number(it.piso) : null,
            ativo: it.ativo !== false,
            descricao: it.descricao ?? null,
            valor_estimado: it.valor_estimado ?? null,
          })
        }
      }

      // Se tem scheduled_at no futuro → watchdog cuida
      if (input.scheduled_at && new Date(input.scheduled_at).getTime() > Date.now()) {
        summary.scheduled++
        continue
      }

      // Senão, enfileira agora
      try {
        await enqueueBotSession(row.session_id, 'bulk', 0)
        summary.immediate++
      } catch (enqueueErr) {
        console.error('[API bot/sessions/bulk] enqueue error:', enqueueErr)
        summary.errors++
      }
    }

    // Insert em lote dos items (se houver)
    if (itemsToInsert.length > 0) {
      const { error: itemsErr } = await supabase
        .from('bot_session_items')
        .insert(itemsToInsert)
      if (itemsErr) {
        console.error('[API bot/sessions/bulk] insert items error:', itemsErr)
        // Não falha tudo — sessões já foram criadas; só loga.
        // User pode reconfigurar itens depois se precisar.
      }
    }

    return NextResponse.json({ results: rows, summary }, { status: 201 })
  } catch (err) {
    console.error('[API bot/sessions/bulk] POST error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
