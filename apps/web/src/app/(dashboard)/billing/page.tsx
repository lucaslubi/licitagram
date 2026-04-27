import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assinatura · Licitagram' }

/**
 * /billing is legacy. Canonical destination is /conta/assinatura.
 * This redirect preserves all upgrade/checkout query params so:
 *  - sidebar feature-locks (?upgrade=1&feature=...) keep working
 *  - middleware redirects (?expired=1, ?upgrade=feature_key) keep working
 *  - stripe checkout success/cancel URLs (?success=true, ?canceled=true) keep working
 *  - legacy auto-checkout deep-links (?plan=slug&billing=annual) keep working
 */
export default async function BillingRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string
    canceled?: string
    expired?: string
    upgrade?: string
    plan?: string
    billing?: string
    feature?: string
    from?: string
  }>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v.length > 0) qs.set(k, v)
  }
  const tail = qs.toString()
  redirect(`/conta/assinatura${tail ? '?' + tail : ''}`)
}
