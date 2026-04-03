'use client'

import { useState, useEffect } from 'react'

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
}

interface NeuralPriceDashboardProps {
  predictionId: string
  initialData?: any
  className?: string
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/**
 * NeuralPriceDashboard — Analytical price prediction dashboard.
 * Shows: price range, supplier ranking, price evolution chart,
 * market simulation, and AI chat.
 */
export function NeuralPriceDashboard({ predictionId, initialData, className }: NeuralPriceDashboardProps) {
  const [prediction, setPrediction] = useState<PricePrediction | null>(initialData || null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'analysis' | 'suppliers' | 'simulation' | 'chat'>('analysis')
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    if (!initialData) fetchPrediction()
  }, [predictionId])

  async function fetchPrediction() {
    try {
      const res = await fetch(`/api/neural/result?type=price&id=${predictionId}`)
      const data = await res.json()
      if (data.prediction) setPrediction(data.prediction)
      else setError('Previsao nao encontrada')
    } catch { setError('Erro ao carregar') }
    finally { setLoading(false) }
  }

  async function handleChat() {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      // Build context from prediction data
      const ctx = `Previsao de precos: ${prediction?.item_description || ''}\nMediana prevista: ${prediction?.predicted_median ? formatBRL(prediction.predicted_median) : 'N/A'}\nFaixa: ${prediction?.predicted_range_low ? formatBRL(prediction.predicted_range_low) : '?'} - ${prediction?.predicted_range_high ? formatBRL(prediction.predicted_range_high) : '?'}\nFornecedores: ${suppliers.map((s: any) => s.label).join(', ')}\nInsights: ${prediction?.market_insights?.substring(0, 500) || ''}\nComportamento: ${prediction?.supplier_behavior_summary?.substring(0, 500) || ''}`

      const res = await fetch('/api/neural/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: prediction?.mirofish_simulation_id || '', context: ctx, message: msg, history: chatMessages }),
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response || 'Sem resposta.' }])
    } catch { setChatMessages(prev => [...prev, { role: 'assistant', content: 'Erro.' }]) }
    finally { setChatLoading(false) }
  }

  if (loading) return <div className={`bg-[#111214] border border-zinc-800 rounded-xl p-8 text-center ${className}`}><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-gray-400 text-sm mt-3">Analisando mercado...</p></div>
  if (error || !prediction) return <div className={`bg-[#111214] border border-red-900/30 rounded-xl p-6 ${className}`}><p className="text-red-400 text-sm">{error}</p></div>
  if (prediction.status !== 'completed') return <div className={`bg-[#111214] border border-zinc-800 rounded-xl p-8 text-center ${className}`}><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-gray-400 text-sm mt-3">Processando...</p></div>

  const hasRange = prediction.predicted_range_low != null && prediction.predicted_range_high != null
  const suppliers = (prediction.supplier_graph_nodes || []).filter((n: any) => n.type === 'company')
  const edges = prediction.supplier_graph_edges || []
  const curve = prediction.price_curve || []
  const timeline = prediction.simulation_timeline || []

  return (
    <div className={`bg-[#111214] border border-zinc-800 rounded-xl overflow-hidden ${className || ''}`}>
      {/* Header with price range */}
      <div className="px-6 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-600/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Previsao Neural de Precos</h3>
            <p className="text-gray-500 text-xs">Baseada em {suppliers.length} fornecedores e {curve.length} meses de historico</p>
          </div>
        </div>

        {hasRange && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#1a1c1f] rounded-lg p-3 text-center border border-zinc-800">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Minimo</p>
              <p className="text-cyan-400 text-lg font-bold font-[family-name:var(--font-geist-mono)]">{formatBRL(prediction.predicted_range_low!)}</p>
            </div>
            <div className="bg-[#1a1c1f] rounded-lg p-3 text-center border border-cyan-600/30">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Mediana Prevista</p>
              <p className="text-white text-lg font-bold font-[family-name:var(--font-geist-mono)]">{prediction.predicted_median ? formatBRL(prediction.predicted_median) : '--'}</p>
            </div>
            <div className="bg-[#1a1c1f] rounded-lg p-3 text-center border border-zinc-800">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Maximo</p>
              <p className="text-amber-400 text-lg font-bold font-[family-name:var(--font-geist-mono)]">{formatBRL(prediction.predicted_range_high!)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {[
          { id: 'analysis' as const, label: 'Analise de Mercado' },
          { id: 'suppliers' as const, label: `Fornecedores (${suppliers.length})` },
          { id: 'simulation' as const, label: 'Simulacao' },
          { id: 'chat' as const, label: 'Chat IA' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${activeTab === tab.id ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-600/5' : 'text-gray-500 hover:text-gray-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ── Analysis tab ── */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            {/* Price evolution chart */}
            {curve.length > 0 && (
              <div className="bg-[#1a1c1f] rounded-lg p-4 border border-zinc-800">
                <h4 className="text-white text-sm font-semibold mb-3">Evolucao de Precos</h4>
                <div className="relative" style={{ height: 200 }}>
                  {(() => {
                    const allVals = curve.map((p: any) => [p.actual, p.predicted_low, p.predicted_high]).flat().filter((v: any) => v != null && v > 0)
                    if (allVals.length === 0) return <p className="text-gray-500 text-xs">Sem dados</p>
                    const maxV = Math.max(...allVals) * 1.1
                    const minV = Math.min(...allVals) * 0.9
                    const range = maxV - minV || 1
                    const w = 100 // percentage
                    const h = 180

                    return (
                      <div className="flex items-end gap-1 h-full">
                        {curve.map((p: any, i: number) => {
                          const actual = p.actual
                          const predLow = p.predicted_low
                          const predHigh = p.predicted_high
                          const isPrediction = actual == null
                          const val = actual || ((predLow || 0) + (predHigh || 0)) / 2
                          const barH = ((val - minV) / range) * h

                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ minWidth: 0 }}>
                              <div className="w-full flex flex-col items-center justify-end" style={{ height: h }}>
                                {isPrediction && predLow && predHigh && (
                                  <div className="w-full rounded-t relative" style={{ height: ((predHigh - predLow) / range) * h, background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', bottom: ((predLow - minV) / range) * h }}>
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] text-cyan-400 font-mono whitespace-nowrap">{formatBRL(predHigh).replace('R$', '').trim()}</div>
                                  </div>
                                )}
                                {actual != null && (
                                  <div className={`w-3/4 rounded-t ${isPrediction ? 'bg-cyan-500/50' : 'bg-emerald-500'}`} style={{ height: Math.max(4, barH) }} />
                                )}
                              </div>
                              <span className="text-[8px] text-gray-500 font-mono truncate w-full text-center">{p.month?.slice(-5) || ''}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
                <div className="flex gap-4 mt-2 text-[9px] text-gray-500 justify-center">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-sm" /> Preco real</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-cyan-500/30 border border-cyan-500/50 rounded-sm" /> Faixa prevista</span>
                </div>
              </div>
            )}

            {/* Market insights */}
            {prediction.market_insights && (
              <div className="bg-[#1a1c1f] rounded-lg p-4 border border-zinc-800">
                <h4 className="text-white text-sm font-semibold mb-2">Insights de Mercado</h4>
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{prediction.market_insights}</p>
              </div>
            )}

            {prediction.supplier_behavior_summary && (
              <div className="bg-[#1a1c1f] rounded-lg p-4 border border-zinc-800">
                <h4 className="text-white text-sm font-semibold mb-2">Comportamento dos Fornecedores</h4>
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{prediction.supplier_behavior_summary}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Suppliers tab ── */}
        {activeTab === 'suppliers' && (
          <div className="space-y-3">
            {suppliers.length > 0 ? (
              <>
                {/* Supplier ranking table */}
                <div className="bg-[#1a1c1f] rounded-lg border border-zinc-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-gray-500">
                        <th className="text-left p-3 font-medium">Fornecedor</th>
                        <th className="text-right p-3 font-medium">Risco</th>
                        <th className="text-left p-3 font-medium">Detalhe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.sort((a: any, b: any) => (b.risk || 0) - (a.risk || 0)).map((s: any, i: number) => (
                        <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="p-3">
                            <p className="text-white text-xs font-medium">{s.label?.substring(0, 40)}</p>
                            {s.cnpj && <p className="text-gray-500 text-[10px] font-mono">{s.cnpj}</p>}
                          </td>
                          <td className="p-3 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              (s.risk || 0) >= 0.7 ? 'bg-red-900/30 text-red-400' :
                              (s.risk || 0) >= 0.4 ? 'bg-amber-900/30 text-amber-400' :
                              'bg-emerald-900/30 text-emerald-400'
                            }`}>
                              {((s.risk || 0) * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="p-3 text-gray-400 text-[10px]">{s.detail || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Relationships */}
                {edges.length > 0 && (
                  <div className="bg-[#1a1c1f] rounded-lg p-4 border border-zinc-800">
                    <h4 className="text-white text-sm font-semibold mb-2">Relacoes entre Fornecedores</h4>
                    <div className="space-y-2">
                      {edges.map((e: any, i: number) => {
                        const srcNode = suppliers.find((n: any) => n.id === e.source)
                        const tgtNode = suppliers.find((n: any) => n.id === e.target)
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-gray-300 truncate max-w-[140px]">{srcNode?.label || e.source}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${
                              e.type === 'conluio' ? 'bg-red-900/30 text-red-400' :
                              e.type === 'preco_similar' ? 'bg-amber-900/30 text-amber-400' :
                              'bg-zinc-800 text-gray-400'
                            }`}>
                              {e.label || e.type}
                            </span>
                            <span className="text-gray-300 truncate max-w-[140px]">{tgtNode?.label || e.target}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Sem dados de fornecedores</p>
            )}
          </div>
        )}

        {/* ── Simulation tab ── */}
        {activeTab === 'simulation' && (
          <div className="space-y-3">
            {timeline.length > 0 ? (
              <>
                <h4 className="text-white text-sm font-semibold">Simulacao de Licitacao</h4>
                <p className="text-gray-500 text-xs">Como os fornecedores competiriam numa proxima licitacao</p>
                {timeline.map((event: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-cyan-600/20 flex items-center justify-center text-cyan-400 text-[10px] font-bold font-[family-name:var(--font-geist-mono)]">
                        {event.round || i + 1}
                      </div>
                      {i < timeline.length - 1 && <div className="w-0.5 flex-1 bg-zinc-800 mt-1" />}
                    </div>
                    <div className="flex-1 bg-[#1a1c1f] border border-zinc-800 rounded-lg p-3 mb-1">
                      <p className="text-gray-300 text-sm">{event.event || event.description || ''}</p>
                      {event.price && (
                        <p className="text-cyan-400 text-xs font-[family-name:var(--font-geist-mono)] mt-1">{formatBRL(event.price)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Simulacao nao disponivel</p>
            )}
          </div>
        )}

        {/* ── Chat tab ── */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-[350px]">
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full">
                  <p className="text-gray-500 text-sm">Pergunte sobre a previsao</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {['Qual o melhor preco?', 'Quando licitar?', 'Quem tende a ganhar?'].map(q => (
                      <button key={q} onClick={() => setChatInput(q)} className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-700">{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-cyan-600/20 text-cyan-100 border border-cyan-600/30' : 'bg-[#1a1c1f] text-gray-300 border border-zinc-800'}`}>{msg.content}</div>
                </div>
              ))}
              {chatLoading && <div className="flex justify-start"><div className="bg-[#1a1c1f] border border-zinc-800 rounded-lg px-3 py-2"><div className="flex gap-1"><span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" /><span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div></div></div>}
            </div>
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChat()} placeholder="Pergunte sobre a previsao..." disabled={chatLoading} className="flex-1 bg-[#1a1c1f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-cyan-600 focus:outline-none disabled:opacity-50" />
              <button onClick={handleChat} disabled={chatLoading || !chatInput.trim()} className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-500 disabled:opacity-50 transition-colors">Enviar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
