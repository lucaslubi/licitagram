'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  ListPlus,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitSetorItensAction } from '@/lib/pca/public-actions'

interface Item {
  id: string
  descricao: string
  quantidade: string
  unidadeMedida: string
  mesDemanda: string
  justificativa: string
  categoria: string | null
  aiNormalized: boolean
}

const newItem = (partial?: Partial<Item>): Item => ({
  id: Math.random().toString(36).slice(2),
  descricao: '',
  quantidade: '',
  unidadeMedida: '',
  mesDemanda: '',
  justificativa: '',
  categoria: null,
  aiNormalized: false,
  ...partial,
})

interface Suggestion {
  descricao: string
  unidade: string | null
  categoria: string | null
}

type Step = 0 | 1 | 2 | 3

interface Props {
  token: string
  setorNome: string
  prazoIso: string
  previouslyResponded: boolean
}

export function PublicForm({ token, setorNome, prazoIso, previouslyResponded }: Props) {
  const storageKey = useMemo(() => `pca-draft:${token.slice(0, 16)}`, [token])
  const [step, setStep] = useState<Step>(0)
  const [items, setItems] = useState<Item[]>([newItem()])
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [loadingSug, setLoadingSug] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: Item[]; step?: Step }
        if (parsed.items && parsed.items.length > 0) setItems(parsed.items)
        if (typeof parsed.step === 'number' && parsed.step >= 0 && parsed.step <= 3) {
          setStep(parsed.step as Step)
        }
      }
    } catch {
      /* ignore */
    }
  }, [storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ items, step }))
      } catch {
        /* ignore */
      }
    }, 500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [items, step, storageKey])

  const add = () => setItems((prev) => [...prev, newItem()])
  const remove = (id: string) => setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev))
  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const loadSuggestions = async () => {
    setLoadingSug(true)
    try {
      const res = await fetch('/api/ai/suggest-items-from-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, setorNome }),
      })
      if (!res.ok) {
        setSuggestions([])
        return
      }
      const data = (await res.json()) as { sugestoes?: Suggestion[] }
      setSuggestions(data.sugestoes ?? [])
    } catch {
      setSuggestions([])
    } finally {
      setLoadingSug(false)
    }
  }

  const acceptSuggestion = (s: Suggestion) => {
    setItems((prev) => [
      ...prev.filter((i) => i.descricao.trim()),
      newItem({
        descricao: s.descricao,
        unidadeMedida: s.unidade ?? '',
        categoria: s.categoria,
      }),
    ])
    toast.success(`"${s.descricao.slice(0, 40)}..." adicionado`)
  }

  const normalizeOne = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item || item.descricao.trim().length < 5) return
    try {
      const res = await fetch('/api/ai/normalize-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: item.descricao }),
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        descricaoNormalizada?: string | null
        unidade?: string | null
        categoria?: string | null
      }
      update(id, {
        unidadeMedida: item.unidadeMedida || data.unidade || '',
        categoria: data.categoria ?? item.categoria,
        aiNormalized: true,
      })
    } catch {
      /* silent */
    }
  }

  const submit = () => {
    const valid = items.filter((i) => i.descricao.trim().length >= 3)
    if (valid.length === 0) {
      toast.error('Adicione ao menos 1 item com descrição de 3+ caracteres.')
      return
    }
    startTransition(async () => {
      const res = await submitSetorItensAction(
        token,
        valid.map((i) => ({
          descricaoLivre: i.descricao,
          quantidade: i.quantidade ? Number(i.quantidade) : null,
          unidadeMedida: i.unidadeMedida || null,
          mesDemanda: i.mesDemanda ? Number(i.mesDemanda) : null,
          justificativa: i.justificativa || null,
        })),
      )
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
      setDone(true)
      toast.success(`${res.inserted} itens enviados`)
    })
  }

  const prazoLabel = new Date(prazoIso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const validItems = items.filter((i) => i.descricao.trim().length >= 3)

  if (done) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-accent" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Demanda enviada</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Obrigado! O responsável do órgão recebe uma notificação e a IA consolida a coleta.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Stepper step={step} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden /> Prazo {prazoLabel}
        </Badge>
        {previouslyResponded && (
          <Badge variant="outline" className="border-warning/30 bg-warning/5 text-warning">
            Já respondido antes — novo envio substitui
          </Badge>
        )}
      </div>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-primary" /> Vamos lá
            </CardTitle>
            <CardDescription>
              Esta coleta leva ~10 minutos e é mobile-first. Seu progresso é salvo automaticamente no navegador enquanto você digita.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-bold text-primary">1.</span>
                <span>Vemos se há histórico do seu órgão no PNCP — se sim, a IA sugere itens pra você só confirmar.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-bold text-primary">2.</span>
                <span>Você adiciona ou edita os itens. Descrição + quantidade + unidade é o mínimo.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-bold text-primary">3.</span>
                <span>Confere o resumo e envia. Pode refazer — cada envio substitui o anterior.</span>
              </li>
            </ul>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(1)}>
                Começar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Sugestões do histórico
            </CardTitle>
            <CardDescription>
              A IA olha compras passadas do órgão no PNCP e sugere itens que podem fazer sentido pra você.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions === null ? (
              <Button onClick={loadSuggestions} variant="outline" disabled={loadingSug} className="w-full">
                {loadingSug ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {loadingSug ? 'Buscando...' : 'Buscar sugestões'}
              </Button>
            ) : suggestions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Sem histórico relevante encontrado. Pode seguir adicionando itens manualmente.
              </p>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{s.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.categoria && <span>{s.categoria}</span>}
                        {s.categoria && s.unidade && <span> · </span>}
                        {s.unidade && <span>Unidade: {s.unidade}</span>}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => acceptSuggestion(s)}>
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Footer back={() => setStep(0)} forward={() => setStep(2)} />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Itens do setor ({items.length})</h2>
            <Button variant="outline" size="sm" onClick={add}>
              <ListPlus className="h-4 w-4" /> Adicionar
            </Button>
          </header>

          {items.map((item, index) => (
            <Card key={item.id}>
              <CardContent className="space-y-3 p-4">
                <header className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Item {index + 1}
                    {item.categoria && (
                      <Badge variant="outline" className="font-normal normal-case">
                        {item.categoria}
                      </Badge>
                    )}
                    {item.aiNormalized && (
                      <Badge variant="outline" className="border-primary/30 bg-primary/5 font-normal normal-case text-primary">
                        <Sparkles className="h-3 w-3" /> IA
                      </Badge>
                    )}
                  </p>
                  {items.length > 1 && (
                    <Button
                      type="button" variant="ghost" size="icon"
                      onClick={() => remove(item.id)} aria-label="Remover item"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </header>
                <div className="space-y-1.5">
                  <Label htmlFor={`desc-${item.id}`}>Descrição</Label>
                  <Input
                    id={`desc-${item.id}`}
                    placeholder="Ex: papel A4 75g, resma com 500 folhas"
                    value={item.descricao}
                    onChange={(e) => update(item.id, { descricao: e.target.value, aiNormalized: false })}
                    onBlur={() => normalizeOne(item.id)}
                    disabled={pending}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`qtd-${item.id}`}>Quantidade</Label>
                    <Input
                      id={`qtd-${item.id}`}
                      inputMode="decimal"
                      placeholder="100"
                      value={item.quantidade}
                      onChange={(e) => update(item.id, { quantidade: e.target.value })}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`um-${item.id}`}>Unidade</Label>
                    <Input
                      id={`um-${item.id}`}
                      placeholder="resma / litro / und"
                      value={item.unidadeMedida}
                      onChange={(e) => update(item.id, { unidadeMedida: e.target.value })}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`mes-${item.id}`}>Mês (1-12)</Label>
                    <Input
                      id={`mes-${item.id}`}
                      inputMode="numeric"
                      placeholder="03"
                      maxLength={2}
                      value={item.mesDemanda}
                      onChange={(e) => update(item.id, { mesDemanda: e.target.value.replace(/\D/g, '') })}
                      disabled={pending}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`just-${item.id}`}>Justificativa (opcional)</Label>
                  <Input
                    id={`just-${item.id}`}
                    placeholder="Motivo / referência de processo anterior"
                    value={item.justificativa}
                    onChange={(e) => update(item.id, { justificativa: e.target.value })}
                    disabled={pending}
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="outline" onClick={add} className="w-full" disabled={pending}>
            <Plus className="h-4 w-4" /> Adicionar item
          </Button>

          <Footer back={() => setStep(1)} forward={() => setStep(3)} forwardDisabled={validItems.length === 0} />
        </div>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" /> Confirme e envie
            </CardTitle>
            <CardDescription>
              {validItems.length} itens válidos de {setorNome}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {validItems.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.quantidade ? `${i.quantidade} ${i.unidadeMedida || ''}` : 'sem qtd'}
                      {i.mesDemanda && ` · mês ${i.mesDemanda}`}
                      {i.categoria && ` · ${i.categoria}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <Footer
              back={() => setStep(2)}
              forward={submit}
              forwardLabel={pending ? 'Enviando...' : 'Enviar demanda'}
              forwardIcon={pending ? Loader2 : Send}
              forwardDisabled={pending || validItems.length === 0}
              spinning={pending}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stepper({ step }: { step: Step }) {
  const labels = ['Início', 'Sugestões', 'Itens', 'Enviar']
  return (
    <ol className="flex items-center gap-2 overflow-x-auto text-[11px] sm:text-xs">
      {labels.map((label, i) => {
        const active = i === step
        const done = i < step
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                done
                  ? 'border-accent bg-accent text-accent-foreground'
                  : active
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={active ? 'font-medium text-foreground' : 'text-muted-foreground'}>{label}</span>
            {i < labels.length - 1 && <span className="ml-1 h-px flex-1 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}

function Footer({
  back,
  forward,
  forwardLabel = 'Continuar',
  forwardIcon: ForwardIcon = ArrowRight,
  forwardDisabled,
  spinning = false,
}: {
  back?: () => void
  forward: () => void
  forwardLabel?: string
  forwardIcon?: typeof ArrowRight
  forwardDisabled?: boolean
  spinning?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {back ? (
        <Button type="button" variant="ghost" onClick={back}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" onClick={forward} disabled={forwardDisabled}>
        <ForwardIcon className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
        {forwardLabel}
      </Button>
    </div>
  )
}
