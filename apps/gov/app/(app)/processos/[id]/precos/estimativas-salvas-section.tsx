'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { finalizarPesquisaPrecosAction, type EstimativaRow } from '@/lib/precos/actions'

interface Props {
  processoId: string
  estimativas: EstimativaRow[]
}

function formatBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function EstimativasSalvasSection({ processoId, estimativas }: Props) {
  const router = useRouter()
  const [advancing, startAdvance] = useTransition()

  const advanceToTr = () => {
    startAdvance(async () => {
      const res = await finalizarPesquisaPrecosAction(processoId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Avançando para elaboração do TR.')
      router.push(`/processos/${processoId}/tr`)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-4 w-4 text-success" />
          Estimativas já salvas
        </CardTitle>
        <CardDescription>
          {estimativas.length} item(ns) com cesta aprovada. Essas estimativas serão usadas no TR (alínea I).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {estimativas.map((e) => (
          <div key={`${e.itemDescricao}-${e.calculadoEm}`} className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">{e.itemDescricao}</p>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
              <Stat label="Valor final" value={formatBRL(e.valorFinal)} highlight />
              <Stat label="Método" value={e.metodo} />
              <Stat label="Amostras" value={String(e.qtdAmostras)} />
              <Stat label="CV" value={e.cv != null ? `${e.cv.toFixed(1)}%` : '—'} />
            </div>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between rounded-md border border-accent/30 bg-accent/5 p-4">
          <div>
            <p className="text-sm font-medium">Pronto para o TR?</p>
            <p className="text-xs text-muted-foreground">
              A narrativa de cada cesta será injetada automaticamente no prompt do TR.
            </p>
          </div>
          <Button onClick={advanceToTr} disabled={advancing} variant="gradient">
            {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Elaborar TR
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-semibold tabular-nums ${highlight ? 'text-accent' : ''}`}>{value}</p>
    </div>
  )
}
