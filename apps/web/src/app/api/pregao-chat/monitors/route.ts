import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasFeature, hasActiveSubscription } from '@/lib/auth-helpers'
import { enqueuePregaoFirstPoll } from '@/lib/queues/pregao-chat-producer'

/**
 * GET /api/pregao-chat/monitors
 * List monitored pregões for the authenticated user's company.
 */
export async function GET() {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasActiveSubscription(user)) return NextResponse.json({ error: 'Assinatura ativa necessária' }, { status: 403 })
    if (!hasFeature(user, 'pregao_chat_monitor')) return NextResponse.json({ error: 'Recurso disponível no plano Profissional+' }, { status: 403 })
    if (!user.companyId) return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })

    const supabase = await createClient()

    const { data: monitors, error } = await supabase
      .from('pregoes_monitorados')
      .select(`
        id, portal_slug, portal_pregao_id, portal_pregao_url, orgao_nome, orgao_uasg,
        numero_pregao, objeto_resumido, fase_atual, data_abertura, status_monitoramento,
        polling_interval_ms, ultimo_poll_em, ultimo_poll_sucesso_em, proximo_poll_em,
        erros_consecutivos, ultimo_erro, created_at
      `)
      .eq('company_id', user.companyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API pregao-chat/monitors] GET error:', error)
      return NextResponse.json({ error: 'Erro ao listar monitores' }, { status: 500 })
    }

    // Get unread critical/high message counts per monitor
    const monitorIds = (monitors ?? []).map((m: { id: string }) => m.id)
    let messageCounts: Record<string, number> = {}

    if (monitorIds.length > 0) {
      const { data: counts } = await supabase
        .from('pregao_mensagens')
        .select('pregao_id')
        .in('pregao_id', monitorIds)
        .in('classificacao_urgencia', ['critica', 'alta'])
        .is('notificacao_whatsapp_enviada_em', null)

      if (counts) {
        messageCounts = counts.reduce((acc: Record<string, number>, row: { pregao_id: string }) => {
          acc[row.pregao_id] = (acc[row.pregao_id] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      }
    }

    const monitorsWithCounts = (monitors ?? []).map((m: { id: string }) => ({
      ...m,
      mensagens_urgentes: messageCounts[m.id] || 0,
    }))

    return NextResponse.json({ monitors: monitorsWithCounts })
  } catch (err) {
    console.error('[API pregao-chat/monitors] GET error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * POST /api/pregao-chat/monitors
 * Create a new pregão monitor and enqueue first poll.
 *
 * Body: { credencial_id, portal_pregao_url, portal_pregao_id?, orgao_nome, numero_pregao, objeto_resumido? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasActiveSubscription(user)) return NextResponse.json({ error: 'Assinatura ativa necessária' }, { status: 403 })
    if (!hasFeature(user, 'pregao_chat_monitor')) return NextResponse.json({ error: 'Recurso disponível no plano Profissional+' }, { status: 403 })
    if (!user.companyId) return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })

    // Check monitor limit
    const supabase = await createClient()
    const planLimit = user.plan?.max_pregao_monitors ?? null

    if (planLimit !== null) {
      const { count } = await supabase
        .from('pregoes_monitorados')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', user.companyId)
        .in('status_monitoramento', ['ativo', 'pausado'])

      if ((count ?? 0) >= planLimit) {
        return NextResponse.json({
          error: `Limite de ${planLimit} pregões monitorados atingido. Faça upgrade para monitorar mais.`,
        }, { status: 403 })
      }
    }

    const body = await req.json()
    const { credencial_id, portal_pregao_url, portal_pregao_id, orgao_nome, numero_pregao, objeto_resumido } = body as {
      credencial_id?: string | null
      portal_pregao_url: string
      portal_pregao_id?: string
      orgao_nome?: string
      numero_pregao?: string
      objeto_resumido?: string
    }

    if (!portal_pregao_url) {
      return NextResponse.json({ error: 'URL do pregão é obrigatória' }, { status: 400 })
    }

    // Auto-detect portal from URL when not tied to an explicit credential.
    // Public monitoring (no credential) covers the Compras.gov.br use case
    // where the pregoeiro chat is readable without fornecedor login.
    let portalSlug: string | null = null
    let finalCredencialId: string | null = null

    if (credencial_id) {
      const { data: cred } = await supabase
        .from('pregao_portais_credenciais')
        .select('id, portal_slug, status')
        .eq('id', credencial_id)
        .single()
      if (!cred) return NextResponse.json({ error: 'Credencial não encontrada' }, { status: 404 })
      if (cred.status !== 'ativo') {
        return NextResponse.json({ error: 'Credencial precisa estar ativa' }, { status: 400 })
      }
      portalSlug = cred.portal_slug
      finalCredencialId = cred.id
    } else {
      try {
        const host = new URL(portal_pregao_url).hostname.toLowerCase()
        if (host.includes('comprasnet.gov.br') || host.includes('compras.gov.br') || host.includes('estaleiro.serpro')) portalSlug = 'comprasgov'
        else if (host.includes('bll')) portalSlug = 'bll'
        else if (host.includes('licitanet')) portalSlug = 'licitanet'
        else if (host.includes('portaldecompraspublicas')) portalSlug = 'pcp'
      } catch { /* invalid URL caught below */ }

      if (!portalSlug) {
        return NextResponse.json({
          error: 'Portal não reconhecido pela URL. Portais suportados no modo público: Compras.gov.br',
        }, { status: 400 })
      }
      if (portalSlug !== 'comprasgov') {
        return NextResponse.json({
          error: `O portal ${portalSlug} exige credenciais. Use o fluxo autenticado.`,
        }, { status: 400 })
      }
    }

    // Auto-derive pregão id from URL when not provided
    let finalPortalPregaoId = portal_pregao_id
    if (!finalPortalPregaoId) {
      try {
        finalPortalPregaoId = new URL(portal_pregao_url).pathname.split('/').filter(Boolean).pop() || `manual-${Date.now()}`
      } catch {
        finalPortalPregaoId = `manual-${Date.now()}`
      }
    }

    const { data: monitor, error: insertError } = await supabase
      .from('pregoes_monitorados')
      .insert({
        company_id: user.companyId,
        credencial_id: finalCredencialId,
        portal_slug: portalSlug,
        portal_pregao_id: finalPortalPregaoId,
        portal_pregao_url,
        orgao_nome: orgao_nome || 'A identificar',
        numero_pregao: numero_pregao || 'A identificar',
        objeto_resumido: objeto_resumido || null,
        status_monitoramento: 'ativo',
        proximo_poll_em: new Date().toISOString(), // immediate first poll
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Este pregão já está sendo monitorado' }, { status: 409 })
      }
      console.error('[API pregao-chat/monitors] POST error:', insertError)
      return NextResponse.json({ error: 'Erro ao criar monitor' }, { status: 500 })
    }

    // Enqueue first poll job via BullMQ — worker self-schedules subsequent polls
    try {
      await enqueuePregaoFirstPoll(monitor.id, 0)
    } catch (enqueueErr) {
      console.error('[API pregao-chat/monitors] enqueue error:', enqueueErr)
      // Non-fatal: the record is persisted. A background sweeper could re-enqueue
      // based on proximo_poll_em if we add one later. For now, surface the error.
      return NextResponse.json({
        monitor,
        warning: 'Monitor criado, mas a fila de polling está indisponível. Tente retomar o monitor em instantes.',
      }, { status: 201 })
    }

    return NextResponse.json({ monitor }, { status: 201 })
  } catch (err) {
    console.error('[API pregao-chat/monitors] POST error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * PATCH /api/pregao-chat/monitors
 * Pause/resume/stop a monitor.
 *
 * Body: { id, action: 'pausar' | 'retomar' | 'encerrar' }
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!user.companyId) return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })

    const body = await req.json()
    const { id, action } = body as { id: string; action: string }

    if (!id || !action) {
      return NextResponse.json({ error: 'Campos obrigatórios: id, action' }, { status: 400 })
    }

    const validActions = ['pausar', 'retomar', 'encerrar']
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Ação inválida. Válidas: ${validActions.join(', ')}` }, { status: 400 })
    }

    const statusMap: Record<string, string> = {
      pausar: 'pausado',
      retomar: 'ativo',
      encerrar: 'encerrado',
    }

    const supabase = await createClient()

    const { data: updated, error } = await supabase
      .from('pregoes_monitorados')
      .update({
        status_monitoramento: statusMap[action],
        ...(action === 'retomar' ? { proximo_poll_em: new Date().toISOString(), erros_consecutivos: 0 } : {}),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[API pregao-chat/monitors] PATCH error:', error)
      return NextResponse.json({ error: 'Erro ao atualizar monitor' }, { status: 500 })
    }

    // If the user is resuming monitoring, re-enqueue a poll so the worker picks it up
    if (action === 'retomar' && updated?.id) {
      try {
        await enqueuePregaoFirstPoll(updated.id, 0)
      } catch (enqueueErr) {
        console.error('[API pregao-chat/monitors] retomar enqueue error:', enqueueErr)
      }
    }

    return NextResponse.json({ monitor: updated })
  } catch (err) {
    console.error('[API pregao-chat/monitors] PATCH error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
