'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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

  const isUrgent = diasRestantes > 0 && diasRestantes <= 3
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

  function handleDownloadDocx() {
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
      {/* Main Card — prominent design */}
      <div className={`rounded-xl border-2 overflow-hidden ${
        isUrgent
          ? 'border-red-500/40 bg-gradient-to-br from-red-950/20 to-[#1a1c1f]'
          : isExpired
            ? 'border-zinc-700/50 bg-[#1a1c1f]'
            : 'border-amber-500/30 bg-gradient-to-br from-amber-950/10 to-[#1a1c1f]'
      }`}>
        {/* Header with icon strip */}
        <div className={`px-5 py-3 flex items-center justify-between ${
          isUrgent ? 'bg-red-500/10' : isExpired ? 'bg-zinc-800/50' : 'bg-amber-500/5'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isUrgent ? 'bg-red-500/20' : isExpired ? 'bg-zinc-700' : 'bg-amber-500/15'
            }`}>
              <span className="text-lg">⚖️</span>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Impugnação de Edital</h3>
              <p className="text-[11px] text-gray-400">Gerador jurídico com IA — Lei 14.133/2021</p>
            </div>
          </div>
          {diasRestantes > 0 ? (
            <Badge className={`text-[11px] font-semibold px-2.5 py-1 ${
              isUrgent
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
            }`}>
              {isUrgent ? `🔴 URGENTE — ${diasRestantes}d restante${diasRestantes > 1 ? 's' : ''}` : `⏰ ${diasRestantes} dias úteis`}
            </Badge>
          ) : null}
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {!result ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-2">
                  <p className="text-gray-300 text-xs leading-relaxed">
                    Gere uma <span className="text-white font-medium">impugnação formal completa</span> fundamentada na Lei 14.133/2021, jurisprudência do TCU e argumentação em 5 camadas — pronta para protocolar.
                  </p>
                  {prazoFormatted && diasRestantes > 0 && (
                    <p className="text-[11px] text-gray-500">
                      📅 Prazo limite para impugnação: <span className={isUrgent ? 'text-red-400 font-medium' : 'text-amber-400'}>{prazoFormatted}</span>
                      {' '}(art. 164, Lei 14.133/2021 — 3 dias úteis antes da abertura)
                    </p>
                  )}
                </div>
              </div>

              {/* Feature highlights */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: '📜', text: 'Peça formal completa' },
                  { icon: '⚖️', text: 'Argumentação em 5 camadas' },
                  { icon: '🏛️', text: 'Jurisprudência do TCU' },
                  { icon: '💡', text: 'Redação substitutiva' },
                ].map((f) => (
                  <div key={f.text} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#111214]/60 border border-zinc-800/50">
                    <span className="text-xs">{f.icon}</span>
                    <span className="text-[10px] text-gray-400">{f.text}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => setShowModal(true)}
                className={`w-full font-medium ${
                  isUrgent
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
                size="sm"
              >
                ⚖️ Gerar Impugnação Jurídica
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Fundamentação preview */}
              {result.fundamentacao && (
                <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-emerald-400 font-medium mb-1">💡 FUNDAMENTAÇÃO PRINCIPAL</p>
                  <p className="text-[11px] text-gray-300 line-clamp-3">{result.fundamentacao}</p>
                </div>
              )}

              {/* Full text */}
              <div className="bg-[#111214] rounded-lg p-4 max-h-[500px] overflow-y-auto border border-zinc-800">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{result.texto_completo}</pre>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={handleDownloadDocx} className="bg-emerald-600 hover:bg-emerald-700">
                  📥 Baixar Documento
                </Button>
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? '✅ Copiado!' : '📋 Copiar Texto'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setResult(null); setMotivo('') }} className="text-gray-400">
                  Nova Impugnação
                </Button>
              </div>
            </div>
          )}
          {error && <p className="text-red-400 text-xs mt-2">❌ {error}</p>}
        </div>
      </div>

      {/* Modal — reason input */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1c1f] border border-zinc-700 rounded-xl p-6 max-w-lg mx-4 w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <span className="text-xl">⚖️</span>
              </div>
              <div>
                <h3 className="text-white font-semibold">Gerar Impugnação de Edital</h3>
                <p className="text-gray-400 text-xs">Descreva o(s) motivo(s) para análise jurídica</p>
              </div>
            </div>

            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder={"Exemplos:\n• Exigência de atestado com quantitativo de 100% restringe competitividade\n• Indicação de marca sem justificativa técnica (cláusula 5.3)\n• Capital social mínimo exigido acima de 10% do valor estimado\n• Prazo de execução insuficiente para o porte do objeto"}
              className="w-full h-40 bg-[#111214] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-amber-600 focus:outline-none resize-none"
            />

            <div className="bg-[#111214] rounded-lg px-3 py-2 mt-3 border border-zinc-800">
              <p className="text-[10px] text-gray-500">
                💡 <span className="text-gray-400">Dica:</span> Quanto mais específico o motivo (citando cláusulas e valores), mais precisa será a impugnação. A IA analisará o edital completo e pode identificar vícios adicionais.
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={generate}
                disabled={loading || !motivo.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Gerando (~30s)...
                  </span>
                ) : '⚖️ Gerar Impugnação'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
