/**
 * GLOBAL SCORE COLOR SYSTEM
 *
 * Single source of truth for all score-based colors across the entire app.
 * Rules:
 *   80+  → Super Quente (orange)
 *   70-79 → Verde (green, strong match)
 *   50-69 → Amarelo (yellow, needs review)
 *   <50  → Vermelho (red, weak)
 */

/** Tailwind bg+text classes for score badges */
export function getScoreBgClass(score: number): string {
  if (score >= 80) return 'bg-orange-100 text-orange-800'
  if (score >= 70) return 'bg-emerald-100 text-emerald-800'
  if (score >= 50) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

/** Tailwind bg+text+border classes for score badges with border */
export function getScoreBorderClass(score: number): string {
  if (score >= 80) return 'bg-orange-100 text-orange-800 border-orange-200'
  if (score >= 70) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (score >= 50) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-red-100 text-red-800 border-red-200'
}

/** Hex color for map markers and charts */
export function getScoreHex(score: number): string {
  if (score >= 80) return '#F97316' // Super Quente
  if (score >= 70) return '#10B981' // Verde
  if (score >= 50) return '#FBBF24' // Amarelo
  return '#EF4444'                  // Vermelho
}

/** Tailwind color class for progress bars */
export function getScoreBarClass(score: number): string {
  if (score >= 80) return 'bg-orange-500'
  if (score >= 70) return 'bg-green-500'
  if (score >= 50) return 'bg-yellow-500'
  return 'bg-red-400'
}

/** Whether a match qualifies as "Super Quente" */
export function isSuperHot(score: number): boolean {
  return score >= 80
}
