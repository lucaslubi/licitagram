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
  const color =
    score >= 80
      ? 'bg-orange-900/20 text-orange-400 border-orange-900/30'
      : score >= 70
        ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30'
        : score >= 50
          ? 'bg-amber-900/20 text-amber-400 border-amber-900/30'
          : 'bg-red-900/20 text-red-400 border-red-900/30'

  // Show keyword score when AI score differs significantly (more than 10 points)
  const showKeywordDiff = verified && keywordScore !== null && Math.abs(keywordScore - score) > 10

  return (
    <div className="flex items-center gap-2">
      {showKeywordDiff && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-[#2d2f33] text-gray-400 border border-[#2d2f33] line-through">
          {keywordScore}
          <span className="text-[10px] font-normal no-underline">est.</span>
        </span>
      )}
      {showKeywordDiff && (
        <span className="text-gray-300">→</span>
      )}
      <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-lg font-bold border ${color}`}>
        Score {score}
        {verified ? (
          <span className="text-xs font-normal opacity-70">IA</span>
        ) : (
          <span className="text-xs font-normal opacity-50">estimado</span>
        )}
      </span>
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
