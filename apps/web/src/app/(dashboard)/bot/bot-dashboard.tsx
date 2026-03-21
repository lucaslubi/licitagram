'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { GuidedLogin } from './guided-login'

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface BotConfig {
  id: string
  company_id: string
  portal: string
  username: string
  password: string
  strategy: string
  min_decrease_value: number | null
  min_decrease_percent: number | null
  enabled: boolean
  created_at: string
}

interface BotAction {
  id: string
  action_type: string
  details: Record<string, unknown> | null
  created_at: string
}

interface BotSession {
  id: string
  company_id: string
  config_id: string
  pregao_id: string
  portal: string
  strategy: string
  status: 'pending' | 'active' | 'completed' | 'failed' | 'paused' | 'cancelled'
  bids_placed: number
  min_price: number | null
  max_bids: number | null
  current_price: number | null
  result: Record<string, unknown> | null
  bot_actions: BotAction[]
  created_at: string
}

interface Props {
  configs: BotConfig[]
  sessions: BotSession[]
  companyId: string
}

const PORTAL_OPTIONS = [
  { value: 'pncp', label: 'PNCP (Auto-detectar portal)' },
  { value: 'comprasnet', label: 'ComprasNet' },
  { value: 'comprasgov', label: 'ComprasGov' },
  { value: 'bec', label: 'BEC/SP' },
  { value: 'licitacoes_e', label: 'Licitacoes-e (BB)' },
  { value: 'bll', label: 'BLL Compras' },
]

const STRATEGY_OPTIONS = [
  { value: 'aggressive', label: 'Agressivo - Lances frequentes com decremento minimo' },
  { value: 'moderate', label: 'Moderado - Lances equilibrados' },
  { value: 'conservative', label: 'Conservador - Poucos lances, maior decremento' },
  { value: 'sniper', label: 'Sniper - Lance unico nos segundos finais' },
]

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pendente', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  active: { label: 'Ativo', bg: 'bg-blue-100', text: 'text-blue-800' },
  completed: { label: 'Concluido', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  failed: { label: 'Falhou', bg: 'bg-red-100', text: 'text-red-800' },
  paused: { label: 'Pausado', bg: 'bg-gray-100', text: 'text-gray-700' },
  cancelled: { label: 'Cancelado', bg: 'bg-gray-100', text: 'text-gray-500' },
}

/* ── Spinner ────────────────────────────────────────────────────────────────── */

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

/* ── Status Badge ───────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

/* ── Main Dashboard ─────────────────────────────────────────────────────────── */

