'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

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

  // Show first 3 KPIs as the primary stats grid
  const primaryKpis = kpis.slice(0, 3)
  const secondaryKpis = kpis.slice(3, 6)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">
              Relatório {monthLabel}
            </CardTitle>
            <p className="text-[10px] text-gray-500 mt-0.5">Consolidado do mês</p>
          </div>
          <button
            onClick={() => setShowFull(!showFull)}
            className="text-xs text-gray-400 hover:text-white transition-colors group flex items-center gap-1"
          >
            {showFull ? 'Resumir' : 'Ver completo'} <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Primary stats grid — bordered cells */}
        <div className="grid grid-cols-3 gap-px bg-white/[0.06] rounded-lg overflow-hidden">
          {primaryKpis.map((kpi, i) => (
            <div key={i} className="bg-[#131316] py-5 px-4 text-center">
              <p className="text-2xl font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums tracking-tight">
                {kpi.value}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mt-1.5">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Extended view */}
        {showFull && (
          <>
            {/* Secondary KPIs */}
            {secondaryKpis.length > 0 && (
              <div className="grid grid-cols-3 gap-px bg-white/[0.06] rounded-lg overflow-hidden mt-3">
                {secondaryKpis.map((kpi, i) => (
                  <div key={i} className="bg-[#131316] py-4 px-4 text-center">
                    <p className="text-lg font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums">
                      {kpi.value}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mt-1">{kpi.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Top opportunities */}
            {topOpps.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2">Top 5 Oportunidades</p>
                <div className="divide-y divide-white/[0.06]">
                  {topOpps.map((opp, i) => {
                    const scoreColor = opp.score >= 80 ? 'text-emerald-400 bg-emerald-500/10' : opp.score >= 60 ? 'text-amber-400 bg-amber-500/10' : 'text-gray-400 bg-white/[0.04]'
                    return (
                      <a key={i} href={`/opportunities/${opp.id}`} className="flex items-center gap-2.5 py-2.5 hover:bg-white/[0.02] transition-colors rounded -mx-1 px-1 group">
                        <span className={`text-xs font-bold font-[family-name:var(--font-geist-mono)] tabular-nums w-8 text-center rounded-md py-0.5 ${scoreColor}`}>
                          {opp.score}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate group-hover:text-brand transition-colors">{opp.objeto}</p>
                          <p className="text-[10px] text-gray-500">{opp.orgao} · {opp.uf}</p>
                        </div>
                        {opp.valor > 0 && (
                          <span className="text-[10px] text-gray-400 font-[family-name:var(--font-geist-mono)] tabular-nums shrink-0">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(opp.valor)}
                          </span>
                        )}
                      </a>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
