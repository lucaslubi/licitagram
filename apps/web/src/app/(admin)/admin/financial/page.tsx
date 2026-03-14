import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { getRevenueMetrics, getDelinquents } from '@/actions/admin/financial'
import { StatsCard } from '@/components/admin/stats-card'
import { Badge } from '@/components/ui/badge'

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export default async function AdminFinancialPage() {
  await requirePlatformAdmin()

  const [metrics, { delinquents }] = await Promise.all([
    getRevenueMetrics(),
    getDelinquents(),
  ])

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Financeiro</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatsCard title="MRR" value={formatBRL(metrics.mrr)} description="Receita Mensal Recorrente" />
        <StatsCard title="ARR" value={formatBRL(metrics.arr)} description="Receita Anual Recorrente" />
        <StatsCard title="Inadimplentes" value={delinquents.length} description="Pagamento pendente" />
      </div>

      {/* Revenue by Plan */}
      <div className="bg-white rounded-lg border p-4 sm:p-6 mb-8 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Receita por Plano</h2>
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="text-left py-2 font-medium text-gray-500">Plano</th>
              <th className="text-left py-2 font-medium text-gray-500">Assinantes</th>
              <th className="text-left py-2 font-medium text-gray-500">MRR</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(metrics.revenueByPlan).map(([slug, data]) => (
              <tr key={slug} className="border-b last:border-0">
                <td className="py-2 font-medium">{data.name}</td>
                <td className="py-2 text-gray-500">{data.count}</td>
                <td className="py-2 font-bold">{formatBRL(data.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delinquents */}
      <div className="bg-white rounded-lg border p-4 sm:p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Inadimplentes</h2>
        {delinquents.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum inadimplente no momento.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left py-2 font-medium text-gray-500">Empresa</th>
                <th className="text-left py-2 font-medium text-gray-500">CNPJ</th>
                <th className="text-left py-2 font-medium text-gray-500">Plano</th>
                <th className="text-left py-2 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {delinquents.map((d: any) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2">{d.companies?.razao_social || '—'}</td>
                  <td className="py-2 text-gray-500 font-mono text-xs">{d.companies?.cnpj || '—'}</td>
                  <td className="py-2">{d.plans?.name || '—'}</td>
                  <td className="py-2"><Badge variant="outline" className="bg-amber-50 text-amber-700">{d.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
