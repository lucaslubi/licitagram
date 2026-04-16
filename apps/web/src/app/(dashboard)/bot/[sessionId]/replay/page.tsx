/**
 * Forensic Replay page.
 *
 * Route: /bot/[sessionId]/replay
 *
 * Server component: validates user + subscription + session ownership,
 * then renders the client-side timeline. The feature NO competitor has —
 * "why did I lose?" answered with evidence.
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ForensicTimeline } from './forensic-timeline'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ sessionId: string }>
}

export default async function ForensicReplayPage({ params }: PageProps) {
  const { sessionId } = await params
  const planUser = await getUserWithPlan()
  if (!planUser) redirect('/login')
  if (!hasActiveSubscription(planUser)) redirect('/pricing')
  if (!planUser.companyId) redirect('/dashboard')

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('bot_sessions')
    .select(
      'id, pregao_id, portal, status, mode, min_price, current_price, bids_placed, started_at, completed_at, result',
    )
    .eq('id', sessionId)
    .eq('company_id', planUser.companyId)
    .single()

  if (!session) notFound()

  const statusColor: Record<string, string> = {
    pending: 'bg-slate-300 text-slate-900',
    active: 'bg-blue-500 text-white',
    paused: 'bg-amber-500 text-white',
    completed: 'bg-emerald-600 text-white',
    failed: 'bg-red-600 text-white',
    cancelled: 'bg-slate-500 text-white',
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Replay forense</h1>
          <p className="text-sm text-slate-600">
            Sessão {session.id.slice(0, 8)} · Pregão {session.pregao_id} · Portal {session.portal}
          </p>
        </div>
        <Link href="/bot">
          <Button variant="outline">← Voltar</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <InfoStat label="Status">
          <Badge className={statusColor[session.status] ?? ''}>{session.status}</Badge>
        </InfoStat>
        <InfoStat label="Modo">{session.mode}</InfoStat>
        <InfoStat label="Lances enviados">{session.bids_placed ?? 0}</InfoStat>
        <InfoStat label="Valor final mínimo">
          {session.min_price ? `R$ ${Number(session.min_price).toFixed(2)}` : '—'}
        </InfoStat>
        <InfoStat label="Melhor lance nosso">
          {session.current_price ? `R$ ${Number(session.current_price).toFixed(2)}` : '—'}
        </InfoStat>
      </div>

      <ForensicTimeline sessionId={sessionId} />
    </div>
  )
}

function InfoStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{children}</div>
    </div>
  )
}
