'use client'

import { useState } from 'react'
import { ConsultantProvider } from '@/contexts/consultant-context'
import { AiConsultant } from '@/components/ai-consultant'
import { OnboardingWizard } from '@/components/onboarding-wizard'
import { OnboardingTour } from '@/components/onboarding-tour'
import { GlobalPlaybook } from '@/components/global-playbook'

interface DashboardAiWrapperProps {
  children: React.ReactNode
  onboardingCompleted: boolean
  userUfs: string[]
  userKeywords: string[]
  userEmail: string
  hasTelegram: boolean
  hasWhatsapp: boolean
}

export function DashboardAiWrapper({
  children,
  onboardingCompleted,
  userUfs,
  userKeywords,
  userEmail,
  hasTelegram,
  hasWhatsapp,
}: DashboardAiWrapperProps) {
  const [showWizard, setShowWizard] = useState(!onboardingCompleted)
  const [showTour, setShowTour] = useState(false)

  const handleWizardComplete = (startTour: boolean) => {
    setShowWizard(false)
    if (startTour) {
      setShowTour(true)
    }
  }

  const handleTourComplete = () => {
    setShowTour(false)
  }

  return (
    <ConsultantProvider>
      {children}

      <AiConsultant />
      <GlobalPlaybook />

      {showWizard && (
        <OnboardingWizard
          userUfs={userUfs}
          userKeywords={userKeywords}
          userEmail={userEmail}
          hasTelegram={hasTelegram}
          hasWhatsapp={hasWhatsapp}
          onComplete={handleWizardComplete}
        />
      )}

      {showTour && (
        <OnboardingTour onComplete={handleTourComplete} autoStart />
      )}
    </ConsultantProvider>
  )
}
