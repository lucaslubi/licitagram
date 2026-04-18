import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/EmptyState'
import { listCampanhas } from '@/lib/pca/queries'

export const metadata: Metadata = { title: 'PCA' }

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
      return { label: 'Arquivado', tone: 'bg-muted text-muted-foreground line-through' }
    default:
      return { label: status, tone: 'bg-muted text-muted-foreground' }
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function PcaListPage() {
  const campanhas = await listCampanhas()

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Plano de Contratações</p>
          <h1 className="text-3xl font-semibold tracking-tight">PCA</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Colete demandas dos setores, consolide com IA e publique no PNCP. Baseado na Lei 14.133/2021, art. 12, inciso VII.
          </p>
        </div>
        <Button asChild>
          <Link href="/pca/novo">
            <Plus className="h-4 w-4" /> Nova campanha
          </Link>
        </Button>
      </header>

      {campanhas.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ClipboardList}
              title="Nenhuma campanha ainda"
              description="Crie uma campanha pra coletar demandas dos setores. Cada setor recebe um link próprio, responde pelo celular, e a IA consolida tudo pronto pra publicar no PNCP."
              action={{ label: 'Criar campanha', href: '/pca/novo' }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campanhas.map((c) => {
            const badge = statusLabel(c.status)
            const progress = c.setoresTotal === 0 ? 0 : Math.round((c.setoresRespondidos / c.setoresTotal) * 100)
            return (
              <Link key={c.id} href={`/pca/${c.id}`} className="block">
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardDescription className="font-mono text-xs uppercase tracking-wide">PCA {c.ano}</CardDescription>
                        <CardTitle className="truncate text-base">{c.titulo}</CardTitle>
                      </div>
                      <Badge variant="outline" className={`border-transparent ${badge.tone}`}>
                        {badge.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {c.setoresRespondidos} / {c.setoresTotal} setores
                        </span>
                        <span>{c.itensTotal} itens</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Prazo de resposta: {formatDate(c.prazoRespostaEm)}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
