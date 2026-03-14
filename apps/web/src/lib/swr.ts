/**
 * SWR configuration and hooks for client-side data fetching.
 *
 * Usage:
 * - Interactive data that changes on user action (match status, AI analysis)
 * - Stale-while-revalidate for polled data
 * - Optimistic updates for UI responsiveness
 */

import useSWR, { SWRConfiguration } from 'swr'

// ─── Default Fetcher ─────────────────────────────────────────────────────────

export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) {
    const error = new Error('Fetch failed') as Error & { status: number }
    error.status = res.status
    throw error
  }
  return res.json()
}

// ─── SWR Defaults ────────────────────────────────────────────────────────────

export const swrDefaults: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: false,       // Don't refetch on tab focus (data is cached)
  revalidateOnReconnect: true,    // Refetch on reconnect
  dedupingInterval: 5000,         // Dedup identical requests within 5s
  errorRetryCount: 3,
  errorRetryInterval: 5000,
}

// ─── Typed Hooks ─────────────────────────────────────────────────────────────

interface MatchStatusData {
  id: string
  status: string
  score: number
  match_source: string
  ai_justificativa: string | null
  recomendacao: string | null
}

/**
 * Hook to watch match status updates (e.g., after AI analysis).
 * Revalidates every 10s while AI is processing.
 */
export function useMatchStatus(matchId: string | null) {
  return useSWR<MatchStatusData>(
    matchId ? `/api/matches/${matchId}/status` : null,
    {
      ...swrDefaults,
      refreshInterval: (data) => {
        // Poll every 10s while AI analysis might be in progress
        if (data && !data.ai_justificativa && data.match_source === 'keyword') {
          return 10_000
        }
        return 0 // Stop polling once AI data arrives
      },
    },
  )
}

interface DashboardStatsData {
  totalTenders: number
  recentTendersCount: number
  matchCount: number
  highScoreMatchCount: number
}

/**
 * Hook for dashboard stats.
 * Revalidates every 5 minutes.
 */
export function useDashboardStats() {
  return useSWR<DashboardStatsData>('/api/stats/dashboard', {
    ...swrDefaults,
    refreshInterval: 5 * 60 * 1000, // 5 min
  })
}
