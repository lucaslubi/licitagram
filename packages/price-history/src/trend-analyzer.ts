import type { PriceRecord, PriceTrend } from './types'

// ─── Helpers ──────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Simple linear regression: y = a*x + b
 * Returns { slope, intercept }
 */
function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 }

  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }

  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX
  return { slope, intercept }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Group records by YYYY-MM, compute count/median/min/max for each month.
 * Sorted chronologically.
 */
export function groupByMonth(records: PriceRecord[]): PriceTrend['points'] {
  const groups = new Map<string, number[]>()

  for (const r of records) {
    const d = r.date_homologation instanceof Date ? r.date_homologation : new Date(r.date_homologation)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r.unit_price)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, prices]) => ({
      month,
      count: prices.length,
      median: median(prices),
      min: Math.min(...prices),
      max: Math.max(...prices),
    }))
}

/**
 * Determine trend direction using linear regression on monthly medians.
 * slope > 2% of mean => 'subindo', slope < -2% of mean => 'descendo', else 'estavel'.
 * Also returns the 12-month variation percent if there are enough points.
 */
export function analyzeTrendDirection(
  points: PriceTrend['points'],
): { direction: PriceTrend['direction']; variation_percent: number | undefined } {
  if (points.length < 2) {
    return { direction: 'estavel', variation_percent: undefined }
  }

  const xs = points.map((_, i) => i)
  const ys = points.map((p) => p.median)
  const { slope } = linearRegression(xs, ys)
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length

  // Total change over the full span as a percentage of the mean
  const totalChange = slope * (points.length - 1)
  const changePercent = meanY !== 0 ? (totalChange / meanY) * 100 : 0

  let direction: PriceTrend['direction'] = 'estavel'
  if (changePercent > 2) direction = 'subindo'
  else if (changePercent < -2) direction = 'descendo'

  // 12-month variation: compare last vs first point if we have enough data
  let variation_percent: number | undefined = undefined
  if (points.length >= 2) {
    const first = points[0].median
    const last = points[points.length - 1].median
    if (first !== 0) {
      variation_percent = ((last - first) / first) * 100
    }
  }

  return { direction, variation_percent }
}

/**
 * Project the next month's median using linear regression.
 * Returns undefined if fewer than 3 months of data.
 */
export function projectNextMonth(points: PriceTrend['points']): number | undefined {
  if (points.length < 3) return undefined

  const xs = points.map((_, i) => i)
  const ys = points.map((p) => p.median)
  const { slope, intercept } = linearRegression(xs, ys)

  const projected = slope * points.length + intercept
  return Math.max(0, projected)
}

/**
 * Full trend analysis: group by month, detect direction, project next month.
 */
export function analyzeTrend(records: PriceRecord[]): PriceTrend {
  const points = groupByMonth(records)
  const { direction, variation_percent } = analyzeTrendDirection(points)
  const projected = projectNextMonth(points)

  return {
    points,
    direction,
    variation_12m_percent: variation_percent,
    projected_price_next_month: projected,
  }
}
