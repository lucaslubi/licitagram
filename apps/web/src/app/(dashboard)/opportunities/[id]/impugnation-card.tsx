'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function ImpugnationCard({ matchId, dataAbertura }: { matchId: string; dataAbertura: string | null }) {
  const [showModal, setShowModal] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ texto_completo: string; prazo_limite: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Calculate deadline
  const prazoDate = dataAbertura ? new Date(dataAbertura) : null
  let diasRestantes = 0
  if (prazoDate) {
    // 3 business days before opening
    const prazo = new Date(prazoDate)
    let count = 0
    while (count < 3) {
      prazo.setDate(prazo.getDate() - 1)
      if (prazo.getDay() !== 0 && prazo.getDay() !== 6) count++
    }
    diasRestantes = Math.ceil((prazo.getTime() - Date.now()) / 86400000)
  }

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

  return (
    <>
      <Card className={diasRestantes <= 3 && diasRestantes > 0 ? 'border-amber-900/30' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Impugnação de Edital</CardTitle>
            {diasRestantes > 0 ? (
              <Badge variant="outline" className={diasRestantes <= 3 ? 'bg-red-900/20 text-red-400 border-red-900/30' : 'bg-amber-900/20 text-amber-400 border-amber-900/30'}>
                {diasRestantes <= 3 ? `URGENTE — ${diasRestantes}d` : `${diasRestantes} dias úteis`}
              </Badge>
            ) : prazoDate ? (
              <Badge variant="outline" className="bg-zinc-800 text-gray-500">Prazo encerrado</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {!result ? (
            <div>
              <p className="text-gray-400 text-xs mb-3">
                Gere um modelo de impugnação fundamentado na Lei 14.133/2021 para questionar cláusulas do edital.
              </p>
              <Button onClick={() => setShowModal(true)} size="sm" variant="outline">
                Gerar modelo de impugnação
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-[#111214] rounded-lg p-4 max-h-[400px] overflow-y-auto">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{result.texto_completo}</pre>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => {
                  const blob = new Blob([result.texto_completo], { type: 'text/plain;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'impugnacao.txt'; a.click()
                  URL.revokeObjectURL(url)
                }}>
                  Baixar texto
                </Button>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(result.texto_completo) }}>
                  Copiar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setResult(null)}>
                  Nova impugnação
                </Button>
              </div>
            </div>
          )}
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </CardContent>
      </Card>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1c1f] border border-zinc-700 rounded-xl p-6 max-w-lg mx-4 w-full shadow-2xl">
            <h3 className="text-white font-semibold mb-4">Motivo da Impugnação</h3>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Descreva o motivo da impugnação (cláusulas restritivas, exigências abusivas, etc.)"
              className="w-full h-32 bg-[#111214] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-emerald-600 focus:outline-none resize-none"
            />
            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
              <Button onClick={generate} disabled={loading || !motivo.trim()} className="flex-1">
                {loading ? 'Gerando (~20s)...' : 'Gerar Impugnação'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
