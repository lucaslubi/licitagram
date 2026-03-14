import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { StatsCard } from '@/components/admin/stats-card'
import { getRevenueMetrics } from '@/actions/admin/financial'
import { listClients } from '@/actions/admin/clients'
import { createClient } from '@supabase/supabase-js'

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

export default async function AdminDashboardPage() {
  await requirePlatformAdmin()

  const [metrics, clientsResult] = await Promise.all([
    getRevenueMetrics(),
    listClients({ page: 1, pageSize: 5 }),
  ])

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [tendersResult, matchesResult, usersResult] = await Promise.all([
    supabase.from('tenders').select('id', { count: 'exact', head: true }),
    supabase.from('matches').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])

  const activeCount = metrics.statusCounts['active'] || 0
  const trialingCount = metrics.statusCounts['trialing'] || 0
  const pastDueCount = metrics.statusCounts['past_due'] || 0

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Dashboard Admin</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatsCard
          title="MRR"
          value={formatBRL(metrics.mrr)}
          description="Receita Mensal Recorrente"
        />
        <StatsCard
          title="ARR"
          value={formatBRL(metrics.arr)}
          description="Receita Anual Recorrente"
        />
        <StatsCard
          title="Tenants Ativos"
          value={activeCount + trialingCount}
          description={`${activeCount} pagantes + ${trialingCount} trial`}
        />
        <StatsCard
          title="Inadimplentes"
          value={pastDueCount}
          description="Pagamento pendente"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatsCard title="Total Licitações" value={(tendersResult.count || 0).toLocaleString('pt-BR')} />
        <StatsCard title="Total Matches" value={(matchesResult.count || 0).toLocaleString('pt-BR')} />
        <StatsCard title="Usuários Ativos" value={(usersResult.count || 0).toLocaleString('pt-BR')} />
      </div>

      {/* Revenue by Plan */}
      <div className="bg-white rounded-lg border p-4 sm:p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Receita por Plano</h2>
        <div className="space-y-3">
          {Object.entries(metrics.revenueByPlan).map(([slug, data]) => (
            <div key={slug} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="font-medium">{data.name}</p>
                <p className="text-sm text-gray-500">{data.count} assinaturas</p>
              </div>
              <p className="font-bold">{formatBRL(data.revenue)}/mes</p>
            </div>
          ))}
          {Object.keys(metrics.revenueByPlan).length === 0 && (
            <p className="text-gray-400 text-sm">Nenhuma assinatura ativa.</p>
          )}
        </div>
      </div>

      {/* Recent Clients */}
      <div className="bg-white rounded-lg border p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Clientes Recentes</h2>
        <div className="space-y-2">
          {clientsResult.clients.slice(0, 5).map((client: any) => (
            <div key={client.company_id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="font-medium text-sm">{client.razao_social || client.cnpj}</p>
                <p className="text-xs text-gray-500">{client.plan_name || 'Sem plano'} · {client.uf || '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                client.subscription_status === 'active' ? 'bg-emerald-100 text-emerald-700'
                : client.subscription_status === 'trialing' ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500'
              }`}>
                {client.subscription_status || 'N/A'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
