'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const CATEGORY_LABELS: Record<string, string> = {
  compatibilidade_cnae: 'Compatibilidade CNAE',
  compatibilidade_objeto: 'Compatibilidade do Objeto',
  qualificacao_tecnica: 'Qualificação Técnica',
  potencial_participacao: 'Potencial de Participação',
  relevancia_estrategica: 'Relevância Estratégica',
  capacidade_economica: 'Capacidade Econômica',
  documentacao: 'Documentação',
  localizacao: 'Localização',
}

interface AnalysisData {
  score: number
  breakdown: Array<{ category: string; score: number; reason: string }>
  justificativa: string | null
  recomendacao: string | null
  riscos: string[]
  acoes_necessarias: string[]
}

interface AiAnalysisProps {
  matchId: string
  initialData: AnalysisData
  matchSource: string | null
  hasAccess?: boolean
}

export function AiAnalysis({ matchId, initialData, matchSource, hasAccess = true }: AiAnalysisProps): React.JSX.Element {
  if (!hasAccess) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Analise com IA</h3>
              <p className="text-sm text-gray-500 mt-1">
                Analise detalhada de compatibilidade da sua empresa com este edital.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Disponivel nos planos Professional e Enterprise
              </p>
            </div>
            <a
              href="/billing"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand/10 text-brand rounded-lg text-sm font-medium hover:bg-brand/20 transition-colors"
            >
              Fazer upgrade
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }
  const hasAiAnalysis = matchSource === 'ai' && initialData.justificativa
  const [data, setData] = useState<AnalysisData>(initialData)
  const [loading, setLoading] = useState(!hasAiAnalysis)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Erro ${res.status}`)
      }

      const result = await res.json()

      // Always update data when we get analysis fields back (cached or fresh)
      if (result.score !== undefined) {
        setData({
          score: result.score,
          breakdown: result.breakdown || [],
          justificativa: result.justificativa,
          recomendacao: result.recomendacao,
          riscos: result.riscos || [],
          acoes_necessarias: result.acoes_necessarias || [],
        })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    if (!hasAiAnalysis) {
      runAnalysis()
    }
  }, [hasAiAnalysis, runAnalysis])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            Analisando com IA...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
            <div className="h-12 bg-gray-200 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analise IA</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <Button onClick={runAnalysis} variant="outline" size="sm">
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  const breakdown = data.breakdown || []
  const riscos = data.riscos || []
  const acoesNecessarias = data.acoes_necessarias || []

  return (
    <div className="space-y-6">
      {/* Breakdown */}
      {breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Analise por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {breakdown.map((item) => (
              <div key={item.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </span>
                  <span className="font-bold">{item.score}/100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full ${
                      item.score >= 70
                        ? 'bg-emerald-500'
                        : item.score >= 40
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{item.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Justificativa */}
      {data.justificativa && (
        <Card>
          <CardHeader>
            <CardTitle>Parecer da IA</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{data.justificativa}</p>
          </CardContent>
        </Card>
      )}

      {/* Riscos */}
      {riscos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Riscos Identificados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {riscos.map((risco, i) => (
                <li key={i} className="flex gap-2 text-sm p-2 bg-amber-50 border border-amber-200 rounded-md">
                  <span className="text-amber-500 shrink-0">•</span>
                  <span>{risco}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Acoes */}
      {acoesNecessarias.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Acoes Necessarias</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {acoesNecessarias.map((acao, i) => (
                <li key={i} className="flex gap-2 text-sm p-2 bg-brand/5 border border-brand/20 rounded-md">
                  <span className="text-brand shrink-0">{i + 1}.</span>
                  <span>{acao}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
