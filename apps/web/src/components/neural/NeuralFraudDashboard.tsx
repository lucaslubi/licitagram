'use client'

import { useState, useEffect } from 'react'
import { NeuralGraph } from './NeuralGraph'
import { NeuralRiskGauge } from './NeuralRiskGauge'

interface FraudAnalysis {
  id: string
  risk_score: number
  risk_level: string
  graph_nodes: any[]
  graph_edges: any[]
  network_depth: number
  companies_analyzed: number
  hidden_connections: any[]
  collusion_indicators: any[]
  simulation_timeline: any[]
  simulation_summary: string
  recommended_actions: string[]
  mirofish_simulation_id: string | null
  status: string
  created_at: string
}

interface NeuralFraudDashboardProps {
  analysisId: string
  initialData?: any
  className?: string
}

/**
 * NeuralFraudDashboard — Complete fraud analysis visualization.
 * Shows: risk gauge, corporate graph, collusion chain, simulation timeline,
 * collusion indicators, recommendations, and interactive chat.
 */
export function NeuralFraudDashboard({ analysisId, initialData, className }: NeuralFraudDashboardProps) {
  const [analysis, setAnalysis] = useState<FraudAnalysis | null>(initialData || null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'graph' | 'chain' | 'simulation' | 'chat'>('graph')
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    if (!initialData) fetchAnalysis()
  }, [analysisId])

  async function fetchAnalysis() {
    try {
      const res = await fetch(`/api/neural/result?type=fraud&id=${analysisId}`)
      const data = await res.json()
      if (data.analysis) {
        setAnalysis(data.analysis)
      } else {
        setError('Analise nao encontrada')
      }
    } catch (err) {
      setError('Erro ao carregar analise')
    } finally {
      setLoading(false)
    }
  }

  async function handleChat() {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)

    try {
      const ctx = `Analise de fraude: risco ${analysis?.risk_score}, nivel ${analysis?.risk_level}\nEmpresas: ${(analysis?.graph_nodes || []).map((n: any) => n.label).join(', ')}\nConluio: ${(analysis?.collusion_indicators || []).map((c: any) => c.type + ' ' + c.probability + '%').join('; ')}\nResumo: ${analysis?.simulation_summary?.substring(0, 500) || ''}\nRecomendacoes: ${(analysis?.recommended_actions || []).join('; ')}`

      const res = await fetch('/api/neural/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulationId: analysis?.mirofish_simulation_id || '',
          context: ctx,
          message: msg,
          history: chatMessages,
        }),
      })
      const data = await res.json()
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.response || 'Sem resposta.' }])
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Erro ao comunicar com o agente.' }])
    } finally {
      setChatLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={`bg-[#111214] border border-zinc-800 rounded-xl p-8 ${className || ''}`}>
        <div className="flex items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Carregando analise neural...</p>
        </div>
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className={`bg-[#111214] border border-red-900/30 rounded-xl p-6 ${className || ''}`}>
        <p className="text-red-400 text-sm">{error || 'Analise nao disponivel'}</p>
      </div>
    )
  }

  if (analysis.status === 'processing' || analysis.status === 'pending') {
    return (
      <div className={`bg-[#111214] border border-zinc-800 rounded-xl p-8 ${className || ''}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-emerald-500/30 rounded-full animate-ping" />
            <div className="absolute inset-2 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-gray-400 text-sm">Construindo grafo e simulando cenarios...</p>
          <p className="text-gray-500 text-xs">Isso pode levar ate 2 minutos</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-[#111214] border border-zinc-800 rounded-xl overflow-hidden ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Analise Neural Anti-Fraude</h3>
            <p className="text-gray-500 text-xs">
              {analysis.companies_analyzed} empresas analisadas | Profundidade: {analysis.network_depth} hops
            </p>
          </div>
        </div>
        <NeuralRiskGauge score={analysis.risk_score} size={80} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {[
          { id: 'graph' as const, label: 'Grafo Societario' },
          { id: 'chain' as const, label: 'Cadeia Neural' },
          { id: 'simulation' as const, label: 'Simulacao' },
          { id: 'chat' as const, label: 'Chat IA' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-600/5'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Graph tab */}
        {activeTab === 'graph' && (
          <NeuralGraph
            nodes={analysis.graph_nodes || []}
            edges={analysis.graph_edges || []}
            width={760}
            height={450}
          />
        )}

        {/* Chain tab */}
        {activeTab === 'chain' && (
          <div className="space-y-3">
            {(analysis.hidden_connections || []).length > 0 ? (
              (analysis.hidden_connections as any[]).map((conn: any, i: number) => (
                <div key={i} className="bg-[#1a1c1f] border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-red-400">{conn.type || 'CONEXAO OCULTA'}</span>
                    {conn.risk && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        conn.risk >= 0.7 ? 'bg-red-900/30 text-red-400' : conn.risk >= 0.4 ? 'bg-amber-900/30 text-amber-400' : 'bg-emerald-900/30 text-emerald-400'
                      }`}>
                        {(conn.risk * 100).toFixed(0)}% risco
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm">{conn.description || conn.detail || JSON.stringify(conn)}</p>
                  {conn.chain && (
                    <div className="flex items-center gap-1 mt-2 overflow-x-auto">
                      {(conn.chain as string[]).map((node: string, j: number) => (
                        <span key={j} className="flex items-center gap-1">
                          <span className="bg-zinc-800 text-gray-300 text-xs px-2 py-1 rounded font-mono whitespace-nowrap">{node}</span>
                          {j < conn.chain.length - 1 && <span className="text-emerald-500">→</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Nenhuma conexao oculta detectada</p>
            )}
          </div>
        )}

        {/* Simulation tab */}
        {activeTab === 'simulation' && (
          <div className="space-y-4">
            {/* Collusion indicators */}
            {(analysis.collusion_indicators || []).length > 0 && (
              <div>
                <h4 className="text-white text-sm font-semibold mb-2">Indicadores de Conluio</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(analysis.collusion_indicators as any[]).map((ind: any, i: number) => (
                    <div key={i} className="bg-[#1a1c1f] border border-zinc-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-300">{ind.type || 'Indicador'}</span>
                        <span className={`text-xs font-mono ${
                          (ind.probability || 0) >= 70 ? 'text-red-400' : (ind.probability || 0) >= 40 ? 'text-amber-400' : 'text-gray-500'
                        }`}>
                          {ind.probability || 0}%
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs">{ind.description || ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {analysis.simulation_summary && (
              <div className="bg-[#1a1c1f] border border-zinc-800 rounded-lg p-4">
                <h4 className="text-white text-sm font-semibold mb-2">Resumo da Simulacao</h4>
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{analysis.simulation_summary}</p>
              </div>
            )}

            {/* Recommendations */}
            {(analysis.recommended_actions || []).length > 0 && (
              <div>
                <h4 className="text-white text-sm font-semibold mb-2">Recomendacoes</h4>
                <div className="space-y-2">
                  {analysis.recommended_actions.map((action, i) => (
                    <div key={i} className="flex items-start gap-2 bg-[#1a1c1f] border border-zinc-800 rounded-lg p-3">
                      <span className="text-emerald-400 text-sm mt-0.5">→</span>
                      <p className="text-gray-300 text-sm">{action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat tab */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-[400px]">
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-gray-500 text-sm">Pergunte sobre a analise de fraude</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {['Qual o risco principal?', 'Quais empresas estao conectadas?', 'O que significa esse score?'].map((q) => (
                      <button
                        key={q}
                        onClick={() => { setChatInput(q); }}
                        className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-700 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-600/30'
                      : 'bg-[#1a1c1f] text-gray-300 border border-zinc-800'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#1a1c1f] border border-zinc-800 rounded-lg px-3 py-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                placeholder="Pergunte sobre a analise..."
                disabled={chatLoading || !analysis.mirofish_simulation_id}
                className="flex-1 bg-[#1a1c1f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-emerald-600 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Enviar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
