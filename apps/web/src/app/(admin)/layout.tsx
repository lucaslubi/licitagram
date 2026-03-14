export const dynamic = 'force-dynamic'

import { requirePlatformAdmin, checkAdminPermission } from '@/lib/auth-helpers'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', section: 'dashboard' },
  { href: '/admin/clients', label: 'Clientes', section: 'clients' },
  { href: '/admin/plans', label: 'Planos', section: 'plans' },
  { href: '/admin/users', label: 'Usuarios', section: 'users' },
  { href: '/admin/financial', label: 'Financeiro', section: 'financial' },
  { href: '/admin/admins', label: 'Admins', section: 'admins' },
  { href: '/admin/audit', label: 'Audit Log', section: 'audit' },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requirePlatformAdmin()

  const visibleItems = ADMIN_NAV.filter((item) =>
    checkAdminPermission(user, item.section),
  ).map(({ href, label }) => ({ href, label }))

  return (
    <div className="flex h-screen bg-gray-50 font-roboto">
      <AdminSidebar visibleItems={visibleItems} userEmail={user.email || ''} />
      <main className="flex-1 overflow-auto">
        <div className="pt-14 md:pt-0">
          <div className="p-4 md:p-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
