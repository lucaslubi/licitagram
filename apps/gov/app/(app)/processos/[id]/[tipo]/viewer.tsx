'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  FileDown,
  Loader2,
  Pencil,
  Save,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIStreamCard } from '@/components/shared/AIStreamCard'
import { approveArtefatoAction, updateArtefatoAction } from '@/lib/processos/actions'
import { stripMarkdownChrome, type ArtefatoTipo } from '@/lib/artefatos/prompts'

interface Props {
  processoId: string
  tipo: ArtefatoTipo
  existingMarkdown: string
  existingStatus: string
  existingModelId: string | null
  existingArtefatoId: string | null
}

const NEXT_STEP: Record<ArtefatoTipo, { label: string; href: (id: string) => string } | null> = {
  dfd: { label: 'Próximo: ETP', href: (id) => `/processos/${id}/etp` },
  etp: { label: 'Próximo: Mapa de Riscos', href: (id) => `/processos/${id}/riscos` },
  mapa_riscos: { label: 'Próximo: Cesta de Preços', href: (id) => `/processos/${id}/precos` },
  tr: { label: 'Próximo: Compliance', href: (id) => `/processos/${id}/compliance` },
  edital: { label: 'Próximo: Publicar PNCP', href: (id) => `/processos/${id}/publicar` },
  parecer: { label: 'Próximo: Edital', href: (id) => `/processos/${id}/edital` },
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
  const initial = useMemo(
    () => (tipo === 'mapa_riscos' ? existingMarkdown : stripMarkdownChrome(existingMarkdown)),
    [existingMarkdown, tipo],
  )
  const [output, setOutput] = useState(initial)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelId, setModelId] = useState<string | null>(existingModelId)
  const [approving, startApprove] = useTransition()
  const [saving, startSave] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [copied, setCopied] = useState(false)

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
      setModelId(existingModelId)
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      toast.success('Texto copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Falha ao copiar')
    }
  }

  const openPrint = () => {
    const url = `/print/${processoId}/${tipo}`
    window.open(url, '_blank', 'noopener')
  }

  const startEdit = () => {
    setDraft(output)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft(output)
  }

  const saveEdit = () => {
    startSave(async () => {
      const res = await updateArtefatoAction(processoId, tipo, draft)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setOutput(tipo === 'mapa_riscos' ? draft : stripMarkdownChrome(draft))
      setEditing(false)
      toast.success('Alterações salvas')
      router.refresh()
    })
  }

  const hasContent = output.length > 0
  const isTerminal = existingStatus === 'aprovado' || existingStatus === 'publicado'
  const isApproved = existingStatus === 'aprovado' || existingStatus === 'publicado'
  const nextStep = NEXT_STEP[tipo]

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wide">LICITAGRAM AI</span>
          {existingStatus !== 'pendente' && (
            <>
              <span>·</span>
              <span>
                {existingStatus === 'aprovado'
                  ? 'Aprovado'
                  : existingStatus === 'gerando'
                    ? 'Gerando…'
                    : existingStatus === 'gerado'
                      ? 'Gerado — aguardando revisão'
                      : existingStatus}
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasContent && !editing && (
            <>
              <Button onClick={copy} disabled={streaming} variant="outline" size="sm">
                {copied ? <ClipboardCheck className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              <Button onClick={openPrint} disabled={streaming} variant="outline" size="sm">
                <FileDown className="h-4 w-4" />
                Exportar PDF
              </Button>
              {!isApproved && (
                <Button onClick={startEdit} disabled={streaming} variant="outline" size="sm">
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              )}
            </>
          )}
          {editing ? (
            <>
              <Button onClick={cancelEdit} disabled={saving} variant="outline" size="sm">
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button onClick={saveEdit} disabled={saving} size="sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </>
          ) : (
            <Button onClick={run} disabled={streaming} variant={hasContent ? 'outline' : 'gradient'}>
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {streaming ? 'Gerando…' : hasContent ? 'Regenerar' : 'Gerar com IA'}
            </Button>
          )}
          {hasContent && !isTerminal && existingArtefatoId && !editing && (
            <Button onClick={approve} disabled={approving || streaming}>
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {approving ? 'Aprovando…' : 'Aprovar'}
            </Button>
          )}
        </div>
      </header>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edição manual</CardTitle>
            <CardDescription>
              Ao salvar, uma nova versão do artefato é criada com autor <code className="font-mono">human-edit</code> no audit log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[480px] w-full resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Conteúdo do artefato"
            />
          </CardContent>
        </Card>
      ) : hasContent || streaming ? (
        <AIStreamCard
          content={output}
          isStreaming={streaming}
          modelId={modelId ?? undefined}
          label={streaming ? 'Gerando…' : 'Artefato'}
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
              Você pode editar o conteúdo gerado, regenerar, ou aprovar para avançar de fase.
            </p>
          </CardContent>
        </Card>
      )}

      {isApproved && nextStep && !editing && (
        <Card className="border-accent/30">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2">
                <CheckCircle2 className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium">Artefato aprovado</p>
                <p className="text-xs text-muted-foreground">Avance para a próxima etapa do fluxo</p>
              </div>
            </div>
            <Button asChild variant="gradient">
              <Link href={nextStep.href(processoId)}>
                {nextStep.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
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
