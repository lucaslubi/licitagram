import { notFound } from 'next/navigation'
import { getProcessoDetail, getArtefato } from '@/lib/processos/queries'
import { getCurrentProfile } from '@/lib/auth/profile'
import { ARTEFATO_LABEL, stripMarkdownChrome, type ArtefatoTipo } from '@/lib/artefatos/prompts'
import { PrintClient } from './print-client'

const TIPOS: ArtefatoTipo[] = ['dfd', 'etp', 'mapa_riscos', 'tr', 'edital', 'parecer']

export const dynamic = 'force-dynamic'

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

  return (
    <PrintClient
      title={ARTEFATO_LABEL[tipo]}
      content={content}
      status={artefato?.status ?? 'pendente'}
      meta={{
        orgaoRazaoSocial: profile.orgao.razaoSocial,
        orgaoNomeFantasia: profile.orgao.nomeFantasia,
        orgaoCnpj: profile.orgao.cnpj,
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
