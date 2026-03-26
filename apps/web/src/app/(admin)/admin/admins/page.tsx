import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { listAdmins } from '@/actions/admin/admins'
import { AdminCard, AddAdminForm } from '@/components/admin/admin-management'

export default async function AdminAdminsPage() {
  await requirePlatformAdmin()
  const { admins } = await listAdmins()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Administradores</h1>
        <p className="text-sm text-gray-400">{admins.length} admin(s)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {admins.map((admin: any) => (
          <AdminCard key={admin.id} admin={admin} />
        ))}
      </div>

      <div className="max-w-md">
        <AddAdminForm existingAdminIds={admins.map((a: any) => a.id)} />
      </div>
    </div>
  )
}
