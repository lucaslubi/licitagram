'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  ExternalLink,
  Loader2,
  Minus,
  Search,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  fillTrendGaps,
  getPrecoStats,
  getPrecoTrend,
  searchPrecosPncp,
  type PrecoPncpRow,
  type PrecoStats,
  type PrecoTrendPoint,
} from '@/lib/precos/pncp-engine'
import { PriceTrendChart } from './components/PriceTrendChart'

const MODALIDADES = [
  '',
  'Pregão Eletrônico',
  'Pregão Presencial',
  'Concorrência',
  'Dispensa',
  'Inexigibilidade',
  'Credenciamento',
  'Leilão',
]

function formatBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function computeVariation(trend: PrecoTrendPoint[]): { pct: number; direction: 'up' | 'down' | 'flat' } {
  if (trend.length < 2) return { pct: 0, direction: 'flat' }
  const first = trend[0]!.mediana
  const last = trend[trend.length - 1]!.mediana
  if (first === 0) return { pct: 0, direction: 'flat' }
  const pct = ((last - first) / first) * 100
  return {
    pct: Number(pct.toFixed(2)),
    direction: Math.abs(pct) < 1 ? 'flat' : pct > 0 ? 'up' : 'down',
  }
}

interface Props {
  initialQuery: string
  initialModalidade: string
  initialUf: string
  initialDateFrom: string
  initialDateTo: string
}

