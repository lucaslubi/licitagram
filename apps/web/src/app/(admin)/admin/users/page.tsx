import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { listUsers } from '@/actions/admin/users'
import { Badge } from '@/components/ui/badge'
import { UserActions } from '@/components/admin/user-actions'
import Link from 'next/link'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; role?: string }>
}) {
  await requirePlatformAdmin()
  const params = await searchParams

  const page = parseInt(params.page || '1')
  const result = await listUsers({
    page,
    pageSize: 30,
    search: params.search,
    role: params.role,
  })

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Usuários</h1>

      <form className="mb-6 flex flex-col sm:flex-row gap-3">
        <input
          name="search"
          defaultValue={params.search || ''}
          placeholder="Buscar por nome ou email..."
          className="flex-1 px-3 py-2 border rounded-md text-sm"
        />
        <select name="role" defaultValue={params.role || ''} className="px-3 py-2 border rounded-md text-sm">
          <option value="">Todos os roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
          <option value="viewer">Viewer</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm">
          Filtrar
        </button>
      </form>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Admin</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Cadastro</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody>
            {result.users.map((user: any) => (
              <tr key={user.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{user.full_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{user.email || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={
                    user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }>
                    {user.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {user.is_platform_admin && <Badge className="bg-amber-100 text-amber-800 border-amber-200" variant="outline">Admin</Badge>}
                </td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                  {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <UserActions user={user} />
                </td>
              </tr>
            ))}
            {result.users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum usuário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-500">{result.count} usuários · Página {page} de {result.totalPages || 1}</p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={`/admin/users?page=${page - 1}&search=${params.search || ''}&role=${params.role || ''}`} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Anterior</Link>
          )}
          {page < result.totalPages && (
            <Link href={`/admin/users?page=${page + 1}&search=${params.search || ''}&role=${params.role || ''}`} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Próxima</Link>
          )}
        </div>
      </div>
    </div>
  )
}
