import { redirect } from 'next/navigation'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { loadCompanyData } from '@/actions/company'
import { OnboardingWizard } from './onboarding-wizard'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')

  // If company is already fully configured, skip
  const result = await loadCompanyData().catch(() => null)
  const company = result && 'data' in result ? result.data : null
  const isFullyConfigured = Boolean(
    company?.cnpj &&
    company?.uf &&
    (company?.palavras_chave?.length ?? 0) > 0,
  )
  if (isFullyConfigured) redirect('/dashboard')

  return <OnboardingWizard initialCompany={company} />
}