export function PrecosMercadoClient({
  initialQuery,
  initialModalidade,
  initialUf,
  initialDateFrom,
  initialDateTo,
}: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [modalidade, setModalidade] = useState(initialModalidade)
  const [uf, setUf] = useState(initialUf)
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)

  const [results, setResults] = useState<PrecoPncpRow[]>([])
  const [stats, setStats] = useState<PrecoStats | null>(null)
  const [trend, setTrend] = useState<PrecoTrendPoint[]>([])
  const [sortKey, setSortKey] = useState<'data' | 'valor' | 'orgao'>('data')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [loading, startLoad] = useTransition()

  const filters = useMemo(
    () => ({
      query: query.trim(),
      modalidade: modalidade || null,
      uf: uf || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      limit: 100,
    }),
    [query, modalidade, uf, dateFrom, dateTo],
  )

  const runSearch = useCallback(() => {
    if (filters.query.length < 3) {
      toast.error('Digite ao menos 3 caracteres')
      return
    }
    startLoad(async () => {
      const [rows, aggregated, tRaw] = await Promise.all([
        searchPrecosPncp(filters),
        getPrecoStats(filters),
        getPrecoTrend({ ...filters, meses: 24 }),
      ])
      setResults(rows)
      setStats(aggregated)
      // Preenche gaps pros últimos 6 meses terem sempre barras (n=0 onde falta).
      setTrend(fillTrendGaps(tRaw, 6))
      if (rows.length === 0) toast.info('Nenhum resultado encontrado')
      else toast.success(`${rows.length} resultado(s) encontrado(s)`)
    })
  }, [filters])

  const variation = useMemo(() => computeVariation(trend), [trend])

  const sorted = useMemo(() => {
    const arr = [...results]
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'valor') return (a.valorUnitario - b.valorUnitario) * dir
      if (sortKey === 'orgao') return a.orgaoNome.localeCompare(b.orgaoNome) * dir
      const av = a.dataPublicacao ? new Date(a.dataPublicacao).getTime() : 0
      const bv = b.dataPublicacao ? new Date(b.dataPublicacao).getTime() : 0
      return (av - bv) * dir
    })
    return arr
  }, [results, sortKey, sortDir])

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'data' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-6">
              <Label htmlFor="q">Descrição do item</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="q"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    placeholder="Ex.: papel A4 75g, cadeira ergonômica, serviço de limpeza"
                    className="pl-9"
                  />
                </div>
                <Button onClick={runSearch} disabled={loading} variant="gradient">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {loading ? 'Buscando…' : 'Buscar'}
                </Button>
              </div>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="mod">Modalidade</Label>
              <select
                id="mod"
                value={modalidade}
                onChange={(e) => setModalidade(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
              >
                {MODALIDADES.map((m) => (
                  <option key={m} value={m}>
                    {m || 'Todas'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="uf">UF (nome do órgão)</Label>
              <Input
                id="uf"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                placeholder="SP / CEARÁ / RIO…"
                maxLength={40}
              />
            </div>
            <div>
              <Label htmlFor="df">De</Label>
              <Input id="df" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="dt">Até</Label>
              <Input id="dt" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={() => { setModalidade(''); setUf(''); setDateFrom(''); setDateTo('') }}>
                Limpar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {stats && stats.n > 0 && (
        <div className="grid gap-3 md:grid-cols-4">
          <KPI
            label="Mediana de mercado"
            value={formatBRL(stats.mediana)}
            hint={`${stats.n.toLocaleString('pt-BR')} contratações`}
            accent
          />
          <KPI
            label="Amostra"
            value={stats.n.toLocaleString('pt-BR')}
            hint={`Média ${formatBRL(stats.media)}`}
          />
          <KPI
            label="Variação 12m"
            value={`${variation.direction === 'up' ? '+' : variation.direction === 'down' ? '' : '±'}${Math.abs(variation.pct).toFixed(1)}%`}
            hint={`${variation.direction === 'up' ? 'Subindo' : variation.direction === 'down' ? 'Caindo' : 'Estável'}`}
            icon={
              variation.direction === 'up' ? (
                <ArrowUp className="h-3 w-3 text-destructive" />
              ) : variation.direction === 'down' ? (
                <ArrowDown className="h-3 w-3 text-accent" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground" />
              )
            }
            tone={variation.direction === 'up' ? 'warn' : variation.direction === 'down' ? 'ok' : 'neutral'}
          />
          <KPI
            label="CV (dispersão)"
            value={`${stats.cv.toFixed(1)}%`}
            hint={stats.complianceTcu1875 ? 'Acórdão TCU 1.875/2021 ✓' : 'Sample disperso — refine'}
            tone={stats.complianceTcu1875 ? 'ok' : 'warn'}
          />
        </div>
      )}

      {/* Gráfico de tendência */}
      {trend.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Tendência de preço</CardTitle>
            <TrendCoverageBadge points={trend} />
          </CardHeader>
          <CardContent>
            <PriceTrendChart points={trend} medianGlobal={stats?.mediana} />
          </CardContent>
        </Card>
      )}

      {/* Estatísticas detalhadas */}
      {stats && stats.n > 0 && (
        <div className="grid gap-3 md:grid-cols-5">
          <MiniStat label="Mínimo" value={formatBRL(stats.minimo)} />
          <MiniStat label="Mediana" value={formatBRL(stats.mediana)} accent />
          <MiniStat label="Média" value={formatBRL(stats.media)} />
          <MiniStat label="Máximo" value={formatBRL(stats.maximo)} />
          <MiniStat label="Desvio" value={formatBRL(stats.desvioPadrao)} />
        </div>
      )}

      {/* Registros */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Registros <Badge variant="secondary" className="ml-2">{results.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              Dados do PNCP · scraper diário
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr className="border-b border-border">
                    <SortHeader label="Data" active={sortKey === 'data'} dir={sortDir} onClick={() => toggleSort('data')} />
                    <SortHeader label="Órgão" active={sortKey === 'orgao'} dir={sortDir} onClick={() => toggleSort('orgao')} />
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Modalidade</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descrição</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qtd</th>
                    <SortHeader label="Unit." align="right" active={sortKey === 'valor'} dir={sortDir} onClick={() => toggleSort('valor')} />
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Δ mediana</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const diff = stats?.mediana
                      ? ((r.valorUnitario - stats.mediana) / stats.mediana) * 100
                      : 0
                    return (
                      <tr key={r.itemId} className="border-b border-border/60 hover:bg-card/40">
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(r.dataPublicacao)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex items-start gap-1">
                            <Building2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="line-clamp-2 text-xs">{r.orgaoNome}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.modalidadeNome ?? '—'}</td>
                        <td className="px-3 py-2">
                          <p className="line-clamp-2 text-xs">{r.descricao}</p>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {r.quantidade != null ? Number(r.quantidade).toLocaleString('pt-BR') : '—'}
                          {r.unidadeMedida ? ` ${r.unidadeMedida}` : ''}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                          {formatBRL(r.valorUnitario)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                          <span
                            className={
                              Math.abs(diff) < 5
                                ? 'text-muted-foreground'
                                : diff > 0
                                  ? 'text-warning'
                                  : 'text-accent'
                            }
                          >
                            {diff > 0 ? '+' : ''}
                            {diff.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {r.linkPncp && (
                            <a
                              href={r.linkPncp}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Abrir no PNCP"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length === 0 && !loading && !stats && (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-base font-semibold">Comece buscando um item</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Digite a descrição do que quer pesquisar. A ferramenta retorna preços históricos
              do PNCP, tendência de 12 meses, estatísticas agregadas e todas as fontes com link.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KPI({
  label,
  value,
  hint,
  icon,
  accent,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  icon?: React.ReactNode
  accent?: boolean
  tone?: 'ok' | 'warn' | 'neutral'
}) {
  return (
    <div
      className={`rounded-large border p-4 ${
        accent ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
          accent ? 'text-primary' : tone === 'ok' ? 'text-accent' : tone === 'warn' ? 'text-warning' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          {icon}
          {hint}
        </p>
      )}
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${accent ? 'text-primary' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function TrendCoverageBadge({ points }: { points: PrecoTrendPoint[] }) {
  const withData = points.filter((p) => p.n > 0)
  if (withData.length === 0) return null
  const first = withData[0]!.mes
  const last = withData[withData.length - 1]!.mes
  const labelRange = first === last
    ? `apenas ${first}`
    : `${first} a ${last}`
  const tone = withData.length >= 6 ? 'default' : withData.length >= 3 ? 'secondary' : 'destructive'
  return (
    <Badge variant={tone as 'default' | 'secondary' | 'destructive'} className="font-normal">
      Cobertura: {withData.length} mês{withData.length > 1 ? 'es' : ''} ({labelRange})
    </Badge>
  )
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right'
}) {
  return (
    <th className={`px-3 py-2 font-medium text-muted-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )
}