export function BotDashboard({ configs: initialConfigs, sessions: initialSessions, companyId }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'configs' | 'sessions' | 'history'>('configs')
  const [configs, setConfigs] = useState(initialConfigs)
  const [sessions, setSessions] = useState(initialSessions)

  // Dialogs
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [showSessionDialog, setShowSessionDialog] = useState(false)
  const [editingConfig, setEditingConfig] = useState<BotConfig | null>(null)
  const [guidedLoginPortal, setGuidedLoginPortal] = useState<{ portal: string; configId: string } | null>(null)
  const [connectedPortals, setConnectedPortals] = useState<Set<string>>(new Set())

  // Form state — config
  const [configForm, setConfigForm] = useState({
    portal: '',
    username: '',
    password: '',
    strategy: 'moderate',
    min_decrease_value: '',
    min_decrease_percent: '',
  })

  // Form state — session
  const [sessionForm, setSessionForm] = useState({
    config_id: '',
    pregao_id: '',
    min_price: '',
    max_bids: '',
    strategy: '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derived data
  const activeSessions = sessions.filter(s => s.status === 'pending' || s.status === 'active')
  const historySessions = sessions.filter(s => !['pending', 'active'].includes(s.status))
  const totalBids = sessions.reduce((sum, s) => sum + (s.bids_placed || 0), 0)
  const completedSessions = sessions.filter(s => s.status === 'completed')
  const winRate = sessions.length > 0
    ? Math.round((completedSessions.length / sessions.length) * 100)
    : 0

  /* ── Auto-refresh active sessions ──────────────────────────────────────── */

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/sessions')
      if (!res.ok) return
      const data = await res.json()
      if (data.sessions) setSessions(data.sessions)
    } catch {
      // Silent fail
    }
  }, [])

  useEffect(() => {
    if (activeSessions.length > 0) {
      pollingRef.current = setInterval(refreshSessions, 5000)
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [activeSessions.length, refreshSessions])

  /* ── Config form handlers ──────────────────────────────────────────────── */

  function openAddConfig() {
    setEditingConfig(null)
    setConfigForm({
      portal: '',
      username: '',
      password: '',
      strategy: 'moderate',
      min_decrease_value: '',
      min_decrease_percent: '',
    })
    setError(null)
    setShowConfigDialog(true)
  }

  function openEditConfig(config: BotConfig) {
    setEditingConfig(config)
    setConfigForm({
      portal: config.portal,
      username: config.username,
      password: '',
      strategy: config.strategy,
      min_decrease_value: config.min_decrease_value?.toString() || '',
      min_decrease_percent: config.min_decrease_percent?.toString() || '',
    })
    setError(null)
    setShowConfigDialog(true)
  }

  async function handleSaveConfig() {
    if (!configForm.portal || !configForm.username || !configForm.password || !configForm.strategy) {
      setError('Preencha todos os campos obrigatorios')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        portal: configForm.portal,
        username: configForm.username,
        password: configForm.password,
        strategy: configForm.strategy,
        min_decrease_value: configForm.min_decrease_value ? parseFloat(configForm.min_decrease_value) : null,
        min_decrease_percent: configForm.min_decrease_percent ? parseFloat(configForm.min_decrease_percent) : null,
      }
      if (editingConfig) payload.id = editingConfig.id

      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao salvar')
        return
      }

      setShowConfigDialog(false)
      router.refresh()

      // Optimistic update
      if (editingConfig) {
        setConfigs(prev => prev.map(c => c.id === editingConfig.id ? data.config : c))
      } else {
        setConfigs(prev => [data.config, ...prev])
      }
    } catch {
      setError('Erro de conexao')
    } finally {
      setSaving(false)
    }
  }

  /* ── Session form handlers ─────────────────────────────────────────────── */

  function openNewSession() {
    setSessionForm({
      config_id: configs[0]?.id || '',
      pregao_id: '',
      min_price: '',
      max_bids: '',
      strategy: '',
    })
    setError(null)
    setShowSessionDialog(true)
  }

  async function handleCreateSession() {
    if (!sessionForm.config_id || !sessionForm.pregao_id) {
      setError('Selecione um portal e informe o ID do pregao')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        config_id: sessionForm.config_id,
        pregao_id: sessionForm.pregao_id,
      }
      if (sessionForm.min_price) payload.min_price = parseFloat(sessionForm.min_price)
      if (sessionForm.max_bids) payload.max_bids = parseInt(sessionForm.max_bids)
      if (sessionForm.strategy) payload.strategy = sessionForm.strategy

      const res = await fetch('/api/bot/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao criar sessao')
        return
      }

      setShowSessionDialog(false)
      router.refresh()
      setSessions(prev => [data.session, ...prev])
    } catch {
      setError('Erro de conexao')
    } finally {
      setSaving(false)
    }
  }

  /* ── Session actions ───────────────────────────────────────────────────── */

  async function handleSessionAction(sessionId: string, action: 'pause' | 'resume' | 'cancel') {
    try {
      const res = await fetch('/api/bot/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, action }),
      })

      if (res.ok) {
        const data = await res.json()
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...data.session } : s))
        router.refresh()
      }
    } catch {
      // Silent fail
    }
  }

  /* ── Mask CPF ──────────────────────────────────────────────────────────── */

  function maskCpf(cpf: string): string {
    const clean = cpf.replace(/\D/g, '')
    if (clean.length < 6) return cpf
    return `${clean.slice(0, 3)}.***.***-${clean.slice(-2)}`
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total sessoes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{sessions.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Bots ativos</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{activeSessions.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Taxa de sucesso</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{winRate}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Lances realizados</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalBids}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'configs' as const, label: 'Portais Configurados' },
          { key: 'sessions' as const, label: `Sessoes Ativas (${activeSessions.length})` },
          { key: 'history' as const, label: 'Historico' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ Tab: Portal Configs ═══ */}
      {activeTab === 'configs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Configuracoes de Portal</h2>
            <button onClick={openAddConfig} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 transition-colors">
              Adicionar Portal
            </button>
          </div>

          {configs.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
              <p className="mt-3 text-sm text-gray-500">Nenhum portal configurado ainda.</p>
              <p className="text-xs text-gray-400 mt-1">Adicione suas credenciais de portal para usar o bot.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {configs.map(config => (
                <div key={config.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">
                        {PORTAL_OPTIONS.find(p => p.value === config.portal)?.label || config.portal}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5 font-mono">{maskCpf(config.username)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        config.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {config.enabled ? 'Ativo' : 'Inativo'}
                      </span>
                      {connectedPortals.has(config.id) ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          Conectado
                        </span>
                      ) : (
                        <button
                          onClick={() => setGuidedLoginPortal({ portal: config.portal, configId: config.id })}
                          className="text-xs px-2.5 py-1 rounded-md bg-brand text-white hover:bg-brand/90 transition-colors font-medium"
                          title="Login guiado no portal"
                        >
                          Conectar
                        </button>
                      )}
                      <button
                        onClick={() => openEditConfig(config)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title="Editar"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                    <span>Estrategia: {STRATEGY_OPTIONS.find(s => s.value === config.strategy)?.label.split(' - ')[0] || config.strategy}</span>
                    {config.min_decrease_value && (
                      <span>Dec. min: R$ {config.min_decrease_value}</span>
                    )}
                    {config.min_decrease_percent && (
                      <span>Dec. min: {config.min_decrease_percent}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Tab: Active Sessions ═══ */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Sessoes Ativas</h2>
            <button
              onClick={openNewSession}
              disabled={configs.length === 0}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              Nova Sessao
            </button>
          </div>

          {activeSessions.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-3 text-sm text-gray-500">Nenhuma sessao ativa no momento.</p>
              {configs.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">Configure um portal primeiro para iniciar uma sessao.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {activeSessions.map(session => (
                <div key={session.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">Pregao {session.pregao_id}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {PORTAL_OPTIONS.find(p => p.value === session.portal)?.label || session.portal}
                      </p>
                    </div>
                    <StatusBadge status={session.status} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xs text-gray-400">Lances</p>
                      <p className="text-lg font-bold text-gray-800">{session.bids_placed}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Preco atual</p>
                      <p className="text-lg font-bold text-gray-800">
                        {session.current_price != null
                          ? `R$ ${session.current_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Estrategia</p>
                      <p className="text-xs font-medium text-gray-600 mt-1">
                        {STRATEGY_OPTIONS.find(s => s.value === session.strategy)?.label.split(' - ')[0] || session.strategy}
                      </p>
                    </div>
                  </div>

                  {session.status === 'active' && (
                    <div className="mt-3 flex items-center gap-1">
                      <Spinner className="h-3 w-3 text-blue-500" />
                      <span className="text-xs text-blue-500 font-medium">Bot em execucao...</span>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                    {session.status === 'active' && (
                      <button
                        onClick={() => handleSessionAction(session.id, 'pause')}
                        className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Pausar
                      </button>
                    )}
                    {session.status === 'paused' && (
                      <button
                        onClick={() => handleSessionAction(session.id, 'resume')}
                        className="text-xs px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90 transition-colors"
                      >
                        Retomar
                      </button>
                    )}
                    <button
                      onClick={() => handleSessionAction(session.id, 'cancel')}
                      className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSessions.length > 0 && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Spinner className="h-3 w-3" />
              Atualizando automaticamente a cada 5 segundos
            </p>
          )}
        </div>
      )}

      {/* ═══ Tab: History ═══ */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Historico de Sessoes</h2>

          {historySessions.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-sm text-gray-500">Nenhuma sessao finalizada ainda.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Pregao</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Portal</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Lances</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Resultado</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historySessions.map(session => (
                      <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{session.pregao_id}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {PORTAL_OPTIONS.find(p => p.value === session.portal)?.label || session.portal}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={session.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">{session.bids_placed}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {session.current_price != null
                            ? `R$ ${session.current_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {new Date(session.created_at).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Config Dialog ═══ */}
      {showConfigDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingConfig ? 'Editar Portal' : 'Adicionar Portal'}
                </h3>
                <button onClick={() => setShowConfigDialog(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Portal */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Portal *</label>
                  <select
                    value={configForm.portal}
                    onChange={e => setConfigForm(f => ({ ...f, portal: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  >
                    <option value="">Selecione...</option>
                    {PORTAL_OPTIONS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Username (CPF) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF/Usuario *</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={configForm.username}
                    onChange={e => setConfigForm(f => ({ ...f, username: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                  <input
                    type="password"
                    placeholder={editingConfig ? 'Deixe vazio para manter' : 'Senha do portal'}
                    value={configForm.password}
                    onChange={e => setConfigForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  />
                </div>

                {/* Strategy */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estrategia *</label>
                  <select
                    value={configForm.strategy}
                    onChange={e => setConfigForm(f => ({ ...f, strategy: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  >
                    {STRATEGY_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Min decrease */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Decremento min (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.01"
                      value={configForm.min_decrease_value}
                      onChange={e => setConfigForm(f => ({ ...f, min_decrease_value: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Decremento min (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0.5"
                      value={configForm.min_decrease_percent}
                      onChange={e => setConfigForm(f => ({ ...f, min_decrease_percent: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setShowConfigDialog(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors flex items-center gap-2"
                >
                  {saving && <Spinner />}
                  {editingConfig ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Guided Login Dialog ═══ */}
      {guidedLoginPortal && (
        <GuidedLogin
          portal={guidedLoginPortal.portal}
          configId={guidedLoginPortal.configId}
          onSuccess={() => {
            setConnectedPortals(prev => new Set([...prev, guidedLoginPortal.configId]))
            setGuidedLoginPortal(null)
          }}
          onClose={() => setGuidedLoginPortal(null)}
        />
      )}

      {/* ═══ New Session Dialog ═══ */}
      {showSessionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Nova Sessao de Bot</h3>
                <button onClick={() => setShowSessionDialog(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Config (Portal) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Portal *</label>
                  <select
                    value={sessionForm.config_id}
                    onChange={e => setSessionForm(f => ({ ...f, config_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  >
                    <option value="">Selecione...</option>
                    {configs.filter(c => c.enabled).map(c => (
                      <option key={c.id} value={c.id}>
                        {PORTAL_OPTIONS.find(p => p.value === c.portal)?.label || c.portal} ({maskCpf(c.username)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pregao ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID do Pregao *</label>
                  <input
                    type="text"
                    placeholder="Ex: PE-2026/001"
                    value={sessionForm.pregao_id}
                    onChange={e => setSessionForm(f => ({ ...f, pregao_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  />
                </div>

                {/* Min price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preco minimo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Valor minimo para lances"
                    value={sessionForm.min_price}
                    onChange={e => setSessionForm(f => ({ ...f, min_price: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  />
                </div>

                {/* Max bids */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max. lances</label>
                  <input
                    type="number"
                    placeholder="Limite de lances (opcional)"
                    value={sessionForm.max_bids}
                    onChange={e => setSessionForm(f => ({ ...f, max_bids: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  />
                </div>

                {/* Strategy override */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estrategia (override)</label>
                  <select
                    value={sessionForm.strategy}
                    onChange={e => setSessionForm(f => ({ ...f, strategy: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  >
                    <option value="">Usar padrao do portal</option>
                    {STRATEGY_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setShowSessionDialog(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={saving}
                  className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors flex items-center gap-2"
                >
                  {saving && <Spinner />}
                  Iniciar Bot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
