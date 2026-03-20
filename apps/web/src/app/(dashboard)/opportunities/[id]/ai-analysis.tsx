'use client'

import React, { useState, useCallback } from 'react'
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
  keywords: 'Palavras-chave',
  description: 'Descrição de Serviços',
  cnae: 'Compatibilidade CNAE',
}

const CATEGORY_ICONS: Record<string, string> = {
  compatibilidade_cnae: '🏢',
  compatibilidade_objeto: '📋',
  qualificacao_tecnica: '🛠️',
  potencial_participacao: '🎯',
  relevancia_estrategica: '⭐',
  capacidade_economica: '💰',
  documentacao: '📄',
  localizacao: '📍',
  keywords: '🔑',
  description: '📝',
  cnae: '🏢',
}

const FIT_LABELS: Record<string, string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  excelente: 'Excelente',
}

type FitLevel = 'baixo' | 'medio' | 'alto' | 'excelente'

const FIT_CONFIG: Record<FitLevel, { bg: string; text: string; border: string; dot: string; bar: string; barWidth: string }> = {
  excelente: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-500', barWidth: 'w-full' },
  alto:      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500',    bar: 'bg-blue-500',    barWidth: 'w-3/4' },
  medio:     { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   bar: 'bg-amber-500',   barWidth: 'w-1/2' },
  baixo:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500',     bar: 'bg-red-500',     barWidth: 'w-1/4' },
}

/** Derive fit label from a numeric score (for backward compat with old AI responses) */
function scoreFitLabel(score: number): string {
  if (score >= 86) return 'Excelente'
  if (score >= 61) return 'Alto'
  if (score >= 41) return 'Médio'
  return 'Baixo'
}

function getFitKey(item: { fit?: string; score?: number }): FitLevel {
  if (item.fit) {
    const normalized = item.fit.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (normalized === 'excelente') return 'excelente'
    if (normalized === 'alto') return 'alto'
    if (normalized === 'medio') return 'medio'
    return 'baixo'
  }
  if (typeof item.score === 'number') {
    if (item.score >= 86) return 'excelente'
    if (item.score >= 61) return 'alto'
    if (item.score >= 41) return 'medio'
    return 'baixo'
  }
  return 'baixo'
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
  const isAiVerified = matchSource === 'ai' || matchSource === 'ai_triage' || matchSource === 'semantic'
  const [data, setData] = useState<AnalysisData>(initialData)
  const [loading, setLoading] = useState(false)
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

  if (!isAiVerified) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analise IA</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">Aguardando analise automatica da IA...</p>
            <p className="text-xs text-gray-400 mt-1">Esta licitacao sera analisada em breve pelo sistema.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const breakdown = data.breakdown || []
  const riscos = data.riscos || []
  const acoesNecessarias = data.acoes_necessarias || []

  // Triage-only: show score summary + offer deep analysis button
  if ((matchSource === 'ai_triage' || matchSource === 'semantic') && breakdown.length === 0 && !data.justificativa) {
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
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Parecer Técnico
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Avaliação detalhada de compatibilidade por dimensão</p>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid gap-3">
              {breakdown.map((item) => {
                const fitKey = getFitKey(item)
                const config = FIT_CONFIG[fitKey]
                const fitLabel = item.fit
                  ? (FIT_LABELS[item.fit] || item.fit)
                  : (typeof item.score === 'number' ? scoreFitLabel(item.score) : '—')
                const icon = CATEGORY_ICONS[item.category] || '📊'

                return (
                  <div
                    key={item.category}
                    className={`rounded-lg border ${config.border} ${config.bg} p-3 transition-all hover:shadow-sm`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{icon}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${config.bg} ${config.text} border ${config.border}`}>
                        {fitLabel}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200/60 rounded-full h-1.5 mb-2">
                      <div className={`h-1.5 rounded-full ${config.bar} ${config.barWidth} transition-all duration-500`} />
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{item.reason}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Riscos + Ações lado a lado */}
      {(riscos.length > 0 || acoesNecessarias.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Riscos */}
          {riscos.length > 0 && (
            <Card className="border-amber-200/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <span>Riscos</span>
                  <span className="ml-auto text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{riscos.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <ul className="space-y-2">
                  {riscos.map((risco, i) => (
                    <li key={i} className="flex gap-2.5 text-sm p-2.5 bg-amber-50/60 rounded-lg">
                      <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-amber-600 text-xs font-bold">{i + 1}</span>
                      </div>
                      <span className="text-gray-700 leading-relaxed">{risco}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Ações Necessárias */}
          {acoesNecessarias.length > 0 && (
            <Card className="border-brand/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <span>Ações</span>
                  <span className="ml-auto text-xs font-normal text-brand bg-brand/10 px-2 py-0.5 rounded-full">{acoesNecessarias.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <ul className="space-y-2">
                  {acoesNecessarias.map((acao, i) => (
                    <li key={i} className="flex gap-2.5 text-sm p-2.5 bg-brand/5 rounded-lg">
                      <div className="w-5 h-5 rounded-full bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-brand text-xs font-bold">{i + 1}</span>
                      </div>
                      <span className="text-gray-700 leading-relaxed">{acao}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
