export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { DashboardAiWrapper } from '@/components/dashboard-ai-wrapper'
import { CompanyProvider } from '@/contexts/company-context'
import { CompanySwitcher } from './company-switcher'
import { getUserCompanies } from '@/actions/multi-company'
import { MatchingProgressBanner } from '@/components/matching-progress-banner'
import type { PlanFeatureKey } from '@licitagram/shared'

interface NavItem {
  href: string
  label: string
  requiredFeature?: PlanFeatureKey
  separator?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/map', label: 'Mapa' },
  { href: '/opportunities', label: 'Oportunidades' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/competitors', label: 'Concorrentes', requiredFeature: 'competitive_intel' },
  { href: '/bot', label: 'Robô', requiredFeature: 'bidding_bot' },
  { href: '/documents', label: 'Certidões', requiredFeature: 'compliance_checker' },
  { href: '/drive', label: 'Drive' },
  // --- separator ---
  { href: '/company', label: 'Empresa', separator: true },
  { href: '/billing', label: 'Plano' },
  { href: '/settings', label: 'Configurações' },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')

  // Filter nav items based on plan features
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.requiredFeature) return true
    return hasFeature(user, item.requiredFeature)
  }).map(({ href, label, separator }) => ({ href, label, separator }))

  const planName = user.plan?.name || null
  const userName = user.fullName || ''
  const userEmail = user.email || ''
  const userInitial = (user.fullName || user.email || 'U')[0].toUpperCase()

  // Fetch WhatsApp status for onboarding wizard
  let hasWhatsapp = false
  if (!user.onboardingCompleted) {
    const supabase = await createClient()
    const { data: wpData } = await supabase
      .from('users')
      .select('whatsapp_verified')
      .eq('id', user.userId)
      .single()
    hasWhatsapp = !!wpData?.whatsapp_verified
  }

  // ── Multi-company support ──────────────────────────────────────────────
  const multiCnpjEnabled = hasFeature(user, 'multi_cnpj')
  const maxCompanies = user.subscription?.max_companies || 1
  const userCompanies = await getUserCompanies()

  // Show company switcher if user has multi_cnpj OR already has >1 company
  const showSwitcher = multiCnpjEnabled || userCompanies.length > 1

  // ── Matching progress banner ───────────────────────────────────────────
  let matchingStatus: string | null = null
  let initialMatchCount = 0
  if (user.companyId) {
    const supabase = await createClient()
    const { data: companyData } = await supabase
      .from('companies')
      .select('matching_status')
      .eq('id', user.companyId)
      .single()
    matchingStatus = companyData?.matching_status || null

    if (matchingStatus && matchingStatus !== 'ready') {
      const { count } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', user.companyId)
        .gte('score', 50)
      initialMatchCount = count || 0
    }
  }

  return (
    <CompanyProvider
      initialCompanies={userCompanies}
      defaultCompanyId={user.companyId}
      maxCompanies={maxCompanies}
      multiCnpjEnabled={multiCnpjEnabled}
    >
      <div className="flex h-screen bg-[#111214] font-roboto">
        <DashboardSidebar
          navItems={visibleNavItems}
          isAdmin={!!user.isPlatformAdmin}
          userName={userName}
          userEmail={userEmail}
          userInitial={userInitial}
          planName={planName}
          companySwitcher={showSwitcher ? <CompanySwitcher /> : undefined}
        />

        {/* Main content — add top padding on mobile for the fixed top bar */}
        <main className="flex-1 overflow-auto bg-[#111214]">
          <div className="pt-14 md:pt-0 h-full">
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
              hasTelegram={!!user.telegramChatId}
              hasWhatsapp={hasWhatsapp}
            >
              <div className="p-4 md:p-8 h-full">{children}</div>
            </DashboardAiWrapper>
          </div>
        </main>
      </div>
    </CompanyProvider>
  )
}
