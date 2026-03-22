export const dynamic = 'force-dynamic'

import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { MonitoringDashboard } from './monitoring-dashboard'

export default async function MonitoringPage() {
  await requirePlatformAdmin()
  return <MonitoringDashboard />
}
