import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  RequestExportButton,
  DownloadExportButton,
  DeleteAccountButton,
  CancelDeletionButton,
} from './privacidade-actions'

export const metadata = { title: 'Privacidade · Licitagram' }
export const dynamic = 'force-dynamic'

type ExportRow = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired'
  requested_at: string
  completed_at: string | null
  signed_url_expires_at: string | null
  storage_path: string | null
  error: string | null
}

type UserDeletionInfo = {
  deletion_scheduled_at: string | null
  deletion_cancelled_at: string | null
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

function statusBadge(s: ExportRow['status'], signedExpires: string | null) {
  if (s === 'completed') {
    if (signedExpires && new Date(signedExpires).getTime() < Date.now()) {
      return <Badge variant="secondary">expirado</Badge>
    }
    return <Badge>pronto</Badge>
  }
  if (s === 'pending') return <Badge variant="secondary">na fila</Badge>
  if (s === 'processing') return <Badge variant="secondary">gerando…</Badge>
  if (s === 'failed') return <Badge variant="destructive">falhou</Badge>
  return <Badge variant="secondary">{s}</Badge>
}

export default async function PrivacidadePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Service client pra bypass RLS em data_export_jobs e users.deletion_*
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: jobs }, { data: profile }] = await Promise.all([
    service
      .from('data_export_jobs')
      .select('id, status, requested_at, completed_at, signed_url_expires_at, storage_path, error')
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(5),
    service
      .from('users')
      .select('deletion_scheduled_at, deletion_cancelled_at')
      .eq('id', user.id)
      .single(),
  ])

  const exports = (jobs || []) as ExportRow[]
  const deletion = (profile || { deletion_scheduled_at: null, deletion_cancelled_at: null }) as UserDeletionInfo
  const lastCompleted = exports.find((j) => j.status === 'completed')
  const lastCompletedExpired =
    lastCompleted?.signed_url_expires_at &&
    new Date(lastCompleted.signed_url_expires_at).getTime() < Date.now()

  // Cooldown 24h
  const last = exports[0]
  const cooldown = !!(
    last && Date.now() - new Date(last.requested_at).getTime() < 24 * 60 * 60 * 1000
  )

  // Banner se deleção agendada no futuro
  const scheduledFuture =
    deletion.deletion_scheduled_at &&
    new Date(deletion.deletion_scheduled_at).getTime() > Date.now()

  return (
    <div className="space-y-6">
      {scheduledFuture && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <strong>Sua conta será deletada em {fmtDate(deletion.deletion_scheduled_at)}.</strong>
              <p className="mt-1 text-muted-foreground">
                Após essa data, todos os seus dados serão apagados permanentemente conforme LGPD.
              </p>
            </div>
            <CancelDeletionButton />
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Exportar meus dados (LGPD)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Você pode pedir uma cópia de todos os seus dados em formato JSON. Vamos preparar e enviar
            por email em até 24h. O link de download fica disponível por 7 dias.
          </p>

          <RequestExportButton disabled={cooldown} />
          {cooldown && (
            <p className="text-xs text-muted-foreground">
              Você já solicitou uma exportação nas últimas 24h. Aguarde para pedir novamente.
            </p>
          )}

          {lastCompleted && (
            <p className="text-sm text-muted-foreground">
              Última exportação: {fmtDate(lastCompleted.completed_at)}
              {lastCompletedExpired ? ' (expirou)' : ''}
            </p>
          )}

          {exports.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Solicitada em</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Concluída em</th>
                    <th className="text-right px-3 py-2 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {exports.map((j) => {
                    const expired =
                      !!j.signed_url_expires_at &&
                      new Date(j.signed_url_expires_at).getTime() < Date.now()
                    return (
                      <tr key={j.id} className="border-t">
                        <td className="px-3 py-2">{fmtDateTime(j.requested_at)}</td>
                        <td className="px-3 py-2">
                          {statusBadge(j.status, j.signed_url_expires_at)}
                        </td>
                        <td className="px-3 py-2">{fmtDateTime(j.completed_at)}</td>
                        <td className="px-3 py-2 text-right">
                          {j.status === 'completed' && !expired ? (
                            <DownloadExportButton jobId={j.id} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deletar minha conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ação permanente. Após 14 dias de carência, todos os seus dados serão apagados conforme
            LGPD. Você pode reverter durante esse período. Sua assinatura é cancelada
            imediatamente — nenhuma cobrança nova será feita.
          </p>
          {scheduledFuture ? (
            <p className="text-sm text-muted-foreground">
              Deleção já agendada para {fmtDate(deletion.deletion_scheduled_at)}. Use o botão no
              banner acima para cancelar.
            </p>
          ) : (
            <DeleteAccountButton userEmail={user.email || ''} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
