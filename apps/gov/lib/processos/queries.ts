import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface ProcessoSummary {
  id: string
  numeroInterno: string | null
  objeto: string
  tipo: string
  modalidade: string | null
  faseAtual: string
  valorEstimado: number | null
  setorNome: string | null
  criadoEm: string
  artefatosCount: number
}

export async function listProcessos(): Promise<ProcessoSummary[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_processos')
  if (error) {
    logger.error({ err: error.message }, 'list_processos RPC failed')
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    numeroInterno: (r.numero_interno as string | null) ?? null,
    objeto: r.objeto as string,
    tipo: r.tipo as string,
    modalidade: (r.modalidade as string | null) ?? null,
    faseAtual: r.fase_atual as string,
    valorEstimado: (r.valor_estimado as number | null) ?? null,
    setorNome: (r.setor_nome as string | null) ?? null,
    criadoEm: r.criado_em as string,
    artefatosCount: Number(r.artefatos_count ?? 0),
  }))
}

export interface ArtefatoListItem {
  id: string
  tipo: string
  versao: number
  status: string
  modeloUsado: string | null
  tokensInput: number | null
  tokensOutput: number | null
  criadoEm: string
  aprovadoEm: string | null
}

export interface ProcessoDetail {
  id: string
  numeroInterno: string | null
  objeto: string
  tipo: string
  modalidade: string | null
  criterioJulgamento: string | null
  modoDisputa: string | null
  valorEstimado: number | null
  faseAtual: string
  setorNome: string | null
  criadoEm: string
  artefatos: ArtefatoListItem[]
}

export async function getProcessoDetail(id: string): Promise<ProcessoDetail | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_processo_detail', { p_processo_id: id })
  if (error) {
    logger.error({ err: error.message, id }, 'get_processo_detail RPC failed')
    return null
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id as string,
    numeroInterno: (r.numero_interno as string | null) ?? null,
    objeto: r.objeto as string,
    tipo: r.tipo as string,
    modalidade: (r.modalidade as string | null) ?? null,
    criterioJulgamento: (r.criterio_julgamento as string | null) ?? null,
    modoDisputa: (r.modo_disputa as string | null) ?? null,
    valorEstimado: (r.valor_estimado as number | null) ?? null,
    faseAtual: r.fase_atual as string,
    setorNome: (r.setor_nome as string | null) ?? null,
    criadoEm: r.criado_em as string,
    artefatos: ((r.artefatos as unknown[]) ?? []).map((a) => {
      const o = a as Record<string, unknown>
      return {
        id: o.id as string,
        tipo: o.tipo as string,
        versao: Number(o.versao ?? 1),
        status: o.status as string,
        modeloUsado: (o.modelo_usado as string | null) ?? null,
        tokensInput: (o.tokens_input as number | null) ?? null,
        tokensOutput: (o.tokens_output as number | null) ?? null,
        criadoEm: o.criado_em as string,
        aprovadoEm: (o.aprovado_em as string | null) ?? null,
      }
    }),
  }
}

export async function getArtefato(
  processoId: string,
  tipo: string,
): Promise<{ id: string; markdown: string; status: string; modeloUsado: string | null; aprovadoEm: string | null } | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_artefato', { p_processo_id: processoId, p_tipo: tipo })
  if (error) return null
  const rows = (data ?? []) as Record<string, unknown>[]
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id as string,
    markdown: (r.conteudo_markdown as string | null) ?? '',
    status: r.status as string,
    modeloUsado: (r.modelo_usado as string | null) ?? null,
    aprovadoEm: (r.aprovado_em as string | null) ?? null,
  }
}

export interface Risco {
  id: string
  fase: string | null
  descricao: string
  probabilidade: string | null
  impacto: string | null
  nivelRisco: string | null
  responsavel: string | null
  tratamento: string | null
  mitigacao: string | null
}

export async function listRiscos(processoId: string): Promise<Risco[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_riscos', { p_processo_id: processoId })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    fase: (r.fase as string | null) ?? null,
    descricao: r.descricao as string,
    probabilidade: (r.probabilidade as string | null) ?? null,
    impacto: (r.impacto as string | null) ?? null,
    nivelRisco: (r.nivel_risco as string | null) ?? null,
    responsavel: (r.responsavel as string | null) ?? null,
    tratamento: (r.tratamento as string | null) ?? null,
    mitigacao: (r.mitigacao as string | null) ?? null,
  }))
}
