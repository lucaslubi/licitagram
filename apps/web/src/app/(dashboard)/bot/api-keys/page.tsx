/**
 * /bot/api-keys — management page for the Supreme Bot public API tokens.
 *
 * Server component: gates on auth/plan; client component does the CRUD.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserWithPlan, hasActiveSubscription, hasFeature } from '@/lib/auth-helpers'
import { ApiKeysManager } from './api-keys-manager'

export const dynamic = 'force-dynamic'

export default async function ApiKeysPage() {
  const planUser = await getUserWithPlan()
  if (!planUser) redirect('/login')
  if (!hasActiveSubscription(planUser)) redirect('/pricing')
  // bidding_bot_supreme gate: API + webhooks é Enterprise-only.
  if (!hasFeature(planUser, 'bidding_bot_supreme')) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="mt-4 text-slate-600">
          Esta feature faz parte do plano Enterprise (Licitagram Supreme Bot).{' '}
          <Link href="/pricing" className="text-brand underline">Ver planos →</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
        <p className="text-sm text-slate-600 mt-1">
          Tokens de acesso à API pública v1. Consulte a{' '}
          <Link className="text-brand underline" href="/api/v1/bot/README.md">documentação</Link>.
        </p>
      </div>
      <ApiKeysManager />
    </div>
  )
}
