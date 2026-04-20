import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Circle, Loader2, Send, Sparkles, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getProcessoDetail } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { FASE_LABEL, TIPO_LABEL, MODALIDADE_LABEL } from '@/lib/validations/processo'
import { ARTEFATO_LABEL, type ArtefatoTipo } from '@/lib/artefatos/prompts'

export const metadata: Metadata = { title: 'Processo' }

// Timeline expandido: 8 etapas reais da fase interna.
// Preços e Compliance não são artefatos markdown — são páginas com dados
// estruturados — mas visualmente fazem parte do fluxo. Incluí-los aqui
// explicita o caminho pro usuário em vez de "sumir" etapas.
type TimelineStep =
  | { kind: 'artefato'; tipo: ArtefatoTipo; fase: string; label: string }
  | { kind: 'data'; slug: 'precos' | 'compliance' | 'publicar'; fase: string; label: string }

const TIMELINE: TimelineStep[] = [
  { kind: 'artefato', tipo: 'dfd', fase: 'dfd', label: ARTEFATO_LABEL.dfd },
  { kind: 'artefato', tipo: 'etp', fase: 'etp', label: ARTEFATO_LABEL.etp },
  { kind: 'artefato', tipo: 'mapa_riscos', fase: 'riscos', label: ARTEFATO_LABEL.mapa_riscos },
  { kind: 'data', slug: 'precos', fase: 'precos', label: 'Pesquisa de Preços (cesta TCU)' },
  { kind: 'artefato', tipo: 'tr', fase: 'tr', label: ARTEFATO_LABEL.tr },
  { kind: 'data', slug: 'compliance', fase: 'compliance', label: 'Compliance (checklist Lei 14.133)' },
  { kind: 'artefato', tipo: 'edital', fase: 'edital', label: ARTEFATO_LABEL.edital },
  { kind: 'artefato', tipo: 'parecer', fase: 'parecer', label: ARTEFATO_LABEL.parecer },
  { kind: 'data', slug: 'publicar', fase: 'publicacao', label: 'Publicação no PNCP' },
]

