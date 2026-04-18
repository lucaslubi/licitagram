import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getProcessoDetail, listRiscos } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { summarizeCompliance } from '@/lib/compliance/engine'
import { listPublicacoes } from '@/lib/pncp/actions'
import { PublicarClient } from './publicar-client'

export const metadata: Metadata = { title: 'Publicar PNCP' }

export default async function PublicarPage({ params }: { params: { id: string } }) {
  const processo = await getProcessoDetail(params.id)
  if (!processo) notFound()
  const [riscos, estimativas, publicacoes] = await Promise.all([
    listRiscos(params.id),
    listEstimativas(params.id),
    listPublicacoes(params.id),
  ])
  const compliance = summarizeCompliance({ processo, riscos, estimativas })

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
          {processo.numeroInterno ?? '—'}
        </p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Send className="h-7 w-7 text-primary" /> Publicação PNCP
        </h1>
        <p className="text-sm text-muted-foreground">
          Art. 94 da Lei 14.133/2021 — prazos de 10 a 20 dias úteis conforme natureza do ato.
        </p>
      </header>
      <PublicarClient
        processoId={params.id}
        compliance={compliance}
        publicacoes={publicacoes}
        isTerminal={processo.faseAtual === 'publicado'}
      />
    </div>
  )
}
