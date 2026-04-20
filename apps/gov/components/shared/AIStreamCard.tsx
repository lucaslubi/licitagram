'use client'

import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** Markdown/text being streamed. Re-renders progressively as it grows. */
  content: string
  isStreaming?: boolean
  label?: string
  modelId?: string
  className?: string
}

/**
 * AIStreamCard — institutional editorial.
 *
 * Doc gerado pela IA é apresentado com linguagem visual de memorando
 * oficial:
 *   - Double-rule top (.document-surface) como letterhead da AGU/CJU
 *   - Serifa Newsreader no corpo (.prose-document)
 *   - Bandeira discreta no topo com model ID + live indicator
 *   - Cursor pulse discreto (não flashy)
 *   - Sem bordas chamativas, sem scroll interno pequeno — o doc é lido
 *     de ponta a ponta como um artefato real
 */
export function AIStreamCard({
  content,
  isStreaming = false,
  label = 'Gerando…',
  modelId,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll sutil pro fim conforme stream chega, só se estiver streaming
    if (isStreaming && ref.current) {
      const el = ref.current
      const nearBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 120
      if (nearBottom) el.scrollTop = el.scrollHeight
    }
  }, [content, isStreaming])

  return (
    <div className={cn('document-surface bg-card', className)}>
      <header className="flex items-center justify-between border-b border-border px-6 pb-3 pt-5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full bg-accent',
              isStreaming && 'animate-dot-pulse',
            )}
            aria-hidden
          />
          <span className="label-institutional">
            {isStreaming ? label : 'Documento'}
          </span>
        </div>
        {modelId && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            {modelId}
          </span>
        )}
      </header>
      <div
        ref={ref}
        className="prose-document mx-auto max-h-[70vh] w-full max-w-[72ch] overflow-y-auto whitespace-pre-wrap break-words px-6 py-6"
        aria-live="polite"
        aria-busy={isStreaming}
      >
        {content || (
          <p className="italic text-muted-foreground">
            <Sparkles className="mr-1.5 inline-block h-3.5 w-3.5 text-accent" aria-hidden />
            Aguardando geração…
          </p>
        )}
        {isStreaming && (
          <span
            className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-dot-pulse bg-accent align-middle"
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}
