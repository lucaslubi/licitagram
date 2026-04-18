import type { Metadata } from 'next'
import { ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/EmptyState'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getAuditLog } from '@/lib/audit/queries'

export const metadata: Metadata = { title: 'Auditoria' }

const OPERACAO_LABEL: Record<string, { label: string; tone: string }> = {
  I: { label: 'Criou', tone: 'bg-accent/10 text-accent border-accent/30' },
  U: { label: 'Atualizou', tone: 'bg-primary/10 text-primary border-primary/30' },
  D: { label: 'Removeu', tone: 'bg-destructive/10 text-destructive border-destructive/30' },
}

export default async function AuditoriaPage() {
  const profile = await getCurrentProfile()
  const isAdmin = profile?.papel === 'admin' || profile?.papel === 'coordenador'

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-muted-foreground">
        Apenas admin/coordenador pode ver o log de auditoria.
      </div>
    )
  }

  const entries = await getAuditLog({ limit: 100 })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Configurações</p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <ScrollText className="h-7 w-7 text-primary" /> Log de auditoria
        </h1>
        <p className="text-sm text-muted-foreground">
          Trilha completa de mutações no schema <code className="font-mono">licitagov.*</code>. Preservada por trigger em toda tabela de negócio (RI-9) — atende exigências TCU/LGPD de rastreabilidade.
        </p>
      </header>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ScrollText}
              title="Sem registros ainda"
              description="Toda criação, atualização e remoção em licitagov.* gera um registro aqui. Crie uma campanha ou processo pra ver a trilha se formando."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas 100 ações</CardTitle>
            <CardDescription>Ordenadas por data decrescente</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {entries.map((e) => {
                const op = OPERACAO_LABEL[e.operacao] ?? {
                  label: e.operacao,
                  tone: 'bg-muted text-muted-foreground border-border',
                }
                return (
                  <li key={e.id} className="flex items-start gap-3 p-4 text-sm">
                    <Badge variant="outline" className={`shrink-0 ${op.tone}`}>
                      {op.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs">
                        {e.schemaName}.{e.tableName}
                        {e.rowId && <span className="text-muted-foreground"> · row {e.rowId.slice(0, 8)}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.actorEmail ?? e.actorId?.slice(0, 8) ?? 'sistema'}
                        {e.actorRole && <span> · {e.actorRole}</span>}
                        <span> · </span>
                        {new Date(e.ocorreuEm).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
