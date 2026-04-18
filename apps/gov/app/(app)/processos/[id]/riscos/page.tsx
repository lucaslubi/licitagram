import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getProcessoDetail, listRiscos, getArtefato } from '@/lib/processos/queries'
import { RiscosClient } from './riscos-client'

export const metadata: Metadata = { title: 'Mapa de Riscos' }

export default async function RiscosPage({ params }: { params: { id: string } }) {
  const processo = await getProcessoDetail(params.id)
  if (!processo) notFound()
  const riscos = await listRiscos(params.id)
  const artefato = await getArtefato(params.id, 'mapa_riscos')

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
          <Scale className="h-7 w-7 text-primary" /> Mapa de Riscos
        </h1>
        <p className="text-sm text-muted-foreground">
          Base legal: Lei 14.133/2021 art. 18 §1º X, art. 22; IN SEGES/ME 65/2021.
        </p>
      </header>

      <RiscosClient
        processoId={params.id}
        initialRiscos={riscos}
        artefatoStatus={artefato?.status ?? 'pendente'}
        modelId={artefato?.modeloUsado ?? null}
      />
    </div>
  )
}
