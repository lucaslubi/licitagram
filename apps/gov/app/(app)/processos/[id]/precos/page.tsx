import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getProcessoDetail } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { PrecosClient } from './precos-client'
import { PncpPrecosSection } from './pncp-section'
import { PainelOficialSection } from './painel-oficial-section'

export const metadata: Metadata = { title: 'Pesquisa de Preços' }

export default async function PrecosPage({ params }: { params: { id: string } }) {
  const processo = await getProcessoDetail(params.id)
  if (!processo) notFound()
  const estimativas = await listEstimativas(params.id)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/processos/${params.id}`}>
            <ArrowLeft className="h-4 w-4" /> Processo
          </Link>
        </Button>
      </div>
      <header className="space-y-1.5">
        <p className="font-mono text-xs uppercase tracking-wide text-primary">
          {processo.numeroInterno ?? '—'} · {processo.objeto.slice(0, 80)}{processo.objeto.length > 80 ? '…' : ''}
        </p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <TrendingUp className="h-7 w-7 text-primary" /> Pesquisa de Preços
        </h1>
        <p className="text-sm text-muted-foreground">
          Base legal: Lei 14.133/2021 art. 23 · IN 65/2021 · Acórdão 1.875/2021-TCU (cesta de preços).
        </p>
      </header>

      <PainelOficialSection processoId={params.id} objeto={processo.objeto} />

      <PncpPrecosSection processoId={params.id} objeto={processo.objeto} />

      <PrecosClient
        processoId={params.id}
        objeto={processo.objeto}
        estimativas={estimativas}
      />
    </div>
  )
}
