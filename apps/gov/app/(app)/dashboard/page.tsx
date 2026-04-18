import Link from 'next/link'
import { ClipboardList, GanttChartSquare, Plus, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/shared/EmptyState'
import { listCampanhas } from '@/lib/pca/queries'
import { listProcessos } from '@/lib/processos/queries'
import { FASE_LABEL } from '@/lib/validations/processo'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default async function DashboardPage() {
  const [campanhas, processos] = await Promise.all([listCampanhas(), listProcessos()])
  const ativas = campanhas.filter((c) => c.status === 'coletando' || c.status === 'consolidando')
  const totalItens = campanhas.reduce((sum, c) => sum + c.itensTotal, 0)
  const processosAbertos = processos.filter((p) => !['publicado', 'cancelado'].includes(p.faseAtual))
  const processosPublicados = processos.filter((p) => p.faseAtual === 'publicado')

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Bem-vindo de volta</p>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Use{' '}
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>{' '}
          para navegar ou criar.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Campanhas PCA ativas</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">{ativas.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{totalItens} itens coletados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Processos abertos</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">{processosAbertos.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">em fase interna</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Artefatos gerados</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">
              {processos.reduce((sum, p) => sum + p.artefatosCount, 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">DFD, ETP, TR, Edital, Parecer</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Publicados PNCP</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold text-accent">{processosPublicados.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">este exercício</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Próxima ação</CardTitle>
            <CardDescription>Caminho dourado: a única ação que importa agora.</CardDescription>
          </CardHeader>
          <CardContent>
            {processosAbertos.length > 0 || ativas.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {processosAbertos.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    <Link href={`/processos/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-secondary/50">
                      <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.objeto}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{p.numeroInterno ?? '—'}</span>
                          <span>·</span>
                          <span>{p.artefatosCount} artefatos</span>
                          <span>·</span>
                          <span>Criado {formatDate(p.criadoEm)}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                        {FASE_LABEL[p.faseAtual] ?? p.faseAtual}
                      </Badge>
                    </Link>
                  </li>
                ))}
                {ativas.slice(0, 2).map((c) => {
                  const progress = c.setoresTotal === 0 ? 0 : Math.round((c.setoresRespondidos / c.setoresTotal) * 100)
                  return (
                    <li key={c.id}>
                      <Link href={`/pca/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-secondary/50">
                        <ClipboardList className="h-4 w-4 text-primary" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.titulo}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{c.setoresRespondidos}/{c.setoresTotal} setores</span>
                            <span>·</span>
                            <span>Prazo {formatDate(c.prazoRespostaEm)}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className="font-mono">{progress}%</Badge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                icon={GanttChartSquare}
                title="Nenhum processo ou coleta em andamento"
                description="Abra um processo de licitação — DFD, ETP, Mapa de Riscos, Pesquisa de Preços, TR, Edital e Parecer gerados por IA com citações jurídicas. Ou crie uma campanha PCA."
                action={{ label: 'Criar processo', href: '/processos/novo' }}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ações rápidas</CardTitle>
              <CardDescription>Cmd+K também funciona</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full" variant="default">
                <Link href="/processos/novo">
                  <Sparkles className="h-4 w-4" /> Novo processo
                </Link>
              </Button>
              <Button asChild className="w-full" variant="outline">
                <Link href="/pca/novo">
                  <Plus className="h-4 w-4" /> Nova campanha PCA
                </Link>
              </Button>
              <Separator />
              <Button asChild className="w-full" variant="ghost">
                <Link href="/processos">
                  <GanttChartSquare className="h-4 w-4" /> Ver processos
                </Link>
              </Button>
              <Button asChild className="w-full" variant="ghost">
                <Link href="/configuracoes/setores">Gerenciar setores</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
