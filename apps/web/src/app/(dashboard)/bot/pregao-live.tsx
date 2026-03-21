// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

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

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; label: string; pulse: boolean }> = {
    ativo: { color: '#f97316', label: '🤖 ROBÔ ATIVO', pulse: true },
    pausado: { color: '#eab308', label: '⏸ PAUSADO', pulse: false },
    standby: { color: '#3b82f6', label: '◉ STANDBY', pulse: true },
    encerrado: { color: '#64748b', label: '■ ENCERRADO', pulse: false },
  }
  const c = cfg[status] || cfg.encerrado
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: `${c.color}18`, border: `1px solid ${c.color}44`,
      borderRadius: 6, padding: '6px 14px',
    }}>
      {c.pulse && <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, animation: 'pulse 1.2s infinite' }} />}
      <span style={{ fontSize: 11, fontWeight: 800, color: c.color, letterSpacing: 2 }}>{c.label}</span>
    </div>
  )
}

function PosicaoIndicator({ pos, total }: { pos: number; total: number }) {
  const color = pos === 1 ? '#f97316' : pos === 2 ? '#eab308' : '#ef4444'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        border: `3px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}12`,
        animation: pos === 1 ? 'glow 2s infinite' : 'none',
      }}>
        <span style={{ fontSize: 32, fontWeight: 900, color, fontFamily: '"IBM Plex Mono", monospace' }}>{pos}º</span>
      </div>
      <span style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>DE {total} LICITANTES</span>
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

  const s: Record<string, React.CSSProperties> = {
    root: {
      background: '#08090e',
      minHeight: '100vh',
      color: '#e2e8f0',
      fontFamily: '"IBM Plex Mono", "Courier New", monospace',
      display: 'flex', flexDirection: 'column',
    },
    header: {
      background: '#0a0b12',
      borderBottom: '1px solid #ffffff0a',
      padding: '12px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    main: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      gap: 1,
      background: '#ffffff08',
    },
    leftCol: {
      background: '#0a0b12',
      padding: 28,
      display: 'flex', flexDirection: 'column', gap: 24,
    },
    rightCol: {
      background: '#070810',
      display: 'flex', flexDirection: 'column',
    },
    metricGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 12,
    },
    metricCard: {
      background: '#0f1018',
      border: '1px solid #ffffff08',
      borderRadius: 10,
      padding: '16px 18px',
    },
    metricLabel: { fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' as const },
    metricValue: { fontSize: 22, fontWeight: 800, letterSpacing: 1, fontFamily: '"IBM Plex Mono", monospace' },
    metricSub: { fontSize: 10, color: '#475569', marginTop: 4 },
    feedHeader: {
      padding: '14px 20px',
      borderBottom: '1px solid #ffffff08',
      fontSize: 10, color: '#334155', letterSpacing: 2,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    feed: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '8px 0',
    },
    lanceRow: (tipo: string): React.CSSProperties => ({
      padding: '10px 20px',
      borderBottom: '1px solid #ffffff04',
      display: 'flex', alignItems: 'center', gap: 12,
      background: tipo === 'nosso' ? '#f9731608' : 'transparent',
      borderLeft: `3px solid ${tipo === 'nosso' ? '#f97316' : tipo === 'concorrente' ? '#ef444430' : '#334155'}`,
    }),
    controlArea: {
      padding: 20,
      borderTop: '1px solid #ffffff08',
      display: 'flex', flexDirection: 'column', gap: 12,
    },
    manualInput: {
      display: 'flex', gap: 8,
    },
    input: {
      flex: 1, background: '#ffffff08', border: '1px solid #ffffff12',
      borderRadius: 6, padding: '10px 14px',
      color: '#f1f5f9', fontSize: 13, fontFamily: '"IBM Plex Mono", monospace',
      outline: 'none',
    },
    btn: (color: string, bg: string): React.CSSProperties => ({
      padding: '10px 18px', borderRadius: 6, cursor: 'pointer',
      background: bg, border: `1px solid ${color}44`,
      color, fontSize: 11, fontWeight: 700, letterSpacing: 1,
    }),
    select: {
      background: '#ffffff08', border: '1px solid #ffffff12',
      borderRadius: 6, padding: '8px 12px',
      color: '#f1f5f9', fontSize: 11, fontFamily: '"IBM Plex Mono", monospace',
      outline: 'none', cursor: 'pointer',
    },
  }

  return (
    <div style={s.root}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes glow { 0%,100%{box-shadow:0 0 0 0 #f9731640} 50%{box-shadow:0 0 0 12px transparent} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes shimmer { from{background-position:200% 0} to{background-position:-200% 0} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e293b; }
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', top: 70, right: 24, zIndex: 100,
          background: toast.type === 'success' ? '#22c55e18' : toast.type === 'error' ? '#ef444418' : '#f9731618',
          border: `1px solid ${toast.type === 'success' ? '#22c55e44' : toast.type === 'error' ? '#ef444444' : '#f9731644'}`,
          borderRadius: 8, padding: '12px 20px',
          fontSize: 12, fontWeight: 700,
          color: toast.type === 'success' ? '#22c55e' : toast.type === 'error' ? '#ef4444' : '#f97316',
          animation: 'slideIn 0.2s ease-out',
          maxWidth: 360,
        }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: estado.fase === 'lances' ? '#22c55e' : '#ef4444', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: '#64748b' }}>LICITAGRAM</span>
          <span style={{ color: '#1e293b' }}>|</span>

          {/* Session selector or title */}
          {activeSessions.length > 0 && !demoMode ? (
            <select
              style={s.select}
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
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              {demoMode ? 'Modo Demo · Simulação' : 'Nenhuma sessão ativa'}
            </span>
          )}

          {/* Demo mode toggle */}
          <button
            style={{
              ...s.btn(demoMode ? '#3b82f6' : '#475569', demoMode ? '#3b82f618' : 'transparent'),
              fontSize: 9, padding: '6px 12px',
            }}
            onClick={toggleDemoMode}
          >
            {demoMode ? '● DEMO' : '○ DEMO'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <StatusBadge status={estado.status_robo} />
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', letterSpacing: 3, fontFamily: 'monospace' }}>{clock}</div>
        </div>
      </div>

      <div style={s.main}>

        {/* LEFT — MÉTRICAS + CONTROLES */}
        <div style={s.leftCol}>

          {/* MÉTRICAS PRINCIPAIS */}
          <div style={s.metricGrid}>
            <div style={{ ...s.metricCard, border: '1px solid #f9731622' }}>
              <div style={s.metricLabel}>Nosso lance</div>
              <div style={{ ...s.metricValue, color: '#f97316' }}>{estado.nosso_lance > 0 ? fmt(estado.nosso_lance) : '—'}</div>
              <div style={s.metricSub}>
                {estado.nosso_lance === 0 ? 'Aguardando lances' :
                 diferenca === 0 ? '= melhor lance' : `${fmt(Math.abs(diferenca))} ${diferenca > 0 ? 'acima' : 'abaixo'} do melhor`}
              </div>
            </div>

            <div style={{ ...s.metricCard, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PosicaoIndicator pos={estado.nossa_posicao} total={estado.total_concorrentes} />
            </div>

            <div style={{ ...s.metricCard, border: '1px solid #3b82f622' }}>
              <div style={s.metricLabel}>Melhor lance</div>
              <div style={{ ...s.metricValue, color: '#3b82f6' }}>{estado.melhor_lance > 0 ? fmt(estado.melhor_lance) : '—'}</div>
              <div style={s.metricSub}>Menor valor da disputa</div>
            </div>
          </div>

          {/* PROGRESSO DE LANCES */}
          <div style={{ background: '#0f1018', border: '1px solid #ffffff08', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 10, color: '#334155', letterSpacing: 2 }}>LANCES EXECUTADOS PELO ROBÔ</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#f97316', fontFamily: 'monospace' }}>
                {estado.lances_executados}/{estado.lances_max}
              </span>
            </div>
            <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${progressPct}%`,
                background: progressPct > 75 ? '#ef4444' : progressPct > 50 ? '#f97316' : '#22c55e',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 9, color: '#334155' }}>0</span>
              <span style={{ fontSize: 9, color: progressPct > 75 ? '#ef4444' : '#334155' }}>
                {progressPct > 75 ? '⚠ Próximo do limite' : `${estado.lances_max - estado.lances_executados} restantes`}
              </span>
              <span style={{ fontSize: 9, color: '#334155' }}>{estado.lances_max}</span>
            </div>
          </div>

          {/* FASE DA DISPUTA */}
          <div style={{ background: '#0f1018', border: '1px solid #ffffff08', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 12 }}>FASE DA DISPUTA</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['Abertura', 'Lances', 'Negociação', 'Resultado'] as const).map((fase, i) => {
                const ativo = (estado.fase === 'lances' && i === 1) || (estado.fase === 'aguardando' && i === 0) || (estado.fase === 'encerrado' && i === 3)
                const done = (estado.fase === 'lances' && i === 0) || (estado.fase === 'encerrado' && i < 3)
                return (
                  <div key={fase} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 6, textAlign: 'center',
                    background: ativo ? '#f9731618' : done ? '#22c55e12' : '#ffffff04',
                    border: `1px solid ${ativo ? '#f9731644' : done ? '#22c55e33' : '#ffffff08'}`,
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: ativo ? '#f97316' : done ? '#22c55e' : '#334155' }}>
                      {done ? '✓' : ativo ? '●' : '○'}
                    </div>
                    <div style={{ fontSize: 9, color: ativo ? '#f97316' : done ? '#22c55e' : '#334155', marginTop: 4 }}>{fase}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* CONTROLES */}
          <div style={{ background: '#0f1018', border: '1px solid #ffffff08', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 14 }}>CONTROLES</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <button style={s.btn(estado.status_robo === 'ativo' ? '#eab308' : '#22c55e', 'transparent')}
                onClick={toggleRobo}>
                {estado.status_robo === 'ativo' ? '⏸ PAUSAR ROBÔ' : '▶ RETOMAR ROBÔ'}
              </button>
              <button style={s.btn('#ef4444', 'transparent')}
                onClick={handleEncerrar}>
                ■ ENCERRAR
              </button>
            </div>

            <div style={{ fontSize: 9, color: '#334155', letterSpacing: 1, marginBottom: 8 }}>LANCE MANUAL</div>
            <div style={s.manualInput}>
              <input
                type="number"
                placeholder="Ex: 185000"
                value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && darLanceManual()}
                style={s.input}
              />
              <button
                style={{ ...s.btn('#f97316', '#f9731618'), padding: '10px 20px', border: '1px solid #f9731644' }}
                onClick={darLanceManual}
              >
                ENVIAR
              </button>
            </div>
            <div style={{ fontSize: 9, color: '#1e293b', marginTop: 6 }}>
              Pressione Enter ou clique em Enviar para dar um lance manual
            </div>
          </div>

          {/* AI INSIGHTS BAR */}
          {aiInsights.length > 0 && (
            <div style={{
              background: '#0f1018',
              border: '1px solid #a855f722',
              borderRadius: 10,
              padding: '14px 18px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: 'linear-gradient(90deg, #a855f7, #3b82f6, #a855f7)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s linear infinite',
              }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, animation: 'pulse 1.5s infinite' }}>🧠</span>
                  <span style={{ fontSize: 8, color: '#a855f7', letterSpacing: 2, fontWeight: 700 }}>INSIGHT IA</span>
                </div>
                {aiInsights.length > 1 && (
                  <div style={{ display: 'flex', gap: 3 }}>
                    {aiInsights.map((_, i) => (
                      <div key={i} style={{
                        width: 4, height: 4, borderRadius: '50%',
                        background: i === aiInsightIndex ? '#a855f7' : '#ffffff12',
                        transition: 'background 0.3s',
                      }} />
                    ))}
                  </div>
                )}
              </div>
              {(() => {
                const ins = aiInsights[aiInsightIndex]
                if (!ins) return null
                const colorMap: Record<string, string> = {
                  alerta: '#f97316',
                  oportunidade: '#22c55e',
                  estrategia: '#3b82f6',
                  risco: '#ef4444',
                }
                const color = colorMap[ins.tipo] || '#a855f7'
                return (
                  <div key={aiInsightIndex} style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: -1 }}>{ins.icone}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 3, letterSpacing: 0.3 }}>
                          {ins.titulo}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                          {ins.descricao}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

        </div>

        {/* RIGHT — FEED DE LANCES */}
        <div style={s.rightCol}>
          <div style={s.feedHeader}>
            <span>◈ FEED DE LANCES</span>
            <span style={{ color: '#f97316' }}>{lances.length} lances</span>
          </div>

          <div ref={feedRef} style={s.feed}>
            {lances.length === 0 && !demoMode && (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#334155', marginBottom: 8 }}>Nenhum lance registrado</div>
                <div style={{ fontSize: 10, color: '#1e293b' }}>
                  {selectedSessionId ? 'Aguardando lances do robô...' : 'Selecione uma sessão ou ative o modo Demo'}
                </div>
              </div>
            )}

            {lances.map((l, i) => (
              <div key={l.id} style={s.lanceRow(l.tipo)}>
                {/* Indicador */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: l.tipo === 'nosso' ? '#f97316' : l.tipo === 'concorrente' ? '#ef4444' : '#334155',
                  animation: i === lances.length - 1 ? 'pulse 0.5s 3' : 'none',
                }} />

                {/* Conteúdo */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{
                      fontSize: 14, fontWeight: 800,
                      color: l.tipo === 'nosso' ? '#f97316' : l.tipo === 'concorrente' ? '#ef4444' : '#475569',
                      fontFamily: 'monospace',
                    }}>
                      {fmt(l.valor)}
                    </span>
                    <span style={{ fontSize: 9, color: '#334155' }}>{l.tempo}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: 1,
                      color: l.tipo === 'nosso' ? '#f9731688' : l.tipo === 'concorrente' ? '#ef444488' : '#33415588',
                    }}>
                      {l.tipo === 'nosso' ? `NOSSO · ${l.executado_por === 'robo' ? '🤖 ROBÔ' : '👤 MANUAL'}` :
                       l.tipo === 'concorrente' ? l.empresa?.toUpperCase() : 'SISTEMA'}
                    </span>
                    {l.posicao_apos > 0 && (
                      <span style={{ fontSize: 9, color: l.posicao_apos === 1 ? '#22c55e' : '#64748b' }}>
                        → {l.posicao_apos}º lugar
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Indicador "ao vivo" */}
            {estado.fase === 'lances' && (
              <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'pulse 1s infinite' }} />
                <span style={{ fontSize: 9, color: '#334155' }}>
                  {demoMode ? 'Simulação ativa...' : selectedSessionId ? 'Polling a cada 3s...' : 'Aguardando sessão...'}
                </span>
              </div>
            )}

            {estado.fase === 'encerrado' && (
              <div style={{
                margin: 16, padding: '16px 20px', borderRadius: 8,
                background: estado.nossa_posicao === 1 ? '#22c55e12' : '#ef444412',
                border: `1px solid ${estado.nossa_posicao === 1 ? '#22c55e33' : '#ef444433'}`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{estado.nossa_posicao === 1 ? '🏆' : '📊'}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: estado.nossa_posicao === 1 ? '#22c55e' : '#ef4444', letterSpacing: 2, marginBottom: 6 }}>
                  {estado.nossa_posicao === 1 ? 'PREGÃO VENCIDO' : 'PREGÃO ENCERRADO'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {estado.nossa_posicao === 1
                    ? `Lance vencedor: ${fmt(estado.nosso_lance)}`
                    : `Posição final: ${estado.nossa_posicao}º lugar`
                  }
                </div>
              </div>
            )}
          </div>

          {/* MINI STATS BOTTOM */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #ffffff06', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Lances nossos', val: lances.filter(l => l.tipo === 'nosso').length },
              { label: 'Concorrentes', val: lances.filter(l => l.tipo === 'concorrente').length },
              { label: 'Total lances', val: lances.length },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#334155', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#475569', fontFamily: 'monospace' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
