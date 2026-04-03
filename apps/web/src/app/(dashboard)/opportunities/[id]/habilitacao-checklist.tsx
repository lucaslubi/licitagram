'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ChecklistItem {
  tipo: string
  categoria: string
  descricao: string
  clausula: string
  obrigatorio: boolean
  status: 'ok' | 'expiring' | 'expired' | 'missing'
  documentoEmpresa: { id: string; tipo: string; validade: string } | null
}

interface ChecklistResult {
  items: ChecklistItem[]
  resumo: { total: number; ok: number; expiring: number; expired: number; missing: number }
  aprovado: boolean
}

const STATUS_CONFIG = {
  ok: { icon: '✅', label: 'Válido', color: 'text-emerald-400' },
  expiring: { icon: '⚠️', label: 'Vencendo', color: 'text-amber-400' },
  expired: { icon: '❌', label: 'Vencido', color: 'text-red-400' },
  missing: { icon: '❌', label: 'Ausente', color: 'text-red-400' },
}

const CATEGORY_LABELS: Record<string, string> = {
  juridica: 'Habilitação Jurídica',
  tecnica: 'Qualificação Técnica',
  economica: 'Qualificação Econômico-Financeira',
  fiscal: 'Regularidade Fiscal',
  trabalhista: 'Regularidade Trabalhista',
  declaracao: 'Declarações',
}

const PROVISION_LINKS: Record<string, string> = {
  'cnd federal': 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
  'crf fgts': 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
  'cndt': 'https://www.tst.jus.br/certidao',
  'certidao negativa': 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
}

export function HabilitacaoChecklist({ matchId }: { matchId: string }) {
  const [result, setResult] = useState<ChecklistResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function analyze() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/habilitacao-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setResult(data)
    } catch { setError('Erro ao analisar') }
    finally { setLoading(false) }
  }

  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Checklist de Habilitação</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-xs mb-3">
            Analise os documentos exigidos no edital e cruze com os documentos da sua empresa.
          </p>
          <Button onClick={analyze} disabled={loading} size="sm">
            {loading ? 'Analisando edital...' : 'Verificar Habilitação'}
          </Button>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  const { items, resumo, aprovado } = result
  const byCategory = new Map<string, ChecklistItem[]>()
  for (const item of items) {
    const cat = item.categoria || 'outros'
    const list = byCategory.get(cat) || []
    list.push(item)
    byCategory.set(cat, list)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Checklist de Habilitação</CardTitle>
          <Badge variant="outline" className={aprovado ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30' : 'bg-red-900/20 text-red-400 border-red-900/30'}>
            {resumo.ok}/{resumo.total} OK
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary badges */}
        <div className="flex gap-2 flex-wrap">
          {resumo.ok > 0 && <Badge variant="outline" className="bg-emerald-900/20 text-emerald-400 border-emerald-900/30">✅ {resumo.ok} válidos</Badge>}
          {resumo.expiring > 0 && <Badge variant="outline" className="bg-amber-900/20 text-amber-400 border-amber-900/30">⚠️ {resumo.expiring} vencendo</Badge>}
          {resumo.expired > 0 && <Badge variant="outline" className="bg-red-900/20 text-red-400 border-red-900/30">❌ {resumo.expired} vencidos</Badge>}
          {resumo.missing > 0 && <Badge variant="outline" className="bg-red-900/20 text-red-400 border-red-900/30">❌ {resumo.missing} ausentes</Badge>}
        </div>

        {/* Items by category */}
        {Array.from(byCategory.entries()).map(([cat, catItems]) => (
          <div key={cat}>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              {CATEGORY_LABELS[cat] || cat}
            </h4>
            <div className="space-y-1.5">
              {catItems.map((item, i) => {
                const cfg = STATUS_CONFIG[item.status]
                const provisionUrl = Object.entries(PROVISION_LINKS).find(([key]) =>
                  item.tipo.toLowerCase().includes(key)
                )?.[1]

                return (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-[#111214]">
                    <span className="text-sm shrink-0">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white">{item.tipo}</span>
                        {item.obrigatorio && <span className="text-[9px] text-red-400">*obrigatório</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.descricao}</p>
                      {item.clausula && <p className="text-[9px] text-gray-500">Cláusula: {item.clausula}</p>}
                      {item.documentoEmpresa?.validade && (
                        <p className="text-[9px] text-gray-500">Validade: {new Date(item.documentoEmpresa.validade).toLocaleDateString('pt-BR')}</p>
                      )}
                    </div>
                    {(item.status === 'missing' || item.status === 'expired') && provisionUrl && (
                      <a href={provisionUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-400 hover:text-emerald-300 shrink-0">
                        Providenciar →
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Bottom status */}
        <div className={`p-3 rounded-lg text-center text-xs font-medium ${aprovado ? 'bg-emerald-900/10 text-emerald-400 border border-emerald-900/20' : 'bg-red-900/10 text-red-400 border border-red-900/20'}`}>
          {aprovado ? '✅ Habilitação OK — Todos os documentos obrigatórios válidos' : `❌ ${resumo.missing + resumo.expired} documento(s) pendente(s) — resolva antes de participar`}
        </div>

        <Button variant="outline" size="sm" onClick={analyze} className="w-full">
          Reanalisar
        </Button>
      </CardContent>
    </Card>
  )
}
