import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface AuditLogEntry {
  id: number
  ocorreuEm: string
  actorId: string | null
  actorEmail: string | null
  actorRole: string | null
  schemaName: string
  tableName: string
  operacao: 'I' | 'U' | 'D'
  rowId: string | null
  diff: unknown
}

export async function getAuditLog(
  filter?: { tableName?: string; actorId?: string; limit?: number; offset?: number },
): Promise<AuditLogEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_audit_log', {
    p_table_filter: filter?.tableName ?? null,
    p_actor_filter: filter?.actorId ?? null,
    p_limit: filter?.limit ?? 50,
    p_offset: filter?.offset ?? 0,
  })
  if (error) {
    logger.error({ err: error.message }, 'get_audit_log failed')
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    ocorreuEm: r.ocorreu_em as string,
    actorId: (r.actor_id as string | null) ?? null,
    actorEmail: (r.actor_email as string | null) ?? null,
    actorRole: (r.actor_role as string | null) ?? null,
    schemaName: r.schema_name as string,
    tableName: r.table_name as string,
    operacao: r.operacao as 'I' | 'U' | 'D',
    rowId: (r.row_id as string | null) ?? null,
    diff: r.diff,
  }))
}
