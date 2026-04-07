import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { getClientDetail, getClientDetailEnriched, resolveAlert } from '@/actions/admin/clients'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientSubscriptionActions } from '@/components/admin/client-subscription-actions'
import { UserActions } from '@/components/admin/user-actions'

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePlatformAdmin()
  const { id } = await params
  const [detail, enriched] = await Promise.all([
    getClientDetail(id),
    getClientDetailEnriched(id),
  ])
  const overview = enriched.overview as any

  if (!detail.company) {
    return <div className="text-center py-20 text-gray-400">Cliente não encontrado.</div>
  }

  const company = detail.company
  const sub = detail.subscription as any
  const plan = sub?.plans

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
        <Link href="/admin/clients" className="text-sm text-gray-400 hover:text-gray-300">← Clientes</Link>
        <h1 className="text-xl sm:text-2xl font-bold truncate">{company.razao_social || company.cnpj}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Company Info */}
        <Card>
          <CardHeader><CardTitle>Dados da Empresa</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">CNPJ</span><span className="font-mono">{company.cnpj}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Razão Social</span><span>{company.razao_social}</span></div>
            {company.nome_fantasia && <div className="flex justify-between"><span className="text-gray-400">Nome Fantasia</span><span>{company.nome_fantasia}</span></div>}
            <div className="flex justify-between"><span className="text-gray-400">UF</span><span>{company.uf || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Porte</span><span>{company.porte || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Cadastro</span><span>{new Date(company.created_at).toLocaleDateString('pt-BR')}</span></div>
          </CardContent>
        </Card>

        {/* Subscription with actions */}
        <Card>
          <CardHeader><CardTitle>Assinatura</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Plano</span>
              <span className="font-medium">{plan?.name || 'Nenhum'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <Badge variant="outline" className={
                sub?.status === 'active' ? 'bg-emerald-900/20 text-emerald-400' : 'bg-[#2d2f33] text-gray-400'
              }>{sub?.status || 'N/A'}</Badge>
            </div>
            {plan?.price_cents && (
              <div className="flex justify-between"><span className="text-gray-400">Valor</span><span>{formatBRL(plan.price_cents)}/mês</span></div>
            )}
            <div className="flex justify-between"><span className="text-gray-400">Matches usados</span><span>{sub?.matches_used_this_month ?? 0} / {plan?.max_matches_per_month ?? '∞'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Total Matches</span><span>{detail.matchCount}</span></div>

            <ClientSubscriptionActions
              companyId={id}
              currentPlanId={sub?.plan_id || null}
              currentStatus={sub?.status || 'inactive'}
              allPlans={detail.allPlans}
            />
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      {enriched.activeAlerts.length > 0 && (
        <Card className="mb-6 border-amber-700/50">
          <CardHeader><CardTitle className="text-amber-400">⚠️ Alertas Ativos ({enriched.activeAlerts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {enriched.activeAlerts.map((a: any) => (
              <div key={a.id} className="flex items-start justify-between gap-3 text-sm border-b border-[#2d2f33] pb-2 last:border-0">
                <div>
                  <Badge variant="outline" className={
                    a.severity === 'critical' ? 'bg-red-900/20 text-red-400' :
                    a.severity === 'warning' ? 'bg-amber-900/20 text-amber-400' :
                    'bg-blue-900/20 text-blue-400'
                  }>{a.type}</Badge>
                  <p className="mt-1 text-gray-300">{a.message}</p>
                </div>
                <form action={async () => { 'use server'; await resolveAlert(a.id) }}>
                  <button className="text-xs text-gray-400 hover:text-white">Resolver</button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Contatos + Atividade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Contatos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Email principal</span><span>{overview?.email_principal || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">WhatsApp</span>
              <span>{overview?.whatsapp_number ? <span className="text-emerald-400">{overview.whatsapp_number}</span> : <span className="text-gray-500">não conectado</span>}</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Telegram</span>
              <span>{overview?.telegram_connected ? <span className="text-emerald-400">conectado</span> : <span className="text-gray-500">não conectado</span>}</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">CNAE principal</span>
              <span className="font-mono">{overview?.has_valid_cnae ? overview.cnae_principal : <span className="text-red-400">inválido</span>}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Atividade</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Último login</span>
              <span>{overview?.last_login_at ? new Date(overview.last_login_at).toLocaleString('pt-BR') : <span className="text-red-400">nunca</span>}</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Último match</span>
              <span>{overview?.last_match_at ? new Date(overview.last_match_at).toLocaleString('pt-BR') : '—'}</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Matches 7d / 30d</span>
              <span>{overview?.matches_7d ?? 0} / {overview?.matches_30d ?? 0}</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Notificações não lidas</span>
              <span>{overview?.notifications_unread ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Matches recentes + notificações recentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Matches recentes</CardTitle></CardHeader>
          <CardContent>
            {enriched.recentMatches.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum match.</p>
            ) : (
              <ul className="text-xs space-y-1">
                {enriched.recentMatches.map((m: any) => (
                  <li key={m.id} className="flex justify-between gap-2 text-gray-300">
                    <span className="font-mono truncate">{m.tender_id?.slice(0, 8)}…</span>
                    <span>score {Math.round((m.score || 0) * 100)}%</span>
                    <span className="text-gray-500">{new Date(m.created_at).toLocaleDateString('pt-BR')}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notificações recentes</CardTitle></CardHeader>
          <CardContent>
            {enriched.recentNotifications.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma notificação.</p>
            ) : (
              <ul className="text-xs space-y-1">
                {enriched.recentNotifications.map((n: any) => (
                  <li key={n.id} className="flex justify-between gap-2">
                    <span className={n.read ? 'text-gray-500' : 'text-white'}>{n.title}</span>
                    <span className="text-gray-500">{new Date(n.created_at).toLocaleDateString('pt-BR')}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Users with actions */}
      <Card>
        <CardHeader><CardTitle>Usuários ({detail.users.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left py-2 text-gray-400 font-medium">Nome</th>
                <th className="text-left py-2 text-gray-400 font-medium hidden sm:table-cell">Email</th>
                <th className="text-left py-2 text-gray-400 font-medium">Status</th>
                <th className="text-left py-2 text-gray-400 font-medium hidden md:table-cell">Cadastro</th>
                <th className="text-left py-2 text-gray-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {detail.users.map((u: any) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2">{u.full_name || u.email || u.id}</td>
                  <td className="py-2 text-gray-400 hidden sm:table-cell">{u.email}</td>
                  <td className="py-2">
                    <Badge variant="outline" className={u.is_active !== false ? 'bg-emerald-900/20 text-emerald-400' : 'bg-red-900/20 text-red-400'}>
                      {u.is_active !== false ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="py-2 text-gray-400 hidden md:table-cell">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="py-2">
                    <UserActions user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
