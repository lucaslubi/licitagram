'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface CestaFonte {
  origem: 'pncp' | 'painel_oficial'
  refId: string
  descricao: string
  orgaoNome: string | null
  modalidade: string | null
  dataReferencia: string | null
  quantidade: number | null
  unidadeMedida: string | null
  valorUnitario: number
  fornecedorNome: string | null
  linkFonte: string | null
  score: number
  scoreSimilaridade: number
  scoreTemporal: number
  scoreModalidade: number
  scoreQuantidade: number
  scoreOutlier: number
  justificativa: string
}

export interface MontarCestaParams {
  query: string
  qtd?: number | null
  modalidadePreferida?: string | null
  mesesBack?: number
  maxFontes?: number
}

export async function montarCestaIA(params: MontarCestaParams): Promise<CestaFonte[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('montar_cesta_ia', {
    p_query: params.query,
    p_qtd: params.qtd ?? null,
    p_modalidade_preferida: params.modalidadePreferida ?? null,
    p_meses_back: params.mesesBack ?? 24,
    p_max_fontes: params.maxFontes ?? 8,
    p_min_fontes: 3,
  })
  if (error) {
    logger.error({ err: error.message }, 'montar_cesta_ia RPC failed')
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    origem: r.origem as 'pncp' | 'painel_oficial',
    refId: r.ref_id as string,
    descricao: r.descricao as string,
    orgaoNome: (r.orgao_nome as string | null) ?? null,
    modalidade: (r.modalidade as string | null) ?? null,
    dataReferencia: (r.data_referencia as string | null) ?? null,
    quantidade: (r.quantidade as number | null) ?? null,
    unidadeMedida: (r.unidade_medida as string | null) ?? null,
    valorUnitario: Number(r.valor_unitario),
    fornecedorNome: (r.fornecedor_nome as string | null) ?? null,
    linkFonte: (r.link_fonte as string | null) ?? null,
    score: Number(r.score),
    scoreSimilaridade: Number(r.score_similaridade),
    scoreTemporal: Number(r.score_temporal),
    scoreModalidade: Number(r.score_modalidade),
    scoreQuantidade: Number(r.score_quantidade),
    scoreOutlier: Number(r.score_outlier),
    justificativa: (r.justificativa as string | null) ?? '',
  }))
}

export interface CestaStats {
  n: number
  media: number
  mediana: number
  menor: number
  maior: number
  desvio: number
  cv: number
  complianceTcu1875: boolean
}

export async function calcCestaStats(fontes: CestaFonte[]): Promise<CestaStats> {
  const valores = fontes.map((f) => f.valorUnitario).filter((v) => v > 0)
  const n = valores.length
  if (n === 0) {
    return { n: 0, media: 0, mediana: 0, menor: 0, maior: 0, desvio: 0, cv: 0, complianceTcu1875: false }
  }
  const sorted = [...valores].sort((a, b) => a - b)
  const media = valores.reduce((s, v) => s + v, 0) / n
  const mediana = n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
  const menor = sorted[0]!
  const maior = sorted[n - 1]!
  const desvio = n > 1 ? Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1)) : 0
  const cv = media > 0 ? (desvio / media) * 100 : 0
  return { n, media, mediana, menor, maior, desvio, cv, complianceTcu1875: n >= 3 && cv < 25 }
}

/**
 * Persiste a cesta selecionada + narrativa no banco, como fontes da
 * precos_pesquisa daquele processo. Deleta pesquisa anterior do mesmo
 * item pra substituir (save_cesta_precos já faz isso).
 */
export async function salvarCestaIA(params: {
  processoId: string
  itemDescricao: string
  fontes: CestaFonte[]
  metodo: 'media' | 'mediana' | 'menor'
  narrativa: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient()

  // Converte CestaFonte → formato do save_cesta_precos (ajuste pro RPC existente)
  const fontes = params.fontes.map((f) => ({
    fonte: f.origem === 'painel_oficial' ? 'painel_precos' : 'contratacoes_similares',
    fonte_prioridade: f.origem === 'painel_oficial' ? 1 : 2,
    valor_unitario: f.valorUnitario,
    data_referencia: f.dataReferencia,
    fornecedor_cnpj: null,
    fornecedor_nome: f.orgaoNome, // usa órgão como "fornecedor" pra display
    link_fonte: f.linkFonte,
    outlier: f.scoreOutlier === 0,
    considerado_no_calculo: f.scoreOutlier !== 0,
  }))

  const { error } = await supabase.rpc('save_cesta_precos', {
    p_processo_id: params.processoId,
    p_item_descricao: params.itemDescricao,
    p_fontes: fontes,
    p_metodo: params.metodo,
  })
  if (error) return { ok: false, error: error.message }

  // Persiste narrativa no processo via tabela auxiliar (simples: armazena no
  // campo metadados de precos_pesquisa). Futuro: tabela dedicada.
  const { error: metaErr } = await supabase.rpc('set_cesta_narrativa', {
    p_processo_id: params.processoId,
    p_item_descricao: params.itemDescricao,
    p_narrativa: params.narrativa,
  })
  if (metaErr) {
    logger.warn({ err: metaErr.message }, 'set_cesta_narrativa failed — prosseguindo sem narrativa salva')
  }
  return { ok: true }
}
