/**
 * GLOBAL SCORE COLOR SYSTEM (Dark Theme)
 *
 * Single source of truth for all score-based colors across the entire app.
 * Rules:
 *   90+  → Excelente (emerald — top tier)
 *   80-89 → Bom (lime — strong match)
 *   70-79 → Moderado (amber — decent)
 *   50-69 → Baixo (slate — needs review)
 *   <50  → Fraco (red — weak)
 */

/** Tailwind bg+text classes for score badges */
export function getScoreBgClass(score: number): string {
  if (score >= 90) return 'bg-emerald-500/10 text-emerald-400'
  if (score >= 80) return 'bg-lime-500/10 text-lime-400'
  if (score >= 70) return 'bg-amber-500/10 text-amber-400'
  if (score >= 50) return 'bg-slate-500/10 text-slate-400'
  return 'bg-red-500/15 text-red-400'
}

/** Tailwind bg+text+border classes for score badges with border */
export function getScoreBorderClass(score: number): string {
  if (score >= 90) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (score >= 80) return 'bg-lime-500/10 text-lime-400 border-lime-500/20'
  if (score >= 70) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  if (score >= 50) return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  return 'bg-red-500/15 text-red-400 border-red-500/30'
}

/** Hex color for map markers and charts */
export function getScoreHex(score: number): string {
  if (score >= 90) return '#10B981' // Emerald — Excelente
  if (score >= 80) return '#84CC16' // Lime — Bom
  if (score >= 70) return '#F59E0B' // Amber — Moderado
  if (score >= 50) return '#64748B' // Slate — Baixo
  return '#EF4444'                  // Red — Fraco
}

/** Tailwind color class for progress bars */
export function getScoreBarClass(score: number): string {
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 80) return 'bg-lime-500'
  if (score >= 70) return 'bg-amber-500'
  if (score >= 50) return 'bg-slate-500'
  return 'bg-red-400'
}

/** Whether a match qualifies as top-tier */
export function isSuperHot(score: number): boolean {
  return score >= 90
}
