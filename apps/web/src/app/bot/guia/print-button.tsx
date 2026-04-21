'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
    >
      🖨️ Imprimir / Salvar PDF
    </button>
  )
}
