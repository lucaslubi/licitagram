'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Search, ShieldAlert, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  searchHistoricoPrecos,
  saveCestaAction,
  finalizarPesquisaPrecosAction,
  type HistoricoMatch,
  type EstimativaRow,
} from '@/lib/precos/actions'
import { ArrowRight } from 'lucide-react'

interface Props {
  processoId: string
  objeto: string
  estimativas: EstimativaRow[]
}

interface SelectedSource {
  id: string // local key
  origin: 'historico' | 'manual'
  fonte: 'contratacoes_similares' | 'fornecedor_direto'
  valor: string
  fornecedor: string | null
  link: string | null
  dataReferencia: string | null
  outlier: boolean
}

function formatBRL(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PrecosClient({ processoId, objeto, estimativas }: Props) {
  const router = useRouter()
  const [keywords, setKeywords] = useState(objeto.slice(0, 80))
  const [todosOrgaos, setTodosOrgaos] = useState(true)
  const [results, setResults] = useState<HistoricoMatch[] | null>(null)
  const [searching, startSearch] = useTransition()
  const [saving, startSave] = useTransition()
  const [advancing, startAdvance] = useTransition()
  const [sources, setSources] = useState<SelectedSource[]>([])
  const [metodo, setMetodo] = useState<'media' | 'mediana' | 'menor'>('mediana')
  const [itemLabel, setItemLabel] = useState(objeto.slice(0, 200))

  const advanceToTr = () => {
    startAdvance(async () => {
      const res = await finalizarPesquisaPrecosAction(processoId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Pesquisa de preços finalizada. Avançando para elaboração do TR.')
      router.push(`/processos/${processoId}/tr`)
    })
  }

  const runSearch = () => {
    startSearch(async () => {
      const data = await searchHistoricoPrecos(processoId, keywords, todosOrgaos)
      setResults(data)
      if (data.length === 0) toast.info('Sem matches no histórico PNCP.')
    })
  }

  const addFromHistorico = (m: HistoricoMatch) => {
    const valor = m.valorHomologado ?? m.valorEstimado ?? 0
    if (!valor || valor <= 0) return
    setSources((prev) => [
      ...prev,
      {
        id: `hist:${m.tenderId}`,
        origin: 'historico',
        fonte: 'contratacoes_similares',
        valor: String(valor),
        fornecedor: m.orgaoNome ?? null,
        link: null,
        dataReferencia: m.dataPublicacao ? m.dataPublicacao.slice(0, 10) : null,
        outlier: false,
      },
    ])
    toast.success('Fonte adicionada à cesta')
  }

  const addManual = () => {
    setSources((prev) => [
      ...prev,
      {
        id: `man:${Math.random().toString(36).slice(2)}`,
        origin: 'manual',
        fonte: 'fornecedor_direto',
        valor: '',
        fornecedor: '',
        link: '',
        dataReferencia: null,
        outlier: false,
      },
    ])
  }

  const update = (id: string, patch: Partial<SelectedSource>) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id))
  }

  const save = () => {
    const fontes = sources
      .filter((s) => Number(s.valor) > 0)
      .map((s) => ({
        fonte: s.fonte,
        valor_unitario: Number(s.valor),
        data_referencia: s.dataReferencia ?? null,
        fornecedor_nome: s.fornecedor ?? null,
        link_fonte: s.link ?? null,
        outlier: s.outlier,
        considerado_no_calculo: true,
      }))

    if (fontes.length < 3) {
      toast.error(
        'Cesta de preços (Acórdão 1.875/2021-TCU) exige mínimo 3 fontes. Adicione mais.',
      )
      return
    }
    startSave(async () => {
      const res = await saveCestaAction(processoId, itemLabel, fontes, metodo)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Cesta salva. Valor estimado: ${formatBRL(res.result.valor_final)}`)
      router.refresh()
      setSources([])
      setResults(null)
    })
  }

  const numValid = sources.filter((s) => Number(s.valor) > 0).length

  return (
    <div className="space-y-6">
      {estimativas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estimativas salvas</CardTitle>
            <CardDescription>Valor de referência calculado por item</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {estimativas.map((e) => (
              <div key={`${e.itemDescricao}-${e.calculadoEm}`} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{e.itemDescricao}</p>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                  <Stat label="Valor final" value={formatBRL(e.valorFinal)} highlight />
                  <Stat label="Método" value={e.metodo} />
                  <Stat label="Amostras" value={String(e.qtdAmostras)} />
                  <Stat label="Coef. var" value={e.cv != null ? `${e.cv.toFixed(1)}%` : '—'} />
                  <Stat label="Menor" value={formatBRL(e.menor)} />
                  <Stat label="Mediana" value={formatBRL(e.mediana)} />
                  <Stat label="Média" value={formatBRL(e.media)} />
                  <Stat label="Maior" value={formatBRL(e.maior)} />
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div>
                <p className="text-sm font-medium">Pesquisa de preços concluída?</p>
                <p className="text-xs text-muted-foreground">
                  Avance para elaboração do Termo de Referência — o TR herdará estas estimativas na alínea I.
                </p>
              </div>
              <Button onClick={advanceToTr} disabled={advancing} variant="gradient">
                {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Elaborar TR
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" /> 1. Buscar no PNCP
          </CardTitle>
          <CardDescription>
            Fonte prioritária (art. 23 §1º I). Cobre contratos análogos em órgãos públicos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="Palavras-chave (ex: papel A4 75g)"
              disabled={searching}
            />
            <Button onClick={runSearch} disabled={searching || keywords.length < 3}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={todosOrgaos}
              onChange={(e) => setTodosOrgaos(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Incluir outros órgãos públicos (recomendado — aumenta a base)
          </label>

          {results !== null && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {results.length === 0 && (
                <li className="p-3 text-center text-xs text-muted-foreground">
                  Sem matches. Tente palavras-chave diferentes ou adicione fontes manualmente abaixo.
                </li>
              )}
              {results.map((m) => {
                const valor = m.valorHomologado ?? m.valorEstimado
                const dispo = typeof valor === 'number' && valor > 0
                return (
                  <li key={m.tenderId} className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm">{m.objeto}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {m.orgaoNome && <span>{m.orgaoNome}</span>}
                        {m.uf && (
                          <>
                            <span>·</span>
                            <span>{m.uf}</span>
                          </>
                        )}
                        {m.modalidadeNome && (
                          <>
                            <span>·</span>
                            <span>{m.modalidadeNome}</span>
                          </>
                        )}
                        {m.dataPublicacao && (
                          <>
                            <span>·</span>
                            <span>{new Date(m.dataPublicacao).toLocaleDateString('pt-BR')}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <p className="font-mono text-sm font-semibold">{formatBRL(valor)}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addFromHistorico(m)}
                        disabled={!dispo}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Adicionar
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Montar cesta</CardTitle>
          <CardDescription>
            Mínimo 3 fontes (Acórdão 1.875/2021-TCU). Combine histórico PNCP + fornecedor direto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="item-label">Item da cesta</Label>
            <Input id="item-label" value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} />
          </div>
          {sources.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Nenhuma fonte selecionada. Busque acima ou adicione manual.
            </p>
          )}
          {sources.map((s) => (
            <div key={s.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {s.origin === 'historico' ? 'Histórico PNCP' : 'Manual'} · {s.fonte}
                </Badge>
                <button
                  type="button"
                  onClick={() => removeSource(s.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  remover
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Valor unitário (R$)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={s.valor}
                    onChange={(e) => update(s.id, { valor: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fornecedor / órgão</Label>
                  <Input
                    value={s.fornecedor ?? ''}
                    onChange={(e) => update(s.id, { fornecedor: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data referência</Label>
                  <Input
                    type="date"
                    value={s.dataReferencia ?? ''}
                    onChange={(e) => update(s.id, { dataReferencia: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Link da fonte</Label>
                  <Input
                    placeholder="https://..."
                    value={s.link ?? ''}
                    onChange={(e) => update(s.id, { link: e.target.value || null })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={s.outlier}
                  onChange={(e) => update(s.id, { outlier: e.target.checked })}
                />
                Marcar como outlier (excluir do cálculo estatístico)
              </label>
            </div>
          ))}
          <Button variant="outline" onClick={addManual} className="w-full">
            + Adicionar fonte manual
          </Button>
        </CardContent>
      </Card>

      <Card className={numValid < 3 ? 'border-warning/30 bg-warning/5' : ''}>
        <CardHeader>
          <CardTitle className="text-base">3. Consolidar estimativa</CardTitle>
          <CardDescription>
            {numValid < 3 ? (
              <span className="text-warning">
                <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
                Ainda {3 - numValid} fonte(s) para atingir o mínimo TCU.
              </span>
            ) : (
              `${numValid} fontes válidas. Escolha o método de consolidação.`
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(['media', 'mediana', 'menor'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodo(m)}
                className={`rounded-lg border p-2.5 text-center transition-colors ${
                  metodo === m ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'
                }`}
              >
                <p className="font-medium capitalize">{m === 'mediana' ? 'Mediana' : m === 'media' ? 'Média' : 'Menor'}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {m === 'mediana'
                    ? 'Resistente a outliers'
                    : m === 'media'
                      ? 'Valor central aritmético'
                      : 'Conservador — melhor preço'}
                </p>
              </button>
            ))}
          </div>

          <Button onClick={save} disabled={saving || numValid < 3} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar e calcular estimativa'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md bg-secondary/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-mono text-sm ${highlight ? 'font-semibold text-primary' : ''}`}>{value}</p>
    </div>
  )
}
