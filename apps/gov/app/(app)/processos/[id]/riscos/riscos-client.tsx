'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RiskMatrix } from '@/components/riscos/RiskMatrix'
import type { Risco } from '@/lib/processos/queries'

interface Props {
  processoId: string
  initialRiscos: Risco[]
  artefatoStatus: string
  modelId: string | null
}

const FASE_LABEL: Record<string, string> = {
  planejamento: 'Planejamento',
  externa: 'Fase externa',
  execucao: 'Execução',
  regulatorio: 'Regulatório',
}

function levelColor(level: string | null): string {
  if (level === 'alto') return 'border-destructive/40 bg-destructive/10 text-destructive'
  if (level === 'medio') return 'border-warning/40 bg-warning/10 text-warning'
  if (level === 'baixo') return 'border-accent/40 bg-accent/10 text-accent'
  return 'border-border text-muted-foreground'
}

export function RiscosClient({ processoId, initialRiscos, artefatoStatus, modelId }: Props) {
  const [riscos, setRiscos] = useState<Risco[]>(initialRiscos)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const generate = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/generate-riscos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processoId }),
        })
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        if (!res.ok) {
          toast.error(body.error ?? 'Falha')
          return
        }
        toast.success(`${body.count} riscos gerados`)
        router.refresh()
        // Força estado local pra atualizar (refresh do server demora um tick)
        setTimeout(() => router.refresh(), 500)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Falha de rede')
      }
    })
  }

  const byFase = riscos.reduce<Record<string, Risco[]>>((acc, r) => {
    const f = r.fase ?? 'outras'
    if (!acc[f]) acc[f] = []
    acc[f].push(r)
    return acc
  }, {})

  const hasContent = riscos.length > 0

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wide">LICITAGRAM AI</span>
          {artefatoStatus !== 'pendente' && (
            <>
              <span>·</span>
              <span>
                {artefatoStatus === 'aprovado' ? 'Aprovado' : 'Gerado — revisar'}
              </span>
            </>
          )}
        </div>
        <Button onClick={generate} disabled={pending} variant={hasContent ? 'outline' : 'default'}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {pending ? 'Gerando...' : hasContent ? 'Regenerar' : 'Gerar com IA'}
        </Button>
      </header>

      {!hasContent ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nenhum risco identificado ainda</CardTitle>
            <CardDescription>
              A IA analisa o objeto do processo e identifica riscos comuns por fase. Você pode editar, remover ou aprovar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Típico: 6-12 riscos acionáveis. A LicitaGram AI estrutura por fase com tratamento e mitigação sugeridos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <RiskMatrix riscos={riscos} />
            </CardContent>
          </Card>

          <section className="space-y-4">
            {Object.entries(byFase).map(([fase, items]) => (
              <Card key={fase}>
                <CardHeader>
                  <CardTitle className="text-base">{FASE_LABEL[fase] ?? fase}</CardTitle>
                  <CardDescription>{items.length} riscos identificados</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">{r.descricao}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <Badge variant="outline" className={levelColor(r.nivelRisco)}>
                          Nível: {r.nivelRisco ?? '—'}
                        </Badge>
                        <Badge variant="outline">Prob: {r.probabilidade ?? '—'}</Badge>
                        <Badge variant="outline">Imp: {r.impacto ?? '—'}</Badge>
                        {r.responsavel && <Badge variant="outline">Resp: {r.responsavel}</Badge>}
                      </div>
                      {(r.tratamento || r.mitigacao) && (
                        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {r.tratamento && (
                            <div>
                              <dt className="inline font-semibold">Tratamento: </dt>
                              <dd className="inline">{r.tratamento}</dd>
                            </div>
                          )}
                          {r.mitigacao && (
                            <div>
                              <dt className="inline font-semibold">Mitigação: </dt>
                              <dd className="inline">{r.mitigacao}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
