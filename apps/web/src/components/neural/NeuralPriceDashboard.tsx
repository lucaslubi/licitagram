'use client'

import { useState, useEffect } from 'react'
import { NeuralGraph } from './NeuralGraph'
import { NeuralRiskGauge } from './NeuralRiskGauge'

interface PricePrediction {
  id: string
  item_description: string
  predicted_range_low: number | null
  predicted_range_high: number | null
  predicted_median: number | null
  confidence_score: number
  supplier_graph_nodes: any[]
  supplier_graph_edges: any[]
  price_curve: any[]
  anomaly_flags: any[]
  supplier_behavior_summary: string | null
  simulation_timeline: any[]
  market_insights: string | null
  mirofish_simulation_id: string | null
  status: string
  created_at: string
}

interface NeuralPriceDashboardProps {
  predictionId: string
  className?: string
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/**
 * NeuralPriceDashboard — Complete price prediction visualization.
 * Shows: predicted range, supplier graph, price curve, anomalies,
 * simulation timeline, and interactive chat.
 */
export function NeuralPriceDashboard({ predictionId, className }: NeuralPriceDashboardProps) {
  const [prediction, setPrediction] = useState<PricePrediction | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'suppliers' | 'curve' | 'simulation' | 'chat'>('overview')
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    fetchPrediction()
  }, [predictionId])

  async function fetchPrediction() {
    try {
      const res = await fetch(`/api/neural/result?type=price&id=${predictionId}`)
      const data = await res.json()
      if (data.prediction) {
        setPrediction(data.prediction)
      } else {
        setError('Previsao nao encontrada')
      }
    } catch {
      setError('Erro ao carregar previsao')
    } finally {
      setLoading(false)
    }
  }

  async function handleChat() {
    if (!chatInput.trim() || !prediction?.mirofish_simulation_id) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)

    try {
      const res = await fetch('/api/neural/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulationId: prediction.mirofish_simulation_id,
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
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Carregando previsao neural...</p>
        </div>
      </div>
    )
  }

  if (error || !prediction) {
    return (
      <div className={`bg-[#111214] border border-red-900/30 rounded-xl p-6 ${className || ''}`}>
        <p className="text-red-400 text-sm">{error || 'Previsao nao disponivel'}</p>
      </div>
    )
  }

  if (prediction.status === 'processing' || prediction.status === 'pending') {
    return (
      <div className={`bg-[#111214] border border-zinc-800 rounded-xl p-8 ${className || ''}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-cyan-500/30 rounded-full animate-ping" />
            <div className="absolute inset-2 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-gray-400 text-sm">Simulando comportamento de fornecedores...</p>
          <p className="text-gray-500 text-xs">Isso pode levar ate 2 minutos</p>
        </div>
      </div>
    )
  }

  const hasRange = prediction.predicted_range_low != null && prediction.predicted_range_high != null

  return (
    <div className={`bg-[#111214] border border-zinc-800 rounded-xl overflow-hidden ${className || ''}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-600/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Previsao Neural de Precos</h3>
              <p className="text-gray-500 text-xs">{prediction.item_description?.slice(0, 80) || 'Item'}</p>
            </div>
          </div>
          {/* Gauge de confianca removido — foco nos dados reais */}
        </div>

        {/* Price Range */}
        {hasRange && (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="bg-[#1a1c1f] rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">Minimo Previsto</p>
              <p className="text-cyan-400 text-lg font-bold font-[family-name:var(--font-geist-mono)]">
                {formatBRL(prediction.predicted_range_low!)}
              </p>
            </div>
            <div className="bg-[#1a1c1f] rounded-lg p-3 text-center border border-cyan-600/30">
              <p className="text-gray-500 text-xs mb-1">Mediana Prevista</p>
              <p className="text-white text-lg font-bold font-[family-name:var(--font-geist-mono)]">
                {prediction.predicted_median ? formatBRL(prediction.predicted_median) : '--'}
              </p>
            </div>
            <div className="bg-[#1a1c1f] rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">Maximo Previsto</p>
              <p className="text-amber-400 text-lg font-bold font-[family-name:var(--font-geist-mono)]">
                {formatBRL(prediction.predicted_range_high!)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {[
          { id: 'overview' as const, label: 'Visao Geral' },
          { id: 'suppliers' as const, label: 'Grafo Fornecedores' },
          { id: 'curve' as const, label: 'Curva de Precos' },
          { id: 'simulation' as const, label: 'Simulacao' },
          { id: 'chat' as const, label: 'Chat IA' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-600/5'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Supplier behavior */}
            {prediction.supplier_behavior_summary && (
              <div className="bg-[#1a1c1f] border border-zinc-800 rounded-lg p-4">
                <h4 className="text-white text-sm font-semibold mb-2">Comportamento dos Fornecedores</h4>
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{prediction.supplier_behavior_summary}</p>
              </div>
            )}

            {/* Market insights */}
            {prediction.market_insights && (
              <div className="bg-[#1a1c1f] border border-zinc-800 rounded-lg p-4">
                <h4 className="text-white text-sm font-semibold mb-2">Insights de Mercado</h4>
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{prediction.market_insights}</p>
              </div>
            )}
          </div>
        )}

        {/* Suppliers graph tab */}
        {activeTab === 'suppliers' && (
          <NeuralGraph
            nodes={prediction.supplier_graph_nodes || []}
            edges={prediction.supplier_graph_edges || []}
            width={760}
            height={450}
          />
        )}

        {/* Price curve tab */}
        {activeTab === 'curve' && (
          <div className="space-y-4">
            {(prediction.price_curve || []).length > 0 ? (
              <div className="bg-[#1a1c1f] rounded-lg p-4">
                <h4 className="text-white text-sm font-semibold mb-3">Historico vs Previsao</h4>
                {/* SVG line chart */}
                <svg width="100%" viewBox="0 0 720 300" className="overflow-visible">
                  {(() => {
                    const curve = prediction.price_curve as any[]
                    if (curve.length === 0) return null
                    const maxVal = Math.max(...curve.map((p) => Math.max(p.actual || 0, p.predicted_high || 0)))
                    const minVal = Math.min(...curve.filter((p) => (p.actual || p.predicted_low) > 0).map((p) => Math.min(p.actual || Infinity, p.predicted_low || Infinity)))
                    const range = maxVal - minVal || 1
                    const w = 720
                    const h = 250
                    const padding = 30

                    const xScale = (i: number) => padding + (i / (curve.length - 1 || 1)) * (w - 2 * padding)
                    const yScale = (v: number) => h - padding - ((v - minVal) / range) * (h - 2 * padding)

                    // Predicted range area
                    const areaPoints = curve
                      .filter((p) => p.predicted_low != null && p.predicted_high != null)
                      .map((p, i) => ({ i, low: p.predicted_low, high: p.predicted_high }))

                    const areaPath = areaPoints.length > 0
                      ? `M${areaPoints.map((p) => `${xScale(p.i)},${yScale(p.high)}`).join(' L')} L${[...areaPoints].reverse().map((p) => `${xScale(p.i)},${yScale(p.low)}`).join(' L')} Z`
                      : ''

                    // Actual line
                    const actualPoints = curve.filter((p) => p.actual != null).map((p, i) => `${xScale(i)},${yScale(p.actual)}`)
                    const actualPath = actualPoints.length > 1 ? `M${actualPoints.join(' L')}` : ''

                    return (
                      <>
                        {/* Grid lines */}
                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                          <line key={pct} x1={padding} x2={w - padding} y1={yScale(minVal + range * pct)} y2={yScale(minVal + range * pct)} stroke="#27272a" strokeDasharray="4 4" />
                        ))}
                        {/* Predicted range */}
                        {areaPath && <path d={areaPath} fill="rgba(6,182,212,0.1)" stroke="none" />}
                        {/* Actual line */}
                        {actualPath && <path d={actualPath} fill="none" stroke="#10b981" strokeWidth={2} />}
                        {/* Dots */}
                        {curve.map((p, i) => (
                          p.actual != null && <circle key={i} cx={xScale(i)} cy={yScale(p.actual)} r={3} fill="#10b981" />
                        ))}
                        {/* Month labels */}
                        {curve.map((p, i) => (
                          i % Math.max(1, Math.floor(curve.length / 6)) === 0 && (
                            <text key={`label-${i}`} x={xScale(i)} y={h - 5} textAnchor="middle" fontSize={10} fill="#71717a">{p.month}</text>
                          )
                        ))}
                        {/* Y axis labels */}
                        {[0, 0.5, 1].map((pct) => (
                          <text key={`y-${pct}`} x={5} y={yScale(minVal + range * pct) + 4} fontSize={9} fill="#71717a" fontFamily="var(--font-geist-mono)">
                            {formatBRL(minVal + range * pct).replace('R$', '').trim()}
                          </text>
                        ))}
                      </>
                    )
                  })()}
                </svg>
                <div className="flex gap-4 mt-2 text-[10px] text-gray-500 justify-center">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Preco real</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-cyan-500/10 border border-cyan-500/30 inline-block" /> Faixa prevista</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Sem dados de curva de precos</p>
            )}
          </div>
        )}

        {/* Chat tab */}
        {/* Simulation tab */}
        {activeTab === 'simulation' && (
          <div className="space-y-3">
            {(prediction.simulation_timeline || []).length > 0 ? (
              <>
                <h4 className="text-white text-sm font-semibold">Simulacao de Comportamento dos Fornecedores</h4>
                <p className="text-gray-500 text-xs mb-3">Como os fornecedores competiriam numa proxima licitacao similar</p>
                {(prediction.simulation_timeline as any[]).map((event: any, i: number) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-cyan-600/20 flex items-center justify-center text-cyan-400 text-xs font-bold font-[family-name:var(--font-geist-mono)]">
                        {event.round || i + 1}
                      </div>
                      {i < (prediction.simulation_timeline as any[]).length - 1 && (
                        <div className="w-0.5 h-8 bg-zinc-800 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 bg-[#1a1c1f] border border-zinc-800 rounded-lg p-3">
                      <p className="text-gray-300 text-sm">{event.event || event.description || ''}</p>
                      {event.price && (
                        <p className="text-cyan-400 text-xs font-[family-name:var(--font-geist-mono)] mt-1">
                          R$ {Number(event.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Simulacao nao disponivel para esta analise</p>
            )}
          </div>
        )}

        {/* Chat tab */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-[400px]">
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-gray-500 text-sm">Pergunte sobre a previsao de precos</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {['Por que esse preco?', 'Quais fornecedores dominam?', 'Tem risco de conluio?'].map((q) => (
                      <button
                        key={q}
                        onClick={() => setChatInput(q)}
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
                      ? 'bg-cyan-600/20 text-cyan-100 border border-cyan-600/30'
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
                      <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
                placeholder="Pergunte sobre a previsao..."
                disabled={chatLoading || !prediction.mirofish_simulation_id}
                className="flex-1 bg-[#1a1c1f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-cyan-600 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
