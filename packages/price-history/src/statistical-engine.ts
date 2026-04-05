/**
 * Statistical Pricing Engine v3
 *
 * Core insight: normalize all prices as discount_ratio = valor_proposta / valor_estimado
 * This eliminates raw price variance — a R$4 software and R$1M ERP both converge
 * to similar discount ratios (typically 0.70–0.95).
 *
 * Features:
 * - Discount ratio statistics (overall + winners)
 * - Logistic regression for P(win) given discount_ratio
 * - Win probability curve generation
 * - Statistical recommendation engine (replaces LLM guesses)
 * - Contextual confidence scoring
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextualBid {
  valor_proposta: number
  valor_estimado: number
  discount_ratio: number
  is_winner: boolean
  porte: string
  uf: string
  modalidade_nome: string
  num_competitors: number
  data_encerramento: string
  orgao_nome: string
  cnpj: string
  nome: string
}

export interface DiscountRatioStats {
  overall: {
    count: number
    mean: number
    median: number
    p10: number
    p25: number
    p75: number
    p90: number
    std_deviation: number
    cv_percent: number
  }
  winners: {
    count: number
    mean: number
    median: number
    p10: number
    p25: number
    p75: number
    p90: number
    std_deviation: number
  }
}

export interface WinProbModel {
  type: 'logistic' | 'empirical'
  coefficients?: { beta0: number; beta1: number; beta2: number }
  predict: (discountRatio: number, numCompetitors?: number) => number
  sampleSize: number
  winnerCount: number
}

export interface WinCurvePoint {
  discount_pct: number // 0-50% (desconto sobre estimado)
  ratio: number // 0.50-1.10
  price: number // valor_estimado * ratio
  win_probability: number // 0-100
}

export interface PricingRecommendation {
  strategy: 'agressivo' | 'competitivo' | 'seguro'
  price: number
  discount_ratio: number
  discount_pct: number // % de desconto sobre valor_estimado
  win_probability: number // 0-100
  risk_level: 'alto' | 'medio' | 'baixo'
  rationale: string
}

export interface PriceBand {
  band_id: string
  band_label: string
  range: { min: number; max: number }
  count: number
  avg_discount_ratio: number
  median_discount_ratio: number
  winner_avg_discount_ratio: number
  avg_valor_estimado: number
}

export type ConfidenceLevel = 'alta' | 'média' | 'baixa'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortedNumbers(values: number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const frac = idx - lo
  return sorted[lo] + frac * (sorted[hi] - sorted[lo])
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function median(values: number[]): number {
  return percentile(sortedNumbers(values), 50)
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0
  const sqDiffs = values.map((v) => (v - avg) ** 2)
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1))
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

// ─── 1. Discount Ratio Statistics ─────────────────────────────────────────────

export function computeDiscountRatioStats(bids: ContextualBid[]): DiscountRatioStats {
  const allRatios = bids
    .map((b) => b.discount_ratio)
    .filter((r) => r > 0 && r < 5) // sanity: exclude absurd ratios

  const winnerRatios = bids
    .filter((b) => b.is_winner)
    .map((b) => b.discount_ratio)
    .filter((r) => r > 0 && r < 5)

  const sortedAll = sortedNumbers(allRatios)
  const sortedWin = sortedNumbers(winnerRatios)

  const allMean = mean(allRatios)
  const winMean = mean(winnerRatios)

  const allStd = stddev(allRatios, allMean)

  return {
    overall: {
      count: allRatios.length,
      mean: round4(allMean),
      median: round4(percentile(sortedAll, 50)),
      p10: round4(percentile(sortedAll, 10)),
      p25: round4(percentile(sortedAll, 25)),
      p75: round4(percentile(sortedAll, 75)),
      p90: round4(percentile(sortedAll, 90)),
      std_deviation: round4(allStd),
      cv_percent: allMean > 0 ? round2((allStd / allMean) * 100) : 0,
    },
    winners: {
      count: winnerRatios.length,
      mean: round4(winMean),
      median: round4(percentile(sortedWin, 50)),
      p10: round4(percentile(sortedWin, 10)),
      p25: round4(percentile(sortedWin, 25)),
      p75: round4(percentile(sortedWin, 75)),
      p90: round4(percentile(sortedWin, 90)),
      std_deviation: round4(stddev(winnerRatios, winMean)),
    },
  }
}

// ─── 2. Win Probability Model ────────────────────────────────────────────────

/**
 * Builds a win-probability model from historical bid data.
 *
 * IMPORTANT: Our database only contains WINNING bids (situacao = 'Homologado').
 * There are no losing bids to train a true logistic regression. Instead, we use
 * a **percentile-rank model**:
 *
 *   P(win | ratio) = % of historical winners who bid at a HIGHER ratio (less aggressive)
 *
 * Interpretation: "If you bid at ratio 0.80, you would have been more competitive
 * than X% of past winners in this market." This is a reasonable proxy for win
 * probability because lower ratios (bigger discounts) are more competitive.
 *
 * When we have both winners AND losers (future data), this function automatically
 * switches to logistic regression for true P(win) estimation.
 */
