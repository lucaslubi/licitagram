/**
 * GET /api/v1/bot/status — PUBLIC (no auth).
 *
 * The Stripe-style status page feed. Returns aggregate latency, portal
 * health, and webhook health for the last 24h. Intentionally no
 * per-company data — this is the FLEET health, not any one client's.
 *
 * Response shape (stable):
 *   {
 *     ts: string (ISO),
 *     slo: { target_p99_ms: 200, current_p99_ms: number | null, status: 'ok' | 'degraded' | 'down' },
 *     portals: Array<{ portal, p50_ms, p95_ms, p99_ms, success_ratio_pct, live_sessions }>,
 *     webhooks: { total, delivered, pending_retry, permanently_failed, delivery_ratio_pct, p95_attempts }
 *   }
 */

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Prevent any form of response caching — status must be live.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const SLO_TARGET_P99_MS = 200

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET() {
  const supabase = getServiceSupabase()

  const [latency, portalHealth, webhookHealth] = await Promise.all([
    supabase.from('bot_latency_stats_24h').select('*'),
    supabase.from('bot_portal_health_24h').select('*'),
    supabase.from('bot_webhook_health_24h').select('*').limit(1).maybeSingle(),
  ])

  if (latency.error || portalHealth.error || webhookHealth.error) {
    return NextResponse.json(
      {
        ts: new Date().toISOString(),
        error: 'internal_unavailable',
        detail:
          latency.error?.message ??
          portalHealth.error?.message ??
          webhookHealth.error?.message,
      },
      { status: 500 },
    )
  }

  const latencyByPortal: Record<
    string,
    { p50_ms: number | null; p95_ms: number | null; p99_ms: number | null; sample_size: number }
  > = {}
  for (const row of latency.data ?? []) {
    const r = row as Record<string, unknown>
    latencyByPortal[String(r.portal)] = {
      p50_ms: r.p50_ms as number | null,
      p95_ms: r.p95_ms as number | null,
      p99_ms: r.p99_ms as number | null,
      sample_size: (r.sample_size as number | null) ?? 0,
    }
  }

  const portals = (portalHealth.data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const p = String(r.portal ?? 'unknown')
    const lat = latencyByPortal[p] ?? { p50_ms: null, p95_ms: null, p99_ms: null, sample_size: 0 }
    return {
      portal: p,
      live_sessions: r.live_sessions as number,
      total_sessions: r.total_sessions as number,
      completed_sessions: r.completed_sessions as number,
      failed_sessions: r.failed_sessions as number,
      success_ratio_pct: r.success_ratio_pct as number | null,
      p50_ms: lat.p50_ms,
      p95_ms: lat.p95_ms,
      p99_ms: lat.p99_ms,
      latency_sample_size: lat.sample_size,
    }
  })

  // Fleet-wide p99 = max p99 across portals that have samples.
  const fleetP99 = portals
    .map((p) => p.p99_ms)
    .filter((v): v is number => typeof v === 'number')
    .reduce<number | null>((max, v) => (max === null || v > max ? v : max), null)

  const sloStatus: 'ok' | 'degraded' | 'down' =
    fleetP99 === null ? 'ok'
      : fleetP99 <= SLO_TARGET_P99_MS ? 'ok'
        : fleetP99 <= SLO_TARGET_P99_MS * 2 ? 'degraded'
          : 'down'

  return NextResponse.json({
    ts: new Date().toISOString(),
    slo: {
      target_p99_ms: SLO_TARGET_P99_MS,
      current_p99_ms: fleetP99,
      status: sloStatus,
    },
    portals,
    webhooks: webhookHealth.data ?? {
      total_deliveries: 0,
      delivered: 0,
      pending_retry: 0,
      permanently_failed: 0,
      delivery_ratio_pct: null,
      p95_attempts: null,
    },
  })
}
