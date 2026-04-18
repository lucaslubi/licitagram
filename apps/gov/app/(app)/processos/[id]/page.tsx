import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Circle, Loader2, Sparkles, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getProcessoDetail } from '@/lib/processos/queries'
import { FASE_LABEL, TIPO_LABEL, MODALIDADE_LABEL } from '@/lib/validations/processo'
import { ARTEFATO_LABEL, type ArtefatoTipo } from '@/lib/artefatos/prompts'

export const metadata: Metadata = { title: 'Processo' }

// Ordem canônica da fase interna conforme master plan
const TIMELINE: ArtefatoTipo[] = ['dfd', 'etp', 'mapa_riscos', 'tr', 'edital', 'parecer']

export default async function ProcessoDetailPage({ params }: { params: { id: string } }) {
  const p = await getProcessoDetail(params.id)
  if (!p) notFound()

  const artefatosByTipo = new Map(p.artefatos.map((a) => [a.tipo, a]))

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
          {TIMELINE.map((tipo, idx) => {
            const a = artefatosByTipo.get(tipo)
            const status = a?.status ?? 'pendente'
            const hasContent = !!a && status !== 'gerando'
            const isCurrentFase =
              (tipo === 'dfd' && p.faseAtual === 'dfd') ||
              (tipo === 'etp' && p.faseAtual === 'etp') ||
              (tipo === 'mapa_riscos' && p.faseAtual === 'riscos') ||
              (tipo === 'tr' && p.faseAtual === 'tr') ||
              (tipo === 'edital' && p.faseAtual === 'edital') ||
              (tipo === 'parecer' && p.faseAtual === 'parecer')
            // Páginas especializadas (matriz visual, cesta de preços) em vez do viewer genérico
            const href =
              tipo === 'mapa_riscos'
                ? `/processos/${p.id}/riscos`
                : `/processos/${p.id}/${tipo}`
            return (
              <li key={tipo}>
                <Link href={href} className="block">
                  <Card className={`transition-colors hover:border-primary/50 ${isCurrentFase ? 'border-primary/50' : ''}`}>
                    <CardContent className="flex items-center gap-4 p-4">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          status === 'aprovado' || status === 'publicado'
                            ? 'bg-accent/10 text-accent'
                            : status === 'gerado'
                              ? 'bg-primary/10 text-primary'
                              : status === 'gerando'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {status === 'gerando' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : hasContent ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <span className="font-mono text-[11px] text-muted-foreground">{idx + 1}.</span>
                          {ARTEFATO_LABEL[tipo]}
                          {a?.modeloUsado && (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {a.modeloUsado}
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {status === 'pendente'
                            ? 'Aguardando geração'
                            : status === 'gerando'
                              ? 'IA gerando...'
                              : status === 'aprovado'
                                ? `Aprovado em ${a?.aprovadoEm ? new Date(a.aprovadoEm).toLocaleDateString('pt-BR') : '—'}`
                                : `Gerado em ${a?.criadoEm ? new Date(a.criadoEm).toLocaleDateString('pt-BR') : '—'}`}
                        </p>
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
  return `/processos/${processoId}/${mapFaseToTipo(fase)}`
}
