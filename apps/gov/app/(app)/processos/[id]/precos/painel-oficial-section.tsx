'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  addMultiplePainelToCesta,
  getPainelStats,
  searchPainelOficial,
  syncPainelOnDemand,
  type PainelOficialRow,
  type PainelOficialStats,
} from '@/lib/precos/painel-oficial'

interface Props {
  processoId: string
  objeto: string
  codigoCatmat?: string | null
  codigoCatser?: string | null
}

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

export function PainelOficialSection({ processoId, objeto, codigoCatmat, codigoCatser }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState(() => objeto.slice(0, 80))
  const [codigo, setCodigo] = useState<string>(codigoCatmat ?? codigoCatser ?? '')
  const [results, setResults] = useState<PainelOficialRow[]>([])
  const [stats, setStats] = useState<PainelOficialStats | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searching, startSearch] = useTransition()
  const [adding, startAdd] = useTransition()

  const tipo: 'M' | 'S' | null = codigoCatmat ? 'M' : codigoCatser ? 'S' : null

  const filters = useMemo(
    () => ({
      query: query.trim() || null,
      codigo: codigo.trim() || null,
      tipo,
      meses: 24,
      limit: 100,
    }),
    [query, codigo, tipo],
  )

  const runSearch = useCallback(() => {
    if (!filters.codigo && (!filters.query || filters.query.length < 3)) {
      toast.error('Informe um código CATMAT/CATSER ou pelo menos 3 caracteres de descrição')
      return
    }
    startSearch(async () => {
      const [rows, aggregated] = await Promise.all([
        searchPainelOficial(filters),
        getPainelStats(filters),
      ])

      // On-demand sync: se não achou nada E tem código específico, busca na
      // API oficial do Compras.gov em tempo real, ingere e re-busca.
      if (rows.length === 0 && filters.codigo) {
        const detectedTipo = filters.tipo ?? (/^\d{6,}$/.test(filters.codigo) ? 'M' : 'M')
        toast.info('Buscando na fonte oficial Compras.gov.br…', { duration: 8000 })
        const syncRes = await syncPainelOnDemand({
          tipo: detectedTipo,
          codigo: filters.codigo,
        })
        if (syncRes.error) {
          toast.error(syncRes.error)
          setResults([])
          setStats(null)
          setSelected(new Set())
          return
        }
        if (syncRes.synced === 0) {
          // Tenta CATSER se CATMAT não trouxe nada
          if (detectedTipo === 'M' && !filters.tipo) {
            const syncRes2 = await syncPainelOnDemand({ tipo: 'S', codigo: filters.codigo })
            if (syncRes2.synced === 0) {
              toast.info('Código não encontrado no Painel Oficial (nem como CATMAT nem CATSER)')
              setResults([])
              setStats(null)
              setSelected(new Set())
              return
            }
          } else {
            toast.info(`Código ${filters.codigo} sem preços recentes no Painel Oficial`)
            setResults([])
            setStats(null)
            setSelected(new Set())
            return
          }
        } else {
          toast.success(`${syncRes.synced} preço(s) oficiais sincronizados da fonte`)
        }

        // Re-busca depois do sync
        const [freshRows, freshStats] = await Promise.all([
          searchPainelOficial(filters),
          getPainelStats(filters),
        ])
        setResults(freshRows)
        setStats(freshStats)
        setSelected(new Set())
        return
      }

      setResults(rows)
      setStats(aggregated)
      setSelected(new Set())
      if (rows.length === 0) {
        toast.info('Informe um CATMAT/CATSER específico pra buscar na fonte oficial')
      } else {
        toast.success(`${rows.length} preço(s) oficial(is) encontrado(s)`)
      }
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

  const selectedStats = useMemo(() => {
    if (selected.size === 0) return null
    const values = results.filter((r) => selected.has(r.id)).map((r) => r.valorUnitario)
    if (values.length === 0) return null
    const n = values.length
    const media = values.reduce((a, b) => a + b, 0) / n
    const sorted = [...values].sort((a, b) => a - b)
    const mediana = sorted[Math.floor(n / 2)]!
    const desvio = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1)) : 0
    const cv = media > 0 ? (desvio / media) * 100 : 0
    return { n, media, mediana, cv, complianceTcu1875: n >= 3 && cv < 25 }
  }, [selected, results])

  const addSelected = () => {
    if (selected.size === 0) {
      toast.error('Selecione pelo menos 1 preço')
      return
    }
    startAdd(async () => {
      const res = await addMultiplePainelToCesta(
        processoId,
        filters.query || `Preço oficial código ${filters.codigo}`,
        Array.from(selected),
      )
      if (res.added === 0) {
        toast.error(res.errors[0] ?? 'Falha')
        return
      }
      toast.success(`${res.added} preço(s) oficial(is) adicionado(s) à cesta`)
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck className="h-4 w-4 text-accent" />
              Painel de Preços Oficial
              <Badge variant="default" className="ml-2 bg-accent text-accent-foreground">
                Fonte governo.br
              </Badge>
            </CardTitle>
            <CardDescription>
              Base autoritativa do Compras.gov.br — usada no parecer AGU/CJU sem questionamento.
              Satisfaz Acórdão TCU 1.875/2021 quando amostra ≥ 3 e CV &lt; 25%.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <div>
            <Label htmlFor="painel-q">Descrição</Label>
            <Input
              id="painel-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="papel A4, cadeira ergonômica, software…"
            />
          </div>
          <div>
            <Label htmlFor="painel-codigo">Código CATMAT/CATSER (opcional)</Label>
            <Input
              id="painel-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="Ex: 140520"
              className="font-mono"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={runSearch} disabled={searching} variant="gradient" className="w-full">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
        </div>

        {stats && stats.n > 0 && (
          <div className="grid gap-3 rounded-lg border border-accent/20 bg-accent/5 p-4 sm:grid-cols-4">
            <Stat label="Total oficial" value={stats.n.toString()} />
            <Stat label="Mediana" value={formatBRL(stats.mediana)} accent />
            <Stat label="Média" value={formatBRL(stats.media)} />
            <Stat
              label="CV"
              value={`${stats.cv.toFixed(1)}%`}
              tone={stats.cv < 25 ? 'ok' : 'warn'}
            />
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {selected.size > 0 && selectedStats ? (
                  <>
                    <strong>{selected.size}</strong> selecionado(s) · mediana{' '}
                    <strong>{formatBRL(selectedStats.mediana)}</strong> · CV{' '}
                    <strong>{selectedStats.cv.toFixed(1)}%</strong>
                    {selectedStats.complianceTcu1875 && (
                      <Badge variant="default" className="ml-2 bg-accent text-accent-foreground">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        TCU 1.875 OK
                      </Badge>
                    )}
                  </>
                ) : (
                  'Marque os preços oficiais pra adicionar à cesta'
                )}
              </p>
              <Button onClick={addSelected} disabled={adding || selected.size === 0} variant="gradient">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar {selected.size} à cesta
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Preço unit.</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Órgão</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fornecedor</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Data</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={r.id}
                      className={`cursor-pointer border-t border-border/60 align-top hover:bg-card/50 ${
                        selected.has(r.id) ? 'bg-accent/5' : ''
                      }`}
                      onClick={() => toggle(r.id)}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 accent-accent"
                        />
                      </td>
                      <td className="min-w-[280px] px-3 py-3">
                        <p className="text-sm leading-snug" title={r.descricao}>{r.descricao}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {r.tipoItem === 'M' ? 'CATMAT' : 'CATSER'} {r.codigoItem}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums">
                        {formatBRL(r.valorUnitario)}
                      </td>
                      <td className="min-w-[180px] px-3 py-3">
                        <div className="flex items-start gap-1.5">
                          <Building2 className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                          <p className="line-clamp-2 text-xs" title={r.orgaoNome ?? r.uasgNome ?? ''}>
                            {r.orgaoNome ?? r.uasgNome ?? '—'}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {r.fornecedorNome?.slice(0, 40) ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(r.dataHomologacao)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {r.fonteUrl && (
                          <a
                            href={r.fonteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-accent"
                            aria-label="Fonte oficial"
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
            Painel de Preços Oficial do Compras.gov.br. Busca por CATMAT/CATSER específico.
            <br />
            Sync sob demanda: se o código não tiver dados no banco, consultamos a fonte oficial em tempo real e
            trazemos os preços na hora.
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
  accent,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'neutral'
  accent?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-mono text-lg font-semibold tabular-nums ${
          accent ? 'text-accent' : tone === 'ok' ? 'text-accent' : tone === 'warn' ? 'text-warning' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
