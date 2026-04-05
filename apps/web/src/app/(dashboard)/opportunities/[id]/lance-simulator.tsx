'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function formatBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

interface SimResult {
  probabilidadeVitoria: number
  concorrentes: Array<{ nome: string; cnpj: string; valorProposta: number; desconto: number; isWinner: boolean; totalParticipacoes: number; winRate: number }>
  recomendacao: { lanceMinimo: number; lanceSugerido: number; lanceAgressivo: number }
  distribuicaoDescontos: Array<{ faixa: string; count: number }>
  descontoMediano: number
  totalConcorrentes: number
  dataSource: 'direct' | 'similar' | 'market'
  dataSourceLabel: string
}

export function LanceSimulator({ matchId, tenderId, valorEstimado }: { matchId: string; tenderId: string; valorEstimado: number }) {
  const [desconto, setDesconto] = useState(10)
  const [result, setResult] = useState<SimResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meuLance = valorEstimado * (1 - desconto / 100)

  async function simulate(overrideDesconto?: number) {
    const d = overrideDesconto ?? desconto
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/lance-simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId, valorEstimado, meuDesconto: d }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
      } else {
        setError(data.error || `Erro ${res.status}`)
      }
    } catch (err) {
      setError('Erro de conexão')
    }
    setLoading(false)
  }

  function applyRecommendation(targetValue: number) {
    const newDesconto = Math.round(((valorEstimado - targetValue) / valorEstimado) * 10000) / 100
    setDesconto(Math.max(0, Math.min(50, newDesconto)))
    simulate(newDesconto)
  }

  if (!valorEstimado || valorEstimado <= 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-tight">Simulador de Lance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Slider */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Desconto sobre estimativa</span>
            <span className="font-mono text-white">{desconto}%</span>
          </div>
          <input type="range" min="0" max="50" step="0.5" value={desconto} onChange={e => setDesconto(Number(e.target.value))} className="w-full accent-emerald-500" />
          <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-[#0a0a0b] rounded-lg p-3 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Valor Estimado</p>
            <p className="text-sm text-gray-300 font-[family-name:var(--font-geist-mono)] tabular-nums">{formatBRL(valorEstimado)}</p>
          </div>
          <span className="text-gray-500">→</span>
          <div className="text-right">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Seu Lance</p>
            <p className="text-sm text-emerald-400 font-[family-name:var(--font-geist-mono)] tabular-nums font-bold">{formatBRL(meuLance)}</p>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <Button onClick={() => simulate()} disabled={loading} size="sm" variant="secondary" className="w-full border border-white/[0.06]">
          {loading ? 'Simulando...' : 'Simular'}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-4 pt-2">
            {/* Probability */}
            <div className="text-center">
              <p className={`text-3xl font-bold font-mono ${result.probabilidadeVitoria >= 70 ? 'text-emerald-400' : result.probabilidadeVitoria >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {result.probabilidadeVitoria}%
              </p>
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Competitividade</p>
            </div>

            {/* Data source indicator */}
            <div className={`text-center px-3 py-1.5 rounded-md text-[10px] ${
              result.dataSource === 'direct'
                ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/20'
                : result.dataSource === 'similar'
                  ? 'bg-blue-950/30 text-blue-400 border border-blue-900/20'
                  : 'bg-amber-950/30 text-amber-400 border border-amber-900/20'
            }`}>
              {result.dataSource === 'direct' && '📊 '}
              {result.dataSource === 'similar' && '🔍 '}
              {result.dataSource === 'market' && '📈 '}
              {result.dataSourceLabel}
            </div>

            {/* Recommendation buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => applyRecommendation(result.recomendacao.lanceMinimo)} className="p-2 rounded-lg bg-[#0a0a0b] text-center hover:bg-white/[0.06] transition-colors">
                <p className="text-[10px] text-gray-500">Conservador</p>
                <p className="text-xs text-white font-mono">{formatBRL(result.recomendacao.lanceMinimo)}</p>
              </button>
              <button onClick={() => applyRecommendation(result.recomendacao.lanceSugerido)} className="p-2 rounded-lg bg-emerald-900/10 border border-emerald-900/20 text-center hover:bg-emerald-900/20 transition-colors">
                <p className="text-[10px] text-emerald-400">Sugerido</p>
                <p className="text-xs text-white font-mono">{formatBRL(result.recomendacao.lanceSugerido)}</p>
              </button>
              <button onClick={() => applyRecommendation(result.recomendacao.lanceAgressivo)} className="p-2 rounded-lg bg-[#0a0a0b] text-center hover:bg-white/[0.06] transition-colors">
                <p className="text-[10px] text-gray-500">Agressivo</p>
                <p className="text-xs text-white font-mono">{formatBRL(result.recomendacao.lanceAgressivo)}</p>
              </button>
            </div>

            {/* Distribution */}
            <div>
              <p className="text-xs text-gray-400 mb-2">
                Distribuição de descontos
                {result.totalConcorrentes > 0 && ` (${result.totalConcorrentes} concorrentes)`}
              </p>
              <div className="flex items-end gap-1 h-20">
                {result.distribuicaoDescontos.map((d, i) => {
                  const maxCount = Math.max(...result.distribuicaoDescontos.map(x => x.count), 1)
                  const h = (d.count / maxCount) * 100
                  const isMyRange = desconto >= [0, 5, 10, 15, 20, 30][i] && desconto < [5, 10, 15, 20, 30, 100][i]
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className={`w-full rounded-t transition-colors ${isMyRange ? 'bg-emerald-500' : 'bg-emerald-500/30'}`}
                        style={{ height: `${Math.max(4, h)}%` }}
                      />
                      <span className={`text-[8px] ${isMyRange ? 'text-emerald-400 font-bold' : 'text-gray-500'}`}>{d.faixa}</span>
                    </div>
                  )
                })}
              </div>
              {/* User's position marker */}
              <p className="text-[10px] text-gray-500 text-center mt-1">
                Seu desconto: <span className="text-emerald-400 font-mono">{desconto}%</span>
                {result.descontoMediano > 0 && (
                  <> · Mediana: <span className="text-gray-300 font-mono">{result.descontoMediano}%</span></>
                )}
              </p>
            </div>

            {/* Top competitors (only for direct data) */}
            {result.concorrentes.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Principais concorrentes</p>
                <div className="space-y-1">
                  {result.concorrentes.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-[#0a0a0b] text-xs">
                      <div className="min-w-0">
                        <p className="text-white truncate">{c.nome?.substring(0, 30)}</p>
                        <p className="text-[10px] text-gray-500">{c.totalParticipacoes} participações | {c.winRate}% win</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-gray-300">{c.desconto.toFixed(1)}%</p>
                        {c.isWinner && <Badge variant="outline" className="text-[8px] bg-emerald-900/20 text-emerald-400 border-emerald-900/30">Vencedor</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
