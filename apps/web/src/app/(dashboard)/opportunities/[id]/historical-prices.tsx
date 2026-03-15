'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface HistoricalTender {
  id: string
  objeto: string
  orgao_nome: string
  uf: string
  valor_estimado: number | null
  valor_homologado: number | null
  data_abertura: string | null
  modalidade_nome: string | null
}

function formatCurrencyBR(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function extractKeywords(objeto: string): string[] {
  const stopwords = new Set([
    'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'a', 'o', 'as', 'os',
    'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sem',
    'um', 'uma', 'uns', 'umas', 'que', 'ao', 'se', 'este', 'esta',
    'registro', 'precos', 'preco', 'aquisicao', 'contratacao',
    'eventual', 'fornecimento', 'prestacao', 'servicos', 'servico',
    'materiais', 'material', 'empresa', 'objeto', 'licitacao',
  ])

  return objeto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w))
    .slice(0, 5)
}

export function HistoricalPrices({
  currentObjeto,
  currentValorEstimado,
  currentTenderId,
}: {
  currentObjeto: string
  currentValorEstimado: number | null
  currentTenderId: string
}) {
  const [tenders, setTenders] = useState<HistoricalTender[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    avgEstimado: 0,
    avgHomologado: 0,
    avgDesconto: 0,
    count: 0,
  })

  useEffect(() => {
    async function fetchHistorical() {
      const supabase = createClient()
      const keywords = extractKeywords(currentObjeto)

      if (keywords.length === 0) {
        setLoading(false)
        return
      }

      // Search for similar tenders using the most specific keywords
      // We use multiple OR conditions with ilike for trigram-like matching
      const searchTerm = `%${keywords[0]}%`
      let query = supabase
        .from('tenders')
        .select('id, objeto, orgao_nome, uf, valor_estimado, valor_homologado, data_abertura, modalidade_nome')
        .neq('id', currentTenderId)
        .ilike('objeto', searchTerm)
        .not('valor_estimado', 'is', null)
        .order('data_abertura', { ascending: false })
        .limit(20)

      // Add second keyword filter if available
      if (keywords.length > 1) {
        query = supabase
          .from('tenders')
          .select('id, objeto, orgao_nome, uf, valor_estimado, valor_homologado, data_abertura, modalidade_nome')
          .neq('id', currentTenderId)
          .ilike('objeto', `%${keywords[0]}%`)
          .ilike('objeto', `%${keywords[1]}%`)
          .not('valor_estimado', 'is', null)
          .order('data_abertura', { ascending: false })
          .limit(20)
      }

      const { data } = await query

      const results = (data || []) as HistoricalTender[]
      setTenders(results)

      // Calculate statistics
      if (results.length > 0) {
        const withEstimado = results.filter((t) => t.valor_estimado && t.valor_estimado > 0)
        const withHomologado = results.filter(
          (t) => t.valor_homologado && t.valor_homologado > 0 && t.valor_estimado && t.valor_estimado > 0,
        )

        const avgEst =
          withEstimado.length > 0
            ? withEstimado.reduce((sum, t) => sum + (t.valor_estimado || 0), 0) / withEstimado.length
            : 0

        const avgHom =
          withHomologado.length > 0
            ? withHomologado.reduce((sum, t) => sum + (t.valor_homologado || 0), 0) / withHomologado.length
            : 0

        const discounts = withHomologado.map((t) => {
          const est = t.valor_estimado || 1
          const hom = t.valor_homologado || 0
          return ((est - hom) / est) * 100
        })

        const avgDesc =
          discounts.length > 0 ? discounts.reduce((a, b) => a + b, 0) / discounts.length : 0

        setStats({
          avgEstimado: avgEst,
          avgHomologado: avgHom,
          avgDesconto: avgDesc,
          count: results.length,
        })
      }

      setLoading(false)
    }

    fetchHistorical()
  }, [currentObjeto, currentTenderId])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-gray-400 text-sm">
          Buscando preços históricos...
        </CardContent>
      </Card>
    )
  }

  if (tenders.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span>📊</span> Histórico de Preços Similares
          <Badge variant="secondary" className="text-xs ml-auto">
            {stats.count} licitações
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-gray-100 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-gray-400">Valor Estimado Médio</p>
            <p className="text-sm font-bold text-gray-900">
              {stats.avgEstimado > 0 ? formatCurrencyBR(stats.avgEstimado) : '-'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Valor Vencedor Médio</p>
            <p className="text-sm font-bold text-emerald-700">
              {stats.avgHomologado > 0 ? formatCurrencyBR(stats.avgHomologado) : '-'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Desconto Médio</p>
            <p className="text-sm font-bold text-brand">
              {stats.avgDesconto > 0 ? `${stats.avgDesconto.toFixed(1)}%` : '-'}
            </p>
          </div>
        </div>

        {/* Comparison with current */}
        {currentValorEstimado && stats.avgHomologado > 0 && (
          <div className="p-3 border border-brand/20 bg-brand/5 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Sugestão de preço competitivo</p>
            <p className="text-sm font-medium text-gray-900">
              Com base no desconto médio de {stats.avgDesconto.toFixed(1)}%, um preço competitivo
              seria em torno de{' '}
              <span className="font-bold text-brand">
                {formatCurrencyBR(currentValorEstimado * (1 - stats.avgDesconto / 100))}
              </span>
            </p>
          </div>
        )}

        {/* Historical list */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {tenders.slice(0, 10).map((t) => {
            const desconto =
              t.valor_estimado && t.valor_homologado && t.valor_estimado > 0
                ? ((t.valor_estimado - t.valor_homologado) / t.valor_estimado) * 100
                : null

            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 p-2.5 border rounded-md text-xs hover:bg-gray-100"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 line-clamp-1">{t.objeto}</p>
                  <p className="text-gray-400 mt-0.5">
                    {t.orgao_nome} — {t.uf}
                    {t.data_abertura && ` — ${new Date(t.data_abertura).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-gray-500">
                    Est: {t.valor_estimado ? formatCurrencyBR(t.valor_estimado) : '-'}
                  </p>
                  {t.valor_homologado ? (
                    <p className="text-emerald-700 font-medium">
                      Ven: {formatCurrencyBR(t.valor_homologado)}
                      {desconto !== null && (
                        <span className="text-brand ml-1">(-{desconto.toFixed(0)}%)</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-gray-400">Sem resultado</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
