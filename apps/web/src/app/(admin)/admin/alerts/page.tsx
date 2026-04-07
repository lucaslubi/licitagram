import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { listAdminAlerts, resolveAlert, runAnomalyDetection } from '@/actions/admin/clients'
import { Badge } from '@/components/ui/badge'

export default async function AdminAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>
}) {
  await requirePlatformAdmin()
  const params = await searchParams
  const { alerts } = await listAdminAlerts({
    onlyUnresolved: true,
    severity: params.severity as 'info' | 'warning' | 'critical' | undefined,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Alertas do Sistema</h1>
        <form action={async () => { 'use server'; await runAnomalyDetection() }}>
          <button className="px-4 py-2 bg-brand text-white rounded-md text-sm">
            Executar detecção agora
          </button>
        </form>
      </div>

      <div className="flex gap-2 mb-4">
        <Link href="/admin/alerts" className="px-3 py-1.5 text-sm border rounded">Todos</Link>
        <Link href="/admin/alerts?severity=critical" className="px-3 py-1.5 text-sm border rounded text-red-400">Críticos</Link>
        <Link href="/admin/alerts?severity=warning" className="px-3 py-1.5 text-sm border rounded text-amber-400">Avisos</Link>
        <Link href="/admin/alerts?severity=info" className="px-3 py-1.5 text-sm border rounded text-blue-400">Info</Link>
      </div>

      <div className="bg-[#1a1c1f] rounded-lg border">
        {alerts.length === 0 ? (
          <p className="p-8 text-center text-gray-400">Nenhum alerta ativo. 🎉</p>
        ) : (
          <ul className="divide-y divide-[#2d2f33]">
            {alerts.map(a => (
              <li key={a.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={
                      a.severity === 'critical' ? 'bg-red-900/20 text-red-400' :
                      a.severity === 'warning' ? 'bg-amber-900/20 text-amber-400' :
                      'bg-blue-900/20 text-blue-400'
                    }>{a.type}</Badge>
                    {a.companies && (
                      <Link href={`/admin/clients/${a.company_id}`} className="text-sm text-blue-400 hover:underline truncate">
                        {a.companies.razao_social || a.companies.cnpj}
                      </Link>
                    )}
                  </div>
                  <p className="text-sm text-gray-300">{a.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(a.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <form action={async () => { 'use server'; await resolveAlert(a.id) }}>
                  <button className="text-xs text-gray-400 hover:text-white border px-2 py-1 rounded">Resolver</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
