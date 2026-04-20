'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Pencil,
  Save,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  montarCestaIA,
  calcCestaStats,
  salvarCestaIA,
  type CestaFonte,
  type CestaStats,
} from '@/lib/precos/cesta-ia'
import { finalizarPesquisaPrecosAction } from '@/lib/precos/actions'

interface Props {
  processoId: string
  objeto: string
  modalidadePreferida?: string | null
}

const METODOS: Array<{ value: 'media' | 'mediana' | 'menor'; label: string; hint: string }> = [
  { value: 'mediana', label: 'Mediana', hint: 'Recomendado pela IN SEGES 65/2021 — robusto a outliers' },
  { value: 'media', label: 'Média aritmética', hint: 'Apropriado quando a amostra é homogênea (CV baixo)' },
  { value: 'menor', label: 'Menor valor', hint: 'Mais conservador — só use com justificativa específica' },
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

export function CestaInteligenteSection({ processoId, objeto, modalidadePreferida }: Props) {
  const router = useRouter()
  const [descricao, setDescricao] = useState(objeto.slice(0, 200))
  const [qtd, setQtd] = useState<string>('')
  const [metodo, setMetodo] = useState<'media' | 'mediana' | 'menor'>('mediana')
  const [fontes, setFontes] = useState<CestaFonte[]>([])
  const [removidas, setRemovidas] = useState<Set<string>>(new Set())
  const [narrativa, setNarrativa] = useState<string>('')
  const [narrativaEditada, setNarrativaEditada] = useState(false)
  const [editandoNarrativa, setEditandoNarrativa] = useState(false)
  const [montando, startMontando] = useTransition()
  const [justificando, setJustificando] = useState(false)
  const [salvando, startSalvando] = useTransition()

  const fontesAtivas = useMemo(
    () => fontes.filter((f) => !removidas.has(f.refId)),
    [fontes, removidas],
  )

  const stats = useMemo<CestaStats>(() => {
    if (fontesAtivas.length === 0) {
      return { n: 0, media: 0, mediana: 0, menor: 0, maior: 0, desvio: 0, cv: 0, complianceTcu1875: false }
    }
    const valores = fontesAtivas.map((f) => f.valorUnitario).sort((a, b) => a - b)
    const n = valores.length
    const media = valores.reduce((s, v) => s + v, 0) / n
    const mediana = n % 2 === 1 ? valores[(n - 1) / 2]! : (valores[n / 2 - 1]! + valores[n / 2]!) / 2
    const desvio = n > 1 ? Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1)) : 0
    const cv = media > 0 ? (desvio / media) * 100 : 0
    return {
      n,
      media,
      mediana,
      menor: valores[0]!,
      maior: valores[n - 1]!,
      desvio,
      cv,
      complianceTcu1875: n >= 3 && cv < 25,
    }
  }, [fontesAtivas])

  const valorFinal = useMemo(() => {
    if (metodo === 'media') return stats.media
    if (metodo === 'menor') return stats.menor
    return stats.mediana
  }, [metodo, stats])

  const montar = useCallback(() => {
    if (!descricao || descricao.trim().length < 3) {
      toast.error('Informe a descrição do item (mínimo 3 caracteres)')
      return
    }
    startMontando(async () => {
      const rows = await montarCestaIA({
        query: descricao.trim(),
        qtd: qtd ? Number(qtd) : null,
        modalidadePreferida: modalidadePreferida ?? null,
        mesesBack: 24,
        maxFontes: 8,
      })
      setFontes(rows)
      setRemovidas(new Set())
      setNarrativa('')
      setNarrativaEditada(false)

      if (rows.length === 0) {
        toast.info('Nenhuma contratação análoga encontrada. Amplie a descrição ou verifique CATMAT/CATSER.')
        return
      }
      if (rows.length < 3) {
        toast.warning(`Apenas ${rows.length} fonte(s) relevante(s). Acórdão TCU 1.875 exige ≥ 3.`)
      } else {
        toast.success(`${rows.length} fontes ranqueadas · mediana ${formatBRL(calcMediana(rows))}`)
      }
    })
  }, [descricao, qtd, modalidadePreferida])

  const gerarNarrativa = useCallback(async () => {
    if (fontesAtivas.length === 0) {
      toast.error('Monte a cesta primeiro')
      return
    }
    setJustificando(true)
    setNarrativa('')
    setNarrativaEditada(false)
    try {
      const res = await fetch('/api/ai/justificar-cesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processoId,
          itemDescricao: descricao,
          objeto,
          fontes: fontesAtivas,
          stats,
          metodo,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      if (!res.body) throw new Error('Sem stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const parsed = JSON.parse(payload) as { text?: string; error?: string }
            if (parsed.error) {
              toast.error(parsed.error)
              return
            }
            if (parsed.text) setNarrativa((prev) => prev + parsed.text)
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao gerar narrativa')
    } finally {
      setJustificando(false)
    }
  }, [processoId, descricao, objeto, fontesAtivas, stats, metodo])

  const salvar = () => {
    if (fontesAtivas.length < 3) {
      toast.error('Mínimo 3 fontes (Acórdão TCU 1.875/2021)')
      return
    }
    if (!narrativa || narrativa.trim().length < 50) {
      toast.error('Gere ou escreva a narrativa antes de salvar')
      return
    }
    startSalvando(async () => {
      const res = await salvarCestaIA({
        processoId,
        itemDescricao: descricao,
        fontes: fontesAtivas,
        metodo,
        narrativa,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Cesta salva. Avançando pro TR com narrativa injetada.')
      // Avança fase
      const advRes = await finalizarPesquisaPrecosAction(processoId)
      if (advRes.ok) {
        router.push(`/processos/${processoId}/tr`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-accent" />
              Cesta de Preços · IA
            </CardTitle>
            <CardDescription>
              Informe o item e a IA busca contratações análogas (PNCP + Painel Oficial), ranqueia por relevância
              (similaridade, data, modalidade, quantidade) e gera a justificativa técnico-jurídica pronta pra
              ETP/TR (Acórdão TCU 1.875/2021).
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Input */}
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
          <div>
            <Label htmlFor="cesta-desc">Descrição do item</Label>
            <Input
              id="cesta-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="papel A4 75g 500 folhas"
            />
          </div>
          <div>
            <Label htmlFor="cesta-qtd">Quantidade (opcional)</Label>
            <Input
              id="cesta-qtd"
              value={qtd}
              onChange={(e) => setQtd(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="200"
              className="font-mono"
              inputMode="decimal"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={montar} disabled={montando} variant="gradient" className="w-full">
              {montando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {montando ? 'Montando…' : 'Montar cesta com IA'}
            </Button>
          </div>
        </div>

        {/* Stats + método */}
        {fontes.length > 0 && (
          <>
            <div className="grid gap-3 rounded-md border border-accent/20 bg-accent/5 p-4 sm:grid-cols-5">
              <Stat label="Fontes" value={stats.n.toString()} />
              <Stat label="Mediana" value={formatBRL(stats.mediana)} accent />
              <Stat label="Média" value={formatBRL(stats.media)} />
              <Stat label="CV" value={`${stats.cv.toFixed(1)}%`} tone={stats.cv < 25 ? 'ok' : 'warn'} />
              <Stat label="Valor final" value={formatBRL(valorFinal)} accent strong />
            </div>

            {stats.complianceTcu1875 ? (
              <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-xs">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  Atende Acórdão TCU 1.875/2021: ≥3 fontes com CV &lt; 25%. Essa cesta pode fundamentar o valor
                  estimado no ETP e TR sem questionamento.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span className="text-muted-foreground">
                  {stats.n < 3
                    ? `Apenas ${stats.n} fonte(s). Acórdão TCU 1.875 exige ≥3. Amplie a descrição ou aceite mais fontes.`
                    : `CV = ${stats.cv.toFixed(1)}% (>25%). Remova outliers ou justifique a dispersão elevada.`}
                </span>
              </div>
            )}

            {/* Método */}
            <div className="space-y-2">
              <Label>Método de cálculo do valor final</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {METODOS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMetodo(m.value)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      metodo === m.value
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:border-accent/40 hover:bg-muted/40'
                    }`}
                  >
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{m.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Fontes selecionadas */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Fontes selecionadas pela IA</h3>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-card text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Origem · Órgão · Modalidade</th>
                      <th className="px-3 py-2 text-right font-medium">Valor</th>
                      <th className="px-3 py-2 text-left font-medium">Data</th>
                      <th className="w-12 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {fontes.map((f) => {
                      const removed = removidas.has(f.refId)
                      return (
                        <tr
                          key={f.refId}
                          className={`border-t border-border/60 align-top ${
                            removed ? 'opacity-40' : ''
                          }`}
                        >
                          <td className="min-w-[320px] px-3 py-3">
                            <div className="flex items-start gap-1.5">
                              {f.origem === 'painel_oficial' ? (
                                <BadgeCheck className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                              ) : (
                                <Building2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm">{f.orgaoNome ?? '—'}</p>
                                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                                  {f.justificativa}
                                </p>
                                {f.modalidade && (
                                  <Badge variant="outline" className="mt-1 text-[10px]">
                                    {f.modalidade}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums">
                            {formatBRL(f.valorUnitario)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(f.dataReferencia)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <div className="flex items-center gap-1">
                              {f.linkFonte && (
                                <a
                                  href={f.linkFonte}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-accent"
                                  aria-label="Fonte"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setRemovidas((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(f.refId)) next.delete(f.refId)
                                    else next.add(f.refId)
                                    return next
                                  })
                                }
                                className="ml-1 text-muted-foreground hover:text-destructive"
                                aria-label={removed ? 'Reincluir fonte' : 'Remover fonte'}
                                title={removed ? 'Reincluir' : 'Remover do cálculo'}
                              >
                                {removed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Narrativa */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Narrativa técnico-jurídica</h3>
                <div className="flex gap-2">
                  <Button
                    onClick={gerarNarrativa}
                    disabled={justificando || fontesAtivas.length === 0}
                    variant="outline"
                    size="sm"
                  >
                    {justificando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {narrativa ? 'Regenerar' : 'Gerar com IA'}
                  </Button>
                  {narrativa && !editandoNarrativa && (
                    <Button onClick={() => setEditandoNarrativa(true)} variant="outline" size="sm">
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  )}
                </div>
              </div>

              {editandoNarrativa ? (
                <textarea
                  value={narrativa}
                  onChange={(e) => {
                    setNarrativa(e.target.value)
                    setNarrativaEditada(true)
                  }}
                  className="min-h-[200px] w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed focus:border-accent focus:outline-none"
                  placeholder="A IA ainda não gerou narrativa, ou escreva manualmente aqui."
                />
              ) : narrativa ? (
                <div className="prose-document rounded-md border border-border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {narrativa}
                  {narrativaEditada && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      editada manualmente
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Clique em &quot;Gerar com IA&quot; para produzir a narrativa fundamentando a cesta.
                  <br />
                  Ela vai automaticamente pro ETP (alínea VI), TR (alínea I) e Parecer.
                </p>
              )}

              {editandoNarrativa && (
                <div className="flex justify-end">
                  <Button onClick={() => setEditandoNarrativa(false)} variant="outline" size="sm">
                    <Save className="h-3.5 w-3.5" />
                    Concluir edição
                  </Button>
                </div>
              )}
            </div>

            {/* CTA salvar */}
            <div className="flex items-center justify-between rounded-md border border-accent/30 bg-accent/5 p-4">
              <div>
                <p className="text-sm font-medium">Salvar cesta e avançar para TR</p>
                <p className="text-xs text-muted-foreground">
                  A narrativa será injetada no contexto do ETP, TR e Parecer.
                </p>
              </div>
              <Button
                onClick={salvar}
                disabled={salvando || fontesAtivas.length < 3 || !narrativa || narrativa.length < 50}
                variant="gradient"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Salvar e elaborar TR
              </Button>
            </div>
          </>
        )}

        {fontes.length === 0 && !montando && (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Clique em <strong>Montar cesta com IA</strong> para buscar e ranquear contratações análogas. A IA
            elimina outliers, prioriza fontes recentes e do Painel Oficial, e gera a justificativa pronta pros
            documentos seguintes.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function calcMediana(rows: CestaFonte[]): number {
  const v = rows.map((r) => r.valorUnitario).sort((a, b) => a - b)
  const n = v.length
  if (n === 0) return 0
  if (n % 2 === 1) return v[(n - 1) / 2]!
  return (v[n / 2 - 1]! + v[n / 2]!) / 2
}

function Stat({
  label,
  value,
  tone = 'neutral',
  accent,
  strong,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'neutral'
  accent?: boolean
  strong?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-mono font-semibold tabular-nums ${strong ? 'text-lg' : 'text-base'} ${
          accent ? 'text-accent' : tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
