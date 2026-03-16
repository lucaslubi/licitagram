'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

const FIT_LABELS: Record<string, string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  excelente: 'Excelente',
}

/** Derive fit label from a numeric score (for backward compat with old AI responses) */
function scoreFitLabel(score: number): string {
  if (score >= 86) return 'Excelente'
  if (score >= 61) return 'Alto'
  if (score >= 41) return 'Médio'
  return 'Baixo'
}

interface BreakdownItem {
  category: string
  score?: number
  fit?: string
  reason: string
}

interface AnalysisData {
  score: number
  fit?: string
  breakdown: BreakdownItem[]
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
  onScoreUpdate?: (newScore: number) => void
}

export function AiAnalysis({ matchId, initialData, matchSource, hasAccess = true, onScoreUpdate }: AiAnalysisProps): React.JSX.Element {
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
              <h3 className="font-semibold text-gray-900">Análise com IA</h3>
              <p className="text-sm text-gray-500 mt-1">
                Análise detalhada de compatibilidade da sua empresa com este edital.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Disponível nos planos Professional e Enterprise
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
  const isAiVerified = matchSource === 'ai' || matchSource === 'ai_triage'
  const hasAiAnalysis = isAiVerified && (initialData.justificativa || matchSource === 'ai_triage')
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
          fit: result.fit || undefined,
          breakdown: result.breakdown || [],
          justificativa: result.justificativa,
          recomendacao: result.recomendacao,
          riscos: result.riscos || [],
          acoes_necessarias: result.acoes_necessarias || [],
        })
        // Propagate AI-verified score to parent (header badge)
        onScoreUpdate?.(result.score)
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
          <CardTitle>Análise IA</CardTitle>
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

  // Triage-only: show score summary + offer deep analysis button
  if (matchSource === 'ai_triage' && breakdown.length === 0 && !data.justificativa) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Análise IA (Triagem)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                {data.score}
              </div>
              <div>
                <p className="text-sm font-medium text-blue-900">Score verificado por IA</p>
                <p className="text-xs text-blue-600">
                  {data.recomendacao === 'participar'
                    ? 'Recomendado participar'
                    : data.recomendacao === 'nao_recomendado'
                      ? 'Não recomendado'
                      : 'Avaliar com mais detalhes'}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Esta licitação foi avaliada pela triagem automática de IA. Para uma análise detalhada com parecer técnico completo, clique abaixo.
            </p>
            <Button onClick={runAnalysis} variant="outline" size="sm" className="w-full">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Análise detalhada com IA
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Parecer Técnico — Fit por Categoria */}
      {breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Parecer Técnico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {breakdown.map((item) => {
              const fitLabel = item.fit
                ? (FIT_LABELS[item.fit] || item.fit)
                : (typeof item.score === 'number' ? scoreFitLabel(item.score) : '—')
              return (
                <div key={item.category} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {CATEGORY_LABELS[item.category] || item.category}
                    </span>
                    <span className="text-sm text-gray-600 font-medium">
                      {fitLabel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.reason}</p>
                </div>
              )
            })}
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
            <CardTitle>Ações Necessárias</CardTitle>
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
