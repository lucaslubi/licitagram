import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getProcessoDetail, getArtefato } from '@/lib/processos/queries'
import { ARTEFATO_LABEL, type ArtefatoTipo } from '@/lib/artefatos/prompts'
import { ArtefatoViewer } from './viewer'

const KNOWN_TIPOS: ArtefatoTipo[] = ['dfd', 'etp', 'mapa_riscos', 'tr', 'edital', 'parecer']

export async function generateMetadata({
  params,
}: {
  params: { tipo: string }
}): Promise<Metadata> {
  const tipo = params.tipo as ArtefatoTipo
  return { title: ARTEFATO_LABEL[tipo] ?? 'Artefato' }
}

export default async function ArtefatoPage({
  params,
}: {
  params: { id: string; tipo: string }
}) {
  if (!KNOWN_TIPOS.includes(params.tipo as ArtefatoTipo)) notFound()
  const tipo = params.tipo as ArtefatoTipo

  const processo = await getProcessoDetail(params.id)
  if (!processo) notFound()

  const existing = await getArtefato(params.id, tipo)

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
        <h1 className="text-3xl font-semibold tracking-tight">{ARTEFATO_LABEL[tipo]}</h1>
      </header>
      <ArtefatoViewer
        processoId={params.id}
        tipo={tipo}
        existingMarkdown={existing?.markdown ?? ''}
        existingStatus={existing?.status ?? 'pendente'}
        existingModelId={existing?.modeloUsado ?? null}
        existingArtefatoId={existing?.id ?? null}
      />
    </div>
  )
}
