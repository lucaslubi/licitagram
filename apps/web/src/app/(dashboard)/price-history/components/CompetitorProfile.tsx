'use client'

import { useState, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompetitorProfileProps {
  query: string
}

interface RecentBid {
  data: string
  objeto: string
  orgao: string
  uf: string
  proposta: number
  estimado: number
  desconto: number
  resultado: 'won' | 'lost'
}

interface MonthlyActivity {
  month: string
  wins: number
  losses: number
}

interface ProfileData {
  empresa: string
  cnpj: string
  porte: string
  uf: string
  first_seen: string
  last_seen: string
  stats: {
    total_participacoes: number
    vitorias: number
    taxa_vitoria: number
    desconto_medio: number
    desconto_mediano: number
    consistencia: string
    lance_medio: number
    lance_mediano: number
    agressividade: string
  }
  behavior: {
    agressividade: string
    consistencia: string
    faixa_desconto: { min: number; max: number }
    modalidades: string[]
    ufs: string[]
  }
  recent_bids: RecentBid[]
  monthly_activity: MonthlyActivity[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  let formatted = digits
  if (digits.length > 2) formatted = digits.slice(0, 2) + '.' + digits.slice(2)
  if (digits.length > 5) formatted = formatted.slice(0, 6) + '.' + formatted.slice(6)
  if (digits.length > 8) formatted = formatted.slice(0, 10) + '/' + formatted.slice(10)
  if (digits.length > 12) formatted = formatted.slice(0, 15) + '-' + formatted.slice(15)
  return formatted
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR')
}

const MONTHS_PTBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-')
  const monthIndex = parseInt(m, 10) - 1
  if (monthIndex < 0 || monthIndex > 11) return month
  return `${MONTHS_PTBR[monthIndex]}/${year.slice(2)}`
}

function agressividadeColor(level: string): string {
  switch (level) {
    case 'muito_agressivo': return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'agressivo': return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    case 'moderado': return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'conservador': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    default: return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  }
}

function agressividadeLabel(level: string): string {
  switch (level) {
    case 'muito_agressivo': return 'Muito Agressivo'
    case 'agressivo': return 'Agressivo'
    case 'moderado': return 'Moderado'
    case 'conservador': return 'Conservador'
    default: return level
  }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#2d2f33] ${className ?? 'h-4 w-full'}`} />
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="bg-[#23262a]">
        <CardContent className="p-6 space-y-3">
          <SkeletonBar className="h-7 w-64" />
          <SkeletonBar className="h-4 w-48" />
          <div className="flex gap-2 mt-2">
            <SkeletonBar className="h-6 w-16" />
            <SkeletonBar className="h-6 w-12" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i} className="bg-[#23262a]">
            <CardContent className="p-4">
              <SkeletonBar className="h-3 w-20 mb-2" />
              <SkeletonBar className="h-7 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-[#23262a]">
        <CardContent className="p-6">
          <SkeletonBar className="h-40 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chart Tooltip
// ---------------------------------------------------------------------------

interface ActivityTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; dataKey: string }>
  label?: string
}

