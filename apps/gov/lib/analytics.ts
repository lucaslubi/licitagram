'use client'

import posthog from 'posthog-js'

let initialized = false

export function initAnalytics() {
  if (initialized || typeof window === 'undefined') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
  if (!key) return
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    person_profiles: 'identified_only',
    // PII redaction (RI-14): never capture form values with sensitive data
    mask_all_text: false,
    mask_all_element_attributes: false,
    session_recording: { maskAllInputs: true },
  })
  initialized = true
}

export { posthog }
