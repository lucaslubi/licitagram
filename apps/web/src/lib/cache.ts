import { createClient } from '@/lib/supabase/server'
import { cached, CacheKeys, TTL } from './redis'
import crypto from 'crypto'

/**
 * Server-side cached data fetchers.
 *
 * Architecture:
 * - GLOBAL data (tenders) → Redis cache with TTL (shared across all users)
 * - PER-USER data (matches) → Redis cache keyed by company_id (personalized)
 * - Cache invalidation: Workers bust Redis keys after writing new data
 *
 * This layer sits between Server Components and Supabase,
 * dramatically reducing database queries for repeated page views.
 */

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Create a stable hash of filter params for cache key */
export function hashFilters(params: Record<string, string | number | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return crypto.createHash('md5').update(sorted).digest('hex').slice(0, 12)
}

// ─── Auth (cached per request via React cache) ──────────────────────────────

interface AuthResult {
  userId: string
  companyId: string | null
  minScore: number
  fullName: string | null
}

/**
 * Get authenticated user + profile in a single operation.
 * Not Redis-cached (auth must be fresh), but avoids
 * the 3x redundant auth checks (middleware + layout + page).
 */
export async function getAuthAndProfile(): Promise<AuthResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('company_id, min_score, full_name')
    .eq('id', user.id)
    .single()

  return {
    userId: user.id,
    companyId: profile?.company_id ?? null,
    minScore: profile?.min_score ?? 10,
    fullName: profile?.full_name ?? null,
  }
}

// ─── Global Tender Queries (cached, shared across users) ─────────────────────

interface TenderListParams {
  page: number
  pageSize: number
  uf?: string
  modalidade?: string
  dataFrom?: string
  dataTo?: string
  fonte?: string
  search?: string
  searchEdital?: boolean
  ordemValor?: string
  ordemData?: string
  showClosed?: boolean
}

interface TenderListResult {
  tenders: Array<Record<string, any>>
  count: number
  totalPages: number
}

/**
 * Fetch tender list with Redis caching.
 * Global data — same results for all users with same filters.
 * TTL: 5 minutes.
 */
export async function getTenderList(params: TenderListParams): Promise<TenderListResult> {
  const filterHash = hashFilters({
    p: params.page,
    ps: params.pageSize,
    uf: params.uf,
    mod: params.modalidade,
    df: params.dataFrom,
    dt: params.dataTo,
    src: params.fonte,
    q: params.search,
    se: params.searchEdital ? '1' : undefined,
    ov: params.ordemValor,
    od: params.ordemData,
    sc: params.showClosed ? '1' : undefined,
  })

  // Don't cache text searches (too many variants)
  if (params.search) {
    return fetchTenderListFromDB(params)
  }

  return cached(
    CacheKeys.tenderList(filterHash),
    () => fetchTenderListFromDB(params),
    TTL.tenderList,
  )
}

