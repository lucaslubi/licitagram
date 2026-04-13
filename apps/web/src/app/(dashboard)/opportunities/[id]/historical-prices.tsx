'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrencyBR } from '@/lib/format'

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

interface ScoredTender extends HistoricalTender {
  relevance: number
}

/** Normalize text: lowercase, strip accents, remove special chars */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'a', 'o', 'as', 'os',
  'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sem',
  'um', 'uma', 'uns', 'umas', 'que', 'ao', 'se', 'este', 'esta',
  'pelo', 'pela', 'pelos', 'pelas', 'ser', 'ter', 'como', 'mais',
  'sua', 'seu', 'seus', 'suas', 'isso', 'esta', 'esse', 'essa',
  // Termos genéricos de licitação
  'constitui', 'objeto', 'presente', 'licitacao', 'pregao',
  'registro', 'preços', 'preço', 'aquisição', 'contratação',
  'eventual', 'fornecimento', 'prestação', 'serviços', 'serviço',
  'materiais', 'material', 'empresa', 'empresas', 'futura',
  'futuras', 'visando', 'objetivando', 'melhores', 'propostas',
  'proposta', 'selecao', 'vantajosa', 'consignado', 'prazo',
  'meses', 'dias', 'anos', 'conforme', 'acordo', 'termo',
  'referencia', 'necessaria', 'necessario', 'atender', 'demandas',
  'demanda', 'necessidades', 'secretaria', 'municipal', 'fundo',
])

/**
 * Extract meaningful keywords, keeping the most specific/rare words.
 * Returns up to 8 keywords sorted by length desc (longer = more specific).
 */
function extractKeywords(objeto: string): string[] {
  const words = normalize(objeto)
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))

  // Deduplicate
  const unique = [...new Set(words)]

  // Sort by length descending — longer words tend to be more specific
  unique.sort((a, b) => b.length - a.length)

  return unique.slice(0, 8)
}

/**
 * Calculate relevance score: how many keywords from the current tender
 * appear in the historical tender's objeto.
 */
