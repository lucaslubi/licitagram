export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

// ─── VPS Health via SSH-less approach: store metrics in Redis, read here ─────
// For now we query what we can from Supabase and Redis directly

export async function GET() {
  try {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // ─── 1. Database metrics ──────────────────────────────────────────
    const [
      { count: totalTenders },
      { count: analyzedTenders },
      { count: newTenders },
      { count: totalMatches },
      { count: hotMatches },
      { count: totalCompanies },
      { count: totalUsers },
      { count: activeSubscriptions },
      { count: matchesToday },
      { count: tendersToday },
      { count: notifiedToday },
      { count: matchesLastHour },
    ] = await Promise.all([
      supabase.from('tenders').select('*', { count: 'exact', head: true }),
      supabase.from('tenders').select('*', { count: 'exact', head: true }).eq('status', 'analyzed'),
      supabase.from('tenders').select('*', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('matches').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('is_hot', true),
      supabase.from('companies').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('subscriptions').select('*', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
      supabase.from('matches').select('*', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`),
      supabase.from('tenders').select('*', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`),
      supabase.from('matches').select('*', { count: 'exact', head: true }).not('notified_at', 'is', null).gte('notified_at', `${today}T00:00:00`),
      supabase.from('matches').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
    ])

    // ─── 2. Match source breakdown ────────────────────────────────────
    const { data: matchSources } = await supabase
      .from('matches')
      .select('match_source')
      .limit(10000)

    const sourceBreakdown: Record<string, number> = {}
    for (const m of matchSources || []) {
      sourceBreakdown[m.match_source] = (sourceBreakdown[m.match_source] || 0) + 1
    }

    // ─── 3. Subscription breakdown ────────────────────────────────────
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('plan, status')

    const planBreakdown: Record<string, number> = {}
    const statusBreakdown: Record<string, number> = {}
    for (const s of subs || []) {
      planBreakdown[s.plan] = (planBreakdown[s.plan] || 0) + 1
      statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1
    }

    // ─── 4. Notification channels ─────────────────────────────────────
    const { data: usersWithChannels } = await supabase
      .from('users')
      .select('telegram_chat_id, whatsapp_number')

    let telegramLinked = 0
    let whatsappLinked = 0
    for (const u of usersWithChannels || []) {
      if (u.telegram_chat_id) telegramLinked++
      if (u.whatsapp_number) whatsappLinked++
    }

    // ─── 5. Pending matches (not notified) ────────────────────────────
    const { count: pendingNotifications } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')
      .is('notified_at', null)
      .gte('score', 50)
      .in('match_source', ['ai', 'ai_triage', 'semantic'])

    // ─── 6. Keyword-only matches (need AI triage) ─────────────────────
    const { count: keywordOnlyMatches } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('match_source', 'keyword')

    // ─── 7. Redis / Upstash info ──────────────────────────────────────
    let redisInfo = null
    try {
      const redisUrl = process.env.REDIS_URL || ''
      if (redisUrl.includes('upstash')) {
        // Extract host from rediss://default:xxx@host:port
        const match = redisUrl.match(/@([^:]+):/)
        if (match) {
          const host = match[1]
          redisInfo = { provider: 'Upstash', host, status: 'connected' }
        }
      }
    } catch {
      redisInfo = { provider: 'unknown', status: 'error' }
    }

    // ─── 8. Map cache status ──────────────────────────────────────────
    let mapCacheCount = 0
    try {
      const { count } = await supabase.from('map_cache').select('*', { count: 'exact', head: true })
      mapCacheCount = count || 0
    } catch {
      // table may not exist yet
    }

    // ─── 9. Generate alerts ───────────────────────────────────────────
    const alerts: Array<{ level: 'critical' | 'warning' | 'info'; message: string; detail?: string }> = []

    if ((newTenders || 0) > 1000) {
      alerts.push({
        level: 'warning',
        message: `${newTenders} tenders presos em status "new"`,
        detail: 'Extraction pipeline pode estar travada. Verificar worker-extraction.',
      })
    }

    if ((pendingNotifications || 0) > 100) {
      alerts.push({
        level: 'warning',
        message: `${pendingNotifications} matches pendentes de notificacao`,
        detail: 'Pending notifications queue pode estar acumulando.',
      })
    }

    if ((keywordOnlyMatches || 0) > 5000) {
      alerts.push({
        level: 'info',
        message: `${keywordOnlyMatches} matches ainda sao keyword-only`,
        detail: 'AI triage sweep vai processar gradualmente.',
      })
    }

    if (telegramLinked === 0 && whatsappLinked === 0) {
      alerts.push({
        level: 'warning',
        message: 'Nenhum usuario com canal de notificacao vinculado',
        detail: 'Usuarios precisam vincular Telegram ou WhatsApp em Settings.',
      })
    }

    if ((matchesLastHour || 0) === 0 && now.getUTCHours() >= 10 && now.getUTCHours() <= 23) {
      alerts.push({
        level: 'warning',
        message: 'Nenhum match criado na ultima hora',
        detail: 'Workers de matching podem estar parados.',
      })
    }

    if ((matchesToday || 0) > 0) {
      alerts.push({
        level: 'info',
        message: `${matchesToday} novos matches hoje, ${notifiedToday} notificados`,
      })
    }

    if ((tendersToday || 0) > 0) {
      alerts.push({
        level: 'info',
        message: `${tendersToday} novos tenders scrapeados hoje`,
      })
    }

    // ─── Response ─────────────────────────────────────────────────────
    return NextResponse.json({
      timestamp: now.toISOString(),
      database: {
        tenders: {
          total: totalTenders || 0,
          analyzed: analyzedTenders || 0,
          new: newTenders || 0,
          today: tendersToday || 0,
          processingRate: totalTenders ? Math.round(((analyzedTenders || 0) / (totalTenders || 1)) * 100) : 0,
        },
        matches: {
          total: totalMatches || 0,
          hot: hotMatches || 0,
          today: matchesToday || 0,
          lastHour: matchesLastHour || 0,
          pendingNotification: pendingNotifications || 0,
          keywordOnly: keywordOnlyMatches || 0,
          bySource: sourceBreakdown,
        },
        entities: {
          companies: totalCompanies || 0,
          users: totalUsers || 0,
          subscriptions: activeSubscriptions || 0,
        },
        mapCache: mapCacheCount || 0,
      },
      subscriptions: {
        byPlan: planBreakdown,
        byStatus: statusBreakdown,
      },
      notifications: {
        telegramLinked,
        whatsappLinked,
        notifiedToday: notifiedToday || 0,
      },
      infrastructure: {
        redis: redisInfo,
        supabase: {
          plan: 'Pro + Small Compute',
          ram: '2 GB',
          cpu: '2 dedicated',
        },
        vps: {
          provider: 'Hostinger',
          ram: '7.8 GB',
          workers: 7,
        },
      },
      alerts,
    })
  } catch (err) {
    console.error('System health check failed:', err)
    return NextResponse.json(
      { error: 'Failed to fetch system health', detail: String(err) },
      { status: 500 },
    )
  }
}
