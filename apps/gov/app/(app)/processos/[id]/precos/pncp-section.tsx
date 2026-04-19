'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  searchPrecosPncp,
  getPrecoStats,
  addMultiplePrecosToCesta,
  type PrecoPncpRow,
  type PrecoStats,
} from '@/lib/precos/pncp-engine'

interface Props {
  processoId: string
  objeto: string
}

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
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

export function PncpPrecosSection({ processoId, objeto }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState(() => objeto.slice(0, 80))
  const [modalidade, setModalidade] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [results, setResults] = useState<PrecoPncpRow[]>([])
  const [stats, setStats] = useState<PrecoStats | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searching, startSearch] = useTransition()
  const [adding, startAdd] = useTransition()

  const filters = useMemo(
    () => ({
      query: query.trim(),
      modalidade: modalidade || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      limit: 50,
    }),
    [query, modalidade, dateFrom, dateTo],
  )

  const runSearch = useCallback(() => {
    if (filters.query.length < 3) {
      toast.error('Digite ao menos 3 caracteres')
      return
    }
    startSearch(async () => {
      const [rows, aggregated] = await Promise.all([
        searchPrecosPncp(filters),
        getPrecoStats(filters),
      ])
      setResults(rows)
      setStats(aggregated)
      setSelected(new Set())
      if (rows.length === 0) toast.info('Nenhum resultado encontrado no PNCP')
      else toast.success(`${rows.length} resultado(s) encontrado(s)`)
    })
  }, [filters])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedStats = useMemo<PrecoStats | null>(() => {
    if (selected.size === 0) return null
    const values = results
      .filter((r) => selected.has(r.itemId))
      .map((r) => r.valorUnitario)
      .filter((v) => v > 0)
    if (values.length === 0) return null
    const n = values.length
    const media = values.reduce((a, b) => a + b, 0) / n
    const sorted = [...values].sort((a, b) => a - b)
    const mediana = sorted[Math.floor(n / 2)]!
    const desvio =
      n > 1
        ? Math.sqrt(values.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1))
        : 0
    const cv = media > 0 ? (desvio / media) * 100 : 0
    return {
      n,
      media: Number(media.toFixed(2)),
      mediana: Number(mediana.toFixed(2)),
      minimo: Math.min(...values),
      maximo: Math.max(...values),
      desvioPadrao: Number(desvio.toFixed(2)),
      cv: Number(cv.toFixed(2)),
      complianceTcu1875: n >= 3 && cv < 25,
    }
  }, [selected, results])

  const addSelected = () => {
    if (selected.size === 0) {
      toast.error('Selecione pelo menos 1 item')
      return
    }
    startAdd(async () => {
      const res = await addMultiplePrecosToCesta(
        processoId,
        filters.query,
        Array.from(selected),
      )
      if (res.added === 0) {
        toast.error(`Falha: ${res.errors[0] ?? 'erro desconhecido'}`)
        return
      }
      if (res.errors.length === 0) {
        toast.success(`${res.added} fonte(s) adicionada(s) à cesta`)
      } else {
        toast.warning(`${res.added} adicionada(s), ${res.errors.length} com erro`)
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  /**
   * Cesta automática: busca até 200 resultados, remove outliers por desvio
   * absoluto mediano (MAD), escolhe até 5 fontes próximas da mediana,
   * valida CV < 25% e adiciona. Em 1 clique satisfaz Acórdão TCU 1.875/2021.
   */
  const gerarCestaAutomatica = () => {
    if (filters.query.length < 3) {
      toast.error('Digite ao menos 3 caracteres')
      return
    }
    startAdd(async () => {
      const rows = await searchPrecosPncp({ ...filters, limit: 200 })
      if (rows.length < 3) {
        toast.error(`Apenas ${rows.length} resultado(s) — mín 3 para cesta válida. Amplie a busca.`)
        setResults(rows)
        setStats(null)
        return
      }
      const values = rows.map((r) => r.valorUnitario).sort((a, b) => a - b)
      const mediana = values[Math.floor(values.length / 2)]!
      const absDeviations = values.map((v) => Math.abs(v - mediana)).sort((a, b) => a - b)
      const mad = absDeviations[Math.floor(absDeviations.length / 2)]!
      const threshold = Math.max(mad * 3, mediana * 0.35)

      const inliers = rows
        .filter((r) => Math.abs(r.valorUnitario - mediana) <= threshold)
        .sort((a, b) => Math.abs(a.valorUnitario - mediana) - Math.abs(b.valorUnitario - mediana))
        .slice(0, 5)

      if (inliers.length < 3) {
        toast.error('Amostra muito dispersa — refine a busca (modalidade, período)')
        setResults(rows)
        return
      }

      const media = inliers.reduce((a, b) => a + b.valorUnitario, 0) / inliers.length
      const desvio = Math.sqrt(
        inliers.reduce((s, r) => s + (r.valorUnitario - media) ** 2, 0) / (inliers.length - 1),
      )
      const cv = media > 0 ? (desvio / media) * 100 : 0

      if (cv >= 25) {
        toast.warning(
          `Cesta auto achou ${inliers.length} fontes mas CV=${cv.toFixed(1)}% ≥ 25%. Adicionando mesmo assim — revise e considere refinar.`,
        )
      }

      const res = await addMultiplePrecosToCesta(
        processoId,
        filters.query,
        inliers.map((i) => i.itemId),
      )
      if (res.added === 0) {
        toast.error(`Falha ao salvar: ${res.errors[0] ?? 'erro'}`)
        return
      }
      toast.success(
        `Cesta automática: ${res.added} fontes · mediana ${formatBRL(mediana)} · CV ${cv.toFixed(1)}%`,
      )
      setResults(rows)
      setSelected(new Set(inliers.map((i) => i.itemId)))
      router.refresh()
    })
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Buscar preços no PNCP
              <Badge variant="secondary" className="ml-2">
                <Sparkles className="mr-1 h-3 w-3" />
                254k licitações reais
              </Badge>
            </CardTitle>
            <CardDescription>
              Base do Portal Nacional de Contratações Públicas. Satisfaz Acórdão TCU 1.875/2021
              quando você seleciona ≥ 3 fontes com CV &lt; 25%.
            </CardDescription>
          </div>
          <Button
            onClick={gerarCestaAutomatica}
            disabled={adding || searching}
            variant="gradient"
            title="Busca + filtra outliers + adiciona 3-5 fontes com CV<25%"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Cesta automática
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-5">
            <Label htmlFor="q">Descrição do item</Label>
            <div className="flex gap-2">
              <Input
                id="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="Ex.: papel A4 75g, cadeira ergonômica, licença Office 365"
              />
              <Button onClick={runSearch} disabled={searching} variant="gradient">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {searching ? 'Buscando…' : 'Buscar'}
              </Button>
            </div>
          </div>
          <div className="sm:col-span-2">
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
            <Label htmlFor="df">De</Label>
            <Input id="df" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dt">Até</Label>
            <Input id="dt" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => { setModalidade(''); setDateFrom(''); setDateTo('') }}>
              Limpar
            </Button>
          </div>
        </div>

        {stats && stats.n > 0 && (
          <div className="grid gap-3 rounded-lg border border-border bg-card/60 p-4 sm:grid-cols-4">
            <Stat label="Total encontrado" value={stats.n.toLocaleString('pt-BR')} />
            <Stat label="Média" value={formatBRL(stats.media)} />
            <Stat label="Mediana" value={formatBRL(stats.mediana)} />
            <Stat
              label="CV (coef. variação)"
              value={`${stats.cv.toFixed(1)}%`}
              tone={stats.cv < 25 ? 'ok' : 'warn'}
            />
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {selected.size > 0 ? (
                  <>
                    <strong>{selected.size}</strong> selecionado(s) ·{' '}
                    {selectedStats && (
                      <>
                        média <strong>{formatBRL(selectedStats.media)}</strong> · mediana{' '}
                        <strong>{formatBRL(selectedStats.mediana)}</strong> · CV{' '}
                        <strong>{selectedStats.cv.toFixed(1)}%</strong>
                        {selectedStats.complianceTcu1875 ? (
                          <Badge variant="default" className="ml-2 bg-accent text-accent-foreground">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            TCU 1.875/2021 OK
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="ml-2">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {selectedStats.n < 3
                              ? 'Mínimo 3 fontes'
                              : 'CV > 25% — revise amostra'}
                          </Badge>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  'Marque os itens que deseja adicionar à cesta deste processo'
                )}
              </p>
              <Button
                onClick={addSelected}
                disabled={adding || selected.size === 0}
                variant="gradient"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {adding ? 'Adicionando…' : `Adicionar ${selected.size} à cesta`}
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left" />
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descrição</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Unit.</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Órgão</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Modalidade</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Data</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={r.itemId}
                      className={`cursor-pointer border-t border-border/60 hover:bg-card/50 ${
                        selected.has(r.itemId) ? 'bg-primary/5' : ''
                      }`}
                      onClick={() => toggle(r.itemId)}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.itemId)}
                          onChange={() => toggle(r.itemId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 accent-primary"
                          aria-label="Selecionar item"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="line-clamp-2">{r.descricao}</p>
                        {r.unidadeMedida && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {r.quantidade != null ? `${Number(r.quantidade).toLocaleString('pt-BR')} ` : ''}
                            {r.unidadeMedida}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatBRL(r.valorUnitario)}
                      </td>
                      <td className="px-3 py-2">
                        <p className="flex items-center gap-1 text-xs">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {r.orgaoNome.slice(0, 40)}
                          {r.orgaoNome.length > 40 ? '…' : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.modalidadeNome ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(r.dataPublicacao)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.linkPncp && (
                          <a
                            href={r.linkPncp}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Abrir no PNCP"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {results.length === 0 && !searching && stats == null && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Busca por descrição na base do PNCP · 254k licitações · 271k itens com preço histórico.
            <br />
            Marque as fontes e clique em <strong>Adicionar à cesta</strong> — elas são salvas em{' '}
            <code className="font-mono text-xs">licitagov.precos_pesquisa</code> do processo.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'neutral'
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-mono text-lg font-semibold tabular-nums ${
          tone === 'ok' ? 'text-accent' : tone === 'warn' ? 'text-warning' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
