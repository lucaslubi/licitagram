'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Loader2, Scale, Send, Sparkles, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIStreamCard } from '@/components/shared/AIStreamCard'
import { approveCampanhaAction, publishCampanhaAction } from '@/lib/pca/admin-actions'
import type { ComplianceCheck, ComplianceSummary } from '@/lib/pca/compliance'

interface Props {
  campanhaId: string
  status: string
  itemCount: number
  compliance: ComplianceSummary
  savedMarkdown: string | null
}

export function RevisaoClient({ campanhaId, status, itemCount, compliance, savedMarkdown }: Props) {
  const [output, setOutput] = useState(savedMarkdown ?? '')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approving, startApprove] = useTransition()
  const [publishing, startPublish] = useTransition()
  const router = useRouter()

  const isTerminal = status === 'aprovado' || status === 'publicado' || status === 'arquivado'

  const runConsolidation = async () => {
    if (itemCount === 0) {
      toast.error('Sem itens pra consolidar — aguarde os setores responderem')
      return
    }
    setStreaming(true)
    setError(null)
    setOutput('')
    try {
      const res = await fetch('/api/ai/consolidate-pca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campanhaId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      if (!res.body) throw new Error('Sem stream na resposta')

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
            if (parsed.text) setOutput((prev) => prev + parsed.text)
          } catch {
            /* ignore malformed lines */
          }
        }
      }
      toast.success('Consolidação concluída')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na consolidação'
      setError(msg)
      toast.error(msg)
    } finally {
      setStreaming(false)
    }
  }

  const approve = () => {
    startApprove(async () => {
      const res = await approveCampanhaAction(campanhaId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Campanha aprovada')
      router.refresh()
    })
  }

  const publish = () => {
    if (!window.confirm('Marcar campanha como publicada? Integração PNCP ainda está em desenvolvimento — neste momento apenas registra o status.')) {
      return
    }
    startPublish(async () => {
      const res = await publishCampanhaAction(campanhaId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Campanha publicada (status registrado)')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <section>
        <header className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Scale className="h-4 w-4 text-primary" />
              Compliance pré-publicação
            </h2>
            <p className="text-xs text-muted-foreground">
              {compliance.passed} / {compliance.total} checks OK · {compliance.criticas} críticos · {compliance.altas} altos
            </p>
          </div>
        </header>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {compliance.checks.map((c) => (
            <li key={c.id} className="flex gap-3 p-3">
              <CheckIcon check={c} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>
                {c.citation && (
                  <p className="mt-1 font-mono text-[11px] text-primary">
                    {c.citation.lei}
                    {c.citation.artigo ? `, art. ${c.citation.artigo}` : ''}
                    {c.citation.paragrafo ? ` § ${c.citation.paragrafo}` : ''}
                    {c.citation.inciso ? `, inciso ${c.citation.inciso}` : ''}
                    {c.citation.acordao ? ` · ${c.citation.acordao}` : ''}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Consolidação IA (Gemini 2.5 Pro)
          </h2>
          <Button onClick={runConsolidation} disabled={streaming || itemCount === 0} variant={output ? 'outline' : 'default'}>
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {streaming ? 'Consolidando...' : output ? 'Regenerar' : 'Consolidar com IA'}
          </Button>
        </header>

        {output || streaming ? (
          <AIStreamCard
            content={output}
            isStreaming={streaming}
            modelId="gemini-2.5-pro"
            label={streaming ? 'Consolidando...' : 'Consolidação gerada'}
          />
        ) : savedMarkdown ? null : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pronto pra consolidar?</CardTitle>
              <CardDescription>
                A IA detecta duplicatas entre setores, alerta risco de fracionamento (art. 23 §1º), e gera insights
                executivos com citações jurídicas rastreáveis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Leva ~20-40s. Gemini 2.5 Pro via Google AI.
              </p>
            </CardContent>
          </Card>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </section>

      {!isTerminal && (
        <section className="sticky bottom-4 z-10">
          <Card className="border-primary/30 bg-background/90 backdrop-blur">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Pronto pra avançar?</p>
                <p className="text-xs text-muted-foreground">
                  {compliance.canPublish
                    ? 'Compliance OK. Aprove ou publique.'
                    : `Bloqueado: ${compliance.criticas} pendência(s) crítica(s) antes de publicar.`}
                </p>
              </div>
              <div className="flex gap-2">
                {status === 'consolidando' && (
                  <Button
                    variant="outline"
                    onClick={approve}
                    disabled={approving || !compliance.canPublish}
                  >
                    {approving && <Loader2 className="h-4 w-4 animate-spin" />} Aprovar
                  </Button>
                )}
                <Button onClick={publish} disabled={publishing || !compliance.canPublish}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {publishing ? 'Publicando...' : 'Publicar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}

function CheckIcon({ check }: { check: ComplianceCheck }) {
  if (check.passed) {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
  }
  if (check.severity === 'critica') {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
  }
  return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
}
