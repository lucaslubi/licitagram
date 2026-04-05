export { computeStatistics, assessConfidence, calculatePercentile, aggregateByDimension, filterOutliers, deduplicateRecords, DEFAULT_OUTLIER_CONFIG } from './price-aggregator'
export { analyzeTrend, groupByMonth, analyzeTrendDirection } from './trend-analyzer'
export { buildSearchClause, buildFilterClauses, buildFullQuery, generateCacheKey } from './search-engine'
export { cachedQuery } from './cache-strategy'
export { formatAsCSV, formatAsSpreadsheetData, formatAsSummaryText } from './export-formatter'
export {
  computeDiscountRatioStats,
  fitWinProbabilityModel,
  generateRecommendations,
  generateWinCurve,
  assessContextualConfidence,
} from './statistical-engine'
export type {
  ContextualBid,
  DiscountRatioStats,
  WinProbModel,
  WinCurvePoint,
  PricingRecommendation,
  PriceBand,
  ConfidenceLevel,
} from './statistical-engine'
export type * from './types'
