import { redirect } from 'next/navigation'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { DashboardAiWrapper } from '@/components/dashboard-ai-wrapper'
import { CompanyProvider } from '@/contexts/company-context'
import { CompanySwitcher } from './company-switcher'
import { getUserCompanies } from '@/actions/multi-company'
import { MatchingProgressBanner } from '@/components/matching-progress-banner'
import { navigationGroups, accountItems } from '@/config/navigation'
import type { PlanFeatureKey } from '@licitagram/shared'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')

  // Collect all required features that this user's plan enables
  const allFeatures = [
    ...navigationGroups.flatMap((g) => g.items),
    ...accountItems,
  ]
    .filter((item) => item.requiredFeature)
    .map((item) => item.requiredFeature!)

  const enabledFeatures = allFeatures.filter((f) => hasFeature(user, f))

  const planName = user.plan?.name || null
  const userName = user.fullName || ''
  const userEmail = user.email || ''
  const userInitial = (user.fullName || user.email || 'U')[0].toUpperCase()

  // ── Parallel data fetching ─────────────────────────────────────────────
  const supabase = await createClient()

  const whatsappPromise = !user.onboardingCompleted
    ? supabase
        .from('users')
        .select('whatsapp_verified')
        .eq('id', user.userId)
        .single()
        .then(({ data }) => !!data?.whatsapp_verified)
    : Promise.resolve(false)

  const companiesPromise = getUserCompanies()

  const matchingPromise = user.companyId
    ? supabase
        .from('companies')
        .select('matching_status')
        .eq('id', user.companyId)
        .single()
        .then(async ({ data }) => {
          const status = data?.matching_status || null
          let matchCount = 0
          if (status && status !== 'ready') {
            const { count } = await supabase
              .from('matches')
              .select('id', { count: 'exact', head: true })
              .eq('company_id', user.companyId!)
              .gte('score', 50)
            matchCount = count || 0
          }
          return { status, matchCount }
        })
    : Promise.resolve({ status: null as string | null, matchCount: 0 })

  const [hasWhatsapp, userCompanies, { status: matchingStatus, matchCount: initialMatchCount }] =
    await Promise.all([whatsappPromise, companiesPromise, matchingPromise])

  // ── Multi-company support ──────────────────────────────────────────────
  const multiCnpjEnabled = hasFeature(user, 'multi_cnpj')
  const maxCompanies = user.subscription?.max_companies || 1

  // Show company switcher if user has multi_cnpj OR already has >1 company
  const showSwitcher = multiCnpjEnabled || userCompanies.length > 1

  return (
    <CompanyProvider
      initialCompanies={userCompanies}
      defaultCompanyId={user.companyId}
      maxCompanies={maxCompanies}
      multiCnpjEnabled={multiCnpjEnabled}
    >
      <div className="flex h-screen bg-background">
        <DashboardSidebar
          isAdmin={!!user.isPlatformAdmin}
          userName={userName}
          userEmail={userEmail}
          userInitial={userInitial}
          planName={planName}
          enabledFeatures={enabledFeatures}
          companySwitcher={showSwitcher ? <CompanySwitcher /> : undefined}
        />

        {/* Main content — add top padding on mobile for the fixed top bar */}
        <main className="flex-1 overflow-y-auto min-h-0 bg-background">
          <div className="pt-14 md:pt-0 min-h-full">
            {matchingStatus && matchingStatus !== 'ready' && (
              <MatchingProgressBanner
                initialStatus={matchingStatus}
                initialMatchCount={initialMatchCount}
              />
            )}
            <DashboardAiWrapper
              onboardingCompleted={user.onboardingCompleted}
              userUfs={user.ufsInteresse}
              userKeywords={user.palavrasChaveFiltro}
              userEmail={userEmail}
              hasTelegram={!!user.telegramChatId}
              hasWhatsapp={hasWhatsapp}
            >
              <div className="p-4 md:p-8">{children}</div>
            </DashboardAiWrapper>
          </div>
        </main>
      </div>
    </CompanyProvider>
  )
}
