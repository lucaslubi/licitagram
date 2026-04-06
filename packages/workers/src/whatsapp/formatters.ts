/**
 * WhatsApp-specific formatters.
 * WhatsApp uses: *bold*, _italic_, ~strikethrough~, ```code```
 * Does NOT support HTML, clickable labeled links, or inline keyboards.
 */

export function scoreBar(score: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(score / 10)))
  return '\u2593'.repeat(filled) + '\u2591'.repeat(10 - filled)
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/D'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'N/D'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  const ts = new Date(dateStr).getTime()
  if (isNaN(ts)) return 0
  return Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24))
}
