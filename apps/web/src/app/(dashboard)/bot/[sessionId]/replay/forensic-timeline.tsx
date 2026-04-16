'use client'

/**
 * Forensic Replay Timeline — scrubber UI over bot_events.
 *
 * Loads the full event list for a session and renders a scrub-able
 * horizontal timeline. The user drags the scrubber to any ms and the
 * right-side panel shows the event details. Events are color-coded by
 * lane:
 *
 *   our_bid / our_bid_ack     → emerald  (our side)
 *   rival_bid                 → rose     (opponent)
 *   phase_change / encerrado  → amber    (state transitions)
 *   tick                      → slate    (heartbeat — thin ticks)
 *   error / nack              → red
 *   floor_set / supervisor    → sky      (supervisor mode)
 *   chat_msg                  → violet
 *
 * Uses SWR for polling live events while the session is active.
 */

import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Event {
  id: string
  t_ms: number
  kind: string
  payload: Record<string, unknown>
  occurred_at: string
  latency_ms: number | null
}

interface EventsResponse {
  events: Event[]
  next_cursor: string | null
  total_ms: number | null
}

const KIND_STYLES: Record<string, { lane: number; color: string; label: string }> = {
  tick:                     { lane: 0, color: 'bg-slate-300',   label: 'Tick' },
  our_bid:                  { lane: 1, color: 'bg-emerald-500', label: 'Nosso lance' },
  our_bid_attempt:          { lane: 1, color: 'bg-emerald-300', label: 'Tentativa' },
  our_bid_ack:              { lane: 1, color: 'bg-emerald-700', label: 'Confirmado' },
  our_bid_nack:             { lane: 1, color: 'bg-red-500',     label: 'Rejeitado' },
  rival_bid:                { lane: 2, color: 'bg-rose-500',    label: 'Lance rival' },
  rival_overtook_us:        { lane: 2, color: 'bg-rose-700',    label: 'Rival ultrapassou' },
  we_overtook_rival:        { lane: 2, color: 'bg-emerald-700', label: 'Ultrapassamos' },
  phase_change:             { lane: 3, color: 'bg-amber-500',   label: 'Mudança de fase' },
  phase_random_started:     { lane: 3, color: 'bg-amber-600',   label: 'Aleatório iniciado' },
  phase_encerrado:          { lane: 3, color: 'bg-amber-700',   label: 'Encerrado' },
  phase_homologado:         { lane: 3, color: 'bg-amber-800',   label: 'Homologado' },
  chat_msg:                 { lane: 4, color: 'bg-violet-500',  label: 'Chat' },
  floor_set:                { lane: 5, color: 'bg-sky-600',     label: 'Floor definido' },
  floor_update:             { lane: 5, color: 'bg-sky-500',     label: 'Floor atualizado' },
  supervisor_handoff:       { lane: 5, color: 'bg-sky-700',     label: 'Supervisor' },
  auto_bid_handoff:         { lane: 5, color: 'bg-sky-700',     label: 'Auto-bid' },
  shadow_observation:       { lane: 5, color: 'bg-indigo-500',  label: 'Shadow' },
  login_refresh:            { lane: 6, color: 'bg-zinc-500',    label: 'Login' },
  login_expired:            { lane: 6, color: 'bg-zinc-700',    label: 'Login expirado' },
  captcha_solved:           { lane: 6, color: 'bg-green-600',   label: 'Captcha OK' },
  captcha_failed:           { lane: 6, color: 'bg-red-600',     label: 'Captcha falhou' },
  error:                    { lane: 7, color: 'bg-red-700',     label: 'Erro' },
  heartbeat:                { lane: 0, color: 'bg-slate-200',   label: 'Heartbeat' },
  snapshot:                 { lane: 7, color: 'bg-slate-500',   label: 'Snapshot' },
  websocket_message:        { lane: 7, color: 'bg-slate-400',   label: 'WS' },
}

