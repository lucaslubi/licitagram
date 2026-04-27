import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** /settings is legacy — all account/notification config lives under /conta now. */
export default function SettingsRedirect() {
  redirect('/conta')
}
