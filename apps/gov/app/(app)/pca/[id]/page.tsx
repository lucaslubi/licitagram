import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getCampanhaDetail } from '@/lib/pca/queries'
import { CampanhaPanel } from './panel'

export const metadata: Metadata = { title: 'Campanha PCA' }

function statusLabel(status: string) {
  switch (status) {
    case 'rascunho':
      return { label: 'Rascunho', tone: 'bg-muted text-muted-foreground' }
    case 'coletando':
      return { label: 'Coletando', tone: 'bg-primary/10 text-primary' }
    case 'consolidando':
      return { label: 'Consolidando', tone: 'bg-warning/10 text-warning' }
    case 'aprovado':
      return { label: 'Aprovado', tone: 'bg-accent/10 text-accent' }
    case 'publicado':
      return { label: 'Publicado', tone: 'bg-accent text-accent-foreground' }
    case 'arquivado':
      return { label: 'Arquivado', tone: 'bg-muted text-muted-foreground' }
    default:
      return { label: status, tone: 'bg-muted text-muted-foreground' }
  }
}

export default async function CampanhaDetailPage({ params }: { params: { id: string } }) {
  const detail = await getCampanhaDetail(params.id)
  if (!detail) notFound()

  const badge = statusLabel(detail.status)
  const prazoLabel = new Date(detail.prazoRespostaEm).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const respondidos = detail.setores.filter((s) => s.respondidoEm).length
  const totalItens = detail.setores.reduce((sum, s) => sum + s.itensCount, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/pca">
            <ArrowLeft className="h-4 w-4" /> PCA
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-wide text-primary">PCA {detail.ano}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{detail.titulo}</h1>
          <p className="text-sm text-muted-foreground">Prazo de resposta: {prazoLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant="outline" className={`border-transparent ${badge.tone}`}>
            {badge.label}
          </Badge>
          {totalItens > 0 && (
            <Button asChild size="sm">
              <Link href={`/pca/${detail.id}/revisao`}>
                <Sparkles className="h-4 w-4" /> Revisar com IA
              </Link>
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Setores convidados</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">{detail.setores.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Já responderam</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`font-mono text-3xl font-semibold ${respondidos === detail.setores.length ? 'text-accent' : 'text-primary'}`}>
              {respondidos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Itens coletados</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">{totalItens}</p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-2">
        <header className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-medium">Progresso por setor (atualiza em tempo real)</h2>
        </header>
        <CampanhaPanel campanhaId={detail.id} initialSetores={detail.setores} />
      </section>
    </div>
  )
}
