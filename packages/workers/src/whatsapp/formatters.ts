/**
 * WhatsApp-specific formatters.
 * WhatsApp uses: *bold*, _italic_, ~strikethrough~, ```code```
 * Does NOT support HTML, clickable labeled links, or inline keyboards.
 */

export function scoreBar(score: number): string {
  const filled = Math.round(score / 10)
  return '\u2593'.repeat(filled) + '\u2591'.repeat(10 - filled)
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}
