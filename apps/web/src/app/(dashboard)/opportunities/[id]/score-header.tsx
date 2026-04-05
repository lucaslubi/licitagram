'use client'

import React, { useState, useCallback, createContext, useContext } from 'react'
import { AiAnalysis } from './ai-analysis'

interface BreakdownItem {
  category: string
  score?: number
  fit?: string
  reason: string
}

interface ScoreHeaderProps {
  initialScore: number
  initialKeywordScore: number | null
  matchSource: string
  matchId: string
  hasAccess: boolean
  initialData: {
    score: number
    breakdown: BreakdownItem[]
    justificativa: string | null
    recomendacao: string | null
    riscos: string[]
    acoes_necessarias: string[]
  }
}

function ScoreBadgeLarge({ score, verified, keywordScore }: { score: number; verified: boolean; keywordScore: number | null }) {
  // Score-based gradient colors
  const colors = score >= 80
    ? { start: '#10B981', end: '#84CC16' }
    : score >= 60
      ? { start: '#84CC16', end: '#F59E0B' }
      : score >= 40
        ? { start: '#F59E0B', end: '#F97316' }
        : { start: '#EF4444', end: '#F97316' }

  const circumference = 2 * Math.PI * 40
  const dashArray = `${(score / 100) * circumference} ${circumference}`

  const showKeywordDiff = verified && keywordScore !== null && Math.abs(keywordScore - score) > 10

  const sublabel = score >= 80 ? 'Altamente recomendado'
    : score >= 60 ? 'Recomendado'
    : score >= 40 ? 'Avaliar com atenção'
    : 'Baixa compatibilidade'

  return (
    <div className="flex items-center gap-3">
      {showKeywordDiff && (
        <>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-white/[0.04] text-[#52525b] border border-white/[0.06] line-through font-mono">
            {keywordScore}
            <span className="text-[10px] font-normal no-underline">est.</span>
          </span>
          <span className="text-[#52525b]">→</span>
        </>
      )}
      <div className="flex items-center gap-3">
        <div className="relative w-[60px] h-[60px] shrink-0" style={{ filter: `drop-shadow(0 0 12px ${colors.start}30)` }}>
          <svg viewBox="0 0 90 90" className="w-full h-full -rotate-90">
            <circle cx="45" cy="45" r="40" stroke="rgba(255,255,255,0.06)" strokeWidth="7" fill="none" />
            <circle
              cx="45" cy="45" r="40"
              stroke="url(#headerScoreGrad)"
              strokeWidth="7"
              fill="none"
              strokeDasharray={dashArray}
              strokeLinecap="round"
              style={{
                transition: 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                animation: 'score-fill 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
            <defs>
              <linearGradient id="headerScoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={colors.start} />
                <stop offset="100%" stopColor={colors.end} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-[5px] rounded-full bg-[#0a0a0b] flex items-center justify-center">
            <span className="text-xl font-bold font-[family-name:var(--font-geist-mono)] tabular-nums tracking-tight text-white">{score}</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Score IA</span>
          <span className="text-xs text-gray-400">{sublabel}</span>
        </div>
      </div>
    </div>
  )
}

// Context to share score state between ScoreBadgeSlot and AnalysisSlot
const ScoreContext = createContext<{
  badge: React.ReactNode
  analysis: React.ReactNode
} | null>(null)

/**
 * Provider that wraps page content. Uses React Context (not render props)
 * so it can be used from a Server Component without serialization issues.
 */
export function ScoreProvider({
  initialScore,
  initialKeywordScore,
  matchSource,
  matchId,
  hasAccess,
  initialData,
  children,
}: ScoreHeaderProps & { children: React.ReactNode }) {
  const [score, setScore] = useState(initialScore)
  const isAiVerified = matchSource === 'ai' || matchSource === 'ai_triage' || matchSource === 'semantic'
  const [verified, setVerified] = useState(isAiVerified)
  // Keep the original keyword score so we can show the diff after AI analysis
  // If already AI-analyzed (full or triage), use the saved keyword_score from DB; otherwise use current score as keyword estimate
  const [keywordScore] = useState(
    isAiVerified ? initialKeywordScore : initialScore
  )

  const handleScoreUpdate = useCallback((newScore: number) => {
    setScore(newScore)
    setVerified(true)
  }, [])

  const badge = <ScoreBadgeLarge score={score} verified={verified} keywordScore={keywordScore} />
  const analysis = (
    <AiAnalysis
      matchId={matchId}
      matchSource={matchSource}
      hasAccess={hasAccess}
      initialData={initialData}
      onScoreUpdate={handleScoreUpdate}
    />
  )

  return (
    <ScoreContext.Provider value={{ badge, analysis }}>
      {children}
    </ScoreContext.Provider>
  )
}

/** Renders the score badge — place this wherever the badge should appear */
export function ScoreBadgeSlot() {
  const ctx = useContext(ScoreContext)
  return <>{ctx?.badge ?? null}</>
}

/** Renders the AI analysis section — place this wherever analysis should appear */
export function AnalysisSlot() {
  const ctx = useContext(ScoreContext)
  return <>{ctx?.analysis ?? null}</>
}
