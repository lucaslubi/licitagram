'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, Send, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { publishProcessoAction, type PublicacaoRow } from '@/lib/pncp/actions'
import type { ComplianceSummary } from '@/lib/compliance/engine'

interface Props {
  processoId: string
  compliance: ComplianceSummary
  publicacoes: PublicacaoRow[]
  isTerminal: boolean
}

export function PublicarClient({ processoId, compliance, publicacoes, isTerminal }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const publish = () => {
    if (
      !window.confirm(
        'Confirma a publicação? Integração PNCP real ainda exige certificado ICP-Brasil — neste momento o sistema registra o status e a publicação fica pendente para revisão manual.',
      )
    ) {
      return
    }
    startTransition(async () => {
      const res = await publishProcessoAction(processoId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Publicação registrada (${res.status})`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Compliance gate */}
      <Card className={compliance.canPublish ? 'border-accent/30 bg-accent/5' : 'border-destructive/30 bg-destructive/5'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {compliance.canPublish ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-accent" /> Compliance OK
              </>
            ) : (
              <>
                <ShieldAlert className="h-5 w-5 text-destructive" /> Compliance bloqueia publicação
              </>
            )}
          </CardTitle>
          <CardDescription>
            {compliance.canPublish
              ? `${compliance.passed} de ${compliance.total} checks conformes.`
              : `${compliance.criticas} crítica(s) · ${compliance.altas} alta(s). Resolva em /compliance.`}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Histórico de publicações */}
      {publicacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de tentativas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {publicacoes.map((p) => (
                <li key={p.id} className="flex items-start gap-3 p-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      p.status === 'publicado'
                        ? 'bg-accent/10 text-accent'
                        : p.status === 'falhou'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-warning/10 text-warning'
                    }`}
                  >
                    {p.status === 'publicado' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : p.status === 'falhou' ? (
                      <ShieldAlert className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {p.tipoDocumento}
                      <Badge variant="outline" className="text-[10px]">
                        {p.status}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.numeroControle && <span className="font-mono">{p.numeroControle} · </span>}
                      {p.publicadoEm
                        ? `Publicado em ${new Date(p.publicadoEm).toLocaleString('pt-BR')}`
                        : `Registrado em ${new Date(p.criadoEm).toLocaleString('pt-BR')}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Aviso sobre cert ICP-Brasil */}
      <Card className="border-warning/30 bg-warning/5">
        <CardHeader>
          <CardTitle className="text-base">Sobre a integração PNCP</CardTitle>
          <CardDescription>
            A publicação oficial no PNCP exige assinatura digital ICP-Brasil do órgão (MP 2.200-2/2001). No MVP atual,
            o sistema registra o status como <strong>pendente</strong> e mantém o payload auditável — a publicação final
            é feita manualmente via portal PNCP enquanto a integração com certificado não é concluída.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* CTA */}
      {!isTerminal && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publicar agora</CardTitle>
            <CardDescription>
              Registra a intenção de publicação + snapshot do processo em <code>publicacoes_pncp</code> + trigger audit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={publish} disabled={pending || !compliance.canPublish} className="w-full sm:w-auto">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {pending ? 'Publicando...' : 'Registrar publicação'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
