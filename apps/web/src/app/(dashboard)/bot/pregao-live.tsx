// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface Lance {
  id: string
  tempo: string
  valor: number
  tipo: 'nosso' | 'concorrente' | 'sistema'
  executado_por: 'robo' | 'manual' | 'sistema'
  posicao_apos: number
  empresa?: string
}

interface EstadoDisputa {
  fase: 'aguardando' | 'lances' | 'encerrado'
  nosso_lance: number
  melhor_lance: number
  nossa_posicao: number
  total_concorrentes: number
  lances_executados: number
  lances_max: number
  tempo_restante?: string
  status_robo: 'ativo' | 'pausado' | 'standby' | 'encerrado'
}

interface AILiveInsight {
  tipo: string
  icone: string
  titulo: string
  descricao: string
  acao_sugerida: string
}

interface PregaoLiveProps {
  sessionId?: string
  sessions?: any[]
  configs?: any[]
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const lancesMock: Lance[] = [
  { id: '1', tempo: '10:04:22', valor: 210000, tipo: 'sistema', executado_por: 'sistema', posicao_apos: 0, empresa: 'Sistema' },
  { id: '2', tempo: '10:04:35', valor: 198000, tipo: 'concorrente', executado_por: 'sistema', posicao_apos: 1, empresa: 'EQUATORIAL GOIAS' },
  { id: '3', tempo: '10:05:02', valor: 195000, tipo: 'nosso', executado_por: 'robo', posicao_apos: 1 },
  { id: '4', tempo: '10:05:48', valor: 193000, tipo: 'concorrente', executado_por: 'sistema', posicao_apos: 2, empresa: 'EQUATORIAL GOIAS' },
  { id: '5', tempo: '10:06:19', valor: 191000, tipo: 'nosso', executado_por: 'robo', posicao_apos: 1 },
  { id: '6', tempo: '10:07:02', valor: 189500, tipo: 'concorrente', executado_por: 'sistema', posicao_apos: 2, empresa: 'TELEFONICA BRASIL' },
  { id: '7', tempo: '10:07:38', valor: 187000, tipo: 'nosso', executado_por: 'robo', posicao_apos: 1 },
]

const estadoInicial: EstadoDisputa = {
  fase: 'lances',
  nosso_lance: 187000,
  melhor_lance: 187000,
  nossa_posicao: 1,
  total_concorrentes: 5,
  lances_executados: 3,
  lances_max: 20,
  status_robo: 'ativo',
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Convert a bot_action from the DB into a Lance object */
function actionToLance(action: any): Lance | null {
  if (action.action_type !== 'bid') return null
  const d = action.details || {}
  return {
    id: action.id,
    tempo: action.created_at
      ? new Date(action.created_at).toLocaleTimeString('pt-BR', { hour12: false })
      : '',
    valor: d.valor || d.value || 0,
    tipo: d.tipo || (d.executado_por === 'manual' ? 'nosso' : d.executado_por === 'robo' ? 'nosso' : 'concorrente'),
    executado_por: d.executado_por || 'sistema',
    posicao_apos: d.posicao_apos || d.posicao || 0,
    empresa: d.empresa || undefined,
  }
}

/** Map session status to robot status */
function sessionStatusToRoboStatus(status: string): 'ativo' | 'pausado' | 'standby' | 'encerrado' {
  switch (status) {
    case 'active': return 'ativo'
    case 'paused': return 'pausado'
    case 'pending': return 'standby'
    case 'completed':
    case 'failed':
    case 'cancelled':
      return 'encerrado'
    default: return 'standby'
  }
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const overline = 'text-xs uppercase tracking-[0.1em] text-muted-foreground font-semibold'

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { tone: string; label: string; pulse: boolean }> = {
    ativo: { tone: 'bg-brand/10 text-brand border-brand/20', label: '🤖 ROBÔ ATIVO', pulse: true },
    pausado: { tone: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: '⏸ PAUSADO', pulse: false },
    standby: { tone: 'bg-blue-500/10 text-blue-400 border-blue-500/20', label: '◉ STANDBY', pulse: true },
    encerrado: { tone: 'bg-white/[0.04] text-muted-foreground border-white/[0.06]', label: '■ ENCERRADO', pulse: false },
  }
  const c = cfg[status] || cfg.encerrado
  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-1.5 ${c.tone}`}>
      {c.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      <span className="text-xs font-bold tracking-[0.1em]">{c.label}</span>
    </span>
  )
}

function PosicaoIndicator({ pos, total }: { pos: number; total: number }) {
  const tone =
    pos === 1 ? 'text-brand border-brand bg-brand/[0.06]'
    : pos === 2 ? 'text-amber-400 border-amber-400 bg-amber-500/[0.06]'
    : 'text-red-400 border-red-400 bg-red-500/[0.06]'
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] ${tone}`}>
        <span className="text-[32px] font-black font-mono tabular-nums">{pos}º</span>
      </div>
      <span className="text-xs tracking-wide text-muted-foreground">DE <span className="font-mono tabular-nums">{total}</span> LICITANTES</span>
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function PregaoLive({ sessionId: initialSessionId, sessions = [], configs = [] }: PregaoLiveProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId || null)
  const [demoMode, setDemoMode] = useState(false)
  const [estado, setEstado] = useState<EstadoDisputa>({
    fase: 'aguardando',
    nosso_lance: 0,
    melhor_lance: 0,
    nossa_posicao: 0,
    total_concorrentes: 0,
    lances_executados: 0,
    lances_max: 0,
    status_robo: 'standby',
  })
  const [lances, setLances] = useState<Lance[]>([])
  const [manualValue, setManualValue] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const [clock, setClock] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [aiInsights, setAiInsights] = useState<AILiveInsight[]>([])
  const [aiInsightIndex, setAiInsightIndex] = useState(0)
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastAiFetchRef = useRef(0)
  const lancesCountRef = useRef(0)

  // Get active/pending sessions for the dropdown
  const activeSessions = sessions.filter((s: any) =>
    ['pending', 'active', 'paused'].includes(s.status)
  )

  // Get selected session data
  const selectedSession = sessions.find((s: any) => s.id === selectedSessionId)

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ─── REAL DATA POLLING ─────────────────────────────────────────────────────
  const pollRealData = useCallback(async () => {
    if (!selectedSessionId || demoMode) return

    try {
      // Fetch actions for this session
      const actionsRes = await fetch(`/api/bot/actions?sessionId=${selectedSessionId}`)
      if (actionsRes.ok) {
        const { actions } = await actionsRes.json()
        const bidActions = (actions || [])
          .map(actionToLance)
          .filter(Boolean)
          .reverse() // API returns desc, we want asc

        if (bidActions.length > 0) {
          setLances(bidActions)

          // Update estado from real data
          const nossos = bidActions.filter((l: Lance) => l.tipo === 'nosso')
          const lastNosso = nossos[nossos.length - 1]
          const lastLance = bidActions[bidActions.length - 1]

          setEstado(prev => ({
            ...prev,
            nosso_lance: lastNosso?.valor || prev.nosso_lance,
            melhor_lance: lastLance?.valor || prev.melhor_lance,
            nossa_posicao: lastNosso?.posicao_apos || prev.nossa_posicao,
            lances_executados: nossos.length,
          }))
        }
      }

      // Fetch session status
      const sessionsRes = await fetch('/api/bot/sessions')
      if (sessionsRes.ok) {
        const { sessions: freshSessions } = await sessionsRes.json()
        const currentSession = (freshSessions || []).find((s: any) => s.id === selectedSessionId)
        if (currentSession) {
          const roboStatus = sessionStatusToRoboStatus(currentSession.status)
          setEstado(prev => ({
            ...prev,
            status_robo: roboStatus,
            fase: roboStatus === 'encerrado' ? 'encerrado' : prev.fase,
            max_bids: currentSession.max_bids || prev.lances_max,
            total_concorrentes: currentSession.progress?.total_concorrentes || prev.total_concorrentes,
          }))
        }
      }
    } catch (err) {
      console.error('Poll error:', err)
    }
  }, [selectedSessionId, demoMode])

  // Setup polling when a real session is selected
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    if (selectedSessionId && !demoMode) {
      // Initial fetch
      pollRealData()
      // Poll every 3 seconds
      pollRef.current = setInterval(pollRealData, 3000)
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [selectedSessionId, demoMode, pollRealData])

  // When session selection changes, update state
  useEffect(() => {
    if (!selectedSessionId) {
      if (!demoMode) {
        // No session selected and not in demo — show empty state
        setLances([])
        setEstado({
          fase: 'aguardando',
          nosso_lance: 0,
          melhor_lance: 0,
          nossa_posicao: 0,
          total_concorrentes: 0,
          lances_executados: 0,
          lances_max: 0,
          status_robo: 'standby',
        })
      }
      return
    }

    const session = sessions.find((s: any) => s.id === selectedSessionId)
    if (!session) return

    setDemoMode(false)

    // Initialize estado from session data
    const progress = session.progress || {}
    const strategyConfig = session.strategy_config || session.strategy || {}

    setEstado({
      fase: session.status === 'completed' || session.status === 'failed' ? 'encerrado' :
            session.status === 'active' ? 'lances' : 'aguardando',
      nosso_lance: progress.nosso_lance || progress.last_bid?.valor || 0,
      melhor_lance: progress.melhor_lance || progress.last_bid?.valor || 0,
      nossa_posicao: progress.nossa_posicao || 1,
      total_concorrentes: progress.total_concorrentes || 5,
      lances_executados: session.bids_placed || 0,
      lances_max: session.max_bids || strategyConfig.decrementos_max || 20,
      status_robo: sessionStatusToRoboStatus(session.status),
    })

    // Load existing actions as lances
    if (session.bot_actions && session.bot_actions.length > 0) {
      const bidLances = session.bot_actions
        .map(actionToLance)
        .filter(Boolean)
      setLances(bidLances.length > 0 ? bidLances : [])
    } else {
      setLances([])
    }
  }, [selectedSessionId, sessions])

  // ─── DEMO MODE SIMULATION ─────────────────────────────────────────────────
  useEffect(() => {
    if (!demoMode || estado.fase !== 'lances' || estado.status_robo === 'encerrado') return

    const id = setInterval(() => {
      const isNosso = Math.random() > 0.6
      const lastVal = lances[lances.length - 1]?.valor || estado.nosso_lance
      const newVal = Math.round(lastVal * (0.988 + Math.random() * 0.008))

      if (newVal < 165000) {
        clearInterval(id)
        setEstado(p => ({ ...p, fase: 'encerrado', status_robo: 'encerrado' }))
        setToast({ msg: estado.nossa_posicao === 1 ? '🏆 VOCÊ GANHOU O PREGÃO!' : '📊 Pregão encerrado — veja o resultado', type: estado.nossa_posicao === 1 ? 'success' : 'warning' })
        return
      }

      const newLance: Lance = {
        id: String(Date.now()),
        tempo: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
        valor: newVal,
        tipo: isNosso ? 'nosso' : 'concorrente',
        executado_por: isNosso ? 'robo' : 'sistema',
        posicao_apos: isNosso ? 1 : 2,
        empresa: isNosso ? undefined : ['EQUATORIAL GOIAS', 'TELEFONICA BRASIL', 'GOVBRASIL TECH'][Math.floor(Math.random() * 3)],
      }

      setLances(p => [...p, newLance])
      setEstado(p => ({
        ...p,
        nosso_lance: isNosso ? newVal : p.nosso_lance,
        melhor_lance: newVal,
        nossa_posicao: isNosso ? 1 : (Math.random() > 0.5 ? 2 : p.nossa_posicao),
        lances_executados: isNosso ? p.lances_executados + 1 : p.lances_executados,
      }))

      if (!isNosso && Math.random() > 0.7) {
        setToast({ msg: `⚡ Superado por ${newLance.empresa} — robô contra-atacando`, type: 'warning' })
      }
    }, 4000 + Math.random() * 4000)

    return () => clearInterval(id)
  }, [demoMode, estado.fase, estado.status_robo])

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [lances])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ─── AI INSIGHTS ──────────────────────────────────────────────────────────

