'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { executarAutoHeal, type HealAction } from '@/lib/compliance/auto-heal'

interface Props {
  processoId: string
  pendentesCount: number
}

/**
 * AutoHealPanel — executa a auto-correção das pendências do Compliance.
 *
 * A ferramenta é autônoma: identifica pendências que podem ser resolvidas
 * por regeneração de artefato, montagem de cesta ou cálculo estatístico,
 * e executa cada uma sequencialmente. Pendências que exigem ato humano
 * formal (assinatura, aprovação) ficam sinalizadas como não-resolvíveis.
 */
export function AutoHealPanel({ processoId, pendentesCount }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [actions, setActions] = useState<HealAction[]>([])
  const [ran, setRan] = useState(false)

  const executar = () => {
    if (
      !window.confirm(
        `A ferramenta vai tentar resolver automaticamente ${pendentesCount} pendência(s) — pode regenerar artefatos, montar nova cesta e avançar fases. Prosseguir?`,
      )
    ) {
      return
    }
    setActions([])
    startTransition(async () => {
      try {
        const results = await executarAutoHeal(processoId)
        setActions(results)
        setRan(true)
        const ok = results.filter((r) => r.status === 'success').length
        const failed = results.filter((r) => r.status === 'failed').length
        const unresolvable = results.filter((r) => r.status === 'unresolvable').length
        if (failed === 0 && unresolvable === 0) {
          toast.success(`${ok} pendência(s) resolvida(s) automaticamente`)
        } else if (ok > 0) {
          toast.warning(
            `${ok} resolvida(s), ${failed} falha(s), ${unresolvable} requer(em) ato humano`,
          )
        } else {
          toast.error('Nenhuma pendência pôde ser resolvida automaticamente')
        }
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha no auto-heal'
        toast.error(msg)
      }
    })
  }

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-institutional">Ferramenta autônoma</p>
            <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
              <Sparkles className="h-4 w-4 text-accent" />
              Resolver automaticamente
            </CardTitle>
            <CardDescription>
              A IA itera por cada pendência e executa a ação corretiva: regenera artefatos incompletos,
              monta cesta de preços do zero, recalcula estatísticas, avança fases. Pendências que exigem ato
              humano formal (assinaturas, aprovações) ficam sinalizadas.
            </CardDescription>
          </div>
          {!ran && (
            <Button onClick={executar} disabled={pending || pendentesCount === 0} variant="gradient">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pending ? `Corrigindo…` : `Corrigir ${pendentesCount} pendência(s)`}
            </Button>
          )}
          {ran && (
            <Button onClick={executar} disabled={pending} variant="outline" size="sm">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Executar de novo
            </Button>
          )}
        </div>
      </CardHeader>
      {actions.length > 0 && (
        <CardContent>
          <ul className="divide-y divide-border rounded-md border border-border">
            {actions.map((a) => (
              <li key={a.checkId} className="flex items-start gap-3 p-3">
                <ActionIcon status={a.status} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {a.checkLabel}
                    <StatusBadge status={a.status} />
                  </p>
                  {a.detail && <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>}
                  {a.error && (
                    <p className="mt-0.5 text-xs text-destructive">Erro: {a.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {ran && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Compliance será recalculado automaticamente. Recarregue a página pra ver o novo estado.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function ActionIcon({ status }: { status: HealAction['status'] }) {
  if (status === 'success')
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
  if (status === 'failed')
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
  if (status === 'unresolvable')
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
  if (status === 'running')
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden />
  return <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
}

function StatusBadge({ status }: { status: HealAction['status'] }) {
  const map: Record<HealAction['status'], { label: string; cls: string }> = {
    pending: { label: 'pendente', cls: 'border-border text-muted-foreground' },
    running: { label: 'executando', cls: 'border-accent/40 bg-accent/10 text-accent' },
    success: { label: 'resolvido', cls: 'border-success/40 bg-success/10 text-success' },
    failed: { label: 'falhou', cls: 'border-destructive/40 bg-destructive/10 text-destructive' },
    unresolvable: { label: 'requer humano', cls: 'border-warning/40 bg-warning/10 text-warning' },
  }
  const v = map[status]
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${v.cls}`}>
      {v.label}
    </Badge>
  )
}
