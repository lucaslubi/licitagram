export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { DashboardAiWrapper } from '@/components/dashboard-ai-wrapper'
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
  { href: '/documents', label: 'Certidões', requiredFeature: 'compliance_checker' },
  { href: '/archive', label: 'Arquivo' },
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

  return (
    <div className="flex h-screen bg-gray-50 font-roboto">
      <DashboardSidebar
        navItems={visibleNavItems}
        isAdmin={!!user.isPlatformAdmin}
        userName={userName}
        userEmail={userEmail}
        userInitial={userInitial}
        planName={planName}
      />

      {/* Main content — add top padding on mobile for the fixed top bar */}
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="pt-14 md:pt-0 h-full">
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
  )
}
