'use client'

import { useState } from 'react'
import { Clipboard, ClipboardCheck, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  processoId: string
  pendentesCount: number
}

/**
 * PlanoAcaoIA — a IA lê o contexto completo do processo + compliance
 * summary e redige um plano de ação priorizado pras pendências
 * críticas/altas, com fundamento legal, impacto e exemplos de redação.
 */
export function PlanoAcaoIA({ processoId, pendentesCount }: Props) {
  const [content, setContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const gerar = async () => {
    setStreaming(true)
    setError(null)
    setContent('')
    try {
      const res = await fetch('/api/ai/plano-compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processoId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      if (!res.body) throw new Error('Sem stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const parsed = JSON.parse(payload) as { text?: string; error?: string }
            if (parsed.error) {
              setError(parsed.error)
              toast.error(parsed.error)
              continue
            }
            if (parsed.text) setContent((prev) => prev + parsed.text)
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao gerar plano'
      setError(msg)
      toast.error(msg)
    } finally {
      setStreaming(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success('Plano copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Falha ao copiar')
    }
  }

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-institutional">Resolução assistida</p>
            <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
              <Sparkles className="h-4 w-4 text-accent" />
              Plano de Ação — IA
            </CardTitle>
            <CardDescription>
              A IA analisa o contexto completo do processo e redige um plano de ação priorizando as{' '}
              <strong>{pendentesCount}</strong> pendência(s) crítica/alta — com fundamento legal, impacto e
              exemplos de redação prontos pra copiar nos artefatos.
            </CardDescription>
          </div>
          {!content && !streaming && (
            <Button onClick={gerar} variant="gradient">
              <Sparkles className="h-4 w-4" />
              Gerar plano de ação
            </Button>
          )}
          {content && !streaming && (
            <div className="flex gap-2">
              <Button onClick={copy} variant="outline" size="sm">
                {copied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              <Button onClick={gerar} variant="outline" size="sm">
                <Sparkles className="h-3.5 w-3.5" />
                Regenerar
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {(streaming || content || error) && (
        <CardContent>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="document-surface bg-background">
              <div className="flex items-center justify-between border-b border-border px-5 pb-2.5 pt-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full bg-accent ${
                      streaming ? 'animate-dot-pulse' : ''
                    }`}
                    aria-hidden
                  />
                  <span className="label-institutional">
                    {streaming ? 'Redigindo…' : 'Plano de Ação'}
                  </span>
                </div>
                {streaming && (
                  <Badge variant="outline" className="text-[10px]">
                    streaming
                  </Badge>
                )}
              </div>
              <div className="prose-document mx-auto max-h-[60vh] w-full max-w-[72ch] overflow-y-auto whitespace-pre-wrap break-words px-5 py-5">
                {content}
                {streaming && (
                  <span
                    className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-dot-pulse bg-accent align-middle"
                    aria-hidden
                  />
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
