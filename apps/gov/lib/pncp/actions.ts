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

  // Gap fechado 2026-04-20: quando publicação vai com sucesso, avança a
  // fase pra 'publicado' (estado terminal). Antes disto, o processo ficava
  // eternamente em 'publicacao' mesmo tendo sido efetivamente publicado.
  if (result.status === 'publicado') {
    const { error: faseErr } = await supabase.rpc('set_processo_fase', {
      p_processo_id: processoId,
      p_fase: 'publicado',
    })
    if (faseErr) {
      // Não é fatal — log e segue. A publicação foi registrada no PNCP.
      logger.warn({ err: faseErr.message, processoId }, 'set_processo_fase → publicado falhou pós-publish')
    }
  }

  revalidatePath(`/processos/${processoId}`)
  revalidatePath('/processos')
  revalidatePath('/dashboard')

  return { ok: true, publicacaoId: pubId as string, status: result.status }
}

/**
 * Confirma publicação manual realizada pelo usuário no portal PNCP.
 * Fluxo semi-auto: sistema gera o pacote assinável → user leva ao portal
 * PNCP → cola o numeroControlePNCP retornado aqui pra finalizar.
 *
 * Valida o formato típico (ex: 00414607000118-1-000001/2026) antes de
 * confirmar. Marca a última publicação como 'publicado', avança fase
 * do processo e revalida.
 */
export async function confirmarPublicacaoManualAction(
  processoId: string,
  numeroControlePNCP: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode confirmar publicação' }
  }

  const clean = numeroControlePNCP.trim()
  // Formato esperado: CNPJ-sequencial-numero/ano ou variações com / ou -
  if (clean.length < 8 || clean.length > 60) {
    return {
      ok: false,
      error: 'Número de controle PNCP inválido (ex: 00414607000118-1-000001/2026).',
    }
  }

  const supabase = createClient()
  const { error: regErr } = await supabase.rpc('register_publicacao_pncp', {
    p_processo_id: processoId,
    p_tipo_documento: 'edital',
    p_status: 'publicado',
    p_payload: { origem: 'manual', confirmado_por: profile.nomeCompleto },
    p_resposta: { numeroControlePNCP: clean, metodo: 'portal_pncp_manual' },
    p_numero_controle: clean,
  })
  if (regErr) {
    logger.error({ err: regErr.message }, 'register_publicacao_pncp manual failed')
    return { ok: false, error: regErr.message }
  }

  const { error: faseErr } = await supabase.rpc('set_processo_fase', {
    p_processo_id: processoId,
    p_fase: 'publicado',
  })
  if (faseErr) {
    logger.warn({ err: faseErr.message }, 'set_processo_fase → publicado falhou pós-manual')
  }

  revalidatePath(`/processos/${processoId}`)
  revalidatePath('/processos')
  revalidatePath('/dashboard')

  return { ok: true }
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