async function fetchTenderListFromDB(params: TenderListParams): Promise<TenderListResult> {
  const supabase = await createClient()
  const { page, pageSize, uf, modalidade, dataFrom, dataTo, fonte, search, searchEdital, ordemValor, ordemData } = params

  let query = supabase
    .from('tenders')
    .select(
      'id, objeto, orgao_nome, uf, valor_estimado, data_abertura, data_publicacao, data_encerramento, modalidade_nome, modalidade_id, status, source, situacao_nome',
      { count: 'exact' },
    )

  // Filter open vs closed tenders based on data_encerramento (proposal deadline).
  // If today > data_encerramento → tender is closed (proposals period ended).
  // If today <= data_encerramento OR data_encerramento is null → still open.
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD (date only)
  if (params.showClosed) {
    // Archive: data_encerramento is in the past (today > data_encerramento)
    query = query.not('data_encerramento', 'is', null).lt('data_encerramento', today)
  } else {
    // Opportunities: data_encerramento is null (unknown) or >= today (still open)
    query = query.or(`data_encerramento.is.null,data_encerramento.gte.${today}`)
  }

  // Dynamic ordering — valor (primary) then data (secondary), both independent
  if (ordemValor === 'valor_desc') {
    query = query.order('valor_estimado', { ascending: false, nullsFirst: false })
  } else if (ordemValor === 'valor_asc') {
    query = query.order('valor_estimado', { ascending: true, nullsFirst: false })
  }

  if (ordemData === 'data_asc') {
    query = query.order('data_publicacao', { ascending: true, nullsFirst: false })
  } else if (ordemData === 'data_desc') {
    query = query.order('data_publicacao', { ascending: false, nullsFirst: false })
  } else if (!ordemValor) {
    // Default: mais recentes primeiro (por data de publicação no portal)
    query = query.order('data_publicacao', { ascending: false, nullsFirst: false })
  }

  query = query.range((page - 1) * pageSize, page * pageSize - 1)

  if (uf) query = query.eq('uf', uf)
  if (modalidade) query = query.eq('modalidade_id', parseInt(modalidade))
  if (dataFrom) query = query.gte('data_abertura', dataFrom)
  if (dataTo) query = query.lte('data_abertura', dataTo)
  if (fonte) query = query.eq('source', fonte)

  // Text search (accent-insensitive via PostgreSQL unaccent RPC)
  if (search && !searchEdital) {
    // Use DB-side unaccent for true accent-insensitive search
    const { data: matchingIds } = await supabase
      .rpc('search_tenders_unaccent', { search_text: search.trim(), max_results: 500 })

    if (matchingIds && matchingIds.length > 0) {
      query = query.in('id', matchingIds as string[])
    } else {
      // Fallback: strip accents in JS and use ilike (works if DB data has no accents)
      const words = search.trim().split(/\s+/).filter(Boolean)
      for (const word of words) {
        const normalized = stripAccents(word)
        query = query.ilike('objeto', `%${normalized}%`)
      }
    }
  }

  // Full-text search in edital documents (accent-insensitive)
  if (search && searchEdital) {
    const { data: docMatches } = await supabase
      .rpc('search_documents_unaccent', { search_text: search.trim(), max_results: 200 })

    if (docMatches && docMatches.length > 0) {
      const tenderIds = [...new Set(docMatches.map((d: { tender_id: string }) => d.tender_id))]
      query = query.in('id', tenderIds)
    } else {
      // Fallback to objeto search (accent-insensitive)
      const { data: fallbackIds } = await supabase
        .rpc('search_tenders_unaccent', { search_text: search.trim(), max_results: 500 })

      if (fallbackIds && fallbackIds.length > 0) {
        query = query.in('id', fallbackIds as string[])
      } else {
        const words = search.trim().split(/\s+/).filter(Boolean)
        for (const word of words) {
          const normalized = stripAccents(word)
          query = query.ilike('objeto', `%${normalized}%`)
        }
      }
    }
  }

  const { data: tenders, count } = await query

  return {
    tenders: tenders || [],
    count: count || 0,
    totalPages: Math.ceil((count || 0) / pageSize),
  }
}

// ─── Match Queries (cached per-company) ──────────────────────────────────────

interface MatchListParams {
  companyId: string
  page: number
  pageSize: number
  minScore: number
  uf?: string
  modalidade?: string
  dataFrom?: string
  dataTo?: string
  fonte?: string
  scoreMin?: number
  ordemValor?: string
  ordemData?: string
}

interface MatchListResult {
  matches: Array<Record<string, any>>
  count: number
  totalPages: number
}

/**
 * Fetch match list with Redis caching.
 * Per-company data — personalized to user's company.
 * TTL: 2 minutes.
 */
export async function getMatchList(params: MatchListParams): Promise<MatchListResult> {
  const filterHash = hashFilters({
    p: params.page,
    ps: params.pageSize,
    ms: params.minScore,
    uf: params.uf,
    mod: params.modalidade,
    df: params.dataFrom,
    dt: params.dataTo,
    src: params.fonte,
    sm: params.scoreMin,
    ov: params.ordemValor,
    od: params.ordemData,
  })

  return cached(
    CacheKeys.matchList(params.companyId, filterHash),
    () => fetchMatchListFromDB(params),
    TTL.matchList,
  )
}

