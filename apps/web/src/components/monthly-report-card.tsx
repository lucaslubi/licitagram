'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface KPI { label: string; value: string | number; icon: string }
interface TopOpp { id: string; score: number; objeto: string; orgao: string; valor: number; uf: string }

export function MonthlyReportCard() {
  const [kpis, setKpis] = useState<KPI[]>([])
  const [topOpps, setTopOpps] = useState<TopOpp[]>([])
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [showFull, setShowFull] = useState(false)

  useEffect(() => { fetchReport() }, [])

  async function fetchReport() {
    try {
      const res = await fetch('/api/reports/monthly')
      if (!res.ok) return
      const data = await res.json()
      setKpis(data.kpis || [])
      setTopOpps(data.topOpportunities || [])
      setMonth(data.month || '')
    } catch {}
    setLoading(false)
  }

  const monthLabel = month ? new Date(month + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : ''

  if (loading) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Relatório {monthLabel}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowFull(!showFull)}>
            {showFull ? 'Resumir' : 'Ver completo'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mini KPIs */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {kpis.slice(0, showFull ? 6 : 3).map((kpi, i) => (
            <div key={i} className="bg-[#111214] rounded-lg p-2.5 text-center">
              <span className="text-lg">{kpi.icon}</span>
              <p className="text-lg font-bold text-white font-[family-name:var(--font-geist-mono)] mt-1">{kpi.value}</p>
              <p className="text-[9px] text-gray-500 leading-tight">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Top opportunities */}
        {showFull && topOpps.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2 font-semibold">Top 5 Oportunidades</p>
            <div className="space-y-1.5">
              {topOpps.map((opp, i) => (
                <a key={i} href={`/opportunities/${opp.id}`} className="flex items-center gap-2 p-2 rounded-lg bg-[#111214] hover:bg-[#2d2f33]/30 transition-colors">
                  <span className={`text-xs font-bold font-mono w-8 text-center rounded py-0.5 ${opp.score >= 80 ? 'bg-emerald-900/20 text-emerald-400' : opp.score >= 60 ? 'bg-amber-900/20 text-amber-400' : 'bg-zinc-800 text-gray-400'}`}>
                    {opp.score}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{opp.objeto}</p>
                    <p className="text-[10px] text-gray-500">{opp.orgao} • {opp.uf}</p>
                  </div>
                  {opp.valor && <span className="text-[10px] text-gray-400 font-mono shrink-0">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(opp.valor)}</span>}
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
