import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { getClientDetail } from '@/actions/admin/clients'
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
  const detail = await getClientDetail(id)

  if (!detail.company) {
    return <div className="text-center py-20 text-gray-400">Cliente não encontrado.</div>
  }

  const company = detail.company
  const sub = detail.subscription as any
  const plan = sub?.plans

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
        <Link href="/admin/clients" className="text-sm text-gray-500 hover:text-gray-700">← Clientes</Link>
        <h1 className="text-xl sm:text-2xl font-bold truncate">{company.razao_social || company.cnpj}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Company Info */}
        <Card>
          <CardHeader><CardTitle>Dados da Empresa</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">CNPJ</span><span className="font-mono">{company.cnpj}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Razão Social</span><span>{company.razao_social}</span></div>
            {company.nome_fantasia && <div className="flex justify-between"><span className="text-gray-500">Nome Fantasia</span><span>{company.nome_fantasia}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">UF</span><span>{company.uf || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Porte</span><span>{company.porte || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Cadastro</span><span>{new Date(company.created_at).toLocaleDateString('pt-BR')}</span></div>
          </CardContent>
        </Card>

        {/* Subscription with actions */}
        <Card>
          <CardHeader><CardTitle>Assinatura</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Plano</span>
              <span className="font-medium">{plan?.name || 'Nenhum'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <Badge variant="outline" className={
                sub?.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'
              }>{sub?.status || 'N/A'}</Badge>
            </div>
            {plan?.price_cents && (
              <div className="flex justify-between"><span className="text-gray-500">Valor</span><span>{formatBRL(plan.price_cents)}/mês</span></div>
            )}
            <div className="flex justify-between"><span className="text-gray-500">Matches usados</span><span>{sub?.matches_used_this_month ?? 0} / {plan?.max_matches_per_month ?? '∞'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total Matches</span><span>{detail.matchCount}</span></div>

            <ClientSubscriptionActions
              companyId={id}
              currentPlanId={sub?.plan_id || null}
              currentStatus={sub?.status || 'inactive'}
              allPlans={detail.allPlans}
            />
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
                <th className="text-left py-2 text-gray-500 font-medium">Nome</th>
                <th className="text-left py-2 text-gray-500 font-medium hidden sm:table-cell">Email</th>
                <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                <th className="text-left py-2 text-gray-500 font-medium hidden md:table-cell">Cadastro</th>
                <th className="text-left py-2 text-gray-500 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {detail.users.map((u: any) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2">{u.full_name || u.email || u.id}</td>
                  <td className="py-2 text-gray-500 hidden sm:table-cell">{u.email}</td>
                  <td className="py-2">
                    <Badge variant="outline" className={u.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}>
                      {u.is_active !== false ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="py-2 text-gray-500 hidden md:table-cell">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
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
