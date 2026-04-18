'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIStreamCard } from '@/components/shared/AIStreamCard'
import { approveArtefatoAction } from '@/lib/processos/actions'
import { stripMarkdownChrome, type ArtefatoTipo } from '@/lib/artefatos/prompts'

interface Props {
  processoId: string
  tipo: ArtefatoTipo
  existingMarkdown: string
  existingStatus: string
  existingModelId: string | null
  existingArtefatoId: string | null
}

export function ArtefatoViewer({
  processoId,
  tipo,
  existingMarkdown,
  existingStatus,
  existingModelId,
  existingArtefatoId,
}: Props) {
  const router = useRouter()
  const [output, setOutput] = useState(tipo === 'mapa_riscos' ? existingMarkdown : stripMarkdownChrome(existingMarkdown))
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelId, setModelId] = useState<string | null>(existingModelId)
  const [approving, startApprove] = useTransition()

  const run = async () => {
    setStreaming(true)
    setError(null)
    setOutput('')
    try {
      const res = await fetch('/api/ai/generate-artefato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processoId, tipo }),
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
            if (parsed.text) setOutput((prev) => prev + parsed.text)
          } catch {
            /* ignore */
          }
        }
      }
      toast.success('Artefato gerado')
      setModelId(existingModelId) // update after refresh
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha'
      setError(msg)
      toast.error(msg)
    } finally {
      setStreaming(false)
    }
  }

  const approve = () => {
    if (!existingArtefatoId) return
    startApprove(async () => {
      const res = await approveArtefatoAction(existingArtefatoId, processoId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Artefato aprovado')
      router.refresh()
    })
  }

  const hasContent = output.length > 0
  const isTerminal = existingStatus === 'aprovado' || existingStatus === 'publicado'

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {modelId && <span className="font-mono">{modelId}</span>}
          {existingStatus !== 'pendente' && (
            <>
              <span>·</span>
              <span>
                {existingStatus === 'aprovado'
                  ? 'Aprovado'
                  : existingStatus === 'gerando'
                    ? 'Gerando...'
                    : existingStatus === 'gerado'
                      ? 'Gerado — aguardando revisão'
                      : existingStatus}
              </span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={run} disabled={streaming} variant={hasContent ? 'outline' : 'default'}>
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {streaming ? 'Gerando...' : hasContent ? 'Regenerar' : 'Gerar com IA'}
          </Button>
          {hasContent && !isTerminal && existingArtefatoId && (
            <Button onClick={approve} disabled={approving || streaming} variant="default">
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {approving ? 'Aprovando...' : 'Aprovar'}
            </Button>
          )}
        </div>
      </header>

      {hasContent || streaming ? (
        <AIStreamCard
          content={output}
          isStreaming={streaming}
          modelId={modelId ?? 'gemini-2.5'}
          label={streaming ? 'Gerando...' : 'Artefato'}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ainda não gerado</CardTitle>
            <CardDescription>
              A IA usa o objeto do processo + base jurídica (Lei 14.133/2021) para redigir o artefato com citações rastreáveis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Você pode editar o conteúdo gerado depois, regenerar, ou aprovar para avançar de fase.
            </p>
          </CardContent>
        </Card>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
