import type { PriceRecord, PriceStatistics } from './types'

// ─── Helpers ──────────────────────────────────────────────────

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const squaredDiffs = values.map((v) => (v - mean) ** 2)
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1))
}

function calculateCV(stdDev: number, mean: number): number {
  if (mean === 0) return 0
  return (stdDev / mean) * 100
}

// ─── Outlier Filtering ───────────────────────────────────────

export interface OutlierConfig {
  /** Records with price > median * multiplier_above are marked as outlier. Default: 5 */
  multiplier_above: number
  /** Records with price < median * multiplier_below are marked as outlier. Default: 0.1 */
  multiplier_below: number
  /** Minimum records required to apply filtering. Default: 5 */
  min_records: number
}

export const DEFAULT_OUTLIER_CONFIG: OutlierConfig = {
  multiplier_above: 5,
  multiplier_below: 0.1,
  min_records: 5,
}

/**
 * Filter outliers using IQR method + median multiplier.
 * Returns the same array with `is_valid` set to false for outliers,
 * and `confidence_score` set to 0 for excluded records.
 * Also adds an `exclusion_reason` field.
 */
export function filterOutliers(
  records: PriceRecord[],
  config: Partial<OutlierConfig> = {},
): PriceRecord[] {
  const cfg = { ...DEFAULT_OUTLIER_CONFIG, ...config }

  if (records.length < cfg.min_records) return records

  const prices = records.map((r) => r.unit_price).filter((p) => p > 0)
  if (prices.length === 0) return records

  const median = calculateMedian(prices)
  const p25 = calculatePercentile(prices, 25)
  const p75 = calculatePercentile(prices, 75)
  const iqr = p75 - p25

  // Combine IQR method with median multiplier for robust detection
  const iqrUpperBound = p75 + 3 * iqr
  const iqrLowerBound = Math.max(0, p25 - 3 * iqr)
  const medianUpperBound = median * cfg.multiplier_above
  const medianLowerBound = median * cfg.multiplier_below

  // Use the tighter of the two bounds
  const upperBound = Math.min(iqrUpperBound, medianUpperBound)
  const lowerBound = Math.max(iqrLowerBound, medianLowerBound)

  return records.map((r) => {
    if (r.unit_price > upperBound) {
      return { ...r, is_valid: false, confidence_score: 0 }
    }
    if (r.unit_price < lowerBound && r.unit_price > 0) {
      return { ...r, is_valid: false, confidence_score: 0 }
    }
    return r
  })
}

/**
 * Deduplicate records that have the same orgao + valor + date.
 * Keeps only 1 record per group and sets item_quantity to the group count.
 */
export function deduplicateRecords(records: PriceRecord[]): PriceRecord[] {
  const groups = new Map<string, { record: PriceRecord; count: number }>()

  for (const r of records) {
    const dateStr = r.date_homologation instanceof Date
      ? r.date_homologation.toISOString().split('T')[0]
      : String(r.date_homologation).split('T')[0]
    const key = `${r.orgao_nome}|${r.unit_price}|${dateStr}`

    if (!groups.has(key)) {
      groups.set(key, { record: { ...r }, count: 1 })
    } else {
      groups.get(key)!.count++
    }
  }

  return Array.from(groups.values()).map(({ record, count }) => ({
    ...record,
    item_quantity: count,
  }))
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Linear interpolation percentile.
 * For percentile p in [0,100] on a sorted array of n values,
 * the rank = p/100 * (n-1). Interpolates between floor and ceil indices.
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (percentile / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sorted[lower]
  const weight = rank - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

/**
 * Group records by an arbitrary dimension and compute count + median for each group.
 */
export function aggregateByDimension<T extends string>(
  records: PriceRecord[],
  dimension: (r: PriceRecord) => T,
): { key: T; count: number; median: number }[] {
  const groups = new Map<T, number[]>()
  for (const r of records) {
    const key = dimension(r)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r.unit_price)
  }
  return Array.from(groups.entries()).map(([key, prices]) => ({
    key,
    count: prices.length,
    median: calculateMedian(prices),
  }))
}

/**
 * Assess confidence based on sample size and coefficient of variation.
 * - alta:  count >= 10 AND cv < 25
 * - media: (count >= 5 AND count < 10) OR (cv >= 25 AND cv < 50)
 * - baixa: count < 5 OR cv >= 50
 */
export function assessConfidence(count: number, cv: number): 'alta' | 'media' | 'baixa' {
  if (count < 5 || cv >= 50) return 'baixa'
  if (count >= 10 && cv < 25) return 'alta'
  return 'media'
}

/**
 * Compute full statistics for a set of price records.
 */
export function computeStatistics(records: PriceRecord[]): PriceStatistics {
  const prices = records.map((r) => r.unit_price)

  if (prices.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      std_deviation: 0,
      cv_percent: 0,
      percentile_25: 0,
      percentile_75: 0,
      by_uf: [],
      by_modalidade: [],
      by_porte: [],
      confidence: 'baixa',
    }
  }

  const mean = calculateMean(prices)
  const median = calculateMedian(prices)
  const stdDev = calculateStdDev(prices, mean)
  const cv = calculateCV(stdDev, mean)

  return {
    count: prices.length,
    mean,
    median,
    min: Math.min(...prices),
    max: Math.max(...prices),
    std_deviation: stdDev,
    cv_percent: cv,
    percentile_25: calculatePercentile(prices, 25),
    percentile_75: calculatePercentile(prices, 75),
    by_uf: aggregateByDimension(records, (r) => r.orgao_uf),
    by_modalidade: aggregateByDimension(records, (r) => r.licitacao_modalidade),
    by_porte: aggregateByDimension(records, (r) => r.supplier_porte),
    confidence: assessConfidence(prices.length, cv),
  }
}
