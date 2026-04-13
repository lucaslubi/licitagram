'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCNPJ as formatCnpj } from '@/lib/format'

export type MercadoCompetitor = {
  cnpj: string
  razao_social: string | null
  porte: string | null
  cnae_divisao: string | null
  uf: string | null
  total_participacoes: number
  total_vitorias: number
  win_rate: number
  valor_total_ganho: number
  desconto_medio: number
  ufs_atuacao: Record<string, boolean>
  ultima_participacao: string | null
  segmento_ia: string | null
  nivel_ameaca: string | null
  isWatched: boolean
  relevance_score?: number | null
  relationship_type?: string | null
  relevance_reason?: string | null
}

type SortField = 'razao_social' | 'total_participacoes' | 'total_vitorias' | 'win_rate' | 'valor_total_ganho' | 'nivel_ameaca' | 'relevance_score'
type SortDirection = 'asc' | 'desc'

const brlFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })

function nivelAmeacaOrder(nivel: string | null): number {
  if (nivel === 'alto') return 3
  if (nivel === 'medio') return 2
  if (nivel === 'baixo') return 1
  return 0
}

function RelevanceBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null
  const config: Record<string, { className: string; label: string }> = {
    concorrente_direto: { className: 'bg-red-900/20 text-red-400 border-red-900/30', label: 'Direto' },
    concorrente_indireto: { className: 'bg-yellow-900/20 text-yellow-400 border-yellow-900/30', label: 'Indireto' },
    potencial_parceiro: { className: 'bg-blue-900/20 text-blue-400 border-blue-900/30', label: 'Parceiro' },
    irrelevante: { className: 'bg-[#2d2f33] text-gray-400 border-[#2d2f33]', label: 'Irrelevante' },
  }
  const c = config[type]
  if (!c) return null
  return <Badge variant="outline" className={`text-xs ${c.className}`}>{c.label}</Badge>
}

export function RelevanceScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-[#2d2f33] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-400">{score}</span>
    </div>
  )
}

function NivelAmeacaBadge({ nivel }: { nivel: string | null }) {
  if (!nivel) return <Badge variant="outline" className="text-xs">N/D</Badge>
  const config: Record<string, { className: string; label: string }> = {
    alto: { className: 'bg-red-900/20 text-red-400 border-red-900/30', label: 'Alto' },
    medio: { className: 'bg-yellow-900/20 text-yellow-400 border-yellow-900/30', label: 'Medio' },
    baixo: { className: 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30', label: 'Baixo' },
  }
  const c = config[nivel] || { className: '', label: nivel }
  return <Badge variant="outline" className={`text-xs ${c.className}`}>{c.label}</Badge>
}

function PorteBadge({ porte }: { porte: string | null }) {
  if (!porte) return null
  const colors: Record<string, string> = {
    'ME': 'border-blue-900/30 text-blue-400 bg-blue-900/20',
    'EPP': 'border-indigo-900/30 text-indigo-400 bg-indigo-900/20',
    'MEDIO': 'border-purple-900/30 text-purple-400 bg-purple-900/20',
    'DEMAIS': 'border-[#2d2f33] text-gray-300 bg-[#1a1c1f]',
  }
  const colorClass = colors[porte.toUpperCase()] || ''
  return <Badge variant="outline" className={`text-xs ${colorClass}`}>{porte}</Badge>
}

function TrendIndicator({ ultimaParticipacao, participacoes }: { ultimaParticipacao: string | null; participacoes: number }) {
  if (!ultimaParticipacao) return <span className="text-gray-300 text-sm">--</span>
  const daysSince = Math.floor((Date.now() - new Date(ultimaParticipacao).getTime()) / (1000 * 60 * 60 * 24))
  if (daysSince <= 30 && participacoes >= 5) {
    return <span className="text-emerald-400 text-sm font-medium" title="Ativo recentemente">&#x25B2;</span>
  }
  if (daysSince <= 60) {
    return <span className="text-yellow-500 text-sm" title="Atividade moderada">&#x25AC;</span>
  }
  return <span className="text-red-400 text-sm" title="Atividade em queda">&#x25BC;</span>
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDirection }) {
  if (field !== sortField) return <span className="text-gray-300 ml-1">&#x25B4;&#x25BE;</span>
  return <span className="text-orange-500 ml-1">{sortDir === 'asc' ? '\u25B4' : '\u25BE'}</span>
}


