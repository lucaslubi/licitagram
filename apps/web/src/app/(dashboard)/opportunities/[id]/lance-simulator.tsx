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
}

export function LanceSimulator({ matchId, tenderId, valorEstimado }: { matchId: string; tenderId: string; valorEstimado: number }) {
  const [desconto, setDesconto] = useState(10)
  const [result, setResult] = useState<SimResult | null>(null)
  const [loading, setLoading] = useState(false)

  const meuLance = valorEstimado * (1 - desconto / 100)

  async function simulate() {
    setLoading(true)
    try {
      const res = await fetch('/api/lance-simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId, valorEstimado, meuDesconto: desconto }),
      })
      const data = await res.json()
      if (res.ok) setResult(data)
    } catch {}
    setLoading(false)
  }

  if (!valorEstimado || valorEstimado <= 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Simulador de Lance</CardTitle>
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
        <div className="bg-[#111214] rounded-lg p-3 flex justify-between items-center">
          <div>
            <p className="text-[10px] text-gray-500 uppercase">Valor Estimado</p>
            <p className="text-sm text-gray-300 font-mono">{formatBRL(valorEstimado)}</p>
          </div>
          <span className="text-gray-500">→</span>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase">Seu Lance</p>
            <p className="text-sm text-emerald-400 font-mono font-bold">{formatBRL(meuLance)}</p>
          </div>
        </div>

        <Button onClick={simulate} disabled={loading} size="sm" className="w-full">
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
              <p className="text-xs text-gray-400">probabilidade de vitória</p>
            </div>

            {/* Quick buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => { setDesconto(result.descontoMediano - 2); simulate() }} className="p-2 rounded-lg bg-[#111214] text-center hover:bg-[#2d2f33]">
                <p className="text-[10px] text-gray-500">Conservador</p>
                <p className="text-xs text-white font-mono">{formatBRL(result.recomendacao.lanceSugerido)}</p>
              </button>
              <button onClick={() => { setDesconto(result.descontoMediano); simulate() }} className="p-2 rounded-lg bg-emerald-900/10 border border-emerald-900/20 text-center">
                <p className="text-[10px] text-emerald-400">Sugerido</p>
                <p className="text-xs text-white font-mono">{formatBRL(result.recomendacao.lanceSugerido)}</p>
              </button>
              <button onClick={() => { setDesconto(result.descontoMediano + 5); simulate() }} className="p-2 rounded-lg bg-[#111214] text-center hover:bg-[#2d2f33]">
                <p className="text-[10px] text-gray-500">Agressivo</p>
                <p className="text-xs text-white font-mono">{formatBRL(result.recomendacao.lanceAgressivo)}</p>
              </button>
            </div>

            {/* Distribution */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Distribuição de descontos ({result.totalConcorrentes} concorrentes)</p>
              <div className="flex items-end gap-1 h-20">
                {result.distribuicaoDescontos.map((d, i) => {
                  const maxCount = Math.max(...result.distribuicaoDescontos.map(x => x.count), 1)
                  const h = (d.count / maxCount) * 100
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full rounded-t bg-emerald-500/40" style={{ height: `${Math.max(4, h)}%` }} />
                      <span className="text-[8px] text-gray-500">{d.faixa}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top competitors */}
            {result.concorrentes.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Principais concorrentes</p>
                <div className="space-y-1">
                  {result.concorrentes.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-[#111214] text-xs">
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