function calcRelevance(keywords: string[], tenderObjeto: string): number {
  const normalized = normalize(tenderObjeto)
  let matches = 0
  let weightedScore = 0

  for (const kw of keywords) {
    if (normalized.includes(kw)) {
      matches++
      // Longer keywords are worth more
      weightedScore += kw.length
    }
  }

  // Require at least 2 keyword matches to be considered relevant
  if (matches < 2) return 0

  return weightedScore
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
  const [tenders, setTenders] = useState<ScoredTender[]>([])
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

      if (keywords.length < 2) {
        setLoading(false)
        return
      }

      // Use top 3 keywords for the DB query (most specific first)
      // We require all of them to match in the DB query for precision
      const kw1 = keywords[0]
      const kw2 = keywords[1]
      const kw3 = keywords.length > 2 ? keywords[2] : null

      let query = supabase
        .from('tenders')
        .select('id, objeto, orgao_nome, uf, valor_estimado, valor_homologado, data_abertura, modalidade_nome')
        .neq('id', currentTenderId)
        .ilike('objeto', `%${kw1}%`)
        .ilike('objeto', `%${kw2}%`)
        .not('valor_estimado', 'is', null)
        .order('data_abertura', { ascending: false })
        .limit(50)

      if (kw3) {
        query = supabase
          .from('tenders')
          .select('id, objeto, orgao_nome, uf, valor_estimado, valor_homologado, data_abertura, modalidade_nome')
          .neq('id', currentTenderId)
          .ilike('objeto', `%${kw1}%`)
          .ilike('objeto', `%${kw2}%`)
          .ilike('objeto', `%${kw3}%`)
          .not('valor_estimado', 'is', null)
          .order('data_abertura', { ascending: false })
          .limit(50)
      }

      const { data } = await query

      if (!data || data.length === 0) {
        // Fallback: try with just 2 keywords if 3 returned nothing
        if (kw3) {
          const { data: fallbackData } = await supabase
            .from('tenders')
            .select('id, objeto, orgao_nome, uf, valor_estimado, valor_homologado, data_abertura, modalidade_nome')
            .neq('id', currentTenderId)
            .ilike('objeto', `%${kw1}%`)
            .ilike('objeto', `%${kw2}%`)
            .not('valor_estimado', 'is', null)
            .order('data_abertura', { ascending: false })
            .limit(50)

          if (!fallbackData || fallbackData.length === 0) {
            setLoading(false)
            return
          }

          processResults(fallbackData as HistoricalTender[], keywords)
        } else {
          setLoading(false)
          return
        }
      } else {
        processResults(data as HistoricalTender[], keywords)
      }

      setLoading(false)
    }

    function processResults(raw: HistoricalTender[], keywords: string[]) {
      // Score each result by relevance (how many keywords match)
      const scored: ScoredTender[] = raw
        .map((t) => ({
          ...t,
          relevance: calcRelevance(keywords, t.objeto),
        }))
        .filter((t) => t.relevance > 0) // Must match at least 2 keywords

      // Filter by value range if we have the current estimated value
      // Keep only tenders within a reasonable range (0.1x to 10x)
      let filtered = scored
      if (currentValorEstimado && currentValorEstimado > 0) {
        const lowerBound = currentValorEstimado * 0.1
        const upperBound = currentValorEstimado * 10
        const valueFiltered = scored.filter(
          (t) => t.valor_estimado && t.valor_estimado >= lowerBound && t.valor_estimado <= upperBound,
        )
        // Only use value filter if it leaves enough results
        if (valueFiltered.length >= 3) {
          filtered = valueFiltered
        }
      }

      // Sort by relevance desc, then by date desc
      filtered.sort((a, b) => {
        if (b.relevance !== a.relevance) return b.relevance - a.relevance
        const dateA = a.data_abertura || ''
        const dateB = b.data_abertura || ''
        return dateB.localeCompare(dateA)
      })

      // Take top 15
      const results = filtered.slice(0, 15)
      setTenders(results)

      // Calculate statistics only from the filtered relevant results
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

        // Calculate median discount (more robust than mean for outliers)
        const discounts = withHomologado
          .map((t) => {
            const est = t.valor_estimado || 1
            const hom = t.valor_homologado || 0
            return ((est - hom) / est) * 100
          })
          .filter((d) => d >= 0 && d <= 90) // Remove nonsensical discounts
          .sort((a, b) => a - b)

        let avgDesc = 0
        if (discounts.length > 0) {
          // Use median for robustness
          const mid = Math.floor(discounts.length / 2)
          avgDesc =
            discounts.length % 2 === 0
              ? (discounts[mid - 1] + discounts[mid]) / 2
              : discounts[mid]
        }

        setStats({
          avgEstimado: avgEst,
          avgHomologado: avgHom,
          avgDesconto: avgDesc,
          count: results.length,
        })
      }
    }

    fetchHistorical()
  }, [currentObjeto, currentTenderId, currentValorEstimado])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-gray-400 text-sm">
          Buscando precos historicos...
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
        <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          Histórico de Preços Similares
          {stats.count < 5 ? (
            <Badge variant="outline" className="text-xs ml-auto bg-amber-900/20 text-amber-400 border-amber-800/30">
              ⚠️ {stats.count} amostras — confiança baixa
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs ml-auto bg-emerald-900/20 text-emerald-400 border-emerald-800/30">
              ✓ {stats.count} licitações
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-white/[0.04] rounded-lg">
          <div className="text-center">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Valor Estimado Médio</p>
            <p className="text-sm font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums">
              {stats.avgEstimado > 0 ? formatCurrencyBR(stats.avgEstimado) : '-'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Valor Vencedor Médio</p>
            <p className="text-sm font-bold text-emerald-400 font-[family-name:var(--font-geist-mono)] tabular-nums">
              {stats.avgHomologado > 0 ? formatCurrencyBR(stats.avgHomologado) : '-'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Desconto Mediano</p>
            <p className="text-sm font-bold text-brand font-[family-name:var(--font-geist-mono)] tabular-nums">
              {stats.avgDesconto > 0 ? `${stats.avgDesconto.toFixed(1)}%` : '-'}
            </p>
          </div>
        </div>

        {/* Comparison with current */}
        {currentValorEstimado && stats.avgDesconto > 0 && (
          <div className="p-3 border border-brand/20 bg-brand/5 rounded-lg">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Sugestão de preço competitivo</p>
            <p className="text-sm font-medium text-white">
              Com base no desconto mediano de <span className="font-[family-name:var(--font-geist-mono)] tabular-nums">{stats.avgDesconto.toFixed(1)}%</span>, um preço competitivo
              seria em torno de{' '}
              <span className="font-bold text-brand font-[family-name:var(--font-geist-mono)] tabular-nums">
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
                className="flex items-start justify-between gap-3 p-2.5 border rounded-md text-xs hover:bg-white/[0.04]"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white line-clamp-1">{t.objeto}</p>
                  <p className="text-gray-400 mt-0.5">
                    {t.orgao_nome} — {t.uf}
                    {t.data_abertura && ` — ${new Date(t.data_abertura).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-gray-400 font-[family-name:var(--font-geist-mono)] tabular-nums">
                    Est: {t.valor_estimado ? formatCurrencyBR(t.valor_estimado) : '-'}
                  </p>
                  {t.valor_homologado ? (
                    <p className="text-emerald-400 font-medium font-[family-name:var(--font-geist-mono)] tabular-nums">
                      Ven: {formatCurrencyBR(t.valor_homologado)}
                      {desconto !== null && desconto >= 0 && (
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
