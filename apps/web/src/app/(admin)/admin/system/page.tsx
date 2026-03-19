export const dynamic = 'force-dynamic'

import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { SystemHealthDashboard } from '@/components/admin/system-health-dashboard'

export default async function SystemHealthPage() {
  await requirePlatformAdmin()
  return <SystemHealthDashboard />
}
