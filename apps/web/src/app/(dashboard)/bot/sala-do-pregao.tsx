// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface Habilitado {
  cnpj: string
  razao_social: string
  porte: 'MEI' | 'ME' | 'EPP' | 'MEDIO' | 'DEMAIS'
  uf: string
  win_rate: number
  total_participacoes: number
  total_vitorias: number
  valor_medio_ganho: number
  desconto_medio: number
  modalidades: string[]
  ultima_participacao: string
  ganhou_neste_orgao: boolean
  historico?: HistoricoItem[]
}

interface HistoricoItem {
  objeto: string
  orgao: string
  valor: number
  resultado: 'ganhou' | 'perdeu'
  data: string
}

interface DifficultyScore {
  score: number
  nivel: 'fácil' | 'moderado' | 'difícil' | 'muito difícil'
  n_concorrentes: number
  win_rate_medio: number
  presenca_grande: boolean
  descontos_agressivos: boolean
  recomendacao: string
}

interface PriceSuggestion {
  lance_sugerido: number
  faixa_minima: number
  faixa_maxima: number
  baseado_em: number
  historico: HistoricoPreco[]
}

interface HistoricoPreco {
  objeto: string
  valor_estimado: number
  lance_vencedor: number
  desconto_percent: number
  data: string
}

interface Strategy {
  valor_referencia: number
  lance_inicial: number
  lance_minimo: number
  modo: 'agressivo' | 'conservador' | 'personalizado'
  robo_ativo: boolean
  decrementos_max: number
  decremento_percent: number
  posicao_alvo: number
  aguardar_segundos: number
}

interface AIInsight {
  tipo: 'alerta' | 'oportunidade' | 'estrategia' | 'risco'
  icone: string
  titulo: string
  descricao: string
  acao_sugerida: string
}

interface AIInsightsData {
  insights: AIInsight[]
  resumo: string
  score_confianca: number
}

interface SalaDoRegaoProps {
  tenderId?: string
  tenders?: any[]
  competitors?: any[]
  configs?: any[]
  companyId?: string
}

// ─── MOCK DATA (fallback) ────────────────────────────────────────────────────

const mockHabilitados: Habilitado[] = [
  {
    cnpj: '01.543.032/0001-04', razao_social: 'EQUATORIAL GOIAS DISTRIB.', porte: 'DEMAIS',
    uf: 'GO', win_rate: 0.97, total_participacoes: 67, total_vitorias: 65,
    valor_medio_ganho: 1154300, desconto_medio: 20.9, modalidades: ['Dispensa', 'Inexigibilidade'],
    ultima_participacao: '2026-03-19', ganhou_neste_orgao: true,
    historico: [
      { objeto: 'Serviços de TI especializado', orgao: 'Prefeitura de Goiânia', valor: 890000, resultado: 'ganhou', data: '2026-02' },
      { objeto: 'Sistema de gestão municipal', orgao: 'DETRAN/GO', valor: 1200000, resultado: 'ganhou', data: '2026-01' },
    ]
  },
  {
    cnpj: '00.000.000/0001-91', razao_social: 'BANCO DO BRASIL S.A.', porte: 'DEMAIS',
    uf: 'DF', win_rate: 1.0, total_participacoes: 19, total_vitorias: 19,
    valor_medio_ganho: 8490000, desconto_medio: 33.5, modalidades: ['Dispensa'],
    ultima_participacao: '2026-03-17', ganhou_neste_orgao: false,
    historico: [
      { objeto: 'Plataforma financeira gov', orgao: 'Min. da Fazenda', valor: 12000000, resultado: 'ganhou', data: '2026-01' },
    ]
  },
  {
    cnpj: '30.050.141/0001-80', razao_social: 'INLEGIS CONSULTORIA E...', porte: 'ME',
    uf: 'RS', win_rate: 0.89, total_participacoes: 18, total_vitorias: 16,
    valor_medio_ganho: 28210, desconto_medio: 26.4, modalidades: ['Inexigibilidade'],
    ultima_participacao: '2026-03-15', ganhou_neste_orgao: false,
  },
  {
    cnpj: '02.558.157/0001-62', razao_social: 'TELEFONICA BRASIL S.A.', porte: 'DEMAIS',
    uf: 'SP', win_rate: 0.73, total_participacoes: 12, total_vitorias: 9,
    valor_medio_ganho: 108650, desconto_medio: 52.8, modalidades: ['Dispensa', 'Pregão - Eletrônico'],
    ultima_participacao: '2026-03-12', ganhou_neste_orgao: false,
  },
  {
    cnpj: '16.701.716/0001-55', razao_social: 'GOVBRASIL TECH LTDA', porte: 'EPP',
    uf: 'SP', win_rate: 0.44, total_participacoes: 9, total_vitorias: 4,
    valor_medio_ganho: 41200, desconto_medio: 18.2, modalidades: ['Pregão - Eletrônico'],
    ultima_participacao: '2026-03-10', ganhou_neste_orgao: false,
  },
]

const mockDifficulty: DifficultyScore = {
  score: 72,
  nivel: 'difícil',
  n_concorrentes: 5,
  win_rate_medio: 80,
  presenca_grande: true,
  descontos_agressivos: true,
  recomendacao: 'Disputa acirrada. Presença de empresa dominante no segmento com 97% de win rate. Defina seu lance mínimo com cuidado e ative o robô para contra-ataques precisos.',
}

