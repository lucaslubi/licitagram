import pg from 'pg'

const { Pool } = pg

// Local PostgreSQL pool - 0.1ms latency vs 200ms Supabase
export const localPool = new Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'licitagram_data',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'pg2026secure',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

// Flag to enable/disable local reads (instant rollback: set USE_LOCAL_DB=false)
const USE_LOCAL = process.env.USE_LOCAL_DB !== 'false'

function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

function buildUpsert(table: string, data: Record<string, unknown>) {
  const cols = Object.keys(data)
  const vals = cols.map(c => serializeValue(data[c]))
  const placeholders = cols.map((_, i) => '$' + (i + 1)).join(', ')
  const updates = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')
  return {
    text: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updates}, synced_at = NOW()`,
    values: vals,
  }
}

export const localDb = {
  enabled: USE_LOCAL,
  pool: localPool,

  // ── Tenders ────────────────────────────────────
  async getTenderById(id: string) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query('SELECT * FROM mirror_tenders WHERE id = $1', [id])
    return rows[0] || null
  },

  async getTenderByPncpId(pncpId: string) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query('SELECT * FROM mirror_tenders WHERE pncp_id = $1', [pncpId])
    return rows[0] || null
  },

  async getTendersToProcess(status: string, limit = 100) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query(
      'SELECT * FROM mirror_tenders WHERE status = $1 ORDER BY created_at ASC LIMIT $2',
      [status, limit]
    )
    return rows
  },

  async getTendersWithoutResults(limit = 100) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query(
      'SELECT * FROM mirror_tenders WHERE (resultado_importado IS NULL OR resultado_importado = false) AND pncp_id IS NOT NULL ORDER BY data_publicacao DESC LIMIT $1',
      [limit]
    )
    return rows
  },

  async upsertTender(tender: Record<string, unknown>) {
    const q = buildUpsert('mirror_tenders', tender)
    await localPool.query(q.text, q.values)
  },

  async tenderExists(pncpId: string): Promise<boolean> {
    if (!USE_LOCAL) return false
    const { rows } = await localPool.query('SELECT 1 FROM mirror_tenders WHERE pncp_id = $1 LIMIT 1', [pncpId])
    return rows.length > 0
  },

  async getExistingPncpIds(pncpIds: string[]): Promise<Set<string>> {
    if (!USE_LOCAL || pncpIds.length === 0) return new Set()
    const { rows } = await localPool.query(
      'SELECT pncp_id FROM mirror_tenders WHERE pncp_id = ANY($1)',
      [pncpIds]
    )
    return new Set(rows.map((r: { pncp_id: string }) => r.pncp_id))
  },

  // ── Companies ──────────────────────────────────
  async getAllCompanies() {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query('SELECT * FROM mirror_companies')
    return rows
  },

  async getCompanyById(id: string) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query('SELECT * FROM mirror_companies WHERE id = $1', [id])
    return rows[0] || null
  },

  // ── Competitors ────────────────────────────────
  async getCompetitorsByTender(tenderId: string) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query('SELECT * FROM mirror_competitors WHERE tender_id = $1', [tenderId])
    return rows
  },

  async upsertCompetitor(comp: Record<string, unknown>) {
    const q = buildUpsert('mirror_competitors', comp)
    await localPool.query(q.text, q.values)
  },

  // ── Matches ────────────────────────────────────
  async getMatchesByTender(tenderId: string) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query('SELECT * FROM mirror_matches WHERE tender_id = $1', [tenderId])
    return rows
  },

  async getMatchesByCompany(companyId: string, status?: string) {
    if (!USE_LOCAL) return null
    if (status) {
      const { rows } = await localPool.query('SELECT * FROM mirror_matches WHERE company_id = $1 AND status = $2', [companyId, status])
      return rows
    }
    const { rows } = await localPool.query('SELECT * FROM mirror_matches WHERE company_id = $1', [companyId])
    return rows
  },

  // ── Tender Documents ───────────────────────────
  async getDocumentsByTender(tenderId: string) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query('SELECT * FROM mirror_tender_documents WHERE tender_id = $1', [tenderId])
    return rows
  },

  async getDocumentById(id: string) {
    if (!USE_LOCAL) return null
    const { rows } = await localPool.query('SELECT * FROM mirror_tender_documents WHERE id = $1', [id])
    return rows[0] || null
  },
}
