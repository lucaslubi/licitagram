import { redirect } from 'next/navigation'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { IntelligenceClient } from './intelligence-client'

export const metadata = { title: 'Centro de Inteligencia | Licitagram' }

export default async function IntelligencePage() {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')

  const planSlug = user.plan?.slug || 'free'
  const isEnterprise = planSlug === 'enterprise'
  const isProfessional = planSlug === 'profissional' || planSlug === 'professional' || isEnterprise

  return <IntelligenceClient isEnterprise={isEnterprise} isProfessional={isProfessional} planSlug={planSlug} />
}
