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
        <button type="submit" className="px-4 py-2 bg-brand text-white rounded-md text-sm">
          Filtrar
        </button>
      </form>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empresa</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">CNPJ</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plano</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell" title="Canais conectados">Canais</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Matches 7d</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Última atividade</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">CNAE</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {result.clients.map((client: any) => (
              <tr key={client.company_id} className="border-b hover:bg-secondary">
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${client.company_id}`} className="text-foreground hover:underline font-medium">
                    {client.razao_social || client.nome_fantasia || '—'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden sm:table-cell">{client.cnpj}</td>
                <td className="px-4 py-3">{client.plan_name || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={
                    client.subscription_status === 'active' ? 'border border-brand/30 bg-brand/10 text-brand border-emerald-800'
                    : client.subscription_status === 'trialing' ? 'border border-border bg-secondary text-foreground border-blue-800'
                    : client.subscription_status === 'past_due' ? 'bg-amber-900/20 text-amber-400 border-amber-800'
                    : 'bg-secondary text-muted-foreground'
                  }>
                    {client.subscription_status || 'N/A'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  <span className="flex gap-1 text-base" title={`Email: ${client.email_principal || '—'} · WhatsApp: ${client.whatsapp_number || '—'} · Telegram: ${client.telegram_chat_id ? 'sim' : 'não'}`}>
                    <span className={client.email_principal ? '' : 'opacity-20'}>✉️</span>
                    <span className={client.whatsapp_connected ? '' : 'opacity-20'}>💬</span>
                    <span className={client.telegram_connected ? '' : 'opacity-20'}>✈️</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  <span className={(client.matches_7d ?? 0) === 0 ? 'text-amber-400' : ''}>{client.matches_7d ?? 0}</span>
                  <span className="text-gray-600 text-xs"> / {client.matches_30d ?? 0}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-xs">
                  {client.last_login_at
                    ? new Date(client.last_login_at).toLocaleDateString('pt-BR')
                    : <span className="text-destructive">nunca</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs font-mono">
                  {client.has_valid_cnae
                    ? <span className="text-muted-foreground">{client.cnae_principal}</span>
                    : <span className="text-destructive">inválido</span>}
                </td>
                <td className="px-4 py-3">
                  {!client.has_valid_cnae && <span title="CNAE inválido" className="text-destructive">⚠️</span>}
                  {client.has_valid_cnae && (client.matches_7d ?? 0) === 0 && client.subscription_status === 'active' && (
                    <span title="Sem matches em 7d" className="text-amber-400">⏸</span>
                  )}
                  {!client.whatsapp_connected && !client.telegram_connected && client.subscription_status === 'active' && (
                    <span title="Sem canais" className="text-amber-400">🔇</span>
                  )}
                </td>
              </tr>
            ))}
            {result.clients.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-muted-foreground">
          {result.count} clientes · Pagina {page} de {result.totalPages || 1}
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/clients?page=${page - 1}&search=${params.search || ''}&status=${params.status || ''}`}
              className="px-3 py-1.5 border rounded text-sm hover:bg-secondary"
            >
              Anterior
            </Link>
          )}
          {page < result.totalPages && (
            <Link
              href={`/admin/clients?page=${page + 1}&search=${params.search || ''}&status=${params.status || ''}`}
              className="px-3 py-1.5 border rounded text-sm hover:bg-secondary"
            >
              Proxima
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
