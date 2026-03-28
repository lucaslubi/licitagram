import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  computeStatistics,
  analyzeTrend,
  filterOutliers,
  deduplicateRecords,
  type PriceRecord,
  type PriceSearchResult,
  type PriceSearchQuery,
} from '@licitagram/price-history'
import { getPriceHistoryCacheAdapter, checkRedisRateLimit } from '@/lib/price-history-cache'
import { getRedisClient } from '@/lib/redis-client'
import crypto from 'crypto'

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limiting: 30 req/min per user
  const rateLimit = await checkRedisRateLimit(`search:${user.id}`, 30, 60)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Muitas requisicoes. Tente novamente em breve.', retry_after: rateLimit.retryAfter },
      { status: 429 },
    )
  }

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length < 3) {
    return NextResponse.json(
      { error: 'Query must be at least 3 characters' },
      { status: 400 },
    )
  }

  const uf = url.searchParams.get('uf')?.toUpperCase() || undefined
  const modalidade = url.searchParams.get('modalidade') || undefined
  const dateFrom = url.searchParams.get('date_from') || undefined
  const dateTo = url.searchParams.get('date_to') || undefined
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page_size') || '20', 10)))

  // Validate UF if provided
  if (uf && !UF_LIST.includes(uf)) {
    return NextResponse.json({ error: 'Invalid UF' }, { status: 400 })
  }

  try {
    const cache = getPriceHistoryCacheAdapter()

    // Cache keys: stats ignores page/page_size (shared), data includes them
    const filterHash = crypto.createHash('md5').update(
      JSON.stringify({ q: q.toLowerCase(), uf, modalidade, dateFrom, dateTo })
    ).digest('hex').slice(0, 12)

    const statsCacheKey = `stats:${filterHash}`
    const dataCacheKey = `data:${filterHash}:p${page}:s${pageSize}`

    // Try cache first for both stats and data
    const cachedStats = await cache.get<{ statistics: PriceSearchResult['statistics']; trend: PriceSearchResult['trend']; total_count: number }>(statsCacheKey)
    const cachedData = await cache.get<{ records: PriceRecord[] }>(dataCacheKey)

    if (cachedStats && cachedData) {
      // Full cache hit
      const searchQuery: PriceSearchQuery = {
        query: q, uf, modalidade,
        date_from: dateFrom ? new Date(dateFrom) : undefined,
        date_to: dateTo ? new Date(dateTo) : undefined,
        page, page_size: pageSize,
      }

      // Track trending
      trackTrending(q).catch(() => {})

      return NextResponse.json({
        records: cachedData.records,
        statistics: cachedStats.statistics,
        trend: cachedStats.trend,
        total_count: cachedStats.total_count,
        page,
        page_size: pageSize,
        query: searchQuery,
        cache_hit: true,
        query_time_ms: Date.now() - startTime,
      })
    }

    const offset = (page - 1) * pageSize

    // Build the Supabase query using textSearch on objeto
    let query = supabase
      .from('tenders')
      .select(
        'id, objeto, valor_estimado, valor_homologado, uf, municipio, modalidade_nome, orgao_nome, data_publicacao, data_encerramento, competitors!inner(cnpj, nome, valor_proposta, situacao, porte, uf_fornecedor)',
        { count: 'exact' },
      )
      .textSearch('objeto', q, { type: 'websearch', config: 'portuguese' })
      .not('valor_homologado', 'is', null)

    // Apply filters
    if (uf) {
      query = query.eq('uf', uf)
    }
    if (modalidade) {
      query = query.eq('modalidade_nome', modalidade)
    }
    if (dateFrom) {
      query = query.gte('data_encerramento', dateFrom)
    }
    if (dateTo) {
      query = query.lte('data_encerramento', dateTo)
    }

    // Order and paginate
    query = query
      .order('data_encerramento', { ascending: false })
      .range(offset, offset + pageSize - 1)

    const { data, count, error } = await query

    if (error) {
      console.error('Price history search error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform results into PriceRecord[] format
    const records: PriceRecord[] = []

    if (data) {
      for (const tender of data) {
        const competitors = (tender.competitors || []) as Array<{
          cnpj: string | null
          nome: string | null
          valor_proposta: number | null
          situacao: string | null
          porte: string | null
          uf_fornecedor: string | null
        }>

        // If there are competitors with proposals, create one record per competitor
        // Otherwise create one record using valor_homologado
        if (competitors.length > 0) {
          for (const comp of competitors) {
            if (!comp.valor_proposta || comp.valor_proposta <= 0) continue

            records.push({
              id: `${tender.id}-${comp.cnpj || 'unknown'}`,
              licitacao_id: tender.id,
              licitacao_numero: tender.id,
              licitacao_modalidade: tender.modalidade_nome || 'N/I',
              orgao_nome: tender.orgao_nome || 'N/I',
              orgao_uf: tender.uf || '',
              orgao_municipio: tender.municipio || '',
              fonte: 'pncp',
              item_description: tender.objeto || '',
              item_unit: 'SV',
              item_quantity: 1,
              unit_price: comp.valor_proposta,
              total_price: comp.valor_proposta,
              supplier_name: comp.nome || 'N/I',
              supplier_cnpj: comp.cnpj || '',
              supplier_uf: comp.uf_fornecedor || '',
              supplier_porte: mapPorte(comp.porte),
              date_homologation: new Date(tender.data_encerramento || tender.data_publicacao || Date.now()),
              date_opening: new Date(tender.data_publicacao || Date.now()),
              is_valid: true,
              confidence_score: 1,
            })
          }
        } else {
          // Fallback: use valor_homologado as unit_price
          records.push({
            id: tender.id,
            licitacao_id: tender.id,
            licitacao_numero: tender.id,
            licitacao_modalidade: tender.modalidade_nome || 'N/I',
            orgao_nome: tender.orgao_nome || 'N/I',
            orgao_uf: tender.uf || '',
            orgao_municipio: tender.municipio || '',
            fonte: 'pncp',
            item_description: tender.objeto || '',
            item_unit: 'SV',
            item_quantity: 1,
            unit_price: tender.valor_homologado as number,
            total_price: tender.valor_homologado as number,
            supplier_name: 'N/I',
            supplier_cnpj: '',
            supplier_uf: '',
            supplier_porte: 'N/A',
            date_homologation: new Date(tender.data_encerramento || tender.data_publicacao || Date.now()),
            date_opening: new Date(tender.data_publicacao || Date.now()),
            is_valid: true,
            confidence_score: 0.7,
          })
        }
      }
    }

    // 1. Deduplicate identical records (same org + value + date)
    const dedupedRecords = deduplicateRecords(records)

    // 2. Filter outliers (marks is_valid=false, does NOT remove)
    const processedRecords = filterOutliers(dedupedRecords)

    // 3. Compute statistics only on VALID records (outliers excluded from stats)
    const validRecords = processedRecords.filter((r) => r.is_valid)
    const statistics = computeStatistics(validRecords)
    const trend = analyzeTrend(validRecords)
    const totalCount = count || 0

    // 4. Count excluded for metadata
    const excludedCount = processedRecords.filter((r) => !r.is_valid).length

    // Cache stats (2h) and data (1h) in background
    cache.set(statsCacheKey, { statistics, trend, total_count: totalCount, valid_count: validRecords.length, excluded_count: excludedCount }, 7200).catch(() => {})
    cache.set(dataCacheKey, { records: processedRecords }, 3600).catch(() => {})

    const searchQuery: PriceSearchQuery = {
      query: q,
      uf,
      modalidade,
      date_from: dateFrom ? new Date(dateFrom) : undefined,
      date_to: dateTo ? new Date(dateTo) : undefined,
      page,
      page_size: pageSize,
    }

    const result = {
      records: processedRecords,
      statistics,
      trend,
      total_count: totalCount,
      valid_count: validRecords.length,
      excluded_count: excludedCount,
      page,
      page_size: pageSize,
      query: searchQuery,
      cache_hit: false,
      query_time_ms: Date.now() - startTime,
    }

    // Track trending in background
    trackTrending(q).catch(() => {})

    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Price history search error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Track search queries in Redis ZSET for trending */
async function trackTrending(query: string): Promise<void> {
  try {
    const redis = getRedisClient()
    if (!redis) return
    const normalized = query.toLowerCase().trim()
    await redis.zincrby('ph:trending', 1, normalized)
    // Set TTL on the ZSET (24h) — re-set each time to keep it alive
    await redis.expire('ph:trending', 86400)
  } catch {
    // silent
  }
}

function mapPorte(porte: string | null | undefined): PriceRecord['supplier_porte'] {
  if (!porte) return 'N/A'
  const upper = porte.toUpperCase()
  if (upper.includes('ME') && !upper.includes('MEDIO')) return 'ME'
  if (upper.includes('EPP')) return 'EPP'
  if (upper.includes('MEDIO') || upper.includes('MÉDIA')) return 'MEDIO'
  if (upper.includes('GRANDE')) return 'GRANDE'
  return 'N/A'
}
