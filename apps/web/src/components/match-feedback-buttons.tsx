'use client'
import { useState, useTransition } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { voteOnMatch, removeVote } from '@/actions/match-feedback'

interface Props {
  matchId: string
  initialVote?: 'up' | 'down' | null
  size?: 'sm' | 'md'
}

/**
 * F-Q4 — 👍/👎 buttons rendered on each match card / detail page.
 * Click toggles vote (re-clicking the same vote removes it).
 * Optimistic UI: state flips immediately, server reconciles.
 */
export function MatchFeedbackButtons({ matchId, initialVote, size = 'sm' }: Props) {
  const [vote, setVote] = useState<'up' | 'down' | null>(initialVote ?? null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const iconSize = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'
  const padding = size === 'md' ? 'p-2' : 'p-1.5'

  const handleVote = (newVote: 'up' | 'down') => {
    setError(null)
    const previous = vote
    // Optimistic update
    if (vote === newVote) {
      setVote(null)
    } else {
      setVote(newVote)
    }

    startTransition(async () => {
      try {
        if (previous === newVote) {
          const result = await removeVote(matchId)
          if (!result.success) {
            setVote(previous)
            setError(result.error || 'erro')
          }
        } else {
          const result = await voteOnMatch(matchId, newVote)
          if (!result.success) {
            setVote(previous)
            setError(result.error || 'erro')
          }
        }
      } catch (e) {
        setVote(previous)
        setError(e instanceof Error ? e.message : 'erro')
      }
    })
  }

  return (
    <div
      className="inline-flex items-center gap-1"
      aria-label="Avalie esse match"
      onClick={(e) => {
        // Prevent parent <Link>/card click from navigating when user clicks the buttons.
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      <button
        type="button"
        onClick={() => handleVote('up')}
        disabled={isPending}
        aria-pressed={vote === 'up'}
        title="Match relevante"
        className={`${padding} rounded-md transition-colors ${
          vote === 'up'
            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent'
        } disabled:opacity-50`}
      >
        <ThumbsUp className={iconSize} />
      </button>
      <button
        type="button"
        onClick={() => handleVote('down')}
        disabled={isPending}
        aria-pressed={vote === 'down'}
        title="Match irrelevante"
        className={`${padding} rounded-md transition-colors ${
          vote === 'down'
            ? 'bg-red-500/15 text-red-500 border border-red-500/30'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent'
        } disabled:opacity-50`}
      >
        <ThumbsDown className={iconSize} />
      </button>
      {error && (
        <span className="text-[10px] text-red-500 ml-1" title={error}>!</span>
      )}
    </div>
  )
}
