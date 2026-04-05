'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PriceSearchResult, PriceStatistics, PriceTrend } from '@licitagram/price-history'
import { PriceTrendChart } from './components/PriceTrendChart'

// New module imports
import { DiscountAnalysis } from './components/DiscountAnalysis'
import { SeasonalityAnalysis } from './components/SeasonalityAnalysis'
import { BenchmarkGauge } from './components/BenchmarkGauge'
import { CompetitorProfile } from './components/CompetitorProfile'
import { SmartPricing } from './components/SmartPricing'
import { PriceWatch } from './components/PriceWatch'

const UF_OPTIONS = [
  '','AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

const MODALIDADE_OPTIONS = [
  '',
  'Pregao Eletronico',
  'Pregao Presencial',
  'Concorrencia',
  'Tomada de Preços',
  'Convite',
  'Dispensa',
  'Inexigibilidade',
]

const TABS = [
  { id: 'tendencia', label: 'Tendência' },
  { id: 'descontos', label: 'Descontos' },
  { id: 'segmentacao', label: 'Segmentação' },
  { id: 'sazonalidade', label: 'Sazonalidade' },
  { id: 'concorrentes', label: 'Concorrentes' },
] as const

type TabId = typeof TABS[number]['id']

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(value)

function TrendArrow({ direction }: { direction: PriceTrend['direction'] }) {
  if (direction === 'subindo') return <span className="text-red-400">&#9650;</span>
  if (direction === 'descendo') return <span className="text-emerald-400">&#9660;</span>
  return <span className="text-gray-400">&#9654;</span>
}

export function PriceHistoryClient() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') || ''

  const [query, setQuery] = useState(initialQuery)
  const [uf, setUf] = useState('')
  const [modalidade, setModalidade] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [result, setResult] = useState<PriceSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [trending, setTrending] = useState<{ query: string; count: number }[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('tendencia')
  const [winOnly, setWinOnly] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch trending searches on mount + load recent from localStorage
  useEffect(() => {
    fetch('/api/price-history/trending')
      .then((res) => res.ok ? res.json() : { trending: [] })
      .then((d) => setTrending(d.trending || []))
      .catch(() => {})

    try {
      const stored = localStorage.getItem('ph:recent_searches')
      if (stored) setRecentSearches(JSON.parse(stored))
    } catch {}
  }, [])

  // Close dropdown on click outside or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  // Auto re-search when winOnly toggle changes (only if already has results)
  const prevWinOnly = useRef(winOnly)
  useEffect(() => {
    if (prevWinOnly.current !== winOnly && result) {
      prevWinOnly.current = winOnly
      doSearch(1)
    }
  }, [winOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save recent search to localStorage
  function saveRecentSearch(q: string) {
    const trimmed = q.trim().toLowerCase()
    if (!trimmed || trimmed.length < 3) return
    const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, 5)
    setRecentSearches(updated)
    try { localStorage.setItem('ph:recent_searches', JSON.stringify(updated)) } catch {}
  }

  // Filter suggestions based on current input
  const suggestions = query.length >= 2
    ? {
        recent: recentSearches.filter(s => s.includes(query.toLowerCase())).slice(0, 3),
        popular: trending.filter(t => t.query.includes(query.toLowerCase())).map(t => t.query).slice(0, 5),
      }
    : { recent: recentSearches.slice(0, 3), popular: trending.map(t => t.query).slice(0, 5) }

  const hasSuggestions = suggestions.recent.length > 0 || suggestions.popular.length > 0

  const doSearch = useCallback(async (page = 1) => {
    if (!query.trim() || query.trim().length < 3) {
      setError('Digite pelo menos 3 caracteres para buscar.')
      return
    }

    setLoading(true)
    setError(null)
    setShowSuggestions(false)
    saveRecentSearch(query)

    try {
      const params = new URLSearchParams({ q: query.trim(), page: String(page), page_size: '20' })
      if (uf) params.set('uf', uf)
      if (modalidade) params.set('modalidade', modalidade)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (winOnly) params.set('win_only', 'true')

      const res = await fetch(`/api/price-history/search?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro na busca')
      }

      const data: PriceSearchResult = await res.json()
      setResult(data)
      setCurrentPage(page)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [query, uf, modalidade, dateFrom, dateTo, winOnly])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/price-history/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          format: 'csv',
          uf: uf || undefined,
          modalidade: modalidade || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao exportar')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `precos-mercado-${query.trim().replace(/\s+/g, '-').substring(0, 30)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao exportar')
    } finally {
      setExporting(false)
    }
  }

  const totalPages = result ? Math.ceil(result.total_count / result.page_size) : 0

  return (
    <div className="space-y-6">
      {/* Header + Data freshness */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Preços de Mercado</h1>
          <p className="text-sm text-gray-400 mt-1">Pesquise preços praticados em licitações anteriores</p>
        </div>
        {result && (
          <p className="text-[10px] text-gray-500 bg-[#1a1c1f] px-3 py-1.5 rounded-full border border-[#2d2f33] whitespace-nowrap shrink-0">
            Última atualização: agora | {result.total_count.toLocaleString('pt-BR')} licitações indexadas
          </p>
        )}
      </div>

      {/* Trending chips */}
      {trending.length > 0 && !result && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 self-center mr-1">Buscas populares:</span>
          {trending.map((t) => (
            <button
              key={t.query}
              onClick={() => { setQuery(t.query); }}
              className="px-3 py-1 rounded-full text-xs bg-[#23262a] border border-[#2d2f33] text-gray-300 hover:border-[#F43E01]/40 hover:text-white transition-colors"
            >
              {t.query}
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <Card className="bg-[#23262a] border-[#2d2f33]">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search input */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Buscar produto ou serviço..."
                  className="pl-10 bg-[#1a1c1f] border-[#2d2f33] text-white placeholder:text-gray-500"
                  onKeyDown={(e) => { if (e.key === 'Enter') { setShowSuggestions(false); doSearch(1) } }}
                  autoComplete="off"
                />
                {/* Autocomplete dropdown */}
                {showSuggestions && hasSuggestions && (
                  <div ref={dropdownRef} className="absolute top-full left-0 right-0 mt-1 bg-[#1a1c1f] border border-[#2d2f33] rounded-lg shadow-xl z-50 overflow-hidden">
                    {suggestions.recent.length > 0 && (
                      <div className="px-3 pt-2 pb-1">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Recentes</p>
                        {suggestions.recent.map((s) => (
                          <button
                            key={`recent-${s}`}
                            className="w-full text-left px-2 py-1.5 text-sm text-gray-300 hover:bg-[#2d2f33] rounded transition-colors flex items-center gap-2"
                            onClick={() => { setQuery(s); setShowSuggestions(false); setTimeout(() => doSearch(1), 50) }}
                          >
                            <svg className="w-3 h-3 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    {suggestions.popular.length > 0 && (
                      <div className="px-3 pt-2 pb-2 border-t border-[#2d2f33]">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Populares</p>
                        {suggestions.popular.map((s) => (
                          <button
                            key={`pop-${s}`}
                            className="w-full text-left px-2 py-1.5 text-sm text-gray-300 hover:bg-[#2d2f33] rounded transition-colors flex items-center gap-2"
                            onClick={() => { setQuery(s); setShowSuggestions(false); setTimeout(() => doSearch(1), 50) }}
                          >
                            <svg className="w-3 h-3 text-brand shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Button
                onClick={() => doSearch(1)}
                disabled={loading}
                className="bg-[#F43E01] hover:bg-[#d63600] text-white px-6"
              >
                {loading ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">UF</label>
                <select
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="w-full h-9 rounded-md border border-[#2d2f33] bg-[#1a1c1f] px-3 text-sm text-white"
                >
                  <option value="">Todas</option>
                  {UF_OPTIONS.filter(Boolean).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Modalidade</label>
                <select
                  value={modalidade}
                  onChange={(e) => setModalidade(e.target.value)}
                  className="w-full h-9 rounded-md border border-[#2d2f33] bg-[#1a1c1f] px-3 text-sm text-white"
                >
                  <option value="">Todas</option>
                  {MODALIDADE_OPTIONS.filter(Boolean).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">De</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-[#1a1c1f] border-[#2d2f33] text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Ate</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-[#1a1c1f] border-[#2d2f33] text-white"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F43E01]" />
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Win Only toggle + Tabs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={winOnly}
                    onChange={(e) => setWinOnly(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#2d2f33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#F43E01]" />
                </label>
                <span className="text-sm text-gray-300">Apenas vencedores</span>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 bg-[#1a1c1f] rounded-lg p-1 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#F43E01] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-[#2d2f33]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content: Tendência */}
          {activeTab === 'tendencia' && (
            <div className="space-y-6">
              {/* Stats cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-[#23262a] border-[#2d2f33]">
                  <CardContent className="pt-6">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Preço Mediano</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {formatBRL(result.statistics.median)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <TrendArrow direction={result.trend.direction} />
                      <span className="text-xs text-gray-400">
                        {result.trend.direction === 'subindo' ? 'Em alta' :
                         result.trend.direction === 'descendo' ? 'Em queda' : 'Estavel'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-[#23262a] border-[#2d2f33]">
                  <CardContent className="pt-6">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Registros</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {result.total_count.toLocaleString('pt-BR')}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">licitações encontradas</p>
                  </CardContent>
                </Card>

                <Card className="bg-[#23262a] border-[#2d2f33]">
                  <CardContent className="pt-6">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Variação</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      result.trend.variation_12m_percent != null
                        ? result.trend.variation_12m_percent > 0
                          ? 'text-red-400'
                          : result.trend.variation_12m_percent < 0
                            ? 'text-emerald-400'
                            : 'text-white'
                        : 'text-gray-400'
                    }`}>
                      {result.trend.variation_12m_percent != null
                        ? `${result.trend.variation_12m_percent > 0 ? '+' : ''}${result.trend.variation_12m_percent.toFixed(1)}%`
                        : 'N/D'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">periodo analisado</p>
                  </CardContent>
                </Card>

                <Card className="bg-[#23262a] border-[#2d2f33]">
                  <CardContent className="pt-6">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Confiança</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      result.statistics.confidence === 'alta' ? 'text-emerald-400' :
                      result.statistics.confidence === 'media' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {result.statistics.confidence === 'alta' ? 'Alta' :
                       result.statistics.confidence === 'media' ? 'Média' : 'Baixa'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">CV {result.statistics.cv_percent.toFixed(1)}%</p>
                  </CardContent>
                </Card>
              </div>

              {/* Trend chart */}
              {result.trend.points.length > 0 && (
                <Card className="bg-[#23262a] border-[#2d2f33]">
                  <CardHeader>
                    <CardTitle className="text-white text-base">Tendência de Preços</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PriceTrendChart
                      points={result.trend.points.map((pt) => ({
                        month: pt.month,
                        count: pt.count,
                        mean: pt.median, // use median as mean proxy when mean not available
                        median: pt.median,
                        min: pt.min,
                        max: pt.max,
                      }))}
                      direction={result.trend.direction}
                      variation_percent={result.trend.variation_12m_percent ?? 0}
                      projected_price={result.trend.projected_price_next_month ?? undefined}
                      formatCurrency={formatBRL}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Statistics card */}
              <Card className="bg-[#23262a] border-[#2d2f33]">
                <CardHeader>
                  <CardTitle className="text-white text-base">Estatísticas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {([
                      ['Média', result.statistics.mean],
                      ['Mediana', result.statistics.median],
                      ['Menor', result.statistics.min],
                      ['Maior', result.statistics.max],
                      ['CV%', null],
                      ['Desvio Padrão', result.statistics.std_deviation],
                      ['P25', result.statistics.percentile_25],
                      ['P75', result.statistics.percentile_75],
                    ] as [string, number | null][]).map(([label, value]) => (
                      <div key={label} className="bg-[#1a1c1f] rounded-lg p-3">
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="text-sm font-medium text-white mt-1">
                          {label === 'CV%'
                            ? `${result.statistics.cv_percent.toFixed(1)}%`
                            : value != null ? formatBRL(value) : '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Records table */}
              <Card className="bg-[#23262a] border-[#2d2f33]">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-white text-base">Registros</CardTitle>
                    {result.records.some((r) => !r.is_valid) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/20 text-amber-400 border border-amber-900/30">
                        {result.records.filter((r) => !r.is_valid).length} outliers excluídos das estatísticas
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/price-history/report-pdf', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              query,
                              filters: { uf: uf || undefined, modalidade: modalidade || undefined },
                              statistics: result?.statistics,
                              records: result?.records?.slice(0, 20),
                            }),
                          })
                          if (!res.ok) { alert('Erro ao gerar relatório'); return }
                          const blob = await res.blob()
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `relatorio_in65_${query.replace(/\s+/g, '_').substring(0, 30)}.docx`
                          a.click()
                          URL.revokeObjectURL(url)
                        } catch { alert('Erro ao gerar relatório') }
                      }}
                      disabled={!result || (result.records?.length || 0) < 3}
                      className="border-[#2d2f33] text-gray-300 hover:bg-[#2d2f33] hover:text-white"
                    >
                      Relatório IN 65
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExport}
                      disabled={exporting}
                      className="border-[#2d2f33] text-gray-300 hover:bg-[#2d2f33] hover:text-white"
                    >
                      {exporting ? 'Exportando...' : 'Exportar CSV'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2d2f33]">
                          <th className="text-left py-2 text-gray-400 font-medium">Data</th>
                          <th className="text-left py-2 text-gray-400 font-medium">Órgão</th>
                          <th className="text-left py-2 text-gray-400 font-medium">UF</th>
                          <th className="text-left py-2 text-gray-400 font-medium max-w-[200px]">Objeto</th>
                          <th className="text-right py-2 text-gray-400 font-medium">Valor</th>
                          <th className="text-right py-2 text-gray-400 font-medium">Desconto</th>
                          <th className="text-left py-2 text-gray-400 font-medium">Fornecedor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.records.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-gray-400">
                              Nenhum registro encontrado para esta busca.
                            </td>
                          </tr>
                        ) : (
                          result.records.map((record) => {
                            const median = result.statistics.median
                            const isExcluded = !record.is_valid
                            const valueColor = isExcluded
                              ? 'text-gray-600 line-through'
                              : record.unit_price < median
                                ? 'text-emerald-400'
                                : record.unit_price > median
                                  ? 'text-red-400'
                                  : 'text-white'
                            const discount = median > 0
                              ? ((median - record.unit_price) / median) * 100
                              : 0
                            const rowClass = isExcluded
                              ? 'border-b border-[#2d2f33]/50 opacity-50'
                              : 'border-b border-[#2d2f33]/50 hover:bg-[#2d2f33]'
                            const qtyBadge = record.item_quantity > 1
                              ? ` x${record.item_quantity}`
                              : ''
                            return (
                              <tr key={record.id} className={rowClass}>
                                <td className="py-2 text-gray-300 whitespace-nowrap">
                                  {formatDateShort(record.date_homologation)}
                                </td>
                                <td className={`py-2 max-w-[150px] truncate ${isExcluded ? 'text-gray-600' : 'text-white'}`} title={record.orgao_nome}>
                                  {record.orgao_nome}{qtyBadge && <span className="text-amber-400 text-xs ml-1">{qtyBadge}</span>}
                                </td>
                                <td className="py-2 text-gray-300">{record.orgao_uf}</td>
                                <td className={`py-2 max-w-[200px] truncate ${isExcluded ? 'text-gray-600' : 'text-gray-300'}`} title={record.item_description}>
                                  {record.item_description}
                                </td>
                                <td className={`py-2 text-right font-medium whitespace-nowrap ${valueColor}`}>
                                  {formatBRL(record.unit_price)}
                                  {isExcluded && (
                                    <span className="block text-[10px] text-amber-500 font-normal no-underline" style={{ textDecoration: 'none' }}>
                                      {record.unit_price > median ? 'Excessivamente elevado' : 'Inexequivel'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 text-right whitespace-nowrap">
                                  {isExcluded ? (
                                    <span className="text-gray-600 text-xs">--</span>
                                  ) : discount > 0 ? (
                                    <span className="text-emerald-400 text-xs">-{discount.toFixed(1)}%</span>
                                  ) : discount < 0 ? (
                                    <span className="text-red-400 text-xs">+{Math.abs(discount).toFixed(1)}%</span>
                                  ) : (
                                    <span className="text-gray-500 text-xs">-</span>
                                  )}
                                </td>
                                <td className={`py-2 max-w-[150px] truncate ${isExcluded ? 'text-gray-600' : 'text-gray-300'}`} title={record.supplier_name}>
                                  {record.supplier_name}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2d2f33]">
                      <p className="text-xs text-gray-400">
                        Página {currentPage} de {totalPages} ({result.total_count.toLocaleString('pt-BR')} resultados)
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1 || loading}
                          onClick={() => doSearch(currentPage - 1)}
                          className="border-[#2d2f33] text-gray-300 hover:bg-[#2d2f33] hover:text-white disabled:opacity-50"
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages || loading}
                          onClick={() => doSearch(currentPage + 1)}
                          className="border-[#2d2f33] text-gray-300 hover:bg-[#2d2f33] hover:text-white disabled:opacity-50"
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <SmartPricing query={query} uf={uf} modalidade={modalidade} />
              <PriceWatch />
            </div>
          )}

          {/* Tab content: Descontos */}
          {activeTab === 'descontos' && result && (
            <DiscountAnalysis query={query} uf={uf} modalidade={modalidade} dateFrom={dateFrom} dateTo={dateTo} />
          )}

          {/* Tab content: Segmentação */}
          {activeTab === 'segmentacao' && result && (
            <div className="space-y-6">
              {/* Existing breakdowns grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* By UF */}
                <Card className="bg-[#23262a] border-[#2d2f33]">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Por UF</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result.statistics.by_uf.length === 0 ? (
                      <p className="text-xs text-gray-400">Sem dados</p>
                    ) : (
                      <div className="space-y-2">
                        {result.statistics.by_uf
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 5)
                          .map((item) => (
                            <div key={item.key} className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">{item.key || 'N/I'}</span>
                              <div className="text-right">
                                <span className="text-white font-medium">{formatCompact(item.median)}</span>
                                <span className="text-gray-400 text-xs ml-2">({item.count})</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* By Modalidade */}
                <Card className="bg-[#23262a] border-[#2d2f33]">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Por Modalidade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result.statistics.by_modalidade.length === 0 ? (
                      <p className="text-xs text-gray-400">Sem dados</p>
                    ) : (
                      <div className="space-y-2">
                        {result.statistics.by_modalidade
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 5)
                          .map((item) => (
                            <div key={item.key} className="flex items-center justify-between text-sm">
                              <span className="text-gray-300 truncate max-w-[120px]" title={item.key}>{item.key || 'N/I'}</span>
                              <div className="text-right shrink-0">
                                <span className="text-white font-medium">{formatCompact(item.median)}</span>
                                <span className="text-gray-400 text-xs ml-2">({item.count})</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* By Porte */}
                <Card className="bg-[#23262a] border-[#2d2f33]">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Por Porte do Fornecedor</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result.statistics.by_porte.length === 0 ? (
                      <p className="text-xs text-gray-400">Sem dados</p>
                    ) : (
                      <div className="space-y-2">
                        {result.statistics.by_porte
                          .sort((a, b) => b.count - a.count)
                          .map((item) => (
                            <div key={item.key} className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">{item.key || 'N/I'}</span>
                              <div className="text-right">
                                <span className="text-white font-medium">{formatCompact(item.median)}</span>
                                <span className="text-gray-400 text-xs ml-2">({item.count})</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <BenchmarkGauge query={query} uf={uf} modalidade={modalidade} dateFrom={dateFrom} dateTo={dateTo} />
            </div>
          )}

          {/* Tab content: Sazonalidade */}
          {activeTab === 'sazonalidade' && result && (
            <SeasonalityAnalysis query={query} uf={uf} modalidade={modalidade} />
          )}

          {/* Tab content: Concorrentes */}
          {activeTab === 'concorrentes' && result && (
            <CompetitorProfile query={query} />
          )}

        </div>
      )}

      {/* Empty state -- no search yet */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-300 mb-2">Pesquise preços de mercado</h3>
          <p className="text-sm text-gray-500 max-w-md">
            Digite o nome do produto ou serviço para consultar preços praticados em licitações anteriores.
            Os dados vêm de mais de 185 mil editais indexados.
          </p>
        </div>
      )}
    </div>
  )
}

function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
