'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getProcessoDetail } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { listRiscos } from '@/lib/processos/queries'
import { summarizeCompliance } from '@/lib/compliance/engine'
import { publishToPncp, type PncpPublishPayload } from './client'
import { logger } from '@/lib/logger'

type Result = { ok: true; publicacaoId: string; status: string } | { ok: false; error: string }

export async function publishProcessoAction(processoId: string): Promise<Result> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode publicar' }
  }

  const processo = await getProcessoDetail(processoId)
  if (!processo) return { ok: false, error: 'Processo não encontrado' }

  // Valida compliance antes de enviar ao PNCP
  const [riscos, estimativas] = await Promise.all([
    listRiscos(processoId),
    listEstimativas(processoId),
  ])
  const summary = summarizeCompliance({ processo, riscos, estimativas })
  if (!summary.canPublish) {
    return {
      ok: false,
      error: `Bloqueado: ${summary.criticas} pendência(s) crítica(s) no Compliance. Resolva antes de publicar.`,
    }
  }

  const payload: PncpPublishPayload = {
    orgaoCnpj: profile.orgao.cnpj,
    processoNumero: processo.numeroInterno ?? processo.id,
    tipoDocumento: 'edital',
    objeto: processo.objeto,
    valorEstimado: processo.valorEstimado,
    modalidade: processo.modalidade,
    dataPublicacao: new Date().toISOString(),
  }

  const result = await publishToPncp(payload)

  const supabase = createClient()
  const { data: pubId, error } = await supabase.rpc('register_publicacao_pncp', {
    p_processo_id: processoId,
    p_tipo_documento: payload.tipoDocumento,
    p_status: result.status,
    p_payload: result.payload,
    p_resposta: result.resposta,
    p_numero_controle: result.numeroControle,
  })
  if (error) {
    logger.error({ err: error.message }, 'register_publicacao_pncp failed')
    return { ok: false, error: error.message }
  }

  revalidatePath(`/processos/${processoId}`)
  revalidatePath('/processos')
  revalidatePath('/dashboard')

  return { ok: true, publicacaoId: pubId as string, status: result.status }
}

export interface PublicacaoRow {
  id: string
  tipoDocumento: string
  status: string
  numeroControle: string | null
  tentativas: number
  publicadoEm: string | null
  criadoEm: string
}

export async function listPublicacoes(processoId: string): Promise<PublicacaoRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_publicacoes_processo', { p_processo_id: processoId })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    tipoDocumento: r.tipo_documento as string,
    status: r.status as string,
    numeroControle: (r.numero_controle_pncp as string | null) ?? null,
    tentativas: Number(r.tentativas ?? 0),
    publicadoEm: (r.publicado_em as string | null) ?? null,
    criadoEm: r.criado_em as string,
  }))
}
