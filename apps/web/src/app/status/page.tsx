/**
 * Public status page — Stripe/Vercel-style.
 *
 * Route: /status
 *
 * No auth. Reads GET /api/v1/bot/status and renders an overview of fleet
 * health, latency SLO, per-portal metrics and webhook delivery.
 *
 * Honest SLA transparency is a moat we earn by publishing p99 latency
 * nobody else does.
 */

import Link from 'next/link'

interface StatusResponse {
  ts: string
  slo: {
    target_p99_ms: number
    current_p99_ms: number | null
    status: 'ok' | 'degraded' | 'down'
  }
  portals: Array<{
    portal: string
    live_sessions: number | null
    total_sessions: number | null
    completed_sessions: number | null
    failed_sessions: number | null
    success_ratio_pct: number | null
    p50_ms: number | null
    p95_ms: number | null
    p99_ms: number | null
    latency_sample_size: number
  }>
  webhooks: {
    total_deliveries: number | null
    delivered: number | null
    pending_retry: number | null
    permanently_failed: number | null
    delivery_ratio_pct: number | null
    p95_attempts: number | null
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function fetchStatus(): Promise<StatusResponse | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''
  const url = base ? `${base}/api/v1/bot/status` : '/api/v1/bot/status'
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as StatusResponse
  } catch {
    return null
  }
}

export default async function StatusPage() {
  const data = await fetchStatus()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="max-w-5xl mx-auto p-6 sm:p-10 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Licitagram — Supreme Bot Status</h1>
            <p className="text-sm text-slate-600 mt-1">
              Transparência real de latência e saúde do fleet. Atualizado ao vivo.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Voltar
          </Link>
        </header>

        {!data ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
            Não conseguimos ler o endpoint de status no momento. Tente novamente em instantes.
          </div>
        ) : (
          <>
            <SloCard slo={data.slo} ts={data.ts} />
            <PortalsTable portals={data.portals} />
            <WebhooksCard webhooks={data.webhooks} />
          </>
        )}

        <footer className="text-xs text-slate-500 pt-6 border-t border-slate-200">
          Métricas calculadas sobre as últimas 24 horas. SLO alvo: p99 ≤ 200ms
          para submissão de lance. Esta página é gerada por
          <code className="mx-1 text-[11px]">/api/v1/bot/status</code>
          e pode ser consumida por monitores externos.
        </footer>
      </main>
    </div>
  )
}

function SloCard({ slo, ts }: { slo: StatusResponse['slo']; ts: string }) {
  const tint =
    slo.status === 'ok'
      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
      : slo.status === 'degraded'
        ? 'bg-amber-50 text-amber-900 border-amber-200'
        : 'bg-red-50 text-red-900 border-red-200'
  const label =
    slo.status === 'ok'
      ? 'Operacional'
      : slo.status === 'degraded'
        ? 'Degradado'
        : 'Crítico'
  return (
    <section className={`rounded-xl border ${tint} p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold">Estado do serviço</div>
          <div className="text-3xl font-bold mt-1">{label}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide font-semibold">p99 atual</div>
          <div className="text-3xl font-bold mt-1">
            {slo.current_p99_ms === null ? '—' : `${Math.round(slo.current_p99_ms)} ms`}
          </div>
          <div className="text-xs mt-1 opacity-80">alvo ≤ {slo.target_p99_ms} ms</div>
        </div>
      </div>
      <div className="text-xs mt-4 opacity-70">Atualizado em {new Date(ts).toLocaleString('pt-BR')}</div>
    </section>
  )
}

function PortalsTable({ portals }: { portals: StatusResponse['portals'] }) {
  if (portals.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
        Sem dados de portais nas últimas 24 horas.
      </section>
    )
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="font-semibold">Saúde por portal (24h)</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Portal</th>
              <th className="text-right px-4 py-2">Sessões</th>
              <th className="text-right px-4 py-2">Sucesso</th>
              <th className="text-right px-4 py-2">p50</th>
              <th className="text-right px-4 py-2">p95</th>
              <th className="text-right px-4 py-2">p99</th>
              <th className="text-right px-4 py-2">Amostra</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {portals.map((p) => (
              <tr key={p.portal}>
                <td className="px-4 py-2 font-mono text-slate-800">{p.portal}</td>
                <td className="px-4 py-2 text-right">
                  <span className="text-slate-900">{p.total_sessions ?? 0}</span>
                  {p.live_sessions ? (
                    <span className="text-emerald-700 text-xs ml-2">↗ {p.live_sessions} ao vivo</span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right">
                  {p.success_ratio_pct === null ? '—' : `${p.success_ratio_pct.toFixed(1)}%`}
                </td>
                <td className="px-4 py-2 text-right">{p.p50_ms === null ? '—' : `${Math.round(p.p50_ms)}ms`}</td>
                <td className="px-4 py-2 text-right">{p.p95_ms === null ? '—' : `${Math.round(p.p95_ms)}ms`}</td>
                <td className="px-4 py-2 text-right font-semibold">{p.p99_ms === null ? '—' : `${Math.round(p.p99_ms)}ms`}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">{p.latency_sample_size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WebhooksCard({ webhooks }: { webhooks: StatusResponse['webhooks'] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold mb-3">Entrega de webhooks (24h)</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={webhooks.total_deliveries ?? 0} />
        <Stat label="Entregues" value={webhooks.delivered ?? 0} />
        <Stat label="Aguardando retry" value={webhooks.pending_retry ?? 0} />
        <Stat label="Falhas permanentes" value={webhooks.permanently_failed ?? 0} />
      </div>
      <div className="mt-3 text-xs text-slate-600">
        Taxa de entrega: {webhooks.delivery_ratio_pct === null ? '—' : `${webhooks.delivery_ratio_pct.toFixed(1)}%`}
        {' · '}
        p95 tentativas: {webhooks.p95_attempts === null ? '—' : Number(webhooks.p95_attempts).toFixed(1)}
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
    </div>
  )
}
