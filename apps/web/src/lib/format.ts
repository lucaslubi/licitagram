/**
 * Centralized formatting utilities for the Licitagram web app.
 *
 * Consolidates 20+ duplicate formatter definitions that were scattered
 * across admin pages, dashboard components and API routes.
 */

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/** Format **cents** (integer) to BRL currency string: 15000 -> "R$ 150,00" */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

/** Format a raw numeric value (NOT cents) to BRL: 1500.5 -> "R$ 1.500,50" */
export function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Format a nullable numeric value to BRL with no decimal places.
 * Returns "R$ 0" when value is falsy.
 */
export function formatCurrencyWhole(value: number | null): string {
  if (!value) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Format a nullable numeric value to BRL with 2 decimal places.
 * Returns "N/D" when value is null/undefined (but keeps 0).
 */
export function formatCurrencyNullable(value: number | null | undefined): string {
  if (!value && value !== 0) return 'N/D'
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

/** Format a date string or Date to pt-BR: "11/04/2026" */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** Format a nullable date string to pt-BR, returning a dash on null. */
export function formatDateNullable(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR')
  } catch {
    return dateStr
  }
}

/** Format to short pt-BR date with 2-digit year: "11/04/26" */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

/** Format to pt-BR date with time: "11/04/2026, 14:30" */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format to human-readable pt-BR: "11 Abr 2026" */
export function formatDatePtBr(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Document numbers
// ---------------------------------------------------------------------------

/** Format CNPJ: 12345678000199 -> "12.345.678/0001-99" */
export function formatCNPJ(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** Format number with compact suffix: 1500 -> "1.5K", 2000000 -> "2.0M" */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('pt-BR')
}

/** Format number with pt-BR locale (no compact): 1500 -> "1.500" */
export function formatNumberPlain(n: number): string {
  return n.toLocaleString('pt-BR')
}

/** Format as percentage: 87.3 -> "87.3%" */
export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

/** Format as signed percentage: 5.2 -> "+5.2%", -3.1 -> "-3.1%" */
export function formatPercentSigned(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

/**
 * Format a ratio (0-1) as percentage: 0.853 -> "85.3%"
 * Returns "0%" for null/undefined.
 */
export function formatPercentFromRatio(value: number | null): string {
  if (value === null || value === undefined) return '0%'
  return `${(Number(value) * 100).toFixed(1)}%`
}

// ---------------------------------------------------------------------------
// Compact currency
// ---------------------------------------------------------------------------

/**
 * Compact BRL without spaces: 1200000 -> "R$1.2M", 4500 -> "R$4500"
 * Good for tight UI (kanban cards, map markers).
 */
export function formatCompactBRL(value: number): string {
  if (value >= 1_000_000_000) return `R$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$${(value / 1_000).toFixed(0)}K`
  return `R$${value.toFixed(0)}`
}

/**
 * Compact BRL using Intl compact notation: 1200000 -> "R$ 1,2 mi"
 */
export function formatCompactBRLIntl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
  }).format(value)
}

/**
 * Compact number without currency prefix: 1200000 -> "1.2M", 4500 -> "4500"
 * For use in API labels, chart axes, etc. where "R$" is not wanted.
 */
export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} mil`
  return n.toLocaleString('pt-BR')
}

/**
 * Y-axis formatter for BRL charts: 2500000 -> "R$ 2,5M", 4000 -> "R$ 4.000"
 */
export function formatYAxisBRL(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${Math.round(value / 1_000).toLocaleString('pt-BR')}k`
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`
}

// ---------------------------------------------------------------------------
// Month labels
// ---------------------------------------------------------------------------

const MONTHS_PTBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** Format "2026-04" -> "Abr/26" */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-')
  const monthIndex = parseInt(m, 10) - 1
  if (monthIndex < 0 || monthIndex > 11) return month
  return `${MONTHS_PTBR[monthIndex]}/${year.slice(2)}`
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

/** Format Brazilian phone: 11987654321 -> "(11) 98765-4321" */
export function formatPhoneBR(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

// ---------------------------------------------------------------------------
// File size
// ---------------------------------------------------------------------------

/** Format bytes to human-readable: 1536 -> "1.5 KB" */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[i]}`
}

// ---------------------------------------------------------------------------
// Input masking
// ---------------------------------------------------------------------------

/** Format raw digit string for BRL input mask: "15000" -> "150,00" */
export function formatInputBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const numericValue = parseInt(digits, 10) / 100
  return numericValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
