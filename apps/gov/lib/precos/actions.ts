'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface HistoricoMatch {
  tenderId: string
  orgaoCnpj: string
  orgaoNome: string | null
  modalidadeNome: string | null
  objeto: string
  valorEstimado: number | null
  valorHomologado: number | null
  dataPublicacao: string | null
  uf: string | null
  municipio: string | null
  score: number
}

export async function searchHistoricoPrecos(
  processoId: string,
  keywords: string,
  todosOrgaos = true,
): Promise<HistoricoMatch[]> {
  if (!keywords || keywords.trim().length < 3) return []
  const supabase = createClient()
  const { data, error } = await supabase.rpc('search_historico_precos', {
    p_processo_id: processoId,
    p_keywords: keywords,
    p_todos_orgaos: todosOrgaos,
    p_limit: 30,
  })
  if (error) {
    logger.error({ err: error.message }, 'search_historico_precos failed')
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tenderId: r.tender_id as string,
    orgaoCnpj: (r.orgao_cnpj as string) ?? '',
    orgaoNome: (r.orgao_nome as string | null) ?? null,
    modalidadeNome: (r.modalidade_nome as string | null) ?? null,
    objeto: r.objeto as string,
    valorEstimado: (r.valor_estimado as number | null) ?? null,
    valorHomologado: (r.valor_homologado as number | null) ?? null,
    dataPublicacao: (r.data_publicacao as string | null) ?? null,
    uf: (r.uf as string | null) ?? null,
    municipio: (r.municipio as string | null) ?? null,
    score: Number(r.similaridade_score ?? 0),
  }))
}

export interface CestaFonte {
  fonte: string
  valor_unitario: number
  data_referencia?: string | null
  fornecedor_nome?: string | null
  link_fonte?: string | null
  outlier?: boolean
  considerado_no_calculo?: boolean
}

export interface EstimativaResult {
  count: number
  media: number | null
  mediana: number | null
  menor: number | null
  maior: number | null
  desvio_padrao: number | null
  coeficiente_variacao: number | null
  metodo: string
  valor_final: number | null
}

export async function saveCestaAction(
  processoId: string,
  itemDescricao: string,
  fontes: CestaFonte[],
  metodo: 'media' | 'mediana' | 'menor',
): Promise<{ ok: true; result: EstimativaResult } | { ok: false; error: string }> {
  if (fontes.length < 3) {
    return {
      ok: false,
      error: 'Mínimo 3 fontes exigido pela cesta de preços (Acórdão 1.875/2021-TCU).',
    }
  }
  const supabase = createClient()
  const { data, error } = await supabase.rpc('save_cesta_precos', {
    p_processo_id: processoId,
    p_item_descricao: itemDescricao,
    p_fontes: fontes,
    p_metodo: metodo,
  })
  if (error) {
    logger.error({ err: error.message }, 'save_cesta_precos failed')
    return { ok: false, error: error.message }
  }
  revalidatePath(`/processos/${processoId}/precos`)
  return { ok: true, result: data as EstimativaResult }
}

export interface EstimativaRow {
  itemDescricao: string
  qtdAmostras: number
  media: number | null
  mediana: number | null
  menor: number | null
  maior: number | null
  desvioPadrao: number | null
  cv: number | null
  metodo: string
  valorFinal: number | null
  calculadoEm: string
}

/**
 * Finaliza a fase de pesquisa de preços e avança o processo pra "tr".
 *
 * Gap fechado 2026-04-20: antes disto, a cesta era salva mas a fase
 * `precos` ficava travada — nenhum endpoint movia pra `tr` automaticamente.
 * Quem chama: botão "Finalizar pesquisa → elaborar TR" no precos-client.
 */
export async function finalizarPesquisaPrecosAction(
  processoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient()
  // Validação: precisa ter ao menos 1 estimativa finalizada pra avançar.
  const { data: estimativas, error: estErr } = await supabase.rpc('get_precos_estimativa', {
    p_processo_id: processoId,
  })
  if (estErr) {
    logger.error({ err: estErr.message }, 'get_precos_estimativa failed on finalizar')
    return { ok: false, error: estErr.message }
  }
  if (!estimativas || (estimativas as unknown[]).length === 0) {
    return {
      ok: false,
      error: 'Adicione ao menos um item com cesta de preços (≥3 fontes) antes de avançar pra elaboração do TR.',
    }
  }
  const { error } = await supabase.rpc('set_processo_fase', {
    p_processo_id: processoId,
    p_fase: 'tr',
  })
  if (error) {
    logger.error({ err: error.message }, 'set_processo_fase → tr failed')
    return { ok: false, error: error.message }
  }
  revalidatePath(`/processos/${processoId}`)
  revalidatePath(`/processos/${processoId}/precos`)
  return { ok: true }
}

export async function listEstimativas(processoId: string): Promise<EstimativaRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_precos_estimativa', { p_processo_id: processoId })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    itemDescricao: r.item_descricao as string,
    qtdAmostras: Number(r.qtd_amostras ?? 0),
    media: (r.media as number | null) ?? null,
    mediana: (r.mediana as number | null) ?? null,
    menor: (r.menor_valor as number | null) ?? null,
    maior: (r.maior_valor as number | null) ?? null,
    desvioPadrao: (r.desvio_padrao as number | null) ?? null,
    cv: (r.coeficiente_variacao as number | null) ?? null,
    metodo: r.metodo_escolhido as string,
    valorFinal: (r.valor_final as number | null) ?? null,
    calculadoEm: r.calculado_em as string,
  }))
}
