'use client'

import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** Markdown text being streamed in. Re-renders progressively as it grows. */
  content: string
  /** When true, shows the pulsing cursor at the end. */
  isStreaming?: boolean
  /** Header label shown above the stream. */
  label?: string
  /** Optional model id for transparency (Opus 4.7 / Haiku 4.5). */
  modelId?: string
  className?: string
}

/**
 * Displays an LLM completion as it streams in. Auto-scrolls to bottom while
 * streaming. Markdown rendering can be added once we wire react-markdown — for
 * Phase 1 we just render text content with whitespace preserved (sufficient
 * for ETP/TR drafts which are markdown to begin with).
 */
export function AIStreamCard({ content, isStreaming = false, label = 'IA gerando…', modelId, className }: Props) {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (isStreaming && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [content, isStreaming])

  return (
    <div className={cn('rounded-2xl border border-border bg-card', className)}>
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className={cn('h-4 w-4 text-primary', isStreaming && 'animate-pulse')} aria-hidden />
          <span>{label}</span>
        </div>
        {modelId && (
          <code className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{modelId}</code>
        )}
      </header>
      <pre
        ref={ref}
        className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words p-4 font-sans text-sm leading-relaxed text-foreground"
        aria-live="polite"
        aria-busy={isStreaming}
      >
        {content}
        {isStreaming && (
          <span
            className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-primary align-middle"
            aria-hidden
          />
        )}
      </pre>
    </div>
  )
}