function ActivityTooltip({ active, payload, label }: ActivityTooltipProps) {
  if (!active || !payload || !label) return null
  const wins = payload.find((p) => p.dataKey === 'wins')?.value ?? 0
  const losses = payload.find((p) => p.dataKey === 'losses')?.value ?? 0
  return (
    <div className="bg-[#1F2937] border border-[#374151] rounded-lg p-3 shadow-xl">
      <p className="text-white text-xs font-medium mb-2">{formatMonthLabel(label)}</p>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-emerald-400">Vitorias</span>
        <span className="text-white font-mono">{wins}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-gray-400">Derrotas</span>
        <span className="text-white font-mono">{losses}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-[#23262a]">
      <CardContent className="p-4">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className="text-xl font-semibold text-white font-mono">{value}</p>
      </CardContent>
    </Card>
  )
}

function BadgeStatCard({ label, value, badgeClass }: { label: string; value: string; badgeClass: string }) {
  return (
    <Card className="bg-[#23262a]">
      <CardContent className="p-4">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-semibold ${badgeClass}`}>
          {value}
        </span>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CompetitorProfile({ query }: CompetitorProfileProps) {
  const [cnpj, setCnpj] = useState('')
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCnpj(formatCNPJ(e.target.value))
  }

  const fetchProfile = useCallback(async () => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) {
      setError('CNPJ deve conter 14 digitos.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ cnpj: digits })
      if (query) params.set('query', query)

      const res = await fetch(`/api/price-history/competitor-profile?${params.toString()}`)

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Erro ao buscar perfil (${res.status})`)
      }

      const json: ProfileData = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [cnpj, query])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchProfile()
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* 1. CNPJ Search                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card className="bg-[#23262a]">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label htmlFor="cnpj-input" className="block text-xs text-gray-400 mb-1.5">
                CNPJ do concorrente
              </label>
              <Input
                id="cnpj-input"
                type="text"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={handleCnpjChange}
                className="bg-[#1a1c1f] border-[#2d2f33] text-white placeholder:text-gray-500"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading}>
                {loading ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </form>
          {error && (
            <p className="text-red-400 text-sm mt-3">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Loading State                                                      */}
      {/* ------------------------------------------------------------------ */}
      {loading && <LoadingSkeleton />}

      {/* ------------------------------------------------------------------ */}
      {/* Data Sections                                                      */}
      {/* ------------------------------------------------------------------ */}
      {data && !loading && (
        <>
          {/* -------------------------------------------------------------- */}
          {/* 2. Profile Header                                              */}
          {/* -------------------------------------------------------------- */}
          <Card className="bg-[#23262a]">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">{data.empresa}</h2>
                  <p className="text-sm text-gray-400 mt-1 font-mono">{formatCNPJ(data.cnpj)}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="outline" className="border-[#F43E01]/40 text-[#F43E01]">
                      {data.porte}
                    </Badge>
                    <Badge variant="outline" className="border-[#2d2f33] text-gray-300">
                      {data.uf}
                    </Badge>
                  </div>
                </div>
                <div className="text-right text-xs text-gray-400 space-y-1">
                  <p>Primeira vez: <span className="text-gray-300">{formatDate(data.first_seen)}</span></p>
                  <p>Ultima vez: <span className="text-gray-300">{formatDate(data.last_seen)}</span></p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* -------------------------------------------------------------- */}
          {/* 3. Stats Grid (3x3)                                            */}
          {/* -------------------------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Total Participacoes" value={formatNumber(data.stats.total_participacoes)} />
            <StatCard label="Vitorias" value={formatNumber(data.stats.vitorias)} />
            <StatCard label="Taxa de Vitoria" value={formatPercent(data.stats.taxa_vitoria)} />
            <StatCard label="Desconto Medio" value={formatPercent(data.stats.desconto_medio)} />
            <StatCard label="Desconto Mediano" value={formatPercent(data.stats.desconto_mediano)} />
            <BadgeStatCard
              label="Consistencia"
              value={data.stats.consistencia}
              badgeClass="bg-blue-500/15 text-blue-400 border-blue-500/30"
            />
            <StatCard label="Lance Medio" value={formatBRL(data.stats.lance_medio)} />
            <StatCard label="Lance Mediano" value={formatBRL(data.stats.lance_mediano)} />
            <BadgeStatCard
              label="Agressividade"
              value={agressividadeLabel(data.stats.agressividade)}
              badgeClass={agressividadeColor(data.stats.agressividade)}
            />
          </div>

          {/* -------------------------------------------------------------- */}
          {/* 4. Behavior Summary                                            */}
          {/* -------------------------------------------------------------- */}
          <Card className="bg-[#23262a]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300">
                Resumo Comportamental
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Agressividade</p>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${agressividadeColor(data.behavior.agressividade)}`}>
                    {agressividadeLabel(data.behavior.agressividade)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Consistencia</p>
                  <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-blue-500/15 text-blue-400 border-blue-500/30">
                    {data.behavior.consistencia}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Faixa tipica de desconto</p>
                  <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-[#1a1c1f] text-gray-200 border-[#2d2f33]">
                    {data.behavior.faixa_desconto.min}% - {data.behavior.faixa_desconto.max}%
                  </span>
                </div>
              </div>

              {data.behavior.modalidades.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Modalidades preferidas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.behavior.modalidades.map((mod) => (
                      <span
                        key={mod}
                        className="inline-flex items-center rounded-full border border-[#2d2f33] bg-[#1a1c1f] px-2.5 py-0.5 text-xs text-gray-300"
                      >
                        {mod}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {data.behavior.ufs.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">UFs de atuacao</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.behavior.ufs.map((uf) => (
                      <span
                        key={uf}
                        className="inline-flex items-center rounded-full border border-[#F43E01]/20 bg-[#F43E01]/5 px-2.5 py-0.5 text-xs text-[#F43E01]"
                      >
                        {uf}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* -------------------------------------------------------------- */}
          {/* 5. Recent Bids Timeline                                        */}
          {/* -------------------------------------------------------------- */}
          {data.recent_bids.length > 0 && (
            <Card className="bg-[#23262a]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-300">
                  Lances Recentes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#23262a] border-b border-[#2d2f33]">
                      <tr>
                        <th className="text-left text-gray-400 font-medium px-4 py-2.5">Data</th>
                        <th className="text-left text-gray-400 font-medium px-4 py-2.5">Objeto</th>
                        <th className="text-left text-gray-400 font-medium px-4 py-2.5">Orgao</th>
                        <th className="text-left text-gray-400 font-medium px-4 py-2.5">UF</th>
                        <th className="text-right text-gray-400 font-medium px-4 py-2.5">Proposta</th>
                        <th className="text-right text-gray-400 font-medium px-4 py-2.5">Estimado</th>
                        <th className="text-right text-gray-400 font-medium px-4 py-2.5">Desconto</th>
                        <th className="text-center text-gray-400 font-medium px-4 py-2.5">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_bids.slice(0, 20).map((bid, i) => (
                        <tr
                          key={i}
                          className={`border-b border-[#2d2f33] transition-colors ${
                            bid.resultado === 'won'
                              ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                              : 'hover:bg-[#1a1c1f]'
                          }`}
                        >
                          <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap font-mono">
                            {formatDate(bid.data)}
                          </td>
                          <td className="px-4 py-2.5 text-gray-200 max-w-[200px] truncate" title={bid.objeto}>
                            {bid.objeto}
                          </td>
                          <td className="px-4 py-2.5 text-gray-300 max-w-[150px] truncate" title={bid.orgao}>
                            {bid.orgao}
                          </td>
                          <td className="px-4 py-2.5 text-gray-300">{bid.uf}</td>
                          <td className="px-4 py-2.5 text-right text-gray-200 font-mono whitespace-nowrap">
                            {formatBRL(bid.proposta)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-400 font-mono whitespace-nowrap">
                            {formatBRL(bid.estimado)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                            <span className={bid.desconto >= 20 ? 'text-emerald-400' : bid.desconto >= 10 ? 'text-amber-400' : 'text-gray-300'}>
                              {formatPercent(bid.desconto)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {bid.resultado === 'won' ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                Venceu
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-500/15 border border-gray-500/30 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                                Perdeu
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* -------------------------------------------------------------- */}
          {/* 6. Monthly Activity Chart                                      */}
          {/* -------------------------------------------------------------- */}
          {data.monthly_activity.length > 0 && (
            <Card className="bg-[#23262a]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-300">
                  Atividade Mensal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px] md:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.monthly_activity}
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatMonthLabel}
                        tick={{ fill: '#9CA3AF', fontSize: 11 }}
                        axisLine={{ stroke: '#2d2f33' }}
                        tickLine={{ stroke: '#2d2f33' }}
                      />
                      <YAxis
                        tick={{ fill: '#9CA3AF', fontSize: 11 }}
                        axisLine={{ stroke: '#2d2f33' }}
                        tickLine={{ stroke: '#2d2f33' }}
                        width={35}
                        allowDecimals={false}
                      />
                      <Tooltip content={<ActivityTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="wins" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} name="Vitorias" />
                      <Bar dataKey="losses" stackId="a" fill="#4b5563" radius={[4, 4, 0, 0]} name="Derrotas" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 mt-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 inline-block rounded-sm bg-emerald-500" />
                    Vitorias
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 inline-block rounded-sm bg-gray-600" />
                    Derrotas
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
