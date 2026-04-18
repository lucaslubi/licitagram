import type { Metadata } from 'next'
import Link from 'next/link'
import { GanttChartSquare, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/EmptyState'
import { listProcessos } from '@/lib/processos/queries'
import { FASE_LABEL, TIPO_LABEL, MODALIDADE_LABEL } from '@/lib/validations/processo'

export const metadata: Metadata = { title: 'Processos' }

function faseColor(fase: string) {
  if (fase === 'publicado') return 'bg-accent text-accent-foreground'
  if (fase === 'cancelado') return 'bg-muted text-muted-foreground line-through'
  if (['publicacao', 'compliance', 'parecer', 'edital'].includes(fase)) return 'bg-accent/10 text-accent'
  return 'bg-primary/10 text-primary'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function ProcessosPage() {
  const processos = await listProcessos()

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Licitações</p>
          <h1 className="text-3xl font-semibold tracking-tight">Processos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Processos de licitação em andamento. A IA redige DFD, ETP, Mapa de Riscos, TR, Edital e Parecer com citações jurídicas rastreáveis.
          </p>
        </div>
        <Button asChild>
          <Link href="/processos/novo">
            <Plus className="h-4 w-4" /> Novo processo
          </Link>
        </Button>
      </header>

      {processos.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={GanttChartSquare}
              title="Nenhum processo iniciado"
              description="Crie o primeiro processo descrevendo o objeto. A IA gera DFD, ETP, Mapa de Riscos, TR, Edital e Parecer em cascata com citações jurídicas rastreáveis."
              action={{ label: 'Criar processo', href: '/processos/novo' }}
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {processos.map((p) => (
            <li key={p.id}>
              <Link href={`/processos/${p.id}`} className="block">
                <Card className="transition-colors hover:border-primary/50">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                    <div className="min-w-0 flex-1">
                      <CardDescription className="font-mono text-xs uppercase tracking-wide">
                        {p.numeroInterno ?? '—'} · {TIPO_LABEL[p.tipo as keyof typeof TIPO_LABEL] ?? p.tipo}
                        {p.modalidade && ` · ${MODALIDADE_LABEL[p.modalidade as keyof typeof MODALIDADE_LABEL] ?? p.modalidade}`}
                      </CardDescription>
                      <CardTitle className="line-clamp-2 text-base">{p.objeto}</CardTitle>
                    </div>
                    <Badge variant="outline" className={`border-transparent shrink-0 ${faseColor(p.faseAtual)}`}>
                      {FASE_LABEL[p.faseAtual] ?? p.faseAtual}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pb-4 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.setorNome && <span>{p.setorNome}</span>}
                      <span>·</span>
                      <span>{p.artefatosCount} artefatos gerados</span>
                      {p.valorEstimado != null && (
                        <>
                          <span>·</span>
                          <span className="font-mono">R$ {p.valorEstimado.toLocaleString('pt-BR')}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>Criado em {formatDate(p.criadoEm)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
