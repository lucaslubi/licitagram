'use client'

import { useState } from 'react'
import { ConsultantProvider } from '@/contexts/consultant-context'
import { AiConsultant } from '@/components/ai-consultant'
import { OnboardingWizard } from '@/components/onboarding-wizard'
import { OnboardingTour } from '@/components/onboarding-tour'

interface DashboardAiWrapperProps {
  children: React.ReactNode
  onboardingCompleted: boolean
  userUfs: string[]
  userKeywords: string[]
  hasTelegram: boolean
  hasWhatsapp: boolean
}

export function DashboardAiWrapper({
  children,
  onboardingCompleted,
  userUfs,
  userKeywords,
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

      {showWizard && (
        <OnboardingWizard
          userUfs={userUfs}
          userKeywords={userKeywords}
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
