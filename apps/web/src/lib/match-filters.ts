import { MIN_DISPLAY_SCORE, AI_VERIFIED_SOURCES } from '@/lib/cache'

/**
 * REGRA ÚNICA de filtros pra exibir matches no UI.
 * QUALQUER mudança aqui afeta /map, /opportunities e /pipeline simultaneamente.
 *
 * NÃO incluir userMinScore (preferência da empresa pra notificações) como filtro
 * DURO de exibição. A UI só restringe o score quando o usuário seta `scoreMin`
 * explicitamente via filtro na interface.
 *
 * Modalidades excluídas (não-competitivas):
 *   9  → Inexigibilidade
 *   12 → Credenciamento
 *   14 → Concurso (futuro — adicionar quando subir nas tenders)
 *
 * Invariantes (devem se manter — ver feedback_audit.md):
 *  - VISIBLE_MATCH_SOURCES contém 'pgvector_rules' como engine PRIMÁRIO
 *  - VISIBLE_MATCH_SOURCES NÃO contém 'ai' nem 'ai_triage' (deprecated, 12k+ zumbis)
 *  - VISIBLE_MIN_SCORE === 40
 */

export const VISIBLE_MATCH_SOURCES = AI_VERIFIED_SOURCES // single source of truth
export const VISIBLE_MIN_SCORE = MIN_DISPLAY_SCORE // 40

export const EXCLUDED_MODALIDADE_IDS = [9, 12, 14] as const
export const EXCLUDED_MODALIDADE_NAMES = ['Inexigibilidade', 'Credenciamento'] as const

/**
 * Adiciona os filtros padrão de visibilidade numa query Supabase de matches.
 * Use em TODAS as surfaces (map, opportunities, pipeline) pra consistência.
 *
 * Pré-requisito: a query deve ter JOIN com tenders via `tenders!inner(...)`.
 *
 * @param query - PostgrestFilterBuilder de `from('matches').select(...)`
 * @param today - YYYY-MM-DD pra filtro de vigência (passa o mesmo dia em todas)
 */
export function applyVisibilityFilters<Q>(query: Q, today: string): Q {
  const excluded = EXCLUDED_MODALIDADE_NAMES.join(',')
  const q = query as any
  return q
    .in('match_source', [...VISIBLE_MATCH_SOURCES])
    .gte('score', VISIBLE_MIN_SCORE)
    .not('tenders.modalidade_nome', 'in', `(${excluded})`)
    .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }) as Q
}
