/**
 * GLOBAL SCORE COLOR SYSTEM (Dark Theme)
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
  if (score >= 80) return 'bg-orange-500/15 text-orange-400'
  if (score >= 70) return 'bg-emerald-500/15 text-emerald-400'
  if (score >= 50) return 'bg-amber-500/15 text-amber-400'
  return 'bg-red-500/15 text-red-400'
}

/** Tailwind bg+text+border classes for score badges with border */
export function getScoreBorderClass(score: number): string {
  if (score >= 80) return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
  if (score >= 70) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  if (score >= 50) return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  return 'bg-red-500/15 text-red-400 border-red-500/30'
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
