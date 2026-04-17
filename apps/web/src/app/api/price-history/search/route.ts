import { NextRequest, NextResponse } from 'next/server'
import { createClient, createClientWithTimeout } from '@/lib/supabase/server'

// Price search runs a full-text query + stats aggregation over millions of
// tender rows. Vercel serverless default is 10 s — bump to 60 s for this
// endpoint. Postgres statement timeout also bumped via Prefer header below.
export const maxDuration = 60
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

  // Auth check on standard client (cheap)
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Heavy queries go through a 45-second Postgres statement timeout client.
  // PostgREST's Prefer: timeout=45 overrides the authenticated role default.
  const supabase = await createClientWithTimeout(45)

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
  const winOnly = url.searchParams.get('win_only') === 'true'
  // homologated_only defaults to FALSE — include all tenders with competitor proposals
  // to maximize data available for price analysis
  const homologatedOnly = url.searchParams.get('homologated_only') === 'true'
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page_size') || '20', 10)))

  // Validate UF if provided
  if (uf && !UF_LIST.includes(uf)) {
    return NextResponse.json({ error: 'Invalid UF' }, { status: 400 })
  }

  try {
    const cache = getPriceHistoryCacheAdapter()

    // Cache keys include version v2 to invalidate old caches after search logic update
    const filterHash = crypto.createHash('md5').update(
      JSON.stringify({ q: q.toLowerCase(), uf, modalidade, dateFrom, dateTo, winOnly, homologatedOnly })
    ).digest('hex').slice(0, 12)

    const statsCacheKey = `stats:v2:${filterHash}`
    const dataCacheKey = `data:v2:${filterHash}:p${page}:s${pageSize}`

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
    // NOTE: we do NOT filter by valor_homologado — include all tenders with competitor
    // proposals even if still in progress (maximizes data for price analysis)
    let query = supabase
      .from('tenders')
      .select(
        'id, objeto, valor_estimado, valor_homologado, uf, municipio, modalidade_nome, orgao_nome, data_publicacao, data_encerramento, competitors!inner(cnpj, nome, valor_proposta, situacao, porte, uf_fornecedor)',
      )
      .textSearch('objeto', q, { type: 'websearch', config: 'portuguese' })

    if (homologatedOnly) {
      query = query.not('valor_homologado', 'is', null)
    }

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
    if (winOnly) {
      query = query.in('competitors.situacao', ['Informado', 'Homologado'])
    }

    // Order and paginate — this is for the CURRENT PAGE data only
    query = query
      .order('data_encerramento', { ascending: false })
      .range(offset, offset + pageSize - 1)

    const { data, error } = await query

    // Separate count query — counts DISTINCT tenders that match, without
    // the `competitors!inner` join which otherwise inflates/deflates the
    // count depending on PostgREST version. head:true returns just the
    // HEAD count without rows — very cheap.
    let countQuery = supabase
      .from('tenders')
      .select('id', { count: 'exact', head: true })
      .textSearch('objeto', q, { type: 'websearch', config: 'portuguese' })

    if (homologatedOnly) countQuery = countQuery.not('valor_homologado', 'is', null)
    if (uf) countQuery = countQuery.eq('uf', uf)
    if (modalidade) countQuery = countQuery.eq('modalidade_nome', modalidade)
    if (dateFrom) countQuery = countQuery.gte('data_encerramento', dateFrom)
    if (dateTo) countQuery = countQuery.lte('data_encerramento', dateTo)

    const { count } = await countQuery

    // If stats cache is empty, fetch ALL records (up to 500) for global statistics
    // This ensures stats are consistent across pages
    let allRecordsForStats: typeof data = null
    if (!cachedStats) {
      let statsQuery = supabase
        .from('tenders')
        .select(
          'id, objeto, valor_estimado, valor_homologado, uf, municipio, modalidade_nome, orgao_nome, data_publicacao, data_encerramento, competitors!inner(cnpj, nome, valor_proposta, situacao, porte, uf_fornecedor)',
        )
        .textSearch('objeto', q, { type: 'websearch', config: 'portuguese' })
        .order('data_encerramento', { ascending: false })
        .limit(1000) // Increased from 500 to 1000 tenders for richer stats

      if (homologatedOnly) statsQuery = statsQuery.not('valor_homologado', 'is', null)
      if (uf) statsQuery = statsQuery.eq('uf', uf)
      if (modalidade) statsQuery = statsQuery.eq('modalidade_nome', modalidade)
      if (dateFrom) statsQuery = statsQuery.gte('data_encerramento', dateFrom)
      if (dateTo) statsQuery = statsQuery.lte('data_encerramento', dateTo)
      if (winOnly) statsQuery = statsQuery.in('competitors.situacao', ['Informado', 'Homologado'])

      const { data: statsData } = await statsQuery
      allRecordsForStats = statsData
    }

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

        // Create one record per competitor with valid proposals
        // Tenders without competitors use valor_homologado as "preço praticado" (lower confidence)
        const validComps = competitors.filter(c => c.valor_proposta && c.valor_proposta > 0)

        if (validComps.length > 0) {
          for (const comp of validComps) {
            // Sanity check: reject absurd values (> 10 billion or negative)
            if (comp.valor_proposta! > 1e10 || comp.valor_proposta! < 0) continue

            const isWinner = comp.situacao === 'Informado' || comp.situacao === 'Homologado'

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
              unit_price: comp.valor_proposta!,
              total_price: comp.valor_proposta!,
              supplier_name: comp.nome || 'N/I',
              supplier_cnpj: comp.cnpj || '',
              supplier_uf: comp.uf_fornecedor || '',
              supplier_porte: mapPorte(comp.porte),
              date_homologation: new Date(tender.data_encerramento || tender.data_publicacao || Date.now()),
              date_opening: new Date(tender.data_publicacao || Date.now()),
              is_valid: true,
              // Winner proposals have highest confidence, losing proposals are still valuable
              confidence_score: isWinner ? 1.0 : 0.9,
            })
          }
        }

        // If no competitor data, use valor_homologado as "preço praticado" (winning price only)
        // This is LESS reliable than individual proposals — lower confidence and marked as such
        if (validComps.length === 0 && tender.valor_homologado) {
          const homologado = tender.valor_homologado as number
          // Sanity check
          if (homologado > 0 && homologado < 1e10) {
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
              unit_price: homologado,
              total_price: homologado,
              supplier_name: 'Vencedor (dados consolidados)',
              supplier_cnpj: '',
              supplier_uf: '',
              supplier_porte: 'N/A',
              date_homologation: new Date(tender.data_encerramento || tender.data_publicacao || Date.now()),
              date_opening: new Date(tender.data_publicacao || Date.now()),
              is_valid: true,
              // Lower confidence: this is a single winning price, not individual proposals
              // Cannot compute discount analysis or competitive landscape from this alone
              confidence_score: 0.5,
            })
          }
        }
      }
    }

    // DIRECT ITEM SEARCH: query tender_items by description — finds items across
    // ALL tenders in the database (not just the ones in current page)
    // This dramatically increases available data for price analysis
    try {
      const { data: itemSearch } = await supabase
        .from('tender_items')
        .select('id, tender_id, numero_item, descricao, quantidade, unidade_medida, valor_unitario_estimado, valor_total_estimado')
        .textSearch('descricao', q, { type: 'websearch', config: 'portuguese' })
        .gt('valor_unitario_estimado', 0)
        .order('valor_unitario_estimado', { ascending: false })
        .limit(200)

      if (itemSearch && itemSearch.length > 0) {
        // Fetch tender context for these items
        const itemTenderIds = [...new Set(itemSearch.map(i => i.tender_id))]
        const { data: tenderCtx } = await supabase
          .from('tenders')
          .select('id, orgao_nome, uf, municipio, modalidade_nome, data_encerramento, data_publicacao')
          .in('id', itemTenderIds)

        const tenderCtxMap = new Map((tenderCtx || []).map(t => [t.id, t]))

        for (const item of itemSearch) {
          const ctx = tenderCtxMap.get(item.tender_id) as Record<string, unknown> | undefined
          const vu = item.valor_unitario_estimado as number
          if (!vu || vu <= 0 || vu > 1e10) continue

          records.push({
            id: `item-${item.id}`,
            licitacao_id: item.tender_id,
            licitacao_numero: item.tender_id,
            licitacao_modalidade: (ctx?.modalidade_nome as string) || 'N/I',
            orgao_nome: (ctx?.orgao_nome as string) || 'N/I',
            orgao_uf: (ctx?.uf as string) || '',
            orgao_municipio: (ctx?.municipio as string) || '',
            fonte: 'pncp_item',
            item_description: item.descricao || q,
            item_unit: item.unidade_medida || 'UN',
            item_quantity: item.quantidade || 1,
            unit_price: vu,
            total_price: (item.valor_total_estimado as number) || vu,
            supplier_name: 'Estimado (item)',
            supplier_cnpj: '',
            supplier_uf: '',
            supplier_porte: 'N/A',
            date_homologation: new Date((ctx?.data_encerramento as string) || (ctx?.data_publicacao as string) || Date.now()),
            date_opening: new Date((ctx?.data_publicacao as string) || Date.now()),
            is_valid: true,
            confidence_score: 0.8, // Item-level estimated prices have good confidence
          })
        }
      }
    } catch (e) {
      console.warn('Item-level search failed, continuing:', e)
    }

    // Also fetch item-level prices from tender_items + price_history (higher precision)
    // This gives us unit prices per item instead of global tender prices
    if (records.length > 0) {
      const tenderIds = [...new Set(records.map(r => r.licitacao_id))]

      // Fetch tender_items for these tenders
      const { data: itemData } = await supabase
        .from('tender_items')
        .select('tender_id, numero_item, descricao, quantidade, unidade_medida, valor_unitario_estimado, valor_total_estimado')
        .in('tender_id', tenderIds.slice(0, 100)) // Limit to avoid query explosion
        .gt('valor_unitario_estimado', 0)

      // Fetch price_history (winning prices per item)
      const { data: priceData } = await supabase
        .from('price_history')
        .select('tender_id, tender_item_number, cnpj_vencedor, nome_vencedor, valor_unitario_vencido, valor_total_vencido, data_homologacao, marca')
        .in('tender_id', tenderIds.slice(0, 100))
        .gt('valor_unitario_vencido', 0)

      // Add item-level records with higher confidence
      if (priceData && priceData.length > 0) {
        // Find corresponding tender info for each price_history record
        const tenderMap = new Map(records.map(r => [r.licitacao_id, r]))

        for (const ph of priceData) {
          const baseTender = tenderMap.get(ph.tender_id)
          if (!baseTender) continue

          // Find item description
          const item = itemData?.find(i => i.tender_id === ph.tender_id && i.numero_item === ph.tender_item_number)

          records.push({
            id: `${ph.tender_id}-item-${ph.tender_item_number}-${ph.cnpj_vencedor || 'win'}`,
            licitacao_id: ph.tender_id,
            licitacao_numero: ph.tender_id,
            licitacao_modalidade: baseTender.licitacao_modalidade,
            orgao_nome: baseTender.orgao_nome,
            orgao_uf: baseTender.orgao_uf,
            orgao_municipio: baseTender.orgao_municipio,
            fonte: 'pncp_item', // Distinguish item-level data
            item_description: item?.descricao || baseTender.item_description,
            item_unit: item?.unidade_medida || 'UN',
            item_quantity: item?.quantidade || 1,
            unit_price: ph.valor_unitario_vencido!,
            total_price: ph.valor_total_vencido || ph.valor_unitario_vencido! * (item?.quantidade || 1),
            supplier_name: ph.nome_vencedor || 'Vencedor',
            supplier_cnpj: ph.cnpj_vencedor || '',
            supplier_uf: '',
            supplier_porte: 'N/A',
            date_homologation: new Date(ph.data_homologacao || Date.now()),
            date_opening: baseTender.date_opening,
            is_valid: true,
            confidence_score: 1.0, // Item-level winning prices are highest confidence
          })
        }
      }
    }

    // Also fetch cross-reference prices from price_references (multi-source)
    try {
      const { data: refData } = await supabase
        .from('price_references')
        .select('*')
        .textSearch('descricao', q, { type: 'websearch', config: 'portuguese' })
        .order('data_referencia', { ascending: false })
        .limit(50)

      if (refData && refData.length > 0) {
        for (const ref of refData) {
          if (!ref.valor_unitario || ref.valor_unitario <= 0) continue

          records.push({
            id: `ref-${ref.id}`,
            licitacao_id: ref.fonte_id || ref.id,
            licitacao_numero: ref.fonte_id || ref.id,
            licitacao_modalidade: ref.modalidade || 'N/I',
            orgao_nome: ref.orgao_nome || 'Fonte externa',
            orgao_uf: ref.orgao_uf || '',
            orgao_municipio: '',
            fonte: ref.fonte as PriceRecord['fonte'],
            item_description: ref.descricao,
            item_unit: ref.unidade_medida || 'UN',
            item_quantity: ref.quantidade || 1,
            unit_price: ref.valor_unitario,
            total_price: ref.valor_total || ref.valor_unitario,
            supplier_name: ref.nome_fornecedor || 'N/I',
            supplier_cnpj: ref.cnpj_fornecedor || '',
            supplier_uf: '',
            supplier_porte: ref.porte_fornecedor || 'N/A',
            date_homologation: new Date(ref.data_referencia),
            date_opening: new Date(ref.data_referencia),
            is_valid: true,
            confidence_score: ref.confiabilidade || 0.8,
          })
        }
      }
    } catch {
      // price_references table may not exist yet — ignore
    }

    // 1. Deduplicate identical records (same org + value + date)
    const dedupedRecords = deduplicateRecords(records)

    // 2. Filter outliers (marks is_valid=false, does NOT remove)
    const processedRecords = filterOutliers(dedupedRecords)

    // 3. Compute statistics on GLOBAL dataset (not just current page)
    // This fixes the bug where each page showed different percentiles
    let globalRecords: PriceRecord[] = []
    if (allRecordsForStats && allRecordsForStats.length > 0) {
      // Transform ALL tenders (not just current page) for stats
      for (const tender of allRecordsForStats) {
        const comps = ((tender as Record<string, unknown>).competitors || []) as Array<{
          valor_proposta: number | null; situacao: string | null
        }>
        const validComps = comps.filter(c => c.valor_proposta && c.valor_proposta > 0 && c.valor_proposta < 1e10)

        if (validComps.length > 0) {
          for (const c of validComps) {
            globalRecords.push({
              id: '', licitacao_id: '', licitacao_numero: '', licitacao_modalidade: '',
              orgao_nome: '', orgao_uf: '', orgao_municipio: '', fonte: 'pncp',
              item_description: '', item_unit: '', item_quantity: 1,
              unit_price: c.valor_proposta!,
              total_price: c.valor_proposta!,
              supplier_name: '', supplier_cnpj: '', supplier_uf: '', supplier_porte: 'N/A',
              date_homologation: new Date(), date_opening: new Date(),
              is_valid: true, confidence_score: 1,
            })
          }
        } else if ((tender as Record<string, unknown>).valor_homologado) {
          const vh = (tender as Record<string, unknown>).valor_homologado as number
          if (vh > 0 && vh < 1e10) {
            globalRecords.push({
              id: '', licitacao_id: '', licitacao_numero: '', licitacao_modalidade: '',
              orgao_nome: '', orgao_uf: '', orgao_municipio: '', fonte: 'pncp',
              item_description: '', item_unit: '', item_quantity: 1,
              unit_price: vh, total_price: vh,
              supplier_name: '', supplier_cnpj: '', supplier_uf: '', supplier_porte: 'N/A',
              date_homologation: new Date(), date_opening: new Date(),
              is_valid: true, confidence_score: 0.5,
            })
          }
        }
      }
      // Filter outliers on global set
      globalRecords = filterOutliers(globalRecords).filter(r => r.is_valid)
    }

    // Use global records for stats if available, otherwise fall back to page records
    const validRecords = processedRecords.filter((r) => r.is_valid)
    const statsSource = globalRecords.length > 0 ? globalRecords : validRecords
    const statistics = computeStatistics(statsSource)
    const trend = analyzeTrend(validRecords) // Trend uses page records (has dates)
    const totalCount = count || 0

    // 4. Count excluded for metadata
    const excludedCount = processedRecords.filter((r) => !r.is_valid).length

    // 5. Compute data quality metadata (multi-source awareness)
    const fonteSet = new Set(validRecords.map(r => r.fonte))
    const proposalRecords = validRecords.filter(r => r.confidence_score >= 0.9)
    const homologadoRecords = validRecords.filter(r => r.confidence_score < 0.9)
    const externalRecords = validRecords.filter(r => !['pncp', 'pncp_item'].includes(r.fonte))
    const avgConfidence = validRecords.length > 0
      ? validRecords.reduce((sum, r) => sum + r.confidence_score, 0) / validRecords.length
      : 0

    // Selo "Referência Validada": when 3+ independent sources converge
    const isValidated = fonteSet.size >= 3 && validRecords.length >= 10
    const isPartiallyValidated = fonteSet.size >= 2 && validRecords.length >= 5

    const dataQuality = {
      total_records: validRecords.length,
      proposal_records: proposalRecords.length,
      homologado_records: homologadoRecords.length,
      external_records: externalRecords.length,
      excluded_outliers: excludedCount,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      confidence_level: avgConfidence >= 0.85 && validRecords.length >= 10 ? 'alta'
        : avgConfidence >= 0.7 && validRecords.length >= 5 ? 'media'
        : 'baixa',
      sources: Array.from(fonteSet),
      source_count: fonteSet.size,
      // Selo de referência validada
      validated: isValidated,
      partially_validated: isPartiallyValidated,
      validation_label: isValidated ? 'Referência Validada (3+ fontes)'
        : isPartiallyValidated ? 'Referência Parcial (2 fontes)'
        : 'Fonte Única',
    }

    // Cache stats (2h) and data (1h) in background
    cache.set(statsCacheKey, { statistics, trend, total_count: totalCount, valid_count: validRecords.length, excluded_count: excludedCount, data_quality: dataQuality }, 7200).catch(() => {})
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
      data_quality: dataQuality,
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
