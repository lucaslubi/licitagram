import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { listClients } from '@/actions/admin/clients'
import { Badge } from '@/components/ui/badge'

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; plan?: string; status?: string }>
}) {
  await requirePlatformAdmin()
  const params = await searchParams

  const page = parseInt(params.page || '1')
  const result = await listClients({
    page,
    pageSize: 20,
    search: params.search,
    planSlug: params.plan,
    status: params.status,
  })

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Clientes</h1>

      {/* Search */}
      <form className="mb-6 flex flex-col sm:flex-row gap-3">
        <input
          name="search"
          defaultValue={params.search || ''}
          placeholder="Buscar por razao social, CNPJ..."
          className="flex-1 px-3 py-2 border rounded-md text-sm"
        />
        <select name="status" defaultValue={params.status || ''} className="px-3 py-2 border rounded-md text-sm">
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="trialing">Trial</option>
          <option value="past_due">Inadimplente</option>
          <option value="canceled">Cancelado</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm">
          Filtrar
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Empresa</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">CNPJ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Plano</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Matches</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">UF</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Usuarios</th>
            </tr>
          </thead>
          <tbody>
            {result.clients.map((client: any) => (
              <tr key={client.company_id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${client.company_id}`} className="text-blue-600 hover:underline font-medium">
                    {client.razao_social || client.nome_fantasia || '—'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs hidden sm:table-cell">{client.cnpj}</td>
                <td className="px-4 py-3">{client.plan_name || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={
                    client.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : client.subscription_status === 'trialing' ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : client.subscription_status === 'past_due' ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-gray-50 text-gray-500'
                  }>
                    {client.subscription_status || 'N/A'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{client.matches_used_this_month ?? 0}</td>
                <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{client.uf || '—'}</td>
                <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{client.active_users ?? 0}</td>
              </tr>
            ))}
            {result.clients.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-500">
          {result.count} clientes · Pagina {page} de {result.totalPages || 1}
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/clients?page=${page - 1}&search=${params.search || ''}&status=${params.status || ''}`}
              className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
            >
              Anterior
            </Link>
          )}
          {page < result.totalPages && (
            <Link
              href={`/admin/clients?page=${page + 1}&search=${params.search || ''}&status=${params.status || ''}`}
              className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
            >
              Proxima
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