export default async function ProcessoDetailPage({ params }: { params: { id: string } }) {
  const p = await getProcessoDetail(params.id)
  if (!p) notFound()

  const artefatosByTipo = new Map(p.artefatos.map((a) => [a.tipo, a]))
  // Para as etapas de dados (preços, compliance, publicar) inferimos status
  // do próprio estado do processo + dados estruturados.
  const estimativas = await listEstimativas(params.id)
  const precosCount = estimativas.length

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/processos">
            <ArrowLeft className="h-4 w-4" /> Processos
          </Link>
        </Button>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs uppercase tracking-wide text-primary">
            {p.numeroInterno ?? '—'} · {TIPO_LABEL[p.tipo as keyof typeof TIPO_LABEL] ?? p.tipo}
          </p>
          {p.modalidade && (
            <Badge variant="outline">
              {MODALIDADE_LABEL[p.modalidade as keyof typeof MODALIDADE_LABEL] ?? p.modalidade}
            </Badge>
          )}
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            Fase: {FASE_LABEL[p.faseAtual] ?? p.faseAtual}
          </Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{p.objeto}</h1>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {p.setorNome && <span>{p.setorNome}</span>}
          {p.valorEstimado != null && (
            <span className="font-mono">R$ {p.valorEstimado.toLocaleString('pt-BR')}</span>
          )}
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Timeline de artefatos — IA com citações jurídicas
        </h2>
        <ul className="space-y-2">
          {TIMELINE.map((step, idx) => {
            const isCurrentFase = p.faseAtual === step.fase
            const isPublicadoTerminal = p.faseAtual === 'publicado'

            // Deriva status + href + detail
            let status: 'pendente' | 'gerando' | 'gerado' | 'aprovado' | 'concluido'
            let detail: string
            let href: string
            let modeloUsado: string | null = null

            if (step.kind === 'artefato') {
              const a = artefatosByTipo.get(step.tipo)
              const s = (a?.status ?? 'pendente') as typeof status
              status = s
              modeloUsado = a?.modeloUsado ?? null
              detail =
                s === 'pendente'
                  ? 'Aguardando geração'
                  : s === 'gerando'
                    ? 'IA gerando...'
                    : s === 'aprovado'
                      ? `Aprovado em ${a?.aprovadoEm ? new Date(a.aprovadoEm).toLocaleDateString('pt-BR') : '—'}`
                      : `Gerado em ${a?.criadoEm ? new Date(a.criadoEm).toLocaleDateString('pt-BR') : '—'}`
              href =
                step.tipo === 'mapa_riscos'
                  ? `/processos/${p.id}/riscos`
                  : `/processos/${p.id}/${step.tipo}`
            } else if (step.slug === 'precos') {
              // precos: concluído quando há estimativa + fase já avançou
              const completed = precosCount > 0 && phaseAfter(p.faseAtual, 'precos')
              status = completed ? 'concluido' : isCurrentFase ? 'gerando' : 'pendente'
              detail = completed
                ? `${precosCount} item(ns) com cesta finalizada`
                : precosCount > 0
                  ? `${precosCount} estimativa(s) — clique pra finalizar`
                  : 'Elaborar cesta (≥3 fontes/item) conforme TCU 1.875/2021'
              href = `/processos/${p.id}/precos`
            } else if (step.slug === 'compliance') {
              const completed = phaseAfter(p.faseAtual, 'compliance')
              status = completed ? 'concluido' : isCurrentFase ? 'gerando' : 'pendente'
              detail = completed
                ? 'Checklist aprovado — pronto para Edital'
                : 'Checklist determinístico da Lei 14.133'
              href = `/processos/${p.id}/compliance`
            } else {
              // publicar
              const completed = p.faseAtual === 'publicado'
              status = completed ? 'concluido' : isCurrentFase ? 'gerando' : 'pendente'
              detail = completed ? 'Publicado no PNCP' : 'Submeter ao PNCP (Compras.gov.br)'
              href = `/processos/${p.id}/publicar`
            }

            const isDone = status === 'aprovado' || status === 'concluido' || (isPublicadoTerminal && step.kind !== 'artefato')
            const isGenerated = status === 'gerado'

            return (
              <li key={`${step.kind}-${'tipo' in step ? step.tipo : step.slug}`}>
                <Link href={href} className="block">
                  <Card
                    className={`transition-colors hover:border-accent/60 ${
                      isCurrentFase ? 'border-accent/50 bg-accent/[0.02]' : isDone ? 'border-border/50' : ''
                    }`}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          isDone
                            ? 'bg-success/12 text-success'
                            : isGenerated
                              ? 'bg-accent/10 text-accent'
                              : status === 'gerando'
                                ? 'bg-accent/8 text-accent'
                                : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {status === 'gerando' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : step.kind === 'data' && step.slug === 'publicar' ? (
                          isDone ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />
                        ) : isDone || isGenerated ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <span className="font-mono text-[11px] text-muted-foreground">{idx + 1}.</span>
                          {step.label}
                          {modeloUsado && (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {modeloUsado}
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{detail}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Próxima ação recomendada
          </CardTitle>
          <CardDescription>
            {p.faseAtual === 'publicado'
              ? 'Processo já publicado.'
              : `Gerar ${ARTEFATO_LABEL[mapFaseToTipo(p.faseAtual) as ArtefatoTipo] ?? p.faseAtual}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={nextActionHref(p.id, p.faseAtual)}>
              <Sparkles className="h-4 w-4" /> Continuar
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Retorna true se `current` já passou pela etapa `step`. Baseado na ordem
 * canônica da fase_atual.
 */
function phaseAfter(current: string, step: string): boolean {
  const order = ['dfd', 'etp', 'riscos', 'precos', 'tr', 'compliance', 'edital', 'parecer', 'publicacao', 'publicado']
  const ci = order.indexOf(current)
  const si = order.indexOf(step)
  if (ci < 0 || si < 0) return false
  return ci > si
}

function mapFaseToTipo(fase: string): string {
  const map: Record<string, string> = {
    dfd: 'dfd',
    etp: 'etp',
    riscos: 'mapa_riscos',
    precos: 'precos',
    tr: 'tr',
    compliance: 'compliance',
    parecer: 'parecer',
    edital: 'edital',
    publicacao: 'edital',
  }
  return map[fase] ?? 'dfd'
}

function nextActionHref(processoId: string, fase: string): string {
  // Páginas especializadas quando existem
  if (fase === 'riscos') return `/processos/${processoId}/riscos`
  if (fase === 'precos') return `/processos/${processoId}/precos`
  if (fase === 'compliance') return `/processos/${processoId}/compliance`
  if (fase === 'publicacao' || fase === 'publicado') return `/processos/${processoId}/publicar`
  return `/processos/${processoId}/${mapFaseToTipo(fase)}`
}
