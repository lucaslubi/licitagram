import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface CampanhaSummary {
  id: string
  ano: number
  titulo: string
  status: string
  prazoRespostaEm: string
  criadoEm: string
  setoresTotal: number
  setoresRespondidos: number
  itensTotal: number
}

export async function listCampanhas(): Promise<CampanhaSummary[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_campanhas')
  if (error) {
    logger.error({ err: error.message }, 'list_campanhas RPC failed')
    return []
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    ano: row.ano as number,
    titulo: row.titulo as string,
    status: row.status as string,
    prazoRespostaEm: row.prazo_resposta_em as string,
    criadoEm: row.criado_em as string,
    setoresTotal: Number(row.setores_total ?? 0),
    setoresRespondidos: Number(row.setores_respondidos ?? 0),
    itensTotal: Number(row.itens_total ?? 0),
  }))
}

export interface CampanhaSetorRow {
  respostaId: string
  setorId: string
  setorNome: string
  setorSigla: string | null
  expiraEm: string
  respondidoEm: string | null
  revogado: boolean
  itensCount: number
}

export interface CampanhaDetail {
  id: string
  ano: number
  titulo: string
  status: string
  prazoRespostaEm: string
  criadoEm: string
  setores: CampanhaSetorRow[]
}

export async function getCampanhaDetail(id: string): Promise<CampanhaDetail | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_campanha_detail', { p_campanha_id: id })
  if (error) {
    logger.error({ err: error.message, id }, 'get_campanha_detail RPC failed')
    return null
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return null
  const first = rows[0]!
  return {
    id: first.id as string,
    ano: first.ano as number,
    titulo: first.titulo as string,
    status: first.status as string,
    prazoRespostaEm: first.prazo_resposta_em as string,
    criadoEm: first.criado_em as string,
    setores: rows.map((r) => ({
      respostaId: r.resposta_id as string,
      setorId: r.setor_id as string,
      setorNome: r.setor_nome as string,
      setorSigla: (r.setor_sigla as string | null) ?? null,
      expiraEm: r.expira_em as string,
      respondidoEm: (r.respondido_em as string | null) ?? null,
      revogado: Boolean(r.revogado),
      itensCount: Number(r.itens_count ?? 0),
    })),
  }
}
