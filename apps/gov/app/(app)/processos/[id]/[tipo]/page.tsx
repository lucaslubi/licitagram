import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getProcessoDetail, getArtefato } from '@/lib/processos/queries'
import { ARTEFATO_LABEL, type ArtefatoTipo } from '@/lib/artefatos/prompts'
import { ArtefatoViewer } from './viewer'

// Viewer genérico (markdown streaming). Tipos com UI dedicada:
//   mapa_riscos → /riscos (matriz visual)
//   precos      → /precos (cesta TCU)
//   compliance  → /compliance (checklist determinístico)
const KNOWN_TIPOS: ArtefatoTipo[] = ['dfd', 'etp', 'tr', 'edital', 'parecer']

const REDIRECTS: Record<string, string> = {
  mapa_riscos: 'riscos',
  precos: 'precos',
  compliance: 'compliance',
}

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
  const redir = REDIRECTS[params.tipo]
  if (redir) redirect(`/processos/${params.id}/${redir}`)
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
      <header className="rule-top space-y-2 pt-6">
        <p className="label-institutional font-mono">
          {processo.numeroInterno ?? 'a atribuir'} · {processo.objeto.slice(0, 70)}
          {processo.objeto.length > 70 ? '…' : ''}
        </p>
        <h1 className="font-display text-[2rem] leading-[1.12] tracking-tight">
          {ARTEFATO_LABEL[tipo]}
        </h1>
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
