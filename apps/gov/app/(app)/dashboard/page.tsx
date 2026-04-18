import Link from 'next/link'
import { ClipboardList, GanttChartSquare, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ComplianceChip } from '@/components/shared/ComplianceChip'
import { CitationCard } from '@/components/shared/CitationCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingCard } from '@/components/shared/LoadingCard'
import { AIStreamCard } from '@/components/shared/AIStreamCard'

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Bem-vindo de volta</p>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Acompanhe seus processos de licitação, PCAs em coleta e artefatos pendentes de revisão. Use{' '}
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>{' '}
          a qualquer momento para navegar ou criar.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'PCA 2027', value: '0', sub: 'campanhas em coleta', tone: 'text-foreground' },
          { label: 'Processos abertos', value: '0', sub: 'em fase interna', tone: 'text-foreground' },
          { label: 'Artefatos pendentes', value: '0', sub: 'aguardando revisão', tone: 'text-warning' },
          { label: 'Publicados PNCP', value: '0', sub: 'no último mês', tone: 'text-accent' },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">{kpi.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className={`font-mono text-3xl font-semibold ${kpi.tone}`}>{kpi.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Próxima ação</CardTitle>
            <CardDescription>Caminho dourado: a única ação que importa agora.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={GanttChartSquare}
              title="Nenhum processo iniciado"
              description="Crie seu primeiro processo de licitação. A IA gera DFD, ETP e Mapa de Riscos em sequência, com citações jurídicas rastreáveis."
              action={{ label: 'Criar processo', href: '/processos/novo' }}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plano de Contratações</CardTitle>
              <CardDescription>Coletar PCA do próximo exercício</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full" variant="outline">
                <Link href="/pca/novo">
                  <Plus className="h-4 w-4" /> Nova campanha
                </Link>
              </Button>
              <Separator />
              <Button asChild className="w-full" variant="ghost">
                <Link href="/pca">
                  <ClipboardList className="h-4 w-4" /> Ver campanhas
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Componentes da Fase 1 — preview</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status & Compliance</CardTitle>
              <CardDescription>Sinais visuais usados em todos os artefatos</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <StatusBadge status="rascunho" />
              <StatusBadge status="gerando" />
              <StatusBadge status="gerado" />
              <StatusBadge status="aprovado" />
              <StatusBadge status="publicado" />
              <Separator className="my-3" />
              <ComplianceChip level="conforme" />
              <ComplianceChip level="pendente" detail="Falta inciso XIII do art. 18" />
              <ComplianceChip level="nao_conforme" />
              <ComplianceChip level="verificando" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Citação jurídica</CardTitle>
              <CardDescription>Rastreabilidade obrigatória em outputs IA (RI-13)</CardDescription>
            </CardHeader>
            <CardContent>
              <CitationCard
                citation={{
                  lei: 'Lei 14.133/2021',
                  artigo: '18',
                  paragrafo: '1º',
                  inciso: 'I',
                }}
                excerpt="Descrição da necessidade da contratação, observado o disposto no art. 6º, XXIII."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> AI Stream Card
              </CardTitle>
              <CardDescription>Componente de streaming usado durante geração de ETP/TR</CardDescription>
            </CardHeader>
            <CardContent>
              <AIStreamCard
                content={`# ETP — Aquisição de canetas esferográficas\n\n## I — Descrição da necessidade\n\nO órgão demanda canetas esferográficas para uso administrativo dos setores requisitantes...`}
                isStreaming
                modelId="claude-opus-4-7"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loading skeleton</CardTitle>
              <CardDescription>Substitui spinner em qualquer card que carrega</CardDescription>
            </CardHeader>
            <CardContent>
              <LoadingCard rows={4} />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