const mockSuggestion: PriceSuggestion = {
  lance_sugerido: 189420,
  faixa_minima: 165000,
  faixa_maxima: 210000,
  baseado_em: 23,
  historico: [
    { objeto: 'Solução de TI para gestão municipal', valor_estimado: 220000, lance_vencedor: 187000, desconto_percent: 15, data: 'Jan/2026' },
    { objeto: 'Sistema web portal institucional', valor_estimado: 180000, lance_vencedor: 141300, desconto_percent: 21, data: 'Dez/2025' },
    { objeto: 'Desenvolvimento de sistema SaaS', valor_estimado: 250000, lance_vencedor: 198000, desconto_percent: 21, data: 'Nov/2025' },
    { objeto: 'Plataforma digital gov integrada', valor_estimado: 195000, lance_vencedor: 172000, desconto_percent: 12, data: 'Out/2025' },
    { objeto: 'Consultoria TI + suporte técnico', valor_estimado: 210000, lance_vencedor: 175000, desconto_percent: 17, data: 'Set/2025' },
  ]
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Convert raw competitors from DB into Habilitado format */
function competitorsToHabilitados(competitors: any[]): Habilitado[] {
  return competitors.map((c) => ({
    cnpj: c.cnpj || '00.000.000/0001-00',
    razao_social: c.nome || 'Empresa não identificada',
    porte: 'DEMAIS' as const,
    uf: '',
    win_rate: 0,
    total_participacoes: 0,
    total_vitorias: 0,
    valor_medio_ganho: c.valor_proposta ? Number(c.valor_proposta) : 0,
    desconto_medio: 0,
    modalidades: [],
    ultima_participacao: c.created_at ? c.created_at.slice(0, 10) : '',
    ganhou_neste_orgao: c.situacao === 'vencedor',
  }))
}

/** Calculate difficulty score from competitor data */
function calculateDifficulty(habilitados: Habilitado[], valorEstimado: number): DifficultyScore {
  const n = habilitados.length
  const avgWinRate = n > 0 ? habilitados.reduce((s, h) => s + h.win_rate, 0) / n : 0
  const hasLarge = habilitados.some(h => h.porte === 'DEMAIS')
  const avgDiscount = n > 0 ? habilitados.reduce((s, h) => s + h.desconto_medio, 0) / n : 0
  const aggressive = avgDiscount > 20

  let score = 20 // base
  if (n > 5) score += 15
  else if (n > 3) score += 10
  if (avgWinRate > 0.7) score += 20
  else if (avgWinRate > 0.4) score += 10
  if (hasLarge) score += 15
  if (aggressive) score += 15
  score = Math.min(100, Math.max(0, score))

  const nivel = score >= 75 ? 'muito difícil' : score >= 50 ? 'difícil' : score >= 25 ? 'moderado' : 'fácil'

  const recomendacoes: Record<string, string> = {
    'fácil': 'Poucos concorrentes e baixo nível de competitividade. Boa oportunidade para lance conservador.',
    'moderado': 'Competição moderada. Recomenda-se atenção ao posicionamento e lances estratégicos.',
    'difícil': 'Disputa acirrada. Defina seu lance mínimo com cuidado e ative o robô para contra-ataques precisos.',
    'muito difícil': 'Competição extremamente forte. Presença de empresas dominantes. Avalie se o custo-benefício vale a disputa.',
  }

  return {
    score,
    nivel,
    n_concorrentes: n,
    win_rate_medio: Math.round(avgWinRate * 100),
    presenca_grande: hasLarge,
    descontos_agressivos: aggressive,
    recomendacao: recomendacoes[nivel],
  }
}

/** Generate price suggestion based on competitor data and estimated value */
function calculateSuggestion(habilitados: Habilitado[], valorEstimado: number): PriceSuggestion {
  if (!valorEstimado || valorEstimado <= 0) {
    return { lance_sugerido: 0, faixa_minima: 0, faixa_maxima: 0, baseado_em: 0, historico: [] }
  }

  const avgDiscount = habilitados.length > 0
    ? habilitados.reduce((s, h) => s + h.desconto_medio, 0) / habilitados.length
    : 15

  const sugerido = Math.round(valorEstimado * (1 - avgDiscount / 100))
  const minimo = Math.round(valorEstimado * 0.7)
  const maximo = Math.round(valorEstimado * 0.95)

  return {
    lance_sugerido: sugerido,
    faixa_minima: minimo,
    faixa_maxima: maximo,
    baseado_em: habilitados.length,
    historico: [],
  }
}

function WinRateBadge({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100)
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : pct >= 40 ? '#eab308' : '#22c55e'
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700,
      fontFamily: 'monospace', letterSpacing: 1,
    }}>
      {pct}%
    </span>
  )
}

function PorteBadge({ porte }: { porte: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    DEMAIS: { bg: '#ef444422', color: '#ef4444' },
    EPP: { bg: '#f9731622', color: '#f97316' },
    ME: { bg: '#eab30822', color: '#eab308' },
    MEI: { bg: '#22c55e22', color: '#22c55e' },
    MEDIO: { bg: '#a855f722', color: '#a855f7' },
  }
  const s = styles[porte] || { bg: '#ffffff11', color: '#999' }
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
      borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {porte}
    </span>
  )
}

// ─── GAUGE ────────────────────────────────────────────────────────────────────

