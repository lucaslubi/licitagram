/**
 * Smart DB Client — routes reads to local PG, writes to Supabase
 *
 * Usage: import { db } from '../lib/db'  (drop-in replacement for supabase)
 * Rollback: set USE_LOCAL_DB=false to route everything to Supabase
 *
 * Read flow:  db.from('tenders').select('*').eq('id', x) → local PG (0.1ms)
 * Write flow: db.from('tenders').insert({...}) → Supabase (authoritative)
 * RPC flow:   db.rpc('func', args) → Supabase (always)
 */
import { supabase } from './supabase'
import { localPool } from './local-db'
import pino from 'pino'

const logger = pino({ name: 'db-router' })

const USE_LOCAL = process.env.USE_LOCAL_DB !== 'false'

// Tables that have local mirrors — reads go to PG local
const MIRROR_MAP: Record<string, string> = {
  tenders: 'mirror_tenders',
  tender_documents: 'mirror_tender_documents',
  competitors: 'mirror_competitors',
  companies: 'mirror_companies',
  matches: 'mirror_matches',
}

// Metrics for monitoring
let localReads = 0
let supabaseReads = 0
let supabaseWrites = 0
let localFallbacks = 0

export function getDbMetrics() {
  return { localReads, supabaseReads, supabaseWrites, localFallbacks }
}

// Reset metrics every 5 minutes and log
setInterval(() => {
  if (localReads + supabaseReads + supabaseWrites > 0) {
    logger.info({
      localReads, supabaseReads, supabaseWrites, localFallbacks,
      localPct: localReads + supabaseReads > 0
        ? Math.round(localReads / (localReads + supabaseReads) * 100)
        : 0,
    }, 'DB router metrics (5min window)')
  }
  localReads = 0
  supabaseReads = 0
  supabaseWrites = 0
  localFallbacks = 0
}, 5 * 60 * 1000).unref()

// ─── Query Builder ─────────────────────────────────────────────────────────

type FilterOp = {
  type: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in'
  column: string
  value: unknown
}

type NotFilter = {
  type: 'not'
  column: string
  op: string
  value: unknown
}

type OrFilter = {
  type: 'or'
  expr: string
  opts?: { referencedTable?: string }
}

type Filter = FilterOp | NotFilter | OrFilter

interface QueryState {
  table: string
  mirrorTable: string | null
  selectFields: string
  filters: Filter[]
  orderCol: string | null
  orderAsc: boolean
  limitVal: number | null
  rangeFrom: number | null
  rangeTo: number | null
  isSingle: boolean
  isMaybeSingle: boolean
  isCount: boolean
  isHead: boolean
}

