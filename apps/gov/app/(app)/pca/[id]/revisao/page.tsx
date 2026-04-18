import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getCampanhaDetail } from '@/lib/pca/queries'
import { getConsolidationItems, getConsolidationMarkdown } from '@/lib/pca/admin-actions'
import { summarize } from '@/lib/pca/compliance'
import { RevisaoClient } from './revisao-client'

export const metadata: Metadata = { title: 'Revisão PCA' }

export default async function RevisaoPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) redirect('/onboarding')
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-muted-foreground">
        Apenas admin/coordenador pode revisar campanhas.
      </div>
    )
  }

  const detail = await getCampanhaDetail(params.id)
  if (!detail) notFound()

  const items = await getConsolidationItems(params.id)
  const savedMarkdown = await getConsolidationMarkdown(params.id)
  const compliance = summarize(items)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/pca/${params.id}`}>
            <ArrowLeft className="h-4 w-4" /> Voltar ao painel
          </Link>
        </Button>
      </div>

      <header className="space-y-1.5">
        <p className="font-mono text-xs uppercase tracking-wide text-primary">PCA {detail.ano} · Revisão</p>
        <h1 className="text-3xl font-semibold tracking-tight">{detail.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} itens coletados de {new Set(items.map((i) => i.setorNome)).size} setores. Use a IA para consolidar
          antes de aprovar e publicar.
        </p>
      </header>

      <RevisaoClient
        campanhaId={params.id}
        status={detail.status}
        itemCount={items.length}
        compliance={compliance}
        savedMarkdown={savedMarkdown}
      />
    </div>
  )
}