const LANE_LABELS = ['Ticks', 'Nossos lances', 'Concorrentes', 'Fase', 'Chat', 'Estratégia', 'Sessão', 'Sistema']

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ForensicTimeline({ sessionId }: { sessionId: string }) {
  const { data, isLoading, error } = useSWR<EventsResponse>(
    `/api/bot/events?sessionId=${sessionId}&limit=2000`,
    fetcher,
    { refreshInterval: 5000 },
  )

  const [cursorMs, setCursorMs] = useState(0)
  const scrubberRef = useRef<HTMLDivElement>(null)

  const events = data?.events ?? []
  const totalMs = Math.max(data?.total_ms ?? 0, events[events.length - 1]?.t_ms ?? 0, 1)

  const activeEvent = useMemo(() => {
    if (events.length === 0) return null
    // Find the event closest to the cursor (backwards).
    let best: Event | null = null
    for (const e of events) {
      if (e.t_ms <= cursorMs) best = e
      else break
    }
    return best ?? events[0]
  }, [cursorMs, events])

  const handleScrubberClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const el = scrubberRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = ev.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    setCursorMs(Math.floor(pct * totalMs))
  }

  if (isLoading) {
    return <div className="text-slate-600">Carregando timeline…</div>
  }
  if (error || !data) {
    return <div className="text-red-600">Falha ao carregar eventos.</div>
  }
  if (events.length === 0) {
    return <div className="text-slate-600">Nenhum evento registrado ainda.</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Timeline forense · {events.length} eventos · {(totalMs / 1000).toFixed(1)}s</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Lane labels + canvas */}
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 text-xs text-slate-600 pt-8" style={{ minWidth: 100 }}>
              {LANE_LABELS.map((label) => (
                <div key={label} style={{ height: 18 }}>{label}</div>
              ))}
            </div>
            <div className="flex-1">
              <div
                ref={scrubberRef}
                className="relative bg-slate-100 rounded border border-slate-200 overflow-hidden cursor-pointer"
                style={{ height: LANE_LABELS.length * 22 + 12 }}
                onClick={handleScrubberClick}
              >
                {events.map((e) => {
                  const style = KIND_STYLES[e.kind] ?? { lane: 7, color: 'bg-slate-400', label: e.kind }
                  const leftPct = (e.t_ms / totalMs) * 100
                  return (
                    <div
                      key={e.id}
                      className={`absolute rounded-sm ${style.color} transition-opacity hover:opacity-100 opacity-80`}
                      style={{
                        left: `${leftPct}%`,
                        top: style.lane * 22 + 6,
                        width: 4,
                        height: 14,
                      }}
                      title={`+${e.t_ms}ms · ${style.label}`}
                    />
                  )
                })}
                {/* Cursor */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-600 pointer-events-none"
                  style={{ left: `${(cursorMs / totalMs) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>0ms</span>
                <span>Cursor: +{cursorMs}ms</span>
                <span>{(totalMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setCursorMs(0)}>⏮ Início</Button>
            <Button size="sm" variant="outline" onClick={() => setCursorMs(Math.max(0, cursorMs - 1000))}>-1s</Button>
            <Button size="sm" variant="outline" onClick={() => setCursorMs(Math.min(totalMs, cursorMs + 1000))}>+1s</Button>
            <Button size="sm" variant="outline" onClick={() => setCursorMs(totalMs)}>Fim ⏭</Button>
          </div>
        </CardContent>
      </Card>

      {/* Detail panel */}
      {activeEvent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge className={KIND_STYLES[activeEvent.kind]?.color ?? ''}>
                {KIND_STYLES[activeEvent.kind]?.label ?? activeEvent.kind}
              </Badge>
              <span className="text-slate-500">+{activeEvent.t_ms}ms</span>
              {activeEvent.latency_ms !== null && (
                <span className="text-xs text-slate-500">• latência {activeEvent.latency_ms}ms</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-50 rounded p-3 overflow-x-auto text-slate-800">
              {JSON.stringify(activeEvent.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