async function fetchMatchListFromDB(params: MatchListParams): Promise<MatchListResult> {
  const supabase = await createClient()
  const { companyId, page, pageSize, uf, modalidade, dataFrom, dataTo, fonte, ordemValor, ordemData } = params
  const effectiveMinScore = (params.scoreMin && params.scoreMin > 0) ? params.scoreMin : params.minScore

  // NOTE: Supabase .order() with referencedTable only orders the EMBEDDED
  // resource (nested tenders array), NOT the parent match rows. Since each
  // match has exactly one tender (many-to-one), it has zero visible effect.
  // Fix: fetch all matches, sort in JS, then paginate manually.

  let query = supabase
    .from('matches')
    .select(
      `id, score, status, ai_justificativa, recomendacao, match_source, created_at,
       tenders!inner(
         id, objeto, orgao_nome, orgao_cnpj, uf, municipio,
         valor_estimado, valor_homologado, data_abertura, data_publicacao, data_encerramento,
         modalidade_nome, modalidade_id, status, situacao_nome, link_sistema_origem, link_pncp, source,
         tender_documents(id)
       )`,
      { count: 'exact' },
    )
    .eq('company_id', companyId)
    .gte('score', effectiveMinScore)

  // Filters on the referenced tenders table
  if (uf) query = query.eq('tenders.uf', uf)
  if (modalidade) query = query.eq('tenders.modalidade_id', parseInt(modalidade))
  if (dataFrom) query = query.gte('tenders.data_abertura', dataFrom)
  if (dataTo) query = query.lte('tenders.data_abertura', dataTo)
  if (fonte) query = query.eq('tenders.source', fonte)

  // Fetch all rows (up to 2000) — we paginate in JS after sorting
  query = query.order('score', { ascending: false }).limit(2000)

  const { data: allMatches, count } = await query

  if (!allMatches || allMatches.length === 0) {
    return { matches: [], count: 0, totalPages: 0 }
  }

  // Filter out expired tenders in JS (Supabase referencedTable filters don't exclude parent rows)
  const today = new Date().toISOString().split('T')[0]
  const openMatches = allMatches.filter((match) => {
    const tender = match.tenders as unknown as Record<string, unknown> | null
    if (!tender) return false // no tender data = skip
    const enc = tender.data_encerramento as string | null
    return !enc || enc >= today // null (unknown deadline) or still open
  })

  if (openMatches.length === 0) {
    return { matches: [], count: 0, totalPages: 0 }
  }

  // Sort in application code (valor and data sorts on nested tender fields)
  const sorted = [...openMatches]
  sorted.sort((a, b) => {
    const tA = a.tenders as unknown as Record<string, unknown>
    const tB = b.tenders as unknown as Record<string, unknown>

    // Primary sort: valor
    if (ordemValor === 'valor_desc') {
      const diff = (Number(tB?.valor_estimado) || 0) - (Number(tA?.valor_estimado) || 0)
      if (diff !== 0) return diff
    } else if (ordemValor === 'valor_asc') {
      const diff = (Number(tA?.valor_estimado) || 0) - (Number(tB?.valor_estimado) || 0)
      if (diff !== 0) return diff
    }

    // Secondary sort: data
    if (ordemData === 'data_desc') {
      const diff = new Date(String(tB?.data_publicacao || '1970')).getTime() - new Date(String(tA?.data_publicacao || '1970')).getTime()
      if (diff !== 0) return diff
    } else if (ordemData === 'data_asc') {
      const diff = new Date(String(tA?.data_publicacao || '1970')).getTime() - new Date(String(tB?.data_publicacao || '1970')).getTime()
      if (diff !== 0) return diff
    }

    // Default tiebreaker: highest score first
    return (b.score as number) - (a.score as number)
  })

  // Manual pagination
  const start = (page - 1) * pageSize
  const paginatedMatches = sorted.slice(start, start + pageSize)
  const total = openMatches.length

  return {
    matches: paginatedMatches,
    count: total,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get match count for tab badge (cached).
 */
export async function getMatchCount(companyId: string, minScore: number): Promise<number> {
  return cached(
    CacheKeys.matchCount(companyId, minScore),
    async () => {
      const supabase = await createClient()
      const { count } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('score', minScore)
      return count || 0
    },
    TTL.matchCount,
  )
}

/**
 * Get global tender count (cached).
 * Counts only OPEN tenders (data_encerramento is null or >= today).
 */
export async function getTenderCount(): Promise<number> {
  return cached(
    CacheKeys.stats('tender-open-total'),
    async () => {
      const supabase = await createClient()
      const today = new Date().toISOString().split('T')[0]
      const { count } = await supabase
        .from('tenders')
        .select('id', { count: 'exact', head: true })
        .or(`data_encerramento.is.null,data_encerramento.gte.${today}`)
      return count || 0
    },
    TTL.stats,
  )
}

// ─── Tender Detail (cached) ─────────────────────────────────────────────────

/**
 * Fetch a single tender with documents (cached 30 min).
 * Global data — same for all users.
 */
export async function getTenderDetail(tenderId: string): Promise<{
  tender: Record<string, any> | null
  documents: Array<Record<string, any>>
}> {
  return cached(
    CacheKeys.tenderDetail(tenderId),
    async () => {
      const supabase = await createClient()

      // Parallel queries instead of waterfall
      const [tenderResult, docsResult] = await Promise.all([
        supabase.from('tenders').select('*').eq('id', tenderId).single(),
        supabase.from('tender_documents').select('*').eq('tender_id', tenderId),
      ])

      return {
        tender: tenderResult.data,
        documents: docsResult.data || [],
      }
    },
    TTL.tenderDetail,
  )
}

// ─── Match Detail (cached) ──────────────────────────────────────────────────

/**
 * Fetch a single match with nested tender + documents (cached 1 min).
 */
export async function getMatchDetail(matchId: string): Promise<Record<string, any> | null> {
  return cached(
    CacheKeys.matchDetail(matchId),
    async () => {
      const supabase = await createClient()
      const { data } = await supabase
        .from('matches')
        .select(`
          id, company_id, tender_id, score, keyword_score, match_source,
          breakdown, ai_justificativa, riscos, acoes_necessarias, recomendacao,
          status, notified_at, created_at,
          tenders (
            id, pncp_id, objeto, resumo, requisitos,
            orgao_nome, orgao_cnpj, uf, municipio,
            valor_estimado, valor_homologado,
            data_abertura, data_publicacao, data_encerramento,
            modalidade_nome, modalidade_id,
            status, situacao_nome, link_sistema_origem, link_pncp, source,
            tender_documents (id, titulo, tipo, url, texto_extraido, status)
          )
        `)
        .eq('id', matchId)
        .single()

      return data
    },
    TTL.matchDetail,
  )
}

// ─── Dashboard Stats (cached) ───────────────────────────────────────────────

export interface DashboardStats {
  totalTenders: number
  tendersByUf: Record<string, number>
  tendersBySource: Record<string, number>
  recentTendersCount: number
  matchCount: number
  highScoreMatchCount: number
}

/**
 * Get dashboard stats for a company (cached 10 min).
 */
export async function getDashboardStats(companyId: string | null): Promise<DashboardStats> {
  const cacheKey = companyId ? `dashboard:${companyId}` : 'dashboard:global'

  return cached(
    CacheKeys.stats(cacheKey),
    async () => {
      const supabase = await createClient()

      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // Run all count queries in parallel
      const [totalResult, recentResult, matchResult, highScoreResult] = await Promise.all([
        supabase.from('tenders').select('id', { count: 'exact', head: true }),
        supabase.from('tenders').select('id', { count: 'exact', head: true })
          .gte('data_publicacao', sevenDaysAgo),
        companyId
          ? supabase.from('matches').select('id', { count: 'exact', head: true })
              .eq('company_id', companyId)
          : Promise.resolve({ count: 0 }),
        companyId
          ? supabase.from('matches').select('id', { count: 'exact', head: true })
              .eq('company_id', companyId).gte('score', 70)
          : Promise.resolve({ count: 0 }),
      ])

      return {
        totalTenders: totalResult.count || 0,
        tendersByUf: {}, // TODO: aggregate by UF if needed
        tendersBySource: {}, // TODO: aggregate by source if needed
        recentTendersCount: recentResult.count || 0,
        matchCount: matchResult.count || 0,
        highScoreMatchCount: highScoreResult.count || 0,
      }
    },
    TTL.stats,
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip accents/diacritics from text using Unicode NFD normalization.
 * "licitação" → "licitacao", "café" → "cafe"
 */
function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
