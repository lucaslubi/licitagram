'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function ImpugnationCard({ matchId, dataAbertura }: { matchId: string; dataAbertura: string | null }) {
  const [showModal, setShowModal] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ texto_completo: string; prazo_limite: string; fundamentacao: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Calculate deadline (3 business days before opening)
  const prazoDate = dataAbertura ? new Date(dataAbertura) : null
  let diasRestantes = 0
  let prazoFormatted = ''
  if (prazoDate) {
    const prazo = new Date(prazoDate)
    let count = 0
    while (count < 3) {
      prazo.setDate(prazo.getDate() - 1)
      if (prazo.getDay() !== 0 && prazo.getDay() !== 6) count++
    }
    diasRestantes = Math.ceil((prazo.getTime() - Date.now()) / 86400000)
    prazoFormatted = prazo.toLocaleDateString('pt-BR')
  }

  const isExpired = prazoDate !== null && diasRestantes <= 0

  async function generate() {
    if (!motivo.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/impugnation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, motivo }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setResult(data)
      setShowModal(false)
    } catch { setError('Erro ao gerar impugnação') }
    finally { setLoading(false) }
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.texto_completo)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    if (!result) return
    const blob = new Blob([result.texto_completo], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'impugnacao_edital.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="card-refined">
        <div className="card-refined-header">
          <div className="flex items-center gap-2.5">
            <div className="card-refined-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            </div>
            <div>
              <h3 className="card-refined-title">Impugnação de Edital</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Gerador jurídico — Lei 14.133/2021</p>
            </div>
          </div>
          {diasRestantes > 0 && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border font-mono tabular-nums ${
              diasRestantes <= 3
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-foreground/5 text-muted-foreground border-border'
            }`}>
              {diasRestantes}d restantes
            </span>
          )}
        </div>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Gere uma impugnação formal completa fundamentada na Lei 14.133/2021, jurisprudência do TCU e argumentação em 5 camadas — pronta para protocolar.
            </p>
            {prazoFormatted && diasRestantes > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Prazo limite: <span className={diasRestantes <= 3 ? 'text-red-400 font-medium' : 'text-foreground font-medium'}>{prazoFormatted}</span>
                <span className="text-muted-foreground/60"> (art. 164, Lei 14.133 — 3 dias úteis antes da abertura)</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              {[
                'Peça formal completa',
                'Argumentação em 5 camadas',
                'Jurisprudência do TCU',
                'Redação substitutiva',
              ].map((f) => (
                <div key={f} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background border border-border">
                  <span className="text-[10px] text-muted-foreground">{f}</span>
                </div>
              ))}
            </div>

            <Button
              onClick={() => setShowModal(true)}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Gerar Impugnação
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {result.fundamentacao && (
              <div className="bg-background rounded-lg px-3 py-2 border border-border">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Fundamentação Principal</p>
                <p className="text-[11px] text-foreground/80 line-clamp-3">{result.fundamentacao}</p>
              </div>
            )}

            <div className="bg-background rounded-lg p-4 max-h-[500px] overflow-y-auto border border-border">
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">{result.texto_completo}</pre>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleDownload} className="text-xs">
                Baixar Documento
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopy} className="text-xs">
                {copied ? 'Copiado' : 'Copiar Texto'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setResult(null); setMotivo('') }} className="text-xs text-muted-foreground">
                Nova Impugnação
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg mx-4 w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              </div>
              <div>
                <h3 className="text-foreground font-semibold text-sm">Gerar Impugnação</h3>
                <p className="text-muted-foreground text-xs">Descreva o(s) motivo(s) para análise jurídica</p>
              </div>
            </div>

            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder={"Exemplos:\n• Exigência de atestado com quantitativo de 100% restringe competitividade\n• Indicação de marca sem justificativa técnica (cláusula 5.3)\n• Capital social mínimo exigido acima de 10% do valor estimado\n• Prazo de execução insuficiente para o porte do objeto"}
              className="w-full h-40 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />

            <div className="bg-background rounded-lg px-3 py-2 mt-3 border border-border">
              <p className="text-[10px] text-muted-foreground">
                Quanto mais específico o motivo (citando cláusulas e valores), mais precisa será a impugnação.
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 text-xs">
                Cancelar
              </Button>
              <Button
                onClick={generate}
                disabled={loading || !motivo.trim()}
                className="flex-1 text-xs"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                    Gerando (~30s)...
                  </span>
                ) : 'Gerar Impugnação'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
