'use client'

import { useEffect } from 'react'
import { initAnalytics, posthog } from '@/lib/analytics'

interface Props {
  userId: string
  email: string
  orgaoId: string | null
  orgaoEsfera?: string | null
  orgaoUf?: string | null
  papel?: string | null
}

/**
 * Client-only side effect: initialize PostHog and identify the current user
 * once we know who they are. Sets group context so funnels can split by orgão.
 * Renders nothing.
 */
export function PostHogIdentify({ userId, email, orgaoId, orgaoEsfera, orgaoUf, papel }: Props) {
  useEffect(() => {
    initAnalytics()
    posthog.identify(userId, {
      email,
      papel: papel ?? undefined,
    })
    if (orgaoId) {
      posthog.group('orgao', orgaoId, {
        esfera: orgaoEsfera ?? undefined,
        uf: orgaoUf ?? undefined,
      })
    }
  }, [userId, email, orgaoId, orgaoEsfera, orgaoUf, papel])
  return null
}
