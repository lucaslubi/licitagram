'use client'

import { useState, useTransition } from 'react'
import {
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
}

const EMPTY = (): Item => ({
  id: Math.random().toString(36).slice(2),
  descricao: '',
  quantidade: '',
  unidadeMedida: '',
  mesDemanda: '',
  justificativa: '',
})

interface Props {
  token: string
  setorNome: string
  prazoIso: string
  previouslyResponded: boolean
}

export function PublicForm({ token, setorNome, prazoIso, previouslyResponded }: Props) {
  const [items, setItems] = useState<Item[]>([EMPTY()])
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  const prazoLabel = new Date(prazoIso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const add = () => setItems((prev) => [...prev, EMPTY()])
  const remove = (id: string) => setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev))
  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))

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
      setDone(true)
      toast.success(`${res.inserted} itens enviados`)
    })
  }

  if (done) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-accent" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Demanda enviada</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Obrigado! O responsável do órgão recebe uma notificação e a equipe de IA consolida a coleta.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden /> Prazo {prazoLabel}
        </Badge>
        {previouslyResponded && (
          <Badge variant="outline" className="border-warning/30 bg-warning/5 text-warning">
            Já respondido antes — novo envio substitui os itens anteriores
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <Card key={item.id}>
            <CardContent className="space-y-3 p-4">
              <header className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Item {index + 1}
                </p>
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(item.id)}
                    aria-label="Remover item"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </header>
              <div className="space-y-1.5">
                <Label htmlFor={`desc-${item.id}`}>O que o setor precisa?</Label>
                <Input
                  id={`desc-${item.id}`}
                  placeholder="Ex: papel A4 gramatura 75g, resma com 500 folhas"
                  value={item.descricao}
                  onChange={(e) => update(item.id, { descricao: e.target.value })}
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
      </div>

      <Button type="button" variant="outline" onClick={add} className="w-full" disabled={pending}>
        <Plus className="h-4 w-4" /> Adicionar item
      </Button>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-4 sm:py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {setorNome} · {items.length} {items.length === 1 ? 'item' : 'itens'}
          </p>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {pending ? 'Enviando...' : 'Enviar demanda'}
          </Button>
        </div>
      </div>
    </div>
  )
}
