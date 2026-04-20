import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProcessoDetail, getArtefato } from '@/lib/processos/queries'
import { getCurrentProfile } from '@/lib/auth/profile'
import { ARTEFATO_LABEL, stripMarkdownChrome, type ArtefatoTipo } from '@/lib/artefatos/prompts'
import { PrintClient } from './print-client'
import { buildArtefatoFilename } from '@/lib/artefatos/filename'

const TIPOS: ArtefatoTipo[] = ['dfd', 'etp', 'mapa_riscos', 'tr', 'edital', 'parecer']

export const dynamic = 'force-dynamic'

/**
 * Metadata dinâmico por tipo/processo/objeto. O browser usa document.title
 * como filename default quando salva PDF via "Save as PDF" — então precisa
 * ser descritivo: "ETP - Aquisição papel A4 - Proc 2026-001".
 *
 * Importante: template root é "%s · LicitaGram Gov", então passamos só o
 * início e o append acontece — mas no print-client a gente OVERRIDE o
 * document.title removendo o sufixo institucional pra ficar limpo no PDF.
 */
export async function generateMetadata({
  params,
}: {
  params: { processoId: string; tipo: string }
}): Promise<Metadata> {
  if (!TIPOS.includes(params.tipo as ArtefatoTipo)) return { title: 'Artefato' }
  const tipo = params.tipo as ArtefatoTipo
  const processo = await getProcessoDetail(params.processoId)
  const title = processo
    ? buildArtefatoFilename({
        tipo,
        objeto: processo.objeto,
        numeroInterno: processo.numeroInterno,
        extension: null,
      })
    : ARTEFATO_LABEL[tipo]
  return { title, robots: { index: false, follow: false } }
}

export default async function PrintArtefatoPage({
  params,
}: {
  params: { processoId: string; tipo: string }
}) {
  if (!TIPOS.includes(params.tipo as ArtefatoTipo)) notFound()
  const tipo = params.tipo as ArtefatoTipo

  const [processo, artefato, profile] = await Promise.all([
    getProcessoDetail(params.processoId),
    getArtefato(params.processoId, tipo),
    getCurrentProfile(),
  ])
  if (!processo || !profile?.orgao) notFound()

  const content = tipo === 'mapa_riscos' ? artefato?.markdown ?? '' : stripMarkdownChrome(artefato?.markdown ?? '')
  const now = new Date()
  const localidade = [profile.orgao.municipio, profile.orgao.uf].filter(Boolean).join('/')

  const filenameTitle = buildArtefatoFilename({
    tipo,
    objeto: processo.objeto,
    numeroInterno: processo.numeroInterno,
    extension: null,
  })

  return (
    <PrintClient
      title={ARTEFATO_LABEL[tipo]}
      filenameTitle={filenameTitle}
      content={content}
      status={artefato?.status ?? 'pendente'}
      meta={{
        orgaoRazaoSocial: profile.orgao.razaoSocial,
        orgaoNomeFantasia: profile.orgao.nomeFantasia,
        orgaoCnpj: profile.orgao.cnpj,
        orgaoLogoUrl: profile.orgao.logoUrl,
        localidade: localidade || null,
        numeroProcesso: processo.numeroInterno ?? 'a atribuir',
        objeto: processo.objeto,
        responsavelNome: profile.nomeCompleto,
        responsavelCargo: profile.cargo,
        dataEmissao: now.toLocaleDateString('pt-BR'),
        modeloUsado: artefato?.modeloUsado ?? null,
        aprovadoEm: artefato?.aprovadoEm ?? null,
      }}
    />
  )
}