export function fitWinProbabilityModel(bids: ContextualBid[]): WinProbModel {
  const validBids = bids.filter(
    (b) => b.discount_ratio > 0 && b.discount_ratio < 3 && b.num_competitors > 0,
  )

  const winners = validBids.filter((b) => b.is_winner)
  const losers = validBids.filter((b) => !b.is_winner)

  // Check if we have meaningful negative examples for logistic regression
  const winRate = validBids.length > 0 ? winners.length / validBids.length : 1
  const hasNegativeExamples = losers.length >= 10 && winRate < 0.90

  if (hasNegativeExamples && validBids.length >= 30) {
    return fitLogisticModel(validBids, winners.length)
  }

  // Default: percentile-rank model (works with winners-only data)
  return buildPercentileRankModel(validBids)
}

/**
 * Percentile-rank model for winners-only data.
 *
 * P(win | ratio) = % of historical winners who bid at ratio >= yours
 * Lower ratio = bigger discount = higher percentile rank = higher "probability"
 *
 * Uses a smoothed CDF with linear interpolation.
 */
function buildPercentileRankModel(bids: ContextualBid[]): WinProbModel {
  // Use all bids (they're all winners in our data)
  const ratios = sortedNumbers(
    bids.map((b) => b.discount_ratio).filter((r) => r > 0.01 && r < 3),
  )

  const winnerCount = bids.filter((b) => b.is_winner).length

  return {
    type: 'empirical',
    predict: (ratio: number) => {
      if (ratios.length === 0) return 50

      // Count how many historical winners bid at ratio >= yours (less competitive)
      // If you bid lower, you beat more past winners → higher probability
      const beatCount = ratios.filter((r) => r >= ratio).length
      const rawPct = (beatCount / ratios.length) * 100

      // Apply sigmoid smoothing to avoid harsh 0%/100% edges
      // Map [0, 100] → [5, 95] for display comfort
      return round2(5 + rawPct * 0.9)
    },
    sampleSize: bids.length,
    winnerCount,
  }
}

/**
 * Logistic regression model for data with both winners and losers.
 * P(win) = sigmoid(β₀ + β₁·ratio + β₂·log(competitors))
 * Uses IRLS (Iteratively Reweighted Least Squares).
 */
function fitLogisticModel(validBids: ContextualBid[], winnerCount: number): WinProbModel {
  const n = validBids.length
  const X: number[][] = []
  const y: number[] = []

  for (const bid of validBids) {
    X.push([1, bid.discount_ratio, Math.log(bid.num_competitors + 1)])
    y.push(bid.is_winner ? 1 : 0)
  }

  let beta = [0, -2, -0.5]
  const maxIter = 20
  const tol = 1e-6

  for (let iter = 0; iter < maxIter; iter++) {
    const mu: number[] = []
    const W: number[] = []
    const z: number[] = []

    for (let i = 0; i < n; i++) {
      const eta = beta[0] * X[i][0] + beta[1] * X[i][1] + beta[2] * X[i][2]
      const p = sigmoid(eta)
      const pClamped = Math.max(1e-7, Math.min(1 - 1e-7, p))
      mu.push(pClamped)
      W.push(pClamped * (1 - pClamped))
      z.push(eta + (y[i] - pClamped) / (pClamped * (1 - pClamped)))
    }

    const XtWX = Array.from({ length: 3 }, () => Array(3).fill(0))
    const XtWz = Array(3).fill(0)

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 3; j++) {
        XtWz[j] += X[i][j] * W[i] * z[i]
        for (let k = 0; k < 3; k++) {
          XtWX[j][k] += X[i][j] * W[i] * X[i][k]
        }
      }
    }

    const newBeta = solve3x3(XtWX, XtWz)
    if (!newBeta) break

    const diff = Math.sqrt(
      newBeta.reduce((sum, b, i) => sum + (b - beta[i]) ** 2, 0),
    )
    beta = newBeta
    if (diff < tol) break
  }

  return {
    type: 'logistic',
    coefficients: { beta0: beta[0], beta1: beta[1], beta2: beta[2] },
    predict: (ratio: number, numComp = 5) => {
      const eta = beta[0] + beta[1] * ratio + beta[2] * Math.log(numComp + 1)
      return round2(sigmoid(eta) * 100)
    },
    sampleSize: validBids.length,
    winnerCount,
  }
}

function solve3x3(A: number[][], b: number[]): number[] | null {
  const det =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])

  if (Math.abs(det) < 1e-12) return null

  const detX =
    b[0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (b[1] * A[2][2] - A[1][2] * b[2]) +
    A[0][2] * (b[1] * A[2][1] - A[1][1] * b[2])

  const detY =
    A[0][0] * (b[1] * A[2][2] - A[1][2] * b[2]) -
    b[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * b[2] - b[1] * A[2][0])

  const detZ =
    A[0][0] * (A[1][1] * b[2] - b[1] * A[2][1]) -
    A[0][1] * (A[1][0] * b[2] - b[1] * A[2][0]) +
    b[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])

  return [detX / det, detY / det, detZ / det]
}

