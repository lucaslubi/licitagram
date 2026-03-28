import type { PriceSearchQuery } from './types'
import { createHash } from 'crypto'

// ─── Full-text search clause ──────────────────────────────────

/**
 * Build a full-text search clause using plainto_tsquery (NEVER LIKE).
 * Targets `t.objeto` column.
 */
export function buildSearchClause(query: string): { sql: string; params: any[] } {
  return {
    sql: `to_tsvector('portuguese', t.objeto) @@ plainto_tsquery('portuguese', $1)`,
    params: [query],
  }
}

// ─── Filter clauses ───────────────────────────────────────────

/**
 * Build WHERE clauses for all optional filters.
 * Returns a combined SQL fragment and parameter array.
 * Parameter indices start from the given offset.
 */
export function buildFilterClauses(
  query: PriceSearchQuery,
  paramOffset: number = 1,
): { sql: string; params: any[] } {
  const clauses: string[] = []
  const params: any[] = []
  let idx = paramOffset

  if (query.catmat_catser) {
    clauses.push(`t.objeto ILIKE '%' || $${++idx} || '%'`)
    params.push(query.catmat_catser)
  }

  if (query.uf) {
    clauses.push(`t.uf = $${++idx}`)
    params.push(query.uf)
  }

  if (query.municipio) {
    clauses.push(`t.municipio = $${++idx}`)
    params.push(query.municipio)
  }

  if (query.modalidade) {
    clauses.push(`t.modalidade_nome = $${++idx}`)
    params.push(query.modalidade)
  }

  if (query.date_from) {
    clauses.push(`t.data_encerramento >= $${++idx}`)
    params.push(query.date_from)
  }

  if (query.date_to) {
    clauses.push(`t.data_encerramento <= $${++idx}`)
    params.push(query.date_to)
  }

  if (query.min_price !== undefined) {
    clauses.push(`c.valor_proposta >= $${++idx}`)
    params.push(query.min_price)
  }

  if (query.max_price !== undefined) {
    clauses.push(`c.valor_proposta <= $${++idx}`)
    params.push(query.max_price)
  }

  if (query.supplier_porte) {
    clauses.push(`c.porte = $${++idx}`)
    params.push(query.supplier_porte)
  }

  if (query.unit) {
    clauses.push(`t.objeto ILIKE '%' || $${++idx} || '%'`)
    params.push(query.unit)
  }

  return {
    sql: clauses.length > 0 ? clauses.join(' AND ') : '',
    params,
  }
}

// ─── Full query builder ───────────────────────────────────────

/**
 * Build the complete set of queries: count, data (paginated), and stats.
 */
export function buildFullQuery(query: PriceSearchQuery): {
  countSql: string
  dataSql: string
  statsSql: string
  params: any[]
} {
  const search = buildSearchClause(query.query)
  const filters = buildFilterClauses(query, search.params.length)
  const allParams = [...search.params, ...filters.params]

  const fromClause = `FROM tenders t LEFT JOIN competitors c ON c.tender_id = t.id`
  const whereBase = `WHERE ${search.sql}`
  const whereFilters = filters.sql ? ` AND ${filters.sql}` : ''
  const fullWhere = `${whereBase}${whereFilters}`

  // Sorting
  let orderBy = 'ORDER BY t.data_encerramento DESC'
  if (query.sort_by === 'price_asc') orderBy = 'ORDER BY c.valor_proposta ASC'
  else if (query.sort_by === 'price_desc') orderBy = 'ORDER BY c.valor_proposta DESC'
  else if (query.sort_by === 'relevance')
    orderBy = `ORDER BY ts_rank(to_tsvector('portuguese', t.objeto), plainto_tsquery('portuguese', $1)) DESC`

  const page = query.page ?? 1
  const pageSize = query.page_size ?? 20
  const offset = (page - 1) * pageSize

  const countSql = `SELECT COUNT(*) as total ${fromClause} ${fullWhere}`

  const dataSql = [
    `SELECT t.id, t.objeto, t.uf, t.municipio, t.modalidade_nome,`,
    `  t.orgao_nome, t.valor_homologado, t.data_publicacao, t.data_abertura, t.data_encerramento,`,
    `  c.cnpj, c.nome, c.valor_proposta, c.situacao, c.porte, c.uf_fornecedor`,
    fromClause,
    fullWhere,
    orderBy,
    `LIMIT ${pageSize} OFFSET ${offset}`,
  ].join('\n')

  const statsSql = [
    `SELECT`,
    `  COUNT(*) as count,`,
    `  AVG(c.valor_proposta) as mean,`,
    `  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.valor_proposta) as median,`,
    `  MIN(c.valor_proposta) as min,`,
    `  MAX(c.valor_proposta) as max,`,
    `  STDDEV_SAMP(c.valor_proposta) as std_deviation`,
    fromClause,
    fullWhere,
  ].join('\n')

  return { countSql, dataSql, statsSql, params: allParams }
}

// ─── Cache key generation ─────────────────────────────────────

/**
 * Generate a deterministic cache key from a query.
 * Ignores page and page_size so that stats are shared across pages.
 */
export function generateCacheKey(query: PriceSearchQuery, prefix: string = 'ph:'): string {
  const { page, page_size, ...keyParts } = query
  const normalized = JSON.stringify(keyParts, Object.keys(keyParts).sort())
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16)
  return `${prefix}${hash}`
}
