import { redirect } from 'next/navigation'
import { getUserWithPlan, hasFeature, hasActiveSubscription, ensureTrialSubscription } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { DashboardAiWrapper } from '@/components/dashboard-ai-wrapper'
import { CompanyProvider } from '@/contexts/company-context'
import { CompanySwitcher } from './company-switcher'
import { getUserCompanies } from '@/actions/multi-company'
import { MatchingProgressBanner } from '@/components/matching-progress-banner'
import { ProfileHealthBanner } from '@/components/profile-health-banner'
import { TrialBanner } from '@/components/trial-banner'
import { TrialExpiredOverlay } from '@/components/trial-expired-overlay'
import { getActivePlans } from '@/lib/plans'
import { navigationGroups, accountItems } from '@/config/navigation'
import type { PlanFeatureKey } from '@licitagram/shared'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user = await getUserWithPlan()
  if (!user) redirect('/login')

  // ── Safety net: auto-create trial subscription if missing ────────────────
  // This catches users who have a company but somehow ended up without a
  // subscription (e.g., race condition during onboarding, trigger failure).
  if (user.companyId && !user.subscription && !user.isPlatformAdmin) {
    const trialCreated = await ensureTrialSubscription(user)
    if (trialCreated) {
      // Re-fetch user data to pick up the new subscription
      user = (await getUserWithPlan())!
    }
  }

  // Collect all required features that this user's plan enables
  const allFeatures = [
    ...navigationGroups.flatMap((g) => g.items),
    ...accountItems,
  ]
    .filter((item) => item.requiredFeature)
    .map((item) => item.requiredFeature!)

  const enabledFeatures = allFeatures.filter((f) => hasFeature(user, f))

  // ── Trial / Subscription status ─────────────────────────────────────────
  const isActive = hasActiveSubscription(user)
  const isTrialing = user.subscription?.status === 'trialing'

  // Calculate trial days left
  let trialDaysLeft = 0
  if (isTrialing && user.subscription?.current_period_end) {
    const end = new Date(user.subscription.current_period_end).getTime()
    const now = Date.now()
    trialDaysLeft = Math.max(0, Math.ceil((end - now) / 86_400_000))
  }

  // Show expired overlay for users without active subscription (non-admin).
  // The middleware already redirects most routes to /billing, but this catches
  // any routes that slip through and provides a graceful overlay UX.
  // IMPORTANT: Don't show expired overlay for brand-new users who haven't set up
  // their company yet — they simply don't have a subscription row because the
  // trial is created when the company is created during onboarding.
  const isNewUserWithoutCompany = !user.companyId
  const showExpiredOverlay = !isActive && !user.isPlatformAdmin && !isNewUserWithoutCompany

  // Show trial banner if trialing with 3 or fewer days left
  const showTrialBanner = isTrialing && trialDaysLeft <= 3 && !showExpiredOverlay

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

  // Fetch plans for expired overlay so it can call Stripe checkout directly
  const plansPromise = showExpiredOverlay
    ? getActivePlans().then((plans) =>
        plans.map((p) => ({ id: p.id, slug: p.slug, name: p.name, price_cents: p.price_cents }))
      )
    : Promise.resolve([])

  const [hasWhatsapp, userCompanies, { status: matchingStatus, matchCount: initialMatchCount }, overlayPlans] =
    await Promise.all([whatsappPromise, companiesPromise, matchingPromise, plansPromise])

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
          <div className="relative pt-14 md:pt-0 min-h-full">
            {showTrialBanner && <TrialBanner daysLeft={trialDaysLeft} />}
            {matchingStatus && matchingStatus !== 'ready' && (
              <MatchingProgressBanner
                initialStatus={matchingStatus}
                initialMatchCount={initialMatchCount}
              />
            )}
            <ProfileHealthBanner />
            {showExpiredOverlay && <TrialExpiredOverlay plans={overlayPlans} />}
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