// ─── 3. Recommendation Generator ─────────────────────────────────────────────

export function generateRecommendations(
  valorEstimado: number,
  stats: DiscountRatioStats,
  model: WinProbModel,
  numCompetitors = 5,
): PricingRecommendation[] {
  const { winners } = stats

  // Use winner distribution to derive strategies
  const aggressiveRatio = winners.count >= 3 ? winners.p25 : stats.overall.p25
  const competitiveRatio = winners.count >= 3 ? winners.median : stats.overall.median
  const safeRatio = winners.count >= 3 ? winners.p75 : stats.overall.p75

  return [
    buildRecommendation('agressivo', aggressiveRatio, valorEstimado, model, numCompetitors, stats),
    buildRecommendation('competitivo', competitiveRatio, valorEstimado, model, numCompetitors, stats),
    buildRecommendation('seguro', safeRatio, valorEstimado, model, numCompetitors, stats),
  ]
}

function buildRecommendation(
  strategy: PricingRecommendation['strategy'],
  ratio: number,
  valorEstimado: number,
  model: WinProbModel,
  numCompetitors: number,
  stats: DiscountRatioStats,
): PricingRecommendation {
  const price = round2(valorEstimado * ratio)
  const discountPct = round2((1 - ratio) * 100)
  const winProb = model.predict(ratio, numCompetitors)

  const riskLevel: PricingRecommendation['risk_level'] =
    strategy === 'agressivo' ? 'alto' : strategy === 'competitivo' ? 'medio' : 'baixo'

  const rationales: Record<string, string> = {
    agressivo: `Preço no P25 dos vencedores (desconto de ${discountPct.toFixed(1)}%). ${
      stats.winners.count >= 10
        ? `Baseado em ${stats.winners.count} lances vencedores na mesma faixa de valor.`
        : 'Amostra limitada — considere ajustar.'
    } Risco elevado de margem insuficiente.`,
    competitivo: `Preço na mediana dos vencedores (desconto de ${discountPct.toFixed(1)}%). ${
      stats.winners.count >= 10
        ? `${stats.winners.count} vencedores históricos praticaram desconto similar.`
        : 'Referência estatística com amostra moderada.'
    } Equilíbrio entre competitividade e margem.`,
    seguro: `Preço no P75 dos vencedores (desconto de ${discountPct.toFixed(1)}%). ${
      stats.winners.count >= 10
        ? `Margem confortável. ${Math.round(stats.winners.count * 0.75)} de ${stats.winners.count} vencedores praticaram desconto menor.`
        : 'Posição conservadora com margem preservada.'
    } Menor risco de prejuízo.`,
  }

  return {
    strategy,
    price,
    discount_ratio: round4(ratio),
    discount_pct: discountPct,
    win_probability: winProb,
    risk_level: riskLevel,
    rationale: rationales[strategy],
  }
}

// ─── 4. Win Probability Curve ─────────────────────────────────────────────────

export function generateWinCurve(
  model: WinProbModel,
  valorEstimado: number,
  numCompetitors = 5,
  points = 25,
): WinCurvePoint[] {
  const curve: WinCurvePoint[] = []
  const minRatio = 0.50
  const maxRatio = 1.15
  const step = (maxRatio - minRatio) / (points - 1)

  for (let i = 0; i < points; i++) {
    const ratio = minRatio + step * i
    const discountPct = round2((1 - ratio) * 100)
    const price = round2(valorEstimado * ratio)
    const winProb = model.predict(ratio, numCompetitors)

    curve.push({
      discount_pct: discountPct,
      ratio: round4(ratio),
      price,
      win_probability: Math.max(0, Math.min(100, winProb)),
    })
  }

  return curve
}

// ─── 5. Contextual Confidence ─────────────────────────────────────────────────

export function assessContextualConfidence(
  sampleSize: number,
  winnerCount: number,
  cvRatio: number,
  bandWasWidened: boolean,
): { level: ConfidenceLevel; label: string; detail: string } {
  if (sampleSize >= 30 && winnerCount >= 10 && cvRatio < 30 && !bandWasWidened) {
    return {
      level: 'alta',
      label: 'Alta',
      detail: `${sampleSize} amostras, ${winnerCount} vencedores, CV ${cvRatio.toFixed(0)}% — dados consistentes na faixa exata.`,
    }
  }

  if (sampleSize >= 10 && winnerCount >= 3) {
    return {
      level: 'média',
      label: 'Média',
      detail: `${sampleSize} amostras, ${winnerCount} vencedores${bandWasWidened ? ' (faixa ampliada)' : ''}. Resultados indicativos.`,
    }
  }

  return {
    level: 'baixa',
    label: 'Baixa',
    detail: `Apenas ${sampleSize} amostras e ${winnerCount} vencedores. Use como referência inicial.`,
  }
}

// ─── Rounding helpers ─────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