function buildSql(state: QueryState): { text: string; values: unknown[] } {
  const table = state.mirrorTable || state.table
  const params: unknown[] = []
  let paramIdx = 1

  // SELECT
  let fields = state.selectFields || '*'
  // Strip Supabase join syntax for local queries: 'id, tenders!inner(objeto)' → 'id'
  if (fields.includes('!inner') || fields.includes('(')) {
    fields = fields.split(',')
      .map(f => f.trim())
      .filter(f => !f.includes('!') && !f.includes('('))
      .join(', ') || '*'
  }

  let sql = state.isCount && state.isHead
    ? `SELECT COUNT(*) as count FROM ${table}`
    : `SELECT ${fields} FROM ${table}`

  // WHERE
  const conditions: string[] = []
  for (const f of state.filters) {
    if (f.type === 'or') {
      // Complex OR expressions — too risky to translate, skip (will fallback)
      return { text: '', values: [] }
    }
    if (f.type === 'not') {
      if (f.op === 'is') {
        conditions.push(`${f.column} IS NOT ${f.value === null ? 'NULL' : f.value}`)
      } else if (f.op === 'in') {
        // .not('col', 'in', '(val1,val2)') → col NOT IN (...)
        const vals = String(f.value).replace(/[()]/g, '').split(',').map(v => v.trim())
        conditions.push(`${f.column} NOT IN (${vals.map(() => `$${paramIdx++}`).join(', ')})`)
        params.push(...vals)
      } else {
        conditions.push(`${f.column} != $${paramIdx++}`)
        params.push(f.value)
      }
      continue
    }
    // Standard filter ops
    switch (f.type) {
      case 'eq':
        conditions.push(`${f.column} = $${paramIdx++}`)
        params.push(f.value)
        break
      case 'neq':
        conditions.push(`${f.column} != $${paramIdx++}`)
        params.push(f.value)
        break
      case 'gt':
        conditions.push(`${f.column} > $${paramIdx++}`)
        params.push(f.value)
        break
      case 'gte':
        conditions.push(`${f.column} >= $${paramIdx++}`)
        params.push(f.value)
        break
      case 'lt':
        conditions.push(`${f.column} < $${paramIdx++}`)
        params.push(f.value)
        break
      case 'lte':
        conditions.push(`${f.column} <= $${paramIdx++}`)
        params.push(f.value)
        break
      case 'like':
        conditions.push(`${f.column} LIKE $${paramIdx++}`)
        params.push(f.value)
        break
      case 'ilike':
        conditions.push(`${f.column} ILIKE $${paramIdx++}`)
        params.push(f.value)
        break
      case 'is':
        conditions.push(`${f.column} IS ${f.value === null ? 'NULL' : f.value}`)
        break
      case 'in':
        if (Array.isArray(f.value) && f.value.length > 0) {
          conditions.push(`${f.column} = ANY($${paramIdx++})`)
          params.push(f.value)
        }
        break
    }
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  // ORDER BY
  if (state.orderCol) {
    sql += ` ORDER BY ${state.orderCol} ${state.orderAsc ? 'ASC' : 'DESC'}`
  }

  // LIMIT / RANGE
  if (state.rangeFrom !== null && state.rangeTo !== null) {
    const limit = state.rangeTo - state.rangeFrom + 1
    sql += ` LIMIT ${limit} OFFSET ${state.rangeFrom}`
  } else if (state.limitVal !== null) {
    sql += ` LIMIT ${state.limitVal}`
  }

  if (state.isSingle || state.isMaybeSingle) {
    if (!sql.includes('LIMIT')) sql += ' LIMIT 1'
  }

  return { text: sql, values: params }
}

// ─── Chainable Builder ─────────────────────────────────────────────────────

class QueryBuilder {
  private state: QueryState
  private supabaseChain: any

  constructor(table: string) {
    this.state = {
      table,
      mirrorTable: USE_LOCAL && MIRROR_MAP[table] ? MIRROR_MAP[table] : null,
      selectFields: '*',
      filters: [],
      orderCol: null,
      orderAsc: true,
      limitVal: null,
      rangeFrom: null,
      rangeTo: null,
      isSingle: false,
      isMaybeSingle: false,
      isCount: false,
      isHead: false,
    }
    this.supabaseChain = null
  }

  select(fields: string = '*', opts?: { count?: string; head?: boolean }) {
    this.state.selectFields = fields
    if (opts?.count === 'exact' && opts?.head) {
      this.state.isCount = true
      this.state.isHead = true
    }
    return this
  }

  eq(column: string, value: unknown) {
    this.state.filters.push({ type: 'eq', column, value })
    return this
  }

  neq(column: string, value: unknown) {
    this.state.filters.push({ type: 'neq', column, value })
    return this
  }

  gt(column: string, value: unknown) {
    this.state.filters.push({ type: 'gt', column, value })
    return this
  }

  gte(column: string, value: unknown) {
    this.state.filters.push({ type: 'gte', column, value })
    return this
  }

  lt(column: string, value: unknown) {
    this.state.filters.push({ type: 'lt', column, value })
    return this
  }

  lte(column: string, value: unknown) {
    this.state.filters.push({ type: 'lte', column, value })
    return this
  }

  like(column: string, value: unknown) {
    this.state.filters.push({ type: 'like', column, value })
    return this
  }

  ilike(column: string, value: unknown) {
    this.state.filters.push({ type: 'ilike', column, value })
    return this
  }

  is(column: string, value: unknown) {
    this.state.filters.push({ type: 'is', column, value })
    return this
  }

  in(column: string, values: unknown[]) {
    this.state.filters.push({ type: 'in', column, value: values })
    return this
  }

  not(column: string, op: string, value: unknown) {
    this.state.filters.push({ type: 'not', column, op, value })
    return this
  }

  or(expr: string, opts?: { referencedTable?: string }) {
    this.state.filters.push({ type: 'or', expr, opts })
    return this
  }

  overlaps(column: string, value: unknown[]) {
    // Postgres array overlap operator &&
    // Complex — fallback to Supabase by adding an unsupported filter
    this.state.filters.push({ type: 'or', expr: `__overlaps_fallback__`, opts: undefined })
    // Store for Supabase rebuild
    this._overlapsFilters = this._overlapsFilters || []
    this._overlapsFilters.push({ column, value })
    return this
  }

  contains(column: string, value: unknown) {
    this.state.filters.push({ type: 'or', expr: `__contains_fallback__`, opts: undefined })
    this._containsFilters = this._containsFilters || []
    this._containsFilters.push({ column, value })
    return this
  }

  private _overlapsFilters?: Array<{ column: string; value: unknown[] }>
  private _containsFilters?: Array<{ column: string; value: unknown }>

  order(column: string, opts?: { ascending?: boolean }) {
    this.state.orderCol = column
    this.state.orderAsc = opts?.ascending ?? true
    return this
  }

  limit(n: number) {
    this.state.limitVal = n
    return this
  }

  range(from: number, to: number) {
    this.state.rangeFrom = from
    this.state.rangeTo = to
    return this
  }

  single() {
    this.state.isSingle = true
    return this as any
  }

  maybeSingle() {
    this.state.isMaybeSingle = true
    return this as any
  }

  // ── Write operations — always go to Supabase ──

  insert(data: any, opts?: any): any {
    supabaseWrites++
    const chain = supabase.from(this.state.table).insert(data, opts)
    // Fire-and-forget mirror write (log errors instead of swallowing)
    if (this.state.mirrorTable && USE_LOCAL) {
      this._mirrorInsert(data).catch((err: any) => {
        logger.warn({ table: this.state.mirrorTable, err: err?.message }, 'Mirror insert failed')
      })
    }
    return chain
  }

  update(data: any): any {
    supabaseWrites++
    // Build supabase chain with accumulated filters
    let chain = supabase.from(this.state.table).update(data)
    for (const f of this.state.filters) {
      if (f.type === 'eq') chain = chain.eq(f.column, f.value)
      else if (f.type === 'neq') chain = chain.neq(f.column, f.value)
      else if (f.type === 'in') chain = chain.in(f.column, f.value as any[])
      else if (f.type === 'not') chain = chain.not(f.column, f.op as any, f.value)
    }
    return chain
  }

  upsert(data: any, opts?: any): any {
    supabaseWrites++
    const chain = supabase.from(this.state.table).upsert(data, opts)
    // Fire-and-forget mirror upsert (log errors)
    if (this.state.mirrorTable && USE_LOCAL) {
      this._mirrorUpsert(data).catch((err: any) => {
        logger.warn({ table: this.state.mirrorTable, err: err?.message }, 'Mirror upsert failed')
      })
    }
    return chain
  }

  delete(): any {
    supabaseWrites++
    let chain = supabase.from(this.state.table).delete()
    for (const f of this.state.filters) {
      if (f.type === 'eq') chain = chain.eq(f.column, f.value)
    }
    return chain
  }

  // ── Execute read (thenable) ──

  then(resolve: (value: any) => void, reject?: (err: any) => void) {
    return this._execute().then(resolve, reject)
  }

  private async _execute(): Promise<{ data: any; error: any; count?: number }> {
    // If no mirror table or local DB disabled → go straight to Supabase
    if (!this.state.mirrorTable) {
      supabaseReads++
      return this._executeSupabase()
    }

    // Try local PG first
    const { text, values } = buildSql(this.state)

    // If SQL couldn't be built (complex OR, joins) → fallback
    if (!text) {
      supabaseReads++
      return this._executeSupabase()
    }

    try {
      const result = await localPool.query(text, values)
      localReads++

      if (this.state.isCount && this.state.isHead) {
        return { data: null, error: null, count: parseInt(result.rows[0]?.count || '0') }
      }
      if (this.state.isSingle) {
        if (result.rows.length === 0) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
        }
        return { data: result.rows[0], error: null }
      }
      if (this.state.isMaybeSingle) {
        return { data: result.rows[0] || null, error: null }
      }
      return { data: result.rows, error: null, count: result.rowCount ?? undefined }
    } catch (err: any) {
      // Local PG failed → fallback to Supabase
      localFallbacks++
      logger.warn({ table: this.state.table, err: err.message }, 'Local PG read failed, falling back to Supabase')
      supabaseReads++
      return this._executeSupabase()
    }
  }

  private _executeSupabase(): Promise<{ data: any; error: any; count?: number }> {
    let chain = supabase.from(this.state.table).select(
      this.state.selectFields,
      this.state.isCount && this.state.isHead ? { count: 'exact', head: true } : undefined
    )

    for (const f of this.state.filters) {
      if (f.type === 'or' && (f as OrFilter).expr.startsWith('__')) continue // Skip fallback markers
      if (f.type === 'or') chain = chain.or(f.expr, (f as OrFilter).opts)
      else if (f.type === 'not') chain = chain.not(f.column, (f as NotFilter).op as any, f.value)
      else if (f.type === 'eq') chain = chain.eq(f.column, f.value)
      else if (f.type === 'neq') chain = chain.neq(f.column, f.value)
      else if (f.type === 'gt') chain = chain.gt(f.column, f.value)
      else if (f.type === 'gte') chain = chain.gte(f.column, f.value)
      else if (f.type === 'lt') chain = chain.lt(f.column, f.value)
      else if (f.type === 'lte') chain = chain.lte(f.column, f.value)
      else if (f.type === 'like') chain = chain.like(f.column, f.value as string)
      else if (f.type === 'ilike') chain = chain.ilike(f.column, f.value as string)
      else if (f.type === 'is') chain = chain.is(f.column, f.value as any)
      else if (f.type === 'in') {
        // Guard: skip empty IN() to avoid Supabase parse errors
        if (Array.isArray(f.value) && f.value.length > 0) {
          chain = chain.in(f.column, f.value as any[])
        }
      }
    }

    // Replay overlaps/contains filters
    if (this._overlapsFilters) {
      for (const f of this._overlapsFilters) chain = (chain as any).overlaps(f.column, f.value)
    }
    if (this._containsFilters) {
      for (const f of this._containsFilters) chain = (chain as any).contains(f.column, f.value)
    }

    if (this.state.orderCol) chain = chain.order(this.state.orderCol, { ascending: this.state.orderAsc })
    if (this.state.limitVal !== null) chain = chain.limit(this.state.limitVal)
    if (this.state.rangeFrom !== null && this.state.rangeTo !== null) {
      chain = chain.range(this.state.rangeFrom, this.state.rangeTo)
    }
    if (this.state.isSingle) chain = (chain as any).single()
    if (this.state.isMaybeSingle) chain = (chain as any).maybeSingle()

    return chain as any
  }

  // ── Mirror helpers ──

  private async _mirrorInsert(data: any) {
    const rows = Array.isArray(data) ? data : [data]
    for (const row of rows) {
      if (!row.id) continue
      const cols = Object.keys(row)
      const vals = cols.map(c => {
        const v = row[c]
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
      })
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
      const updates = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')
      await localPool.query(
        `INSERT INTO ${this.state.mirrorTable} (${cols.join(', ')}) VALUES (${ph}) ON CONFLICT (id) DO UPDATE SET ${updates}`,
        vals
      ).catch(() => {})
    }
  }

  private async _mirrorUpsert(data: any) {
    return this._mirrorInsert(data)
  }
}

// ─── Main Export ────────────────────────────────────────────────────────────

export const db: any = {
  from(table: string) {
    return new QueryBuilder(table)
  },

  // RPC always goes to Supabase
  rpc(fn: string, args?: any, opts?: any) {
    supabaseWrites++
    return supabase.rpc(fn, args, opts)
  },

  // Auth always goes to Supabase
  auth: supabase.auth,

  // Storage always goes to Supabase
  storage: supabase.storage,

  // Direct Supabase access for edge cases
  supabase,
}
