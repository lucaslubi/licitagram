import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { getAuditLogs } from '@/actions/admin/audit'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; targetType?: string }>
}) {
  await requirePlatformAdmin()
  const params = await searchParams

  const page = parseInt(params.page || '1')
  const result = await getAuditLogs({
    page,
    pageSize: 50,
    action: params.action,
    targetType: params.targetType,
  })

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Audit Log</h1>

      <form className="mb-6 flex flex-col sm:flex-row gap-3">
        <select name="targetType" defaultValue={params.targetType || ''} className="px-3 py-2 border rounded-md text-sm">
          <option value="">Todos os tipos</option>
          <option value="plan">Plano</option>
          <option value="user">Usuario</option>
          <option value="company">Empresa</option>
          <option value="subscription">Assinatura</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm">
          Filtrar
        </button>
      </form>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Data</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Acao</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Ator</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {result.logs.map((log: any) => (
              <tr key={log.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{log.action}</code>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {log.target_type && <Badge variant="outline">{log.target_type}</Badge>}
                </td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{log.actor_email || '—'}</td>
                <td className="px-4 py-3 text-gray-400 truncate max-w-xs hidden lg:table-cell">
                  {log.details && Object.keys(log.details).length > 0
                    ? JSON.stringify(log.details).slice(0, 80) + '...'
                    : '—'}
                </td>
              </tr>
            ))}
            {result.logs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Nenhum log encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-500">{result.count} registros · Pagina {page} de {result.totalPages || 1}</p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={`/admin/audit?page=${page - 1}&targetType=${params.targetType || ''}`} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Anterior</Link>
          )}
          {page < result.totalPages && (
            <Link href={`/admin/audit?page=${page + 1}&targetType=${params.targetType || ''}`} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Proxima</Link>
          )}
        </div>
      </div>
    </div>
  )
}