export function MercadoSummaryCards({ competitors }: { competitors: MercadoCompetitor[] }) {
  const totalCompetitors = competitors.length
  const avgWinRate = totalCompetitors > 0
    ? competitors.reduce((sum, c) => sum + c.win_rate, 0) / totalCompetitors
    : 0
  const altoRiscoCount = competitors.filter((c) => c.nivel_ameaca === 'alto').length
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const novosUltimos30 = competitors.filter((c) => {
    if (!c.ultima_participacao) return false
    return new Date(c.ultima_participacao).getTime() >= thirtyDaysAgo
  }).length

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-400">{totalCompetitors}</p>
            <p className="text-xs text-muted-foreground mt-1">Total de Concorrentes no Segmento</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-400">{(avgWinRate * 100).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Win Rate Medio do Segmento</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-red-400">{altoRiscoCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Concorrentes de Alto Risco</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-emerald-400">{novosUltimos30}</p>
            <p className="text-xs text-muted-foreground mt-1">Ativos Ultimos 30 Dias</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function MercadoTable({ competitors }: { competitors: MercadoCompetitor[] }) {
  const [sortField, setSortField] = useState<SortField>('total_participacoes')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [segmentoFilter, setSegmentoFilter] = useState<string>('all')
  const [collapsedSegments, setCollapsedSegments] = useState<Record<string, boolean>>({})

  const segmentos = useMemo(() => {
    const set = new Set(competitors.map((c) => c.segmento_ia).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [competitors])

  const filtered = useMemo(() => {
    let data = [...competitors]
    if (segmentoFilter !== 'all') {
      data = data.filter((c) => c.segmento_ia === segmentoFilter)
    }
    data.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'razao_social':
          cmp = (a.razao_social || '').localeCompare(b.razao_social || '')
          break
        case 'total_participacoes':
          cmp = a.total_participacoes - b.total_participacoes
          break
        case 'total_vitorias':
          cmp = a.total_vitorias - b.total_vitorias
          break
        case 'win_rate':
          cmp = a.win_rate - b.win_rate
          break
        case 'valor_total_ganho':
          cmp = a.valor_total_ganho - b.valor_total_ganho
          break
        case 'nivel_ameaca':
          cmp = nivelAmeacaOrder(a.nivel_ameaca) - nivelAmeacaOrder(b.nivel_ameaca)
          break
        case 'relevance_score':
          cmp = (a.relevance_score ?? -1) - (b.relevance_score ?? -1)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return data
  }, [competitors, sortField, sortDir, segmentoFilter])

  // Group by segmento_ia
  const grouped = useMemo(() => {
    const map: Record<string, MercadoCompetitor[]> = {}
    for (const c of filtered) {
      const seg = c.segmento_ia || 'Sem segmento'
      if (!map[seg]) map[seg] = []
      map[seg].push(c)
    }
    return Object.entries(map).sort(([, a], [, b]) => b.length - a.length)
  }, [filtered])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  function toggleSegment(seg: string) {
    setCollapsedSegments((prev) => ({ ...prev, [seg]: !prev[seg] }))
  }

  const showGrouped = segmentoFilter === 'all' && segmentos.length > 0

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Segmento IA:</label>
        <select
          value={segmentoFilter}
          onChange={(e) => setSegmentoFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos ({competitors.length})</option>
          {segmentos.map((seg) => (
            <option key={seg} value={seg}>
              {seg} ({competitors.filter((c) => c.segmento_ia === seg).length})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} concorrente{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {showGrouped ? (
        // Grouped by segment view
        grouped.map(([seg, items]) => (
          <Card key={seg}>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSegment(seg)}>
              <CardTitle className="flex items-center gap-2 text-sm">
                <span className="text-base">{collapsedSegments[seg] ? '\u25B6' : '\u25BC'}</span>
                <span className="inline-block w-1.5 h-5 bg-orange-500 rounded-full" />
                {seg}
                <Badge variant="outline" className="text-xs border-orange-300 text-orange-400 ml-auto">
                  {items.length} concorrente{items.length !== 1 ? 's' : ''}
                </Badge>
              </CardTitle>
            </CardHeader>
            {!collapsedSegments[seg] && (
              <CardContent>
                <CompetitorTable items={items} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              </CardContent>
            )}
          </Card>
        ))
      ) : (
        // Flat table view (when filtered by specific segment or no segments exist)
        <Card>
          <CardContent className="pt-6">
            <CompetitorTable items={filtered} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CompetitorTable({
  items, sortField, sortDir, onSort,
}: {
  items: MercadoCompetitor[]
  sortField: SortField
  sortDir: SortDirection
  onSort: (field: SortField) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b transition-colors hover:bg-muted/50">
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-8">#</th>
            <th
              className="h-12 px-4 text-left align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-orange-400"
              onClick={() => onSort('razao_social')}
            >
              Nome <SortIcon field="razao_social" sortField={sortField} sortDir={sortDir} />
            </th>
            <th
              className="h-12 px-4 text-center align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-orange-400"
              onClick={() => onSort('total_participacoes')}
            >
              Part. <SortIcon field="total_participacoes" sortField={sortField} sortDir={sortDir} />
            </th>
            <th
              className="h-12 px-4 text-center align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-orange-400"
              onClick={() => onSort('total_vitorias')}
            >
              Vit. <SortIcon field="total_vitorias" sortField={sortField} sortDir={sortDir} />
            </th>
            <th
              className="h-12 px-4 text-center align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-orange-400"
              onClick={() => onSort('win_rate')}
            >
              Win Rate <SortIcon field="win_rate" sortField={sortField} sortDir={sortDir} />
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-orange-400 hidden md:table-cell"
              onClick={() => onSort('valor_total_ganho')}
            >
              Valor Ganho <SortIcon field="valor_total_ganho" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Porte</th>
            <th
              className="h-12 px-4 text-center align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-orange-400"
              onClick={() => onSort('relevance_score')}
            >
              Relev. <SortIcon field="relevance_score" sortField={sortField} sortDir={sortDir} />
            </th>
            <th
              className="h-12 px-4 text-center align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-orange-400"
              onClick={() => onSort('nivel_ameaca')}
            >
              Ameaca <SortIcon field="nivel_ameaca" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Tend.</th>
            <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground hidden lg:table-cell">UFs</th>
            <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground w-8"></th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {items.map((mc, i) => {
            const winRatePct = (mc.win_rate * 100).toFixed(1)
            const winRateColor = mc.win_rate >= 0.6 ? 'text-emerald-400' : mc.win_rate >= 0.3 ? 'text-yellow-400' : 'text-red-400'
            const topUfs = Object.keys(mc.ufs_atuacao || {}).slice(0, 4)

            return (
              <tr key={mc.cnpj} className="border-b transition-colors hover:bg-muted/50">
                <td className="p-4 font-bold text-muted-foreground">{i + 1}</td>
                <td className="p-4 text-sm font-medium">
                  {mc.razao_social || formatCnpj(mc.cnpj)}
                  {mc.cnae_divisao && (
                    <span className="block text-xs text-gray-400 mt-0.5">CNAE Div. {mc.cnae_divisao}</span>
                  )}
                </td>
                <td className="p-4 text-center">{mc.total_participacoes}</td>
                <td className="p-4 text-center">
                  <Badge variant={mc.total_vitorias > 0 ? 'default' : 'secondary'}>{mc.total_vitorias}</Badge>
                </td>
                <td className={`p-4 text-center font-bold ${winRateColor}`}>{winRatePct}%</td>
                <td className="p-4 text-right text-sm hidden md:table-cell">
                  {mc.valor_total_ganho > 0 ? brlFormat.format(mc.valor_total_ganho) : '-'}
                </td>
                <td className="p-4 text-sm hidden md:table-cell">
                  <PorteBadge porte={mc.porte} />
                </td>
                <td className="p-4 text-center">
                  {mc.relevance_score != null ? (
                    <div className="flex flex-col items-center gap-1">
                      <RelevanceScoreBadge score={mc.relevance_score} />
                      <RelevanceBadge type={mc.relationship_type} />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">--</span>
                  )}
                </td>
                <td className="p-4 text-center">
                  <NivelAmeacaBadge nivel={mc.nivel_ameaca} />
                </td>
                <td className="p-4 text-center">
                  <TrendIndicator ultimaParticipacao={mc.ultima_participacao} participacoes={mc.total_participacoes} />
                </td>
                <td className="p-4 text-center hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1 justify-center">
                    {topUfs.map((uf) => (
                      <Badge key={uf} variant="outline" className="text-xs font-mono">{uf}</Badge>
                    ))}
                  </div>
                </td>
                <td className="p-4 text-center">
                  {mc.isWatched && (
                    <span className="text-orange-500 text-lg" title="Na sua watchlist">&#9733;</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