function DifficultyGauge({ score, nivel }: { score: number; nivel: string }) {
  const color = score >= 75 ? '#ef4444' : score >= 50 ? '#f97316' : score >= 25 ? '#eab308' : '#22c55e'
  const angle = -135 + (score / 100) * 270

  const levelLabel: Record<string, string> = {
    'fácil': 'FÁCIL',
    'moderado': 'MODERADO',
    'difícil': 'DIFÍCIL',
    'muito difícil': 'CRÍTICO',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={200} height={120} viewBox="0 0 200 120">
        {/* Background arc */}
        <path d="M 20 110 A 80 80 0 1 1 180 110" fill="none" stroke="#ffffff0a" strokeWidth={14} strokeLinecap="round" />
        {/* Colored arc based on score */}
        {[
          { start: 0, end: 25, color: '#22c55e' },
          { start: 25, end: 50, color: '#eab308' },
          { start: 50, end: 75, color: '#f97316' },
          { start: 75, end: 100, color: '#ef4444' },
        ].map((seg) => {
          const actualEnd = Math.min(score, seg.end)
          if (actualEnd <= seg.start) return null
          const startAngle = -225 + (seg.start / 100) * 270
          const endAngle = -225 + (actualEnd / 100) * 270
          const startRad = (startAngle * Math.PI) / 180
          const endRad = (endAngle * Math.PI) / 180
          const cx = 100, cy = 110, r = 80
          const x1 = cx + r * Math.cos(startRad)
          const y1 = cy + r * Math.sin(startRad)
          const x2 = cx + r * Math.cos(endRad)
          const y2 = cy + r * Math.sin(endRad)
          const largeArc = (actualEnd - seg.start) / 100 * 270 > 180 ? 1 : 0
          return (
            <path key={seg.start}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none" stroke={seg.color} strokeWidth={14} strokeLinecap="round"
            />
          )
        })}
        {/* Needle */}
        <g transform={`rotate(${angle}, 100, 110)`}>
          <line x1={100} y1={110} x2={100} y2={42} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={100} cy={110} r={6} fill={color} />
          <circle cx={100} cy={110} r={3} fill="#0a0a0f" />
        </g>
        {/* Score text */}
        <text x={100} y={98} textAnchor="middle" fill={color} fontSize={28} fontWeight={700} fontFamily="monospace">
          {score}
        </text>
        <text x={100} y={112} textAnchor="middle" fill="#ffffff44" fontSize={10} fontFamily="monospace">
          /100
        </text>
      </svg>
      <div style={{
        background: `${color}22`, color, border: `1px solid ${color}55`,
        borderRadius: 6, padding: '4px 18px', fontSize: 13, fontWeight: 800,
        letterSpacing: 3, fontFamily: 'monospace',
      }}>
        {levelLabel[nivel] || nivel.toUpperCase()}
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function SalaDoRegao({ tenderId: initialTenderId, tenders = [], competitors = [], configs = [], companyId }: SalaDoRegaoProps) {
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(initialTenderId || null)
  const [habilitados, setHabilitados] = useState<Habilitado[]>([])
  const [difficulty, setDifficulty] = useState<DifficultyScore>(mockDifficulty)
  const [suggestion, setSuggestion] = useState<PriceSuggestion>(mockSuggestion)
  const [expandedCnpj, setExpandedCnpj] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [clock, setClock] = useState('')
  const [isDemo, setIsDemo] = useState(false)
  const [aiInsights, setAiInsights] = useState<AIInsightsData | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const aiRequestRef = useRef(0)

  // Get the selected tender data
  const selectedTender = tenders.find((t: any) => t.id === selectedTenderId)
  const tenderTitle = selectedTender?.objeto || (isDemo ? 'Contratação de empresa especializada para serviços técnicos de TI junto à Câmara Municipal' : 'Nenhum pregão selecionado')
  const valorEstimado = selectedTender?.valor_estimado ? Number(selectedTender.valor_estimado) : (isDemo ? 225000 : 0)

  // Strategy state - initialize with computed values
  const [strategy, setStrategy] = useState<Strategy>({
    valor_referencia: valorEstimado,
    lance_inicial: Math.round(valorEstimado * 0.85),
    lance_minimo: Math.round(valorEstimado * 0.7),
    modo: 'conservador',
    robo_ativo: false,
    decrementos_max: 20,
    decremento_percent: 1,
    posicao_alvo: 1,
    aguardar_segundos: 30,
  })

  // When tender selection changes, recompute everything
  useEffect(() => {
    // If demo mode is explicitly on, use mock data
    if (isDemo) {
      setHabilitados(mockHabilitados)
      setDifficulty(mockDifficulty)
      setSuggestion(mockSuggestion)
      setStrategy(prev => ({
        ...prev,
        valor_referencia: 225000,
        lance_inicial: mockSuggestion.lance_sugerido,
        lance_minimo: mockSuggestion.faixa_minima,
      }))
      return
    }

    if (!selectedTenderId || tenders.length === 0) {
      // No real tender selected — show empty state (not mock)
      setHabilitados([])
      setDifficulty({ score: 0, nivel: 'fácil', n_concorrentes: 0, win_rate_medio: 0, presenca_grande: false, descontos_agressivos: false, recomendacao: 'Selecione um pregão para ver a análise de concorrência.' })
      setSuggestion({ lance_sugerido: 0, faixa_minima: 0, faixa_maxima: 0, baseado_em: 0, historico: [] })
      return
    }

    const tender = tenders.find((t: any) => t.id === selectedTenderId)
    const tenderComps = competitors.filter((c: any) => c.tender_id === selectedTenderId)
    const ve = tender?.valor_estimado ? Number(tender.valor_estimado) : 0

    if (tenderComps.length > 0) {
      const habs = competitorsToHabilitados(tenderComps)
      setHabilitados(habs)
      setDifficulty(calculateDifficulty(habs, ve))
      setSuggestion(calculateSuggestion(habs, ve))
    } else {
      // No competitors found for this tender — show empty (not mock)
      setHabilitados([])
      setDifficulty({ score: 0, nivel: 'fácil', n_concorrentes: 0, win_rate_medio: 0, presenca_grande: false, descontos_agressivos: false, recomendacao: 'Nenhum concorrente encontrado para este pregão ainda.' })
      setSuggestion({ lance_sugerido: ve > 0 ? Math.round(ve * 0.85) : 0, faixa_minima: ve > 0 ? Math.round(ve * 0.7) : 0, faixa_maxima: ve > 0 ? Math.round(ve * 0.95) : 0, baseado_em: 0, historico: [] })
    }

    // Update strategy with new tender values
    const sug = tenderComps.length > 0
      ? calculateSuggestion(competitorsToHabilitados(tenderComps), ve)
      : { lance_sugerido: ve > 0 ? Math.round(ve * 0.85) : 0, faixa_minima: ve > 0 ? Math.round(ve * 0.7) : 0, faixa_maxima: ve > 0 ? Math.round(ve * 0.95) : 0, baseado_em: 0, historico: [] }

    setStrategy(prev => ({
      ...prev,
      valor_referencia: ve,
      lance_inicial: sug.lance_sugerido,
      lance_minimo: sug.faixa_minima,
    }))
    setConfirmed(false)
  }, [selectedTenderId, tenders, competitors, isDemo])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString('pt-BR', { hour12: false }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch AI insights when tender/competitors change
  useEffect(() => {
    if (loading) return

    const requestId = ++aiRequestRef.current
    setAiInsights(null)
    setAiLoading(true)

    const fetchInsights = async () => {
      try {
        const selectedT = tenders.find((t: any) => t.id === selectedTenderId)
        const res = await fetch('/api/bot/ai-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'pre-disputa',
            tender: {
              objeto: selectedT?.objeto || 'Contratação de empresa especializada para serviços técnicos de TI',
              orgao_nome: selectedT?.orgao_nome || selectedT?.orgao || 'Órgão não identificado',
              valor_estimado: valorEstimado,
              modalidade_nome: selectedT?.modalidade_nome || 'Pregão Eletrônico',
            },
            competitors: habilitados.map(h => ({
              razao_social: h.razao_social,
              win_rate: h.win_rate,
              total_participacoes: h.total_participacoes,
              valor_medio_ganho: h.valor_medio_ganho,
              desconto_medio: h.desconto_medio,
            })),
            strategy: {
              lance_inicial: strategy.lance_inicial,
              lance_minimo: strategy.lance_minimo,
              modo: strategy.modo,
            },
          }),
        })

        if (requestId !== aiRequestRef.current) return // stale request

        if (res.ok) {
          const data = await res.json()
          setAiInsights(data)
        }
      } catch {
        // silently skip
      } finally {
        if (requestId === aiRequestRef.current) {
          setAiLoading(false)
        }
      }
    }

    // Debounce slightly to avoid rapid calls
    const timer = setTimeout(fetchInsights, 500)
    return () => clearTimeout(timer)
  }, [habilitados, selectedTenderId, loading])

  // Create a real bot_session when strategy is confirmed
  const handleConfirmStrategy = async () => {
    if (confirmed) return

    // If we have a real tender and configs, create a session
    if (selectedTenderId && configs.length > 0 && companyId && !isDemo) {
      try {
        const config = configs[0] // Use first available config
        const res = await fetch('/api/bot/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config_id: config.id,
            pregao_id: selectedTender?.pncp_id || selectedTenderId,
            tender_id: selectedTenderId,
            portal: config.portal || 'comprasnet',
            min_price: strategy.lance_minimo,
            max_bids: strategy.decrementos_max,
            strategy: {
              modo: strategy.modo,
              lance_inicial: strategy.lance_inicial,
              lance_minimo: strategy.lance_minimo,
              decremento_percent: strategy.decremento_percent,
              posicao_alvo: strategy.posicao_alvo,
              aguardar_segundos: strategy.aguardar_segundos,
              robo_ativo: strategy.robo_ativo,
            },
          }),
        })
        if (!res.ok) {
          console.error('Failed to create session:', await res.text())
        }
      } catch (err) {
        console.error('Failed to create bot session:', err)
      }
    }

    setConfirmed(true)
  }

  const margem = strategy.valor_referencia > 0
    ? Math.round(((strategy.valor_referencia - strategy.lance_minimo) / strategy.valor_referencia) * 100)
    : 0

  const descontoSugerido = strategy.valor_referencia > 0
    ? Math.round(((strategy.valor_referencia - strategy.lance_inicial) / strategy.valor_referencia) * 100)
    : 0

  const s: Record<string, React.CSSProperties> = {
    root: {
      background: '#08090e',
      minHeight: '100vh',
      color: '#e2e8f0',
      fontFamily: '"IBM Plex Mono", "Courier New", monospace',
      position: 'relative',
      overflow: 'hidden',
    },
    scanline: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      pointerEvents: 'none', zIndex: 0,
    },
    header: {
      borderBottom: '1px solid #ffffff0f',
      padding: '14px 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#0a0b12',
      position: 'relative', zIndex: 2,
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 20 },
    headerBadge: {
      background: isDemo ? '#3b82f622' : '#ef444422',
      color: isDemo ? '#3b82f6' : '#ef4444',
      border: `1px solid ${isDemo ? '#3b82f655' : '#ef444455'}`,
      borderRadius: 4,
      padding: '3px 12px', fontSize: 10, fontWeight: 700,
      letterSpacing: 2, animation: 'pulse 2s infinite',
    },
    tenderTitle: { fontSize: 13, color: '#94a3b8', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    clock: { fontSize: 20, fontWeight: 700, color: '#f1f5f9', letterSpacing: 3, fontFamily: '"IBM Plex Mono", monospace' },
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr 340px 360px',
      gap: 1,
      background: '#ffffff08',
      height: 'calc(100vh - 57px)',
      position: 'relative', zIndex: 1,
    },
    panel: {
      background: '#0a0b12',
      overflow: 'auto',
      padding: 0,
    },
    panelHeader: {
      padding: '14px 20px',
      borderBottom: '1px solid #ffffff0a',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, background: '#0a0b12', zIndex: 10,
    },
    panelTitle: { fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#475569', textTransform: 'uppercase' },
    panelCount: { fontSize: 11, color: '#f97316', fontWeight: 700 },
    habilitadoRow: {
      padding: '14px 20px',
      borderBottom: '1px solid #ffffff06',
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
    habilitadoTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    habilitadoName: { fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 4, letterSpacing: 0.3 },
    habilitadoMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
    metaChip: { fontSize: 10, color: '#64748b', fontFamily: 'monospace' },
    diffPanel: { padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 20 },
    factorRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #ffffff06' },
    factorLabel: { fontSize: 11, color: '#64748b' },
    factorValue: { fontSize: 11, fontWeight: 700, fontFamily: 'monospace' },
    recommendation: {
      background: '#f9731608', border: '1px solid #f9731622',
      borderRadius: 8, padding: '12px 16px',
      fontSize: 11, color: '#cbd5e1', lineHeight: 1.7,
    },
    strategyPanel: { padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 16 },
    inputGroup: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
    label: { fontSize: 10, color: '#475569', letterSpacing: 2, textTransform: 'uppercase' as const, fontWeight: 700 },
    input: {
      background: '#ffffff08', border: '1px solid #ffffff12',
      borderRadius: 6, padding: '10px 14px',
      color: '#f1f5f9', fontSize: 13, fontFamily: '"IBM Plex Mono", monospace',
      outline: 'none', width: '100%', boxSizing: 'border-box' as const,
    },
    modeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 },
    modeBtn: (active: boolean, color: string): React.CSSProperties => ({
      padding: '8px 4px', borderRadius: 6, cursor: 'pointer',
      border: `1px solid ${active ? color + '88' : '#ffffff12'}`,
      background: active ? color + '18' : 'transparent',
      color: active ? color : '#475569',
      fontSize: 10, fontWeight: 700, letterSpacing: 1,
      textAlign: 'center', textTransform: 'uppercase',
      transition: 'all 0.15s',
    }),
    toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid #ffffff0a' },
    toggleLabel: { fontSize: 12, color: '#94a3b8' },
    toggle: (on: boolean): React.CSSProperties => ({
      width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
      background: on ? '#f97316' : '#1e293b',
      border: `1px solid ${on ? '#f97316' : '#334155'}`,
      position: 'relative', transition: 'all 0.2s',
    }),
    toggleKnob: (on: boolean): React.CSSProperties => ({
      position: 'absolute', top: 3, left: on ? 23 : 3,
      width: 16, height: 16, borderRadius: 8,
      background: '#fff', transition: 'left 0.2s',
    }),
    summaryBox: {
      background: '#f9731608', border: '1px solid #f9731622',
      borderRadius: 8, padding: '14px 16px',
    },
    summaryRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0' },
    summaryKey: { fontSize: 10, color: '#64748b', letterSpacing: 1 },
    summaryVal: { fontSize: 12, fontWeight: 700, fontFamily: 'monospace' },
    ctaBtn: {
      padding: '14px 20px', borderRadius: 8,
      background: confirmed ? '#22c55e' : strategy.robo_ativo ? 'linear-gradient(135deg, #f97316, #ef4444)' : '#1e40af',
      border: 'none', color: '#fff', cursor: 'pointer',
      fontSize: 13, fontWeight: 800, letterSpacing: 2,
      textTransform: 'uppercase', width: '100%',
      transition: 'all 0.2s',
    },
    histTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 11 },
    select: {
      background: '#ffffff08', border: '1px solid #ffffff12',
      borderRadius: 6, padding: '10px 14px',
      color: '#f1f5f9', fontSize: 12, fontFamily: '"IBM Plex Mono", monospace',
      outline: 'none', width: '100%', boxSizing: 'border-box' as const,
      cursor: 'pointer',
    },
  }

  if (loading) {
    return (
      <div style={{ ...s.root, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
        <div style={s.scanline} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 10, color: '#f97316', letterSpacing: 4, fontFamily: 'monospace', animation: 'pulse 1s infinite' }}>
            ◈ INICIALIZANDO SALA DO PREGÃO
          </div>
          {['Carregando habilitados...', 'Analisando histórico dos concorrentes...', 'Calculando score de dificuldade...', 'Buscando licitações similares...'].map((msg, i) => (
            <div key={i} style={{
              fontSize: 11, color: '#334155', fontFamily: 'monospace', letterSpacing: 1,
              opacity: 0, animation: `fadeIn 0.5s ${i * 0.4}s forwards`,
            }}>
              {msg}
            </div>
          ))}
          <div style={{ width: 200, height: 2, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginTop: 8 }}>
            <div style={{
              height: '100%', background: '#f97316',
              animation: 'loadBar 1.8s ease-out forwards',
              borderRadius: 2,
            }} />
          </div>
        </div>
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
          @keyframes fadeIn { to{opacity:0.6} }
          @keyframes loadBar { from{width:0} to{width:100%} }
        `}</style>
      </div>
    )
  }

  return (
    <div style={s.root}>
      <div style={s.scanline} />
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>

      {/* HEADER */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, color: '#f97316' }}>SALA DO PREGÃO</span>
          </div>
          <button
            onClick={() => setIsDemo(!isDemo)}
            style={{
              ...s.headerBadge,
              cursor: 'pointer',
              background: isDemo ? '#3b82f622' : '#ef444422',
              color: isDemo ? '#3b82f6' : '#ef4444',
              border: `1px solid ${isDemo ? '#3b82f655' : '#ef444455'}`,
            }}
          >
            {isDemo ? '● DEMO' : '○ AO VIVO'}
          </button>

          {/* Tender selector or title */}
          {tenders.length > 0 ? (
            <select
              style={{ ...s.select, maxWidth: 480 }}
              value={selectedTenderId || ''}
              onChange={(e) => setSelectedTenderId(e.target.value || null)}
            >
              <option value="">Selecione um pregão...</option>
              {tenders.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.objeto?.slice(0, 80) || 'Pregão sem título'} {t.valor_estimado ? `(${fmt(Number(t.valor_estimado))})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div style={s.tenderTitle}>{tenderTitle}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ fontSize: 10, color: '#475569', textAlign: 'right' }}>
            <div>ABERTURA</div>
            <div style={{ color: '#94a3b8', fontWeight: 700 }}>
              {selectedTender?.data_abertura
                ? new Date(selectedTender.data_abertura).toLocaleDateString('pt-BR') + ' · ' + new Date(selectedTender.data_abertura).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#475569', textAlign: 'right' }}>
            <div>VALOR EST.</div>
            <div style={{ color: '#f1f5f9', fontWeight: 700 }}>{fmt(valorEstimado)}</div>
          </div>
          <div style={{ fontSize: 10, color: '#475569', textAlign: 'right' }}>
            <div>HORA</div>
            <div style={s.clock}>{clock}</div>
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div style={s.grid}>

        {/* PANEL 1 — HABILITADOS */}
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>◈ Concorrentes habilitados</span>
            <span style={s.panelCount}>{habilitados.length} empresas</span>
          </div>
          {habilitados.map((h, i) => (
            <div key={h.cnpj}>
              <div
                style={{
                  ...s.habilitadoRow,
                  background: expandedCnpj === h.cnpj ? '#ffffff04' : 'transparent',
                  borderLeft: h.ganhou_neste_orgao ? '3px solid #ef444466' : '3px solid transparent',
                  animationDelay: `${i * 0.08}s`,
                }}
                onClick={() => setExpandedCnpj(expandedCnpj === h.cnpj ? null : h.cnpj)}
              >
                <div style={s.habilitadoTop}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.habilitadoName}>
                      {h.razao_social}
                      {h.ganhou_neste_orgao && (
                        <span style={{ fontSize: 9, color: '#ef4444', marginLeft: 8, letterSpacing: 1 }}>
                          ⚡ DOMINA ESTE ÓRGÃO
                        </span>
                      )}
                    </div>
                    <div style={s.habilitadoMeta}>
                      <PorteBadge porte={h.porte} />
                      {h.uf && <span style={s.metaChip}>{h.uf}</span>}
                      {h.uf && <span style={s.metaChip}>·</span>}
                      <span style={s.metaChip}>{h.total_participacoes} participações</span>
                      <span style={s.metaChip}>·</span>
                      <span style={s.metaChip}>desc. médio {h.desconto_medio}%</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <WinRateBadge rate={h.win_rate} />
                    <span style={{ fontSize: 9, color: '#334155' }}>
                      {expandedCnpj === h.cnpj ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* STATS MINI-ROW */}
                <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid #ffffff06' }}>
                  {[
                    { label: 'Vitórias', val: h.total_vitorias },
                    { label: 'Valor médio', val: fmt(h.valor_medio_ganho) },
                    { label: 'Última part.', val: h.ultima_participacao },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 9, color: '#334155', letterSpacing: 1, marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* EXPANDIDO — HISTÓRICO */}
              {expandedCnpj === h.cnpj && h.historico && (
                <div style={{ background: '#070810', padding: '12px 20px 16px', borderBottom: '1px solid #ffffff06' }}>
                  <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 10 }}>ÚLTIMAS PARTICIPAÇÕES</div>
                  {h.historico.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: idx < h.historico!.length - 1 ? '1px solid #ffffff04' : 'none' }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                        background: item.resultado === 'ganhou' ? '#22c55e' : '#ef4444',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.objeto}</div>
                        <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{item.orgao} · {fmt(item.valor)} · {item.data}</div>
                      </div>
                      <div style={{ fontSize: 10, color: item.resultado === 'ganhou' ? '#22c55e' : '#ef4444', fontWeight: 700, flexShrink: 0 }}>
                        {item.resultado === 'ganhou' ? 'GANHOU' : 'PERDEU'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* PANEL 2 — DIFICULDADE + HISTÓRICO */}
        <div style={{ ...s.panel, borderLeft: '1px solid #ffffff08', borderRight: '1px solid #ffffff08' }}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>◈ Análise da disputa</span>
          </div>

          <div style={s.diffPanel}>
            {/* GAUGE */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <DifficultyGauge score={difficulty.score} nivel={difficulty.nivel} />
            </div>

            {/* FATORES */}
            <div>
              <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 8 }}>FATORES DE DIFICULDADE</div>
              {[
                { label: 'Nº de concorrentes', val: `${difficulty.n_concorrentes} empresas`, flag: difficulty.n_concorrentes > 5 },
                { label: 'Win rate médio', val: `${difficulty.win_rate_medio}%`, flag: difficulty.win_rate_medio > 70 },
                { label: 'Grande porte presente', val: difficulty.presenca_grande ? 'SIM' : 'NÃO', flag: difficulty.presenca_grande },
                { label: 'Lances agressivos hist.', val: difficulty.descontos_agressivos ? 'SIM' : 'NÃO', flag: difficulty.descontos_agressivos },
              ].map(f => (
                <div key={f.label} style={s.factorRow}>
                  <span style={s.factorLabel}>{f.label}</span>
                  <span style={{ ...s.factorValue, color: f.flag ? '#f97316' : '#22c55e' }}>{f.val}</span>
                </div>
              ))}
            </div>

            {/* RECOMENDAÇÃO */}
            <div style={s.recommendation}>
              <div style={{ fontSize: 9, color: '#f97316', letterSpacing: 2, marginBottom: 6 }}>⚡ RECOMENDAÇÃO DA IA</div>
              <div style={{ fontSize: 11, lineHeight: 1.7 }}>{difficulty.recomendacao}</div>
            </div>

            {/* AI INSIGHTS */}
            <div>
              <div style={{ fontSize: 9, color: '#a855f7', letterSpacing: 2, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', animation: aiLoading ? 'pulse 1s infinite' : 'none' }}>🧠</span>
                INSIGHTS IA
                {aiInsights && (
                  <span style={{
                    fontSize: 9, color: '#475569', fontWeight: 400, letterSpacing: 0,
                  }}>
                    — Confiança: {aiInsights.score_confianca}%
                  </span>
                )}
              </div>

              {aiLoading && (
                <div style={{
                  background: '#a855f708', border: '1px solid #a855f722',
                  borderRadius: 8, padding: '16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: '2px solid #a855f744',
                    borderTopColor: '#a855f7',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <div>
                    <div style={{ fontSize: 11, color: '#a855f7', fontWeight: 600, marginBottom: 2 }}>Analisando concorrentes...</div>
                    <div style={{ fontSize: 9, color: '#475569' }}>A IA está processando dados dos habilitados</div>
                  </div>
                </div>
              )}

              {aiInsights && !aiLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aiInsights.insights.map((ins, i) => {
                    const borderColors: Record<string, string> = {
                      alerta: '#f97316',
                      oportunidade: '#22c55e',
                      estrategia: '#3b82f6',
                      risco: '#ef4444',
                    }
                    const borderColor = borderColors[ins.tipo] || '#475569'

                    return (
                      <div key={i} style={{
                        background: '#ffffff04',
                        borderLeft: `3px solid ${borderColor}`,
                        borderRadius: '0 6px 6px 0',
                        padding: '10px 12px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 12 }}>{ins.icone}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: borderColor, letterSpacing: 0.3 }}>
                            {ins.titulo}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.6, marginBottom: 6 }}>
                          {ins.descricao}
                        </div>
                        {ins.acao_sugerida && (
                          <div style={{
                            fontSize: 9, color: '#cbd5e1', letterSpacing: 0.5,
                            background: `${borderColor}0a`, padding: '4px 8px',
                            borderRadius: 4, display: 'inline-block',
                          }}>
                            → {ins.acao_sugerida}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* RESUMO */}
                  <div style={{
                    background: '#a855f708', border: '1px solid #a855f722',
                    borderRadius: 6, padding: '8px 12px',
                    fontSize: 10, color: '#a855f7', lineHeight: 1.6,
                    fontStyle: 'italic',
                  }}>
                    {aiInsights.resumo}
                  </div>
                </div>
              )}
            </div>

            {/* SUGESTÃO DE PREÇO */}
            <div>
              <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 10 }}>SUGESTÃO DE LANCE</div>
              <div style={{ fontSize: 9, color: '#475569', marginBottom: 12 }}>
                Baseado em {suggestion.baseado_em} {isDemo ? 'licitações similares encerradas' : 'concorrentes analisados'}
              </div>

              {/* RANGE BAR */}
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <div style={{ height: 6, background: '#1e293b', borderRadius: 3 }}>
                  <div style={{
                    position: 'absolute', height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg, #22c55e44, #f97316)',
                    left: '20%', right: '10%',
                  }} />
                  <div style={{
                    position: 'absolute', top: -3, width: 12, height: 12,
                    borderRadius: '50%', background: '#f97316',
                    border: '2px solid #08090e',
                    left: `${20 + (suggestion.lance_sugerido - suggestion.faixa_minima) / (Math.max(suggestion.faixa_maxima - suggestion.faixa_minima, 1)) * 70}%`,
                    transform: 'translateX(-50%)',
                  }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#475569' }}>
                  <div>MÍNIMO</div>
                  <div style={{ color: '#22c55e', fontWeight: 700 }}>{fmt(suggestion.faixa_minima)}</div>
                </div>
                <div style={{ fontSize: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#f97316', letterSpacing: 1 }}>SUGERIDO</div>
                  <div style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 15 }}>{fmt(suggestion.lance_sugerido)}</div>
                </div>
                <div style={{ fontSize: 10, color: '#475569', textAlign: 'right' }}>
                  <div>MÁXIMO</div>
                  <div style={{ color: '#f1f5f9', fontWeight: 700 }}>{fmt(suggestion.faixa_maxima)}</div>
                </div>
              </div>
            </div>

            {/* HISTÓRICO SIMILARES */}
            {suggestion.historico.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 10 }}>LICITAÇÕES SIMILARES ENCERRADAS</div>
                <table style={s.histTable}>
                  <thead>
                    <tr>
                      {['Data', 'Val. Est.', 'Vencedor', 'Desc.'].map(h => (
                        <th key={h} style={{ textAlign: 'left', fontSize: 9, color: '#334155', fontWeight: 600, padding: '0 0 8px', letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suggestion.historico.map((h, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #ffffff04' }}>
                        <td style={{ padding: '7px 0', fontSize: 10, color: '#475569' }}>{h.data}</td>
                        <td style={{ padding: '7px 0', fontSize: 10, color: '#64748b' }}>{fmt(h.valor_estimado)}</td>
                        <td style={{ padding: '7px 0', fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{fmt(h.lance_vencedor)}</td>
                        <td style={{ padding: '7px 0', fontSize: 11, color: h.desconto_percent > 20 ? '#f97316' : '#22c55e', fontWeight: 700 }}>
                          -{h.desconto_percent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* PANEL 3 — ESTRATÉGIA */}
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>◈ Estratégia de disputa</span>
            <span style={{ fontSize: 9, color: '#334155' }}>Configure antes de entrar</span>
          </div>

          <div style={s.strategyPanel}>

            {/* VALORES */}
            <div style={s.inputGroup}>
              <label style={s.label}>Valor de referência (edital)</label>
              <input
                type="number"
                style={s.input}
                value={strategy.valor_referencia}
                onChange={e => setStrategy(p => ({ ...p, valor_referencia: +e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={s.inputGroup}>
                <label style={s.label}>Lance inicial</label>
                <input
                  type="number"
                  style={{ ...s.input, borderColor: '#f9731633' }}
                  value={strategy.lance_inicial}
                  onChange={e => setStrategy(p => ({ ...p, lance_inicial: +e.target.value }))}
                />
                <span style={{ fontSize: 9, color: '#f97316' }}>
                  -{descontoSugerido}% do valor est.
                </span>
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Lance mínimo ⚠</label>
                <input
                  type="number"
                  style={{ ...s.input, borderColor: '#ef444433' }}
                  value={strategy.lance_minimo}
                  onChange={e => setStrategy(p => ({ ...p, lance_minimo: +e.target.value }))}
                />
                <span style={{ fontSize: 9, color: '#ef4444' }}>
                  Robô nunca descerá abaixo
                </span>
              </div>
            </div>

            {/* MODO */}
            <div style={s.inputGroup}>
              <label style={s.label}>Modo de disputa</label>
              <div style={s.modeGrid}>
                {([
                  { id: 'conservador', label: 'Conservador', color: '#22c55e', desc: '-1% por lance' },
                  { id: 'agressivo', label: 'Agressivo', color: '#ef4444', desc: '-0.5% por lance' },
                  { id: 'personalizado', label: 'Custom', color: '#a855f7', desc: 'Defina você' },
                ] as const).map(m => (
                  <button
                    key={m.id}
                    style={s.modeBtn(strategy.modo === m.id, m.color)}
                    onClick={() => setStrategy(p => ({ ...p, modo: m.id }))}
                  >
                    <div>{m.label}</div>
                    <div style={{ fontSize: 8, opacity: 0.7, marginTop: 2 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* PERSONALIZADO */}
            {strategy.modo === 'personalizado' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={s.inputGroup}>
                  <label style={s.label}>Redução por lance (%)</label>
                  <input type="number" step="0.1" style={s.input}
                    value={strategy.decremento_percent}
                    onChange={e => setStrategy(p => ({ ...p, decremento_percent: +e.target.value }))}
                  />
                </div>
                <div style={s.inputGroup}>
                  <label style={s.label}>Aguardar (seg.)</label>
                  <input type="number" style={s.input}
                    value={strategy.aguardar_segundos}
                    onChange={e => setStrategy(p => ({ ...p, aguardar_segundos: +e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* LIMITES */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={s.inputGroup}>
                <label style={s.label}>Máx. de lances</label>
                <input type="number" style={s.input}
                  value={strategy.decrementos_max}
                  onChange={e => setStrategy(p => ({ ...p, decrementos_max: +e.target.value }))}
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Posição alvo</label>
                <input type="number" min={1} max={3} style={s.input}
                  value={strategy.posicao_alvo}
                  onChange={e => setStrategy(p => ({ ...p, posicao_alvo: +e.target.value }))}
                />
              </div>
            </div>

            {/* ROBÔ TOGGLE */}
            <div style={s.toggleRow}>
              <div>
                <div style={s.toggleLabel}>Ativar robô automático</div>
                <div style={{ fontSize: 9, color: '#334155', marginTop: 2 }}>
                  {strategy.robo_ativo ? '🤖 Executa lances automaticamente durante o pregão' : 'Você precisará dar lances manualmente'}
                </div>
              </div>
              <div style={s.toggle(strategy.robo_ativo)}
                onClick={() => setStrategy(p => ({ ...p, robo_ativo: !p.robo_ativo }))}>
                <div style={s.toggleKnob(strategy.robo_ativo)} />
              </div>
            </div>

            {/* SUMMARY */}
            <div style={s.summaryBox}>
              <div style={{ fontSize: 9, color: '#f97316', letterSpacing: 2, marginBottom: 10 }}>RESUMO DA ESTRATÉGIA</div>
              {[
                { k: 'Lance inicial', v: fmt(strategy.lance_inicial), color: '#f1f5f9' },
                { k: 'Lance mínimo', v: fmt(strategy.lance_minimo), color: '#ef4444' },
                { k: 'Margem protegida', v: `${margem}% sobre o est.`, color: '#22c55e' },
                { k: 'Modo', v: strategy.modo.toUpperCase(), color: '#a855f7' },
                { k: 'Robô', v: strategy.robo_ativo ? 'ATIVADO' : 'DESATIVADO', color: strategy.robo_ativo ? '#f97316' : '#475569' },
                { k: 'Pregão', v: isDemo ? 'DEMO' : (selectedTender?.pncp_id || 'N/A'), color: isDemo ? '#3b82f6' : '#94a3b8' },
              ].map(row => (
                <div key={row.k} style={s.summaryRow}>
                  <span style={s.summaryKey}>{row.k}</span>
                  <span style={{ ...s.summaryVal, color: row.color }}>{row.v}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              style={s.ctaBtn}
              onClick={handleConfirmStrategy}
            >
              {confirmed
                ? '✓ ESTRATÉGIA CONFIRMADA'
                : strategy.robo_ativo
                ? '⚡ ENTRAR COM ROBÔ ATIVO'
                : '→ ENTRAR NO PREGÃO'
              }
            </button>

            {confirmed && (
              <div style={{ textAlign: 'center', fontSize: 10, color: '#22c55e', letterSpacing: 1, animation: 'pulse 2s infinite' }}>
                {isDemo
                  ? 'Modo demo — conecte um pregão real para criar sessão'
                  : `Aguardando abertura da fase de lances · ${strategy.robo_ativo ? 'Robô em standby' : 'Modo manual'}`
                }
              </div>
            )}

            <div style={{ fontSize: 9, color: '#1e293b', textAlign: 'center', lineHeight: 1.6 }}>
              O robô nunca dará lances abaixo do valor mínimo configurado.{'\n'}
              Você pode pausar ou assumir manualmente a qualquer momento.
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
