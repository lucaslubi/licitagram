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

  const totalArtefatos = processos.reduce((sum, p) => sum + p.artefatosCount, 0)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 animate-ink-in">
      {/* Header editorial — label-institutional + serif display */}
      <header className="flex flex-col gap-3 rule-top pt-6">
        <p className="label-institutional">Gabinete · Área de Trabalho</p>
        <h1 className="font-display text-[2.4rem] leading-[1.1] tracking-tight text-balance">
          Dashboard
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Navegação rápida pelos processos e campanhas PCA do órgão.{' '}
          <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
            ⌘K
          </kbd>
        </p>
      </header>

      {/* KPIs — layout editorial com divisores, não cards com sombra */}
      <section className="grid gap-0 border-y border-border sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Campanhas PCA ativas"
          value={ativas.length.toString()}
          hint={`${totalItens.toLocaleString('pt-BR')} itens coletados`}
        />
        <KpiTile
          label="Processos abertos"
          value={processosAbertos.length.toString()}
          hint="em fase interna"
          borderLeft
        />
        <KpiTile
          label="Artefatos gerados"
          value={totalArtefatos.toString()}
          hint="DFD · ETP · TR · Edital · Parecer"
          borderLeft
        />
        <KpiTile
          label="Publicados no PNCP"
          value={processosPublicados.length.toString()}
          hint="neste exercício"
          accent
          borderLeft
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-border">
            <p className="label-institutional">Caminho dourado</p>
            <CardTitle className="font-display text-xl tracking-tight">Próxima ação</CardTitle>
            <CardDescription>Onde retomar o trabalho agora.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
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
            <CardHeader className="border-b border-border">
              <p className="label-institutional">Navegação</p>
              <CardTitle className="font-display text-lg tracking-tight">Ações rápidas</CardTitle>
              <CardDescription>⌘K abre o comando universal.</CardDescription>
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

/**
 * KpiTile — número institucional num layout de colunas tipo Bloomberg.
 * Sem cards com shadow — só divisores verticais entre colunas e valor
 * grande em Newsreader pra evocar diagrama de imprensa.
 */
function KpiTile({
  label,
  value,
  hint,
  accent,
  borderLeft,
}: {
  label: string
  value: string
  hint: string
  accent?: boolean
  borderLeft?: boolean
}) {
  return (
    <div
      className={`px-6 py-5 ${borderLeft ? 'sm:border-l sm:border-border' : ''} ${
        accent ? 'bg-accent/[0.03]' : ''
      }`}
    >
      <p className="label-institutional">{label}</p>
      <p
        className={`mt-3 font-display text-[2.4rem] font-medium leading-none tracking-tight tabular-nums ${
          accent ? 'text-accent' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