  // Fetch AI insights when new bids come in or every 30s
  useEffect(() => {
    if (estado.fase !== 'lances') return

    const shouldFetch =
      lances.length !== lancesCountRef.current ||
      Date.now() - lastAiFetchRef.current > 30000

    if (!shouldFetch) return

    lancesCountRef.current = lances.length
    lastAiFetchRef.current = Date.now()

    const fetchAiInsights = async () => {
      try {
        const res = await fetch('/api/bot/ai-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'ao-vivo',
            tender: {
              objeto: selectedSession?.pregao_id || 'Pregão em andamento',
              valor_estimado: 0,
            },
            lances: lances.slice(-10).map(l => ({
              valor: l.valor,
              tipo: l.tipo,
              empresa: l.empresa || (l.tipo === 'nosso' ? 'NOSSA EMPRESA' : 'Concorrente'),
            })),
            nossa_posicao: estado.nossa_posicao,
            nosso_lance: estado.nosso_lance,
            melhor_lance: estado.melhor_lance,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data.insights && data.insights.length > 0) {
            setAiInsights(data.insights)
            setAiInsightIndex(0)
          }
        }
      } catch {
        // silently skip
      }
    }

    fetchAiInsights()
  }, [lances.length, estado.fase])

  // Auto-rotate through AI insights every 6s
  useEffect(() => {
    if (aiTimerRef.current) {
      clearInterval(aiTimerRef.current)
      aiTimerRef.current = null
    }

    if (aiInsights.length > 1) {
      aiTimerRef.current = setInterval(() => {
        setAiInsightIndex(prev => (prev + 1) % aiInsights.length)
      }, 6000)
    }

    return () => {
      if (aiTimerRef.current) {
        clearInterval(aiTimerRef.current)
        aiTimerRef.current = null
      }
    }
  }, [aiInsights.length])

  // ─── ACTIONS ───────────────────────────────────────────────────────────────

  const toggleRobo = async () => {
    const next = estado.status_robo === 'ativo' ? 'pausado' : 'ativo'

    // If real session, PATCH the session
    if (selectedSessionId && !demoMode) {
      try {
        const action = next === 'ativo' ? 'resume' : 'pause'
        const res = await fetch('/api/bot/sessions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedSessionId, action }),
        })
        if (!res.ok) {
          setToast({ msg: 'Erro ao atualizar status do robô', type: 'error' })
          return
        }
      } catch (err) {
        setToast({ msg: 'Erro de conexão', type: 'error' })
        return
      }
    }

    setEstado(p => ({ ...p, status_robo: next }))
    setToast({ msg: next === 'ativo' ? '🤖 Robô retomado' : '⏸ Robô pausado — modo manual ativo', type: 'warning' })
  }

  const handleEncerrar = async () => {
    if (selectedSessionId && !demoMode) {
      try {
        await fetch('/api/bot/sessions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedSessionId, action: 'cancel' }),
        })
      } catch (err) {
        console.error('Error cancelling session:', err)
      }
    }
    setEstado(p => ({ ...p, fase: 'encerrado', status_robo: 'encerrado' }))
  }

  const darLanceManual = async () => {
    const val = parseFloat(manualValue.replace(/\D/g, ''))
    if (!val || val < estado.melhor_lance * 0.7) return

    // If real session, create a bot_action
    if (selectedSessionId && !demoMode) {
      try {
        const res = await fetch('/api/bot/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: selectedSessionId,
            action_type: 'bid',
            details: {
              valor: val,
              tipo: 'nosso',
              executado_por: 'manual',
              posicao_apos: val < estado.melhor_lance ? 1 : 2,
              empresa: null,
            },
          }),
        })
        if (!res.ok) {
          setToast({ msg: 'Erro ao enviar lance', type: 'error' })
          return
        }
      } catch (err) {
        setToast({ msg: 'Erro de conexão ao enviar lance', type: 'error' })
        return
      }
    }

    const novoLance: Lance = {
      id: String(Date.now()),
      tempo: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      valor: val,
      tipo: 'nosso',
      executado_por: 'manual',
      posicao_apos: val < estado.melhor_lance ? 1 : 2,
    }
    setLances(p => [...p, novoLance])
    setEstado(p => ({
      ...p,
      nosso_lance: val,
      melhor_lance: Math.min(p.melhor_lance, val),
      nossa_posicao: val < p.melhor_lance ? 1 : p.nossa_posicao,
      lances_executados: p.lances_executados + 1,
    }))
    setManualValue('')
    setToast({ msg: `✓ Lance manual de ${fmt(val)} executado`, type: 'success' })
  }

  const toggleDemoMode = () => {
    if (demoMode) {
      // Switching to real — clear demo data
      setDemoMode(false)
      setSelectedSessionId(null)
      setLances([])
      setEstado({
        fase: 'aguardando',
        nosso_lance: 0,
        melhor_lance: 0,
        nossa_posicao: 0,
        total_concorrentes: 0,
        lances_executados: 0,
        lances_max: 0,
        status_robo: 'standby',
      })
    } else {
      // Switching to demo — load mock data
      setDemoMode(true)
      setSelectedSessionId(null)
      setLances(lancesMock)
      setEstado(estadoInicial)
    }
  }

  const diferenca = estado.nosso_lance - estado.melhor_lance
  const progressPct = estado.lances_max > 0 ? (estado.lances_executados / estado.lances_max) * 100 : 0

  // Toast tone mapping
  const toastTone = toast
    ? toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    : toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400'
    : 'bg-brand/10 border-brand/20 text-brand'
    : ''

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-[70px] right-6 z-[100] rounded-lg border px-5 py-3 text-xs font-bold max-w-[360px] animate-fade-in ${toastTone}`}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-card px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${estado.fase === 'lances' ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${estado.fase === 'lances' ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </span>
          <span className="text-xs font-bold tracking-[0.2em] text-muted-foreground">LICITAGRAM</span>
          <span className="text-muted-foreground">|</span>

          {/* Session selector or title */}
          {activeSessions.length > 0 && !demoMode ? (
            <select
              className="max-w-[280px] rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-foreground outline-none focus:border-white/[0.12]"
              value={selectedSessionId || ''}
              onChange={(e) => setSelectedSessionId(e.target.value || null)}
            >
              <option value="">Selecione uma sessão...</option>
              {activeSessions.map((sess: any) => (
                <option key={sess.id} value={sess.id}>
                  {sess.pregao_id?.slice(0, 20) || sess.id.slice(0, 8)} — {sess.status}
                  {sess.portal ? ` (${sess.portal})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-muted-foreground">
              {demoMode ? 'Modo Demo · Simulação' : 'Nenhuma sessão ativa'}
            </span>
          )}

          {/* Demo mode toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleDemoMode}
            className={demoMode
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
              : ''}
          >
            {demoMode ? '● DEMO' : '○ DEMO'}
          </Button>
        </div>
        <div className="flex items-center gap-5">
          <StatusBadge status={estado.status_robo} />
          <div className="text-lg font-bold text-foreground font-mono tabular-nums tracking-wider">{clock}</div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[1fr_380px] gap-px bg-white/[0.06]">

        {/* LEFT — MÉTRICAS + CONTROLES */}
        <div className="bg-card p-7 flex flex-col gap-6">

          {/* MÉTRICAS PRINCIPAIS */}
          <div className="grid grid-cols-3 gap-3">
            {/* Nosso lance */}
            <Card className="border-brand/20">
              <CardContent className="p-4">
                <div className={overline}>Nosso lance</div>
                <div className="text-xl font-bold text-brand font-mono tabular-nums tracking-tight mt-2">
                  {estado.nosso_lance > 0 ? fmt(estado.nosso_lance) : '—'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {estado.nosso_lance === 0 ? 'Aguardando lances' :
                   diferenca === 0 ? '= melhor lance' : `${fmt(Math.abs(diferenca))} ${diferenca > 0 ? 'acima' : 'abaixo'} do melhor`}
                </div>
              </CardContent>
            </Card>

            {/* Posição */}
            <Card>
              <CardContent className="p-4 flex items-center justify-center">
                <PosicaoIndicator pos={estado.nossa_posicao} total={estado.total_concorrentes} />
              </CardContent>
            </Card>

            {/* Melhor lance */}
            <Card className="border-blue-500/20">
              <CardContent className="p-4">
                <div className={overline}>Melhor lance</div>
                <div className="text-xl font-bold text-blue-400 font-mono tabular-nums tracking-tight mt-2">
                  {estado.melhor_lance > 0 ? fmt(estado.melhor_lance) : '—'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Menor valor da disputa</div>
              </CardContent>
            </Card>
          </div>

          {/* PROGRESSO DE LANCES */}
          <Card>
            <CardContent className="p-5">
              <div className="flex justify-between mb-3">
                <span className={overline}>LANCES EXECUTADOS PELO ROBÔ</span>
                <span className="text-xs font-bold text-brand font-mono tabular-nums">
                  {estado.lances_executados}/{estado.lances_max}
                </span>
              </div>
              <Progress
                value={progressPct}
                className={`h-1.5 ${progressPct > 75 ? '[&>div]:bg-red-400' : progressPct > 50 ? '[&>div]:bg-brand' : '[&>div]:bg-emerald-400'}`}
              />
              <div className="flex justify-between mt-1.5">
                <span className="text-xs text-muted-foreground font-mono tabular-nums">0</span>
                <span className={`text-xs font-mono tabular-nums ${progressPct > 75 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {progressPct > 75 ? '⚠ Próximo do limite' : `${estado.lances_max - estado.lances_executados} restantes`}
                </span>
                <span className="text-xs text-muted-foreground font-mono tabular-nums">{estado.lances_max}</span>
              </div>
            </CardContent>
          </Card>

          {/* FASE DA DISPUTA */}
          <Card>
            <CardContent className="p-5">
              <div className={`${overline} mb-3`}>FASE DA DISPUTA</div>
              <div className="flex gap-2">
                {(['Abertura', 'Lances', 'Negociação', 'Resultado'] as const).map((fase, i) => {
                  const ativo = (estado.fase === 'lances' && i === 1) || (estado.fase === 'aguardando' && i === 0) || (estado.fase === 'encerrado' && i === 3)
                  const done = (estado.fase === 'lances' && i === 0) || (estado.fase === 'encerrado' && i < 3)
                  const toneFase = ativo
                    ? 'bg-brand/10 border-brand/20 text-brand'
                    : done
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-white/[0.04] border-white/[0.06] text-muted-foreground'
                  return (
                    <div key={fase} className={`flex-1 rounded-md border p-2 text-center ${toneFase}`}>
                      <div className="text-xs font-semibold tracking-wide">
                        {done ? '✓' : ativo ? '●' : '○'}
                      </div>
                      <div className="text-xs mt-1">{fase}</div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* CONTROLES */}
          <Card>
            <CardContent className="p-5">
              <div className={`${overline} mb-3.5`}>CONTROLES</div>

              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <Button
                  variant="outline"
                  onClick={toggleRobo}
                  className={estado.status_robo === 'ativo'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'}
                >
                  {estado.status_robo === 'ativo' ? '⏸ PAUSAR ROBÔ' : '▶ RETOMAR ROBÔ'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleEncerrar}
                  className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                >
                  ■ ENCERRAR
                </Button>
              </div>

              <div className={`${overline} mb-2`}>LANCE MANUAL</div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Ex: 185000"
                  value={manualValue}
                  onChange={e => setManualValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && darLanceManual()}
                  className="flex-1 font-mono"
                />
                <Button
                  onClick={darLanceManual}
                  className="bg-brand hover:bg-brand-dark text-white px-5"
                >
                  ENVIAR
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-1.5">
                Pressione Enter ou clique em Enviar para dar um lance manual
              </div>
            </CardContent>
          </Card>

          {/* AI INSIGHTS BAR */}
          {aiInsights.length > 0 && (
            <Card className="border-violet-500/20 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 via-blue-500 to-violet-500" />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs animate-pulse">🧠</span>
                    <span className="text-xs text-violet-400 tracking-[0.1em] font-bold">INSIGHT IA</span>
                  </div>
                  {aiInsights.length > 1 && (
                    <div className="flex gap-1">
                      {aiInsights.map((_, i) => (
                        <div key={i} className={`h-1 w-1 rounded-full transition-colors ${i === aiInsightIndex ? 'bg-violet-400' : 'bg-white/[0.08]'}`} />
                      ))}
                    </div>
                  )}
                </div>
                {(() => {
                  const ins = aiInsights[aiInsightIndex]
                  if (!ins) return null
                  const colorMap: Record<string, string> = {
                    alerta: 'text-brand',
                    oportunidade: 'text-emerald-400',
                    estrategia: 'text-blue-400',
                    risco: 'text-red-400',
                  }
                  const titleColor = colorMap[ins.tipo] || 'text-violet-400'
                  return (
                    <div key={aiInsightIndex} className="animate-fade-in">
                      <div className="flex items-start gap-2">
                        <span className="text-sm flex-shrink-0 -mt-px">{ins.icone}</span>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-semibold mb-0.5 tracking-wide ${titleColor}`}>
                            {ins.titulo}
                          </div>
                          <div className="text-xs text-muted-foreground leading-relaxed">
                            {ins.descricao}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          )}

        </div>

        {/* RIGHT — FEED DE LANCES */}
        <div className="bg-background flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <span className={overline}>◈ FEED DE LANCES</span>
            <span className="text-[11px] font-bold text-brand font-mono tabular-nums"><span className="font-mono tabular-nums">{lances.length}</span> lances</span>
          </div>

          <div ref={feedRef} className="flex-1 overflow-auto py-2">
            {lances.length === 0 && !demoMode && (
              <div className="px-5 py-10 text-center">
                <div className="text-xs text-muted-foreground mb-2">Nenhum lance registrado</div>
                <div className="text-xs text-foreground/40">
                  {selectedSessionId ? 'Aguardando lances do robô...' : 'Selecione uma sessão ou ative o modo Demo'}
                </div>
              </div>
            )}

            {lances.map((l, i) => {
              const rowBg = l.tipo === 'nosso' ? 'bg-brand/[0.04]' : ''
              const rowBorder = l.tipo === 'nosso' ? 'border-l-brand'
                : l.tipo === 'concorrente' ? 'border-l-red-400/30'
                : 'border-l-muted-foreground'
              const valColor = l.tipo === 'nosso' ? 'text-brand'
                : l.tipo === 'concorrente' ? 'text-red-400'
                : 'text-foreground/40'
              const subColor = l.tipo === 'nosso' ? 'text-brand/50'
                : l.tipo === 'concorrente' ? 'text-red-400/50'
                : 'text-foreground/30'
              const dotColor = l.tipo === 'nosso' ? 'bg-brand'
                : l.tipo === 'concorrente' ? 'bg-red-400'
                : 'bg-muted-foreground'

              return (
                <div key={l.id} className={`flex items-center gap-3 border-b border-white/[0.04] border-l-[3px] px-5 py-2.5 ${rowBg} ${rowBorder}`}>
                  {/* Indicador */}
                  <div className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor} ${i === lances.length - 1 ? 'animate-pulse' : ''}`} />

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <span className={`text-sm font-bold font-mono tabular-nums ${valColor}`}>
                        {fmt(l.valor)}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono tabular-nums">{l.tempo}</span>
                    </div>
                    <div className="flex gap-2 mt-0.5 items-center">
                      <span className={`text-[11px] font-bold tracking-wider ${subColor}`}>
                        {l.tipo === 'nosso' ? `NOSSO · ${l.executado_por === 'robo' ? '🤖 ROBÔ' : '👤 MANUAL'}` :
                         l.tipo === 'concorrente' ? l.empresa?.toUpperCase() : 'SISTEMA'}
                      </span>
                      {l.posicao_apos > 0 && (
                        <span className={`text-xs font-mono tabular-nums ${l.posicao_apos === 1 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          → {l.posicao_apos}º lugar
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Indicador "ao vivo" */}
            {estado.fase === 'lances' && (
              <div className="flex items-center gap-2 px-5 py-3">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                <span className="text-xs text-muted-foreground">
                  {demoMode ? 'Simulação ativa...' : selectedSessionId ? 'Polling a cada 3s...' : 'Aguardando sessão...'}
                </span>
              </div>
            )}

            {estado.fase === 'encerrado' && (
              <div className={`mx-4 my-4 rounded-lg border p-4 text-center ${estado.nossa_posicao === 1 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <div className="text-xl mb-2">{estado.nossa_posicao === 1 ? '🏆' : '📊'}</div>
                <div className={`text-xs font-bold tracking-[0.14em] mb-1.5 ${estado.nossa_posicao === 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {estado.nossa_posicao === 1 ? 'PREGÃO VENCIDO' : 'PREGÃO ENCERRADO'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {estado.nossa_posicao === 1
                    ? `Lance vencedor: ${fmt(estado.nosso_lance)}`
                    : `Posição final: ${estado.nossa_posicao}º lugar`
                  }
                </div>
              </div>
            )}
          </div>

          {/* MINI STATS BOTTOM */}
          <div className="grid grid-cols-3 gap-3 border-t border-white/[0.06] px-5 py-3.5">
            {[
              { label: 'Lances nossos', val: lances.filter(l => l.tipo === 'nosso').length },
              { label: 'Concorrentes', val: lances.filter(l => l.tipo === 'concorrente').length },
              { label: 'Total lances', val: lances.length },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className={overline}>{s.label}</div>
                <div className="text-base font-bold text-foreground font-mono tabular-nums">{s.val}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
