import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AddWatchlistForm } from './watchlist-form'
import { DeleteWatchlistButton } from './delete-watchlist-button'
import { MercadoSummaryCards, MercadoTable, type MercadoCompetitor } from './mercado-table'

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const tab = params.tab || 'mercado'
  const searchQuery = params.q || ''

  // Fetch AI relevance data once for all tabs
  let relevanceMap: Record<string, { score: number; type: string; reason: string }> = {}
  if (profile?.company_id) {
    const { data: relevanceData } = await supabase
      .from('competitor_relevance')
      .select('competitor_cnpj, relevance_score, relationship_type, reason')
      .eq('company_id', profile.company_id)

    if (relevanceData) {
      for (const r of relevanceData) {
        relevanceMap[r.competitor_cnpj] = {
          score: r.relevance_score,
          type: r.relationship_type || '',
          reason: r.reason || '',
        }
      }
    }
  }

  // Get watchlist
  const { data: watchlist } = await supabase
    .from('competitor_watchlist')
    .select('*')
    .eq('company_id', profile?.company_id || '')
    .order('created_at', { ascending: false })

  // Get competitor stats for watchlist items
  const watchlistCnpjs = (watchlist || []).map((w) => w.competitor_cnpj)
  let watchlistStats: Record<string, {
    total_participacoes: number; total_vitorias: number; win_rate: number
    valor_total_ganho: number; desconto_medio: number
    ufs_atuacao: Record<string, boolean>
    porte: string | null; cnae_divisao: string | null; uf: string | null
    ultima_participacao: string | null
    overlapCount?: number
  }> = {}

  if (watchlistCnpjs.length > 0) {
    const { data: stats } = await supabase
      .from('competitor_stats')
      .select('*')
      .in('cnpj', watchlistCnpjs)

    if (stats) {
      for (const s of stats) {
        watchlistStats[s.cnpj] = {
          total_participacoes: s.total_participacoes,
          total_vitorias: s.total_vitorias,
          win_rate: Number(s.win_rate),
          valor_total_ganho: Number(s.valor_total_ganho || 0),
          desconto_medio: Number(s.desconto_medio || 0),
          ufs_atuacao: (s.ufs_atuacao as Record<string, boolean>) || {},
          porte: s.porte,
          cnae_divisao: s.cnae_divisao,
          uf: s.uf,
          ultima_participacao: s.ultima_participacao,
        }
      }
    }

    // Fallback for CNPJs not yet in competitor_stats (< 3 participations)
    const missingCnpjs = watchlistCnpjs.filter((c) => !watchlistStats[c])
    if (missingCnpjs.length > 0) {
      const { data: rawStats } = await supabase
        .from('competitors')
        .select('cnpj, situacao, valor_proposta, porte, cnae_nome, uf_fornecedor, municipio_fornecedor')
        .in('cnpj', missingCnpjs)

      if (rawStats) {
        for (const s of rawStats) {
          if (!watchlistStats[s.cnpj]) {
            watchlistStats[s.cnpj] = {
              total_participacoes: 0, total_vitorias: 0, win_rate: 0,
              valor_total_ganho: 0, desconto_medio: 0,
              ufs_atuacao: {},
              porte: s.porte, cnae_divisao: s.cnae_nome,
              uf: s.uf_fornecedor,
              ultima_participacao: null,
            }
          }
          watchlistStats[s.cnpj].total_participacoes++
          if (s.situacao?.toLowerCase().includes('homologad')) watchlistStats[s.cnpj].total_vitorias++
          if (s.uf_fornecedor) watchlistStats[s.cnpj].ufs_atuacao[s.uf_fornecedor] = true
        }
      }
    }
  }

  // Calculate overlap: open tenders where this competitor likely competes
  // Uses the same CNAE divisions + UFs from the user's active matches
  const { data: activeMatches } = await supabase
    .from('matches')
    .select('tenders!inner(uf)')
    .eq('company_id', profile?.company_id || '')
    .in('status', ['new', 'notified', 'viewed', 'interested'])

  const activeUfs = [...new Set((activeMatches || []).map((m) => {
    const t = m.tenders as unknown as Record<string, unknown>
    return t.uf as string
  }).filter(Boolean))]

  // For each watchlist competitor, check overlap with user's active UFs
  for (const cnpj of watchlistCnpjs) {
    const stats = watchlistStats[cnpj]
    if (!stats) continue
    const ufsAtua = stats.ufs_atuacao || {}
    const overlapUfs = activeUfs.filter((uf) => ufsAtua[uf])
    stats.overlapCount = overlapUfs.length
  }

  // Search results
  let searchResults: Array<{
    cnpj: string; nome: string; participacoes: number; vitorias: number
    porte?: string; cnae_divisao?: string; uf?: string; municipio?: string
    win_rate?: number; valor_total_ganho?: number; desconto_medio?: number
    ufs_atuacao?: Record<string, boolean>; ultima_participacao?: string | null
    hasStats?: boolean
  }> = []

  if (searchQuery && tab === 'buscar') {
    const cleanQuery = searchQuery.replace(/\D/g, '')
    const isNumeric = cleanQuery.length >= 3

    const { data: competitors } = await supabase
      .from('competitors')
      .select('cnpj, nome, situacao, porte, cnae_nome, uf_fornecedor, municipio_fornecedor')
      .or(
        isNumeric
          ? `cnpj.ilike.%${cleanQuery}%,nome.ilike.%${searchQuery}%`
          : `nome.ilike.%${searchQuery}%`,
      )
      .limit(200)

    if (competitors) {
      const grouped: Record<string, {
        nome: string; participacoes: number; vitorias: number
        porte?: string; cnae_divisao?: string; uf?: string; municipio?: string
      }> = {}
      for (const c of competitors) {
        if (!grouped[c.cnpj]) {
          grouped[c.cnpj] = { nome: c.nome, participacoes: 0, vitorias: 0 }
        }
        grouped[c.cnpj].participacoes++
        const isWinner = c.situacao && typeof c.situacao === 'string' && c.situacao.toLowerCase().includes('homologad')
        if (isWinner) grouped[c.cnpj].vitorias++
        if (c.porte && !grouped[c.cnpj].porte) grouped[c.cnpj].porte = c.porte
        if (c.cnae_nome && !grouped[c.cnpj].cnae_divisao) grouped[c.cnpj].cnae_divisao = c.cnae_nome
        if (c.uf_fornecedor && !grouped[c.cnpj].uf) grouped[c.cnpj].uf = c.uf_fornecedor
        if (c.municipio_fornecedor && !grouped[c.cnpj].municipio) grouped[c.cnpj].municipio = c.municipio_fornecedor
      }
      const basicResults = Object.entries(grouped).map(([cnpj, data]) => ({ cnpj, ...data }))
        .sort((a, b) => b.participacoes - a.participacoes)
        .slice(0, 20)

      // Enrich search results with competitor_stats data
      const searchCnpjs = basicResults.map((r) => r.cnpj)
      let searchStatsMap: Record<string, {
        win_rate: number; valor_total_ganho: number; desconto_medio: number
        ufs_atuacao: Record<string, boolean>; ultima_participacao: string | null
        total_participacoes: number; total_vitorias: number
        porte: string | null; uf: string | null; cnae_divisao: string | null
      }> = {}

      if (searchCnpjs.length > 0) {
        const { data: sStats } = await supabase
          .from('competitor_stats')
          .select('*')
          .in('cnpj', searchCnpjs)

        if (sStats) {
          for (const s of sStats) {
            searchStatsMap[s.cnpj] = {
              win_rate: Number(s.win_rate),
              valor_total_ganho: Number(s.valor_total_ganho || 0),
              desconto_medio: Number(s.desconto_medio || 0),
              ufs_atuacao: (s.ufs_atuacao as Record<string, boolean>) || {},
              ultima_participacao: s.ultima_participacao,
              total_participacoes: s.total_participacoes,
              total_vitorias: s.total_vitorias,
              porte: s.porte,
              uf: s.uf,
              cnae_divisao: s.cnae_divisao,
            }
          }
        }
      }

      searchResults = basicResults.map((r) => {
        const enriched = searchStatsMap[r.cnpj]
        if (enriched) {
          return {
            ...r,
            participacoes: enriched.total_participacoes,
            vitorias: enriched.total_vitorias,
            win_rate: enriched.win_rate,
            valor_total_ganho: enriched.valor_total_ganho,
            desconto_medio: enriched.desconto_medio,
            ufs_atuacao: enriched.ufs_atuacao,
            ultima_participacao: enriched.ultima_participacao,
            porte: enriched.porte || r.porte,
            cnae_divisao: enriched.cnae_divisao || undefined,
            uf: enriched.uf || r.uf,
            municipio: r.municipio,
            hasStats: true,
          }
        }
        return { ...r, hasStats: false }
      })
    }
  }

  // Enterprise gating
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('company_id', profile?.company_id || '')
    .eq('status', 'active')
    .limit(1)
    .single()

  const userPlan = subscription?.plan || 'trial'
  const isEnterprise = userPlan === 'enterprise'

  // Get company CNAE for market analysis (panorama tab)
  const { data: company } = await supabase
    .from('companies')
    .select('cnae_principal, cnaes_secundarios')
    .eq('id', profile?.company_id || '')
    .single()

  const companyCnaeDivisions: string[] = []
  if (company?.cnae_principal) companyCnaeDivisions.push(company.cnae_principal.substring(0, 2))
  if (company?.cnaes_secundarios) {
    for (const c of company.cnaes_secundarios as string[]) {
      const div = c.substring(0, 2)
      if (!companyCnaeDivisions.includes(div)) companyCnaeDivisions.push(div)
    }
  }

  // Fetch top competitors in user's CNAE (market panorama)
  let marketCompetitors: Array<Record<string, unknown>> = []
  if (companyCnaeDivisions.length > 0 && tab === 'panorama') {
    const { data } = await supabase
      .from('competitor_stats')
      .select('*')
      .order('total_participacoes', { ascending: false })
      .limit(50)

    // Filter to competitors who operate in same CNAE divisions
    marketCompetitors = (data || []).filter((s) => {
      const cnaeDivisao = (s.cnae_divisao as string) || ''
      return companyCnaeDivisions.includes(cnaeDivisao)
    }).slice(0, 10)
  }

  // Derive panorama analytics from market competitors
  const ufCompetitionMap: Record<string, { competitors: number; totalWinRate: number; totalDiscount: number }> = {}
  const modalidadeAgg: Record<string, { totalDiscount: number; totalParticipants: number; count: number }> = {}

  for (const mc of marketCompetitors) {
    const ufsAtua = (mc.ufs_atuacao as Record<string, boolean>) || {}
    const winRate = Number(mc.win_rate || 0)
    const discount = Number(mc.desconto_medio || 0)
    const mods = (mc.modalidades as Record<string, boolean>) || {}

    for (const uf of Object.keys(ufsAtua)) {
      if (!ufCompetitionMap[uf]) ufCompetitionMap[uf] = { competitors: 0, totalWinRate: 0, totalDiscount: 0 }
      ufCompetitionMap[uf].competitors++
      ufCompetitionMap[uf].totalWinRate += winRate
      ufCompetitionMap[uf].totalDiscount += discount
    }

    for (const modName of Object.keys(mods)) {
      if (!modalidadeAgg[modName]) modalidadeAgg[modName] = { totalDiscount: 0, totalParticipants: 0, count: 0 }
      modalidadeAgg[modName].totalDiscount += discount
      modalidadeAgg[modName].totalParticipants += Number(mc.total_participacoes || 0)
      modalidadeAgg[modName].count++
    }
  }

  // Find opportunity windows: UF+CNAE combos with few competitors
  const opportunityWindows: Array<{ uf: string; cnaeDiv: string; competitorCount: number }> = []
  if (tab === 'panorama') {
    const ufCnaeCounts: Record<string, number> = {}
    for (const mc of marketCompetitors) {
      const ufsAtua = (mc.ufs_atuacao as Record<string, boolean>) || {}
      const cnaeDiv = (mc.cnae_divisao as string) || ''
      if (cnaeDiv && companyCnaeDivisions.includes(cnaeDiv)) {
        for (const uf of Object.keys(ufsAtua)) {
          const key = `${uf}|${cnaeDiv}`
          ufCnaeCounts[key] = (ufCnaeCounts[key] || 0) + 1
        }
      }
    }
    for (const [key, count] of Object.entries(ufCnaeCounts)) {
      if (count <= 3) {
        const [uf, cnaeDiv] = key.split('|')
        opportunityWindows.push({ uf, cnaeDiv, competitorCount: count })
      }
    }
    opportunityWindows.sort((a, b) => a.competitorCount - b.competitorCount)
  }

  // ─── Mercado (Market Intelligence) Data ──────────────────────────────────
  let mercadoSectorStats: Array<{
    cnaeDiv: string; totalCompetitors: number; avgWinRate: number
    avgDiscount: number; totalValue: number
  }> = []
  let mercadoUfMap: Array<{
    uf: string; competitors: number; avgWinRate: number; opportunityScore: number
  }> = []
  let mercadoTopActive: Array<Record<string, unknown>> = []
  let mercadoWatchlistInSector: Array<{
    cnpj: string; nome: string; winRate: number; participacoes: number
  }> = []
  let mercadoCompetitors: MercadoCompetitor[] = []

  if (tab === 'mercado' && isEnterprise && companyCnaeDivisions.length > 0) {
    // Fetch all competitors in user's CNAE divisions
    const { data: sectorData } = await supabase
      .from('competitor_stats')
      .select('*')
      .order('total_participacoes', { ascending: false })
      .limit(500)

    const sectorFiltered = (sectorData || []).filter((s) => {
      const cnaeDiv = (s.cnae_divisao as string) || ''
      return companyCnaeDivisions.includes(cnaeDiv)
    })

    // Build MercadoCompetitor array for the client component, enriched with relevance
    mercadoCompetitors = sectorFiltered
      .filter((s) => {
        const rel = relevanceMap[s.cnpj as string]
        // Filter out irrelevant competitors (relevance_score < 30) when relevance data exists
        if (rel && rel.score < 30) return false
        return true
      })
      .map((s) => {
        const rel = relevanceMap[s.cnpj as string]
        return {
          cnpj: s.cnpj as string,
          razao_social: (s.razao_social as string) || null,
          porte: (s.porte as string) || null,
          cnae_divisao: (s.cnae_divisao as string) || null,
          uf: (s.uf as string) || null,
          total_participacoes: Number(s.total_participacoes || 0),
          total_vitorias: Number(s.total_vitorias || 0),
          win_rate: Number(s.win_rate || 0),
          valor_total_ganho: Number(s.valor_total_ganho || 0),
          desconto_medio: Number(s.desconto_medio || 0),
          ufs_atuacao: (s.ufs_atuacao as Record<string, boolean>) || {},
          ultima_participacao: (s.ultima_participacao as string) || null,
          segmento_ia: (s.segmento_ia as string) || null,
          nivel_ameaca: (s.nivel_ameaca as string) || null,
          isWatched: watchlistCnpjs.includes(s.cnpj as string),
          relevance_score: rel?.score ?? null,
          relationship_type: rel?.type ?? null,
          relevance_reason: rel?.reason ?? null,
        }
      })
      .sort((a, b) => {
        // Sort by relevance_score DESC if available, fallback to total_participacoes
        const aScore = a.relevance_score ?? -1
        const bScore = b.relevance_score ?? -1
        if (aScore !== bScore) return bScore - aScore
        return b.total_participacoes - a.total_participacoes
      })

    // A. Sector Overview - aggregate by CNAE division
    const cnaeDivAgg: Record<string, {
      count: number; totalWinRate: number; totalDiscount: number; totalValue: number
    }> = {}
    for (const s of sectorFiltered) {
      const div = (s.cnae_divisao as string) || ''
      if (!div) continue
      if (!cnaeDivAgg[div]) cnaeDivAgg[div] = { count: 0, totalWinRate: 0, totalDiscount: 0, totalValue: 0 }
      cnaeDivAgg[div].count++
      cnaeDivAgg[div].totalWinRate += Number(s.win_rate || 0)
      cnaeDivAgg[div].totalDiscount += Number(s.desconto_medio || 0)
      cnaeDivAgg[div].totalValue += Number(s.valor_total_ganho || 0)
    }
    mercadoSectorStats = Object.entries(cnaeDivAgg).map(([cnaeDiv, d]) => ({
      cnaeDiv,
      totalCompetitors: d.count,
      avgWinRate: d.count > 0 ? d.totalWinRate / d.count : 0,
      avgDiscount: d.count > 0 ? d.totalDiscount / d.count : 0,
      totalValue: d.totalValue,
    })).sort((a, b) => b.totalCompetitors - a.totalCompetitors)

    // B. Heat Map by UF
    const ufAgg: Record<string, { competitors: number; totalWinRate: number }> = {}
    for (const s of sectorFiltered) {
      const ufsAtua = (s.ufs_atuacao as Record<string, boolean>) || {}
      const wr = Number(s.win_rate || 0)
      for (const uf of Object.keys(ufsAtua)) {
        if (!ufAgg[uf]) ufAgg[uf] = { competitors: 0, totalWinRate: 0 }
        ufAgg[uf].competitors++
        ufAgg[uf].totalWinRate += wr
      }
    }
    const maxCompetitors = Math.max(...Object.values(ufAgg).map((v) => v.competitors), 1)
    mercadoUfMap = Object.entries(ufAgg).map(([uf, d]) => ({
      uf,
      competitors: d.competitors,
      avgWinRate: d.competitors > 0 ? d.totalWinRate / d.competitors : 0,
      opportunityScore: Math.round(100 - (d.competitors / maxCompetitors) * 100),
    })).sort((a, b) => a.competitors - b.competitors)

    // C. Top 10 most active competitors in sector
    mercadoTopActive = sectorFiltered.slice(0, 10)

    // D. Watchlist integration - which watchlisted competitors are in same CNAE
    if (watchlistCnpjs.length > 0) {
      for (const cnpj of watchlistCnpjs) {
        const match = sectorFiltered.find((s) => s.cnpj === cnpj)
        if (match) {
          const wEntry = (watchlist || []).find((w) => w.competitor_cnpj === cnpj)
          mercadoWatchlistInSector.push({
            cnpj,
            nome: wEntry?.competitor_nome || cnpj,
            winRate: Number(match.win_rate || 0),
            participacoes: Number(match.total_participacoes || 0),
          })
        }
      }
    }
  }

  // Top competitors by AI relevance (with frequency-based fallback)
  type RelevantCompetitor = {
    cnpj: string
    nome: string
    relevance_score: number | null
    relationship_type: string | null
    reason: string | null
    shared_tender_count: number
    count: number
    wins: number
    win_rate: number
    porte: string | null
    uf: string | null
    segmento_ia: string | null
    nivel_ameaca: string | null
  }
  let topCompetitors: RelevantCompetitor[] = []
  let rankingHasAiData = false
  let rankingSummary: { total_analyzed: number; direct_count: number; indirect_count: number; partner_count: number; avg_relevance: number; last_analyzed: string | null } | null = null

  if (profile?.company_id && tab === 'ranking') {
    // Helper: race a promise against a timeout (prevents page from hanging)
    const withTimeout = <T,>(promise: PromiseLike<T>, ms: number): Promise<T | null> =>
      Promise.race([
        Promise.resolve(promise),
        new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
      ])

    // Fetch AI-powered relevance data with 5s timeout — ALL competitors
    try {
      const [rpcResult, summaryResult] = await Promise.all([
        withTimeout(
          supabase.rpc('get_relevant_competitors', {
            p_company_id: profile.company_id,
            p_min_score: 0,
            p_limit: 50,
          }),
          5000,
        ),
        withTimeout(
          supabase.rpc('get_competitor_summary', {
            p_company_id: profile.company_id,
          }),
          5000,
        ),
      ])

      const relevantCompetitors = rpcResult && 'data' in rpcResult ? (rpcResult as any).data : null
      const summaryData = summaryResult && 'data' in summaryResult ? (summaryResult as any).data : null

      if (summaryData) {
        const sd = Array.isArray(summaryData) ? summaryData[0] : summaryData
        if (sd) {
          rankingSummary = {
            total_analyzed: (sd as any).total_analyzed ?? 0,
            direct_count: (sd as any).direct_count ?? 0,
            indirect_count: (sd as any).indirect_count ?? 0,
            partner_count: (sd as any).partner_count ?? 0,
            avg_relevance: (sd as any).avg_relevance ?? 0,
            last_analyzed: (sd as any).last_analyzed ?? null,
          }
        }
      }

      if (relevantCompetitors && relevantCompetitors.length > 0) {
        rankingHasAiData = true
        topCompetitors = relevantCompetitors.map((c: any) => ({
          cnpj: c.competitor_cnpj,
          nome: c.competitor_nome,
          relevance_score: c.relevance_score,
          relationship_type: c.relationship_type,
          reason: c.reason,
          shared_tender_count: c.shared_tender_count,
          count: c.total_participacoes || 0,
          wins: c.total_vitorias || 0,
          win_rate: c.win_rate || 0,
          porte: c.porte,
          uf: c.uf,
          segmento_ia: c.segmento_ia,
          nivel_ameaca: c.nivel_ameaca,
        }))
      }
    } catch (rpcErr) {
      // RPC failed or timed out — continue with fallback
      console.warn('Ranking RPCs failed/timed out, using fallback', rpcErr)
    }

    // Fallback: if no AI data yet, use frequency-based from ALL tenders (not just open ones)
    if (topCompetitors.length === 0) {
      const { data: matchedTenders } = await supabase
        .from('matches')
        .select('tender_id')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .limit(300)

      if (matchedTenders && matchedTenders.length > 0) {
        const tenderIds = [...new Set(matchedTenders.map((m) => m.tender_id))]
        // Fetch in batches to avoid URL length limits
        const allCompetitors: any[] = []
        for (let i = 0; i < tenderIds.length; i += 100) {
          const batch = tenderIds.slice(i, i + 100)
          const { data: batchData } = await supabase
            .from('competitors')
            .select('cnpj, nome, situacao, porte, cnae_nome, uf_fornecedor')
            .in('tender_id', batch)
            .not('cnpj', 'is', null)
          if (batchData) allCompetitors.push(...batchData)
        }

        if (allCompetitors.length > 0) {
          const grouped: Record<string, {
            nome: string; count: number; wins: number
            porte?: string; cnae_nome?: string; uf?: string
          }> = {}
          for (const c of allCompetitors) {
            if (!c.cnpj) continue
            if (!grouped[c.cnpj]) grouped[c.cnpj] = { nome: c.nome, count: 0, wins: 0 }
            grouped[c.cnpj].count++
            const isWinner = c.situacao && typeof c.situacao === 'string' && c.situacao.toLowerCase().includes('homologad')
            if (isWinner) grouped[c.cnpj].wins++
            if (c.porte && !grouped[c.cnpj].porte) grouped[c.cnpj].porte = c.porte
            if (c.cnae_nome && !grouped[c.cnpj].cnae_nome) grouped[c.cnpj].cnae_nome = c.cnae_nome
            if (c.uf_fornecedor && !grouped[c.cnpj].uf) grouped[c.cnpj].uf = c.uf_fornecedor
          }
          topCompetitors = Object.entries(grouped)
            .map(([cnpj, data]) => ({
              cnpj,
              nome: data.nome,
              relevance_score: null,
              relationship_type: null,
              reason: null,
              shared_tender_count: data.count,
              count: data.count,
              wins: data.wins,
              win_rate: data.count > 0 ? data.wins / data.count : 0,
              porte: data.porte || null,
              uf: data.uf || null,
              segmento_ia: null,
              nivel_ameaca: null,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30)
        }
      }
    }
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Inteligência Competitiva</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { key: 'mercado', label: 'Mercado' },
          { key: 'panorama', label: 'Panorama' },
          { key: 'ranking', label: 'Ranking' },
          { key: 'watchlist', label: 'Watchlist' },
          { key: 'comparativa', label: 'Comparativa' },
          { key: 'buscar', label: 'Buscar' },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/competitors?tab=${t.key}`}
            className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
              tab === t.key ? 'bg-brand text-white' : 'bg-gray-150 text-gray-900 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'watchlist' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Adicionar Concorrente</CardTitle>
            </CardHeader>
            <CardContent>
              <AddWatchlistForm companyId={profile?.company_id || ''} />
            </CardContent>
          </Card>

          <div>
            <h2 className="text-lg font-semibold mb-3">Sua Watchlist ({watchlist?.length || 0})</h2>
            {(!watchlist || watchlist.length === 0) ? (
              <Card>
                <CardContent>
                  <p className="text-center text-gray-400 py-6">Nenhum concorrente na watchlist. Adicione acima.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {watchlist.map((w) => {
                  const stats = watchlistStats[w.competitor_cnpj] || {
                    total_participacoes: 0, total_vitorias: 0, win_rate: 0,
                    valor_total_ganho: 0, desconto_medio: 0,
                    ufs_atuacao: {},
                    porte: null, cnae_divisao: null, uf: null,
                    ultima_participacao: null, overlapCount: 0,
                  }
                  const winRatePct = Math.round(stats.win_rate * 100)
                  const winRateColor = winRatePct >= 60 ? 'text-green-600' : winRatePct >= 30 ? 'text-yellow-600' : 'text-red-600'

                  // UFs where this competitor operates
                  const ufsList = Object.keys(stats.ufs_atuacao || {}).slice(0, 5)

                  // Activity trend based on ultima_participacao
                  let activityLabel = 'Inativo'
                  let activityVariant: 'default' | 'secondary' | 'destructive' = 'destructive'
                  if (stats.ultima_participacao) {
                    const daysSince = Math.floor((Date.now() - new Date(stats.ultima_participacao).getTime()) / (1000 * 60 * 60 * 24))
                    if (daysSince <= 30) { activityLabel = 'Ativo'; activityVariant = 'default' }
                    else if (daysSince <= 90) { activityLabel = 'Moderado'; activityVariant = 'secondary' }
                  }

                  const wRel = relevanceMap[w.competitor_cnpj]
                  const relBadgeConfig: Record<string, { className: string; label: string }> = {
                    concorrente_direto: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Direto' },
                    concorrente_indireto: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Indireto' },
                    potencial_parceiro: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Parceiro' },
                    irrelevante: { className: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Irrelevante' },
                  }
                  const wRelConfig = wRel?.type ? relBadgeConfig[wRel.type] : null

                  return (
                    <Card key={w.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="text-sm font-semibold truncate">{w.competitor_nome || formatCnpj(w.competitor_cnpj)}</CardTitle>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatCnpj(w.competitor_cnpj)}</p>
                            {stats.cnae_divisao && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate">CNAE Div. {stats.cnae_divisao}</p>
                            )}
                          </div>
                          <DeleteWatchlistButton watchlistId={w.id} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Activity + porte + location + relevance badges */}
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={activityVariant} className="text-xs">{activityLabel}</Badge>
                          {stats.porte && <Badge variant="outline" className="text-xs">{stats.porte}</Badge>}
                          {stats.uf && (
                            <Badge variant="outline" className="text-xs">{stats.uf}</Badge>
                          )}
                          {wRelConfig && (
                            <Badge variant="outline" className={`text-xs ${wRelConfig.className}`}>{wRelConfig.label}</Badge>
                          )}
                          {wRel && (
                            <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                              Relev. {wRel.score}
                            </Badge>
                          )}
                        </div>

                        {/* Key stats row */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className={`text-lg font-bold ${winRateColor}`}>{winRatePct}%</p>
                            <p className="text-xs text-muted-foreground">Win Rate</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold">{stats.total_participacoes}</p>
                            <p className="text-xs text-muted-foreground">Part.</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold">{stats.total_vitorias}</p>
                            <p className="text-xs text-muted-foreground">Vit.</p>
                          </div>
                        </div>

                        {/* Valor total ganho */}
                        {stats.valor_total_ganho > 0 && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Valor total ganho: </span>
                            <span className="font-medium">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.valor_total_ganho)}
                            </span>
                          </div>
                        )}

                        {/* UFs de atuacao */}
                        {ufsList.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">UFs de Atuacao</p>
                            <div className="flex flex-wrap gap-1">
                              {ufsList.map((uf) => (
                                <Badge key={uf} variant="outline" className="text-xs font-mono">{uf}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Overlap alert */}
                        {(stats.overlapCount || 0) > 0 && (
                          <div className="text-xs font-medium text-amber-600 bg-amber-50 rounded-md px-2 py-1.5">
                            Competindo com voce em {stats.overlapCount} UF{stats.overlapCount !== 1 ? 's' : ''}
                          </div>
                        )}

                        {/* Notes */}
                        {w.notes && (
                          <p className="text-xs text-gray-400 italic">{w.notes}</p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'ranking' && (
        <div className="space-y-4">
          {/* AI Analysis Status Banner */}
          {!rankingHasAiData && topCompetitors.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">Ranking por frequencia de co-participacao</p>
                <p className="text-xs text-amber-600">
                  A analise de IA sera aplicada automaticamente quando disponivel. Por enquanto, os concorrentes sao ordenados pela quantidade de licitacoes em comum.
                </p>
              </div>
            </div>
          )}

          {/* Summary Cards (when AI data available) */}
          {rankingHasAiData && rankingSummary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-lg border bg-white p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{rankingSummary.total_analyzed}</p>
                <p className="text-xs text-gray-500">Analisados</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{rankingSummary.direct_count}</p>
                <p className="text-xs text-red-600">Diretos</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{rankingSummary.indirect_count}</p>
                <p className="text-xs text-amber-600">Indiretos</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{rankingSummary.partner_count}</p>
                <p className="text-xs text-blue-600">Parceiros</p>
              </div>
              <div className="rounded-lg border bg-white p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{rankingSummary.avg_relevance ? Number(rankingSummary.avg_relevance).toFixed(0) : '-'}</p>
                <p className="text-xs text-gray-500">Score Medio</p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {rankingHasAiData ? 'Ranking de Concorrentes por IA' : 'Ranking por Frequencia'}
              </CardTitle>
              {rankingHasAiData && rankingSummary?.last_analyzed && (
                <p className="text-xs text-muted-foreground">
                  Ultima analise: {new Date(rankingSummary.last_analyzed).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {topCompetitors.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-600 font-medium">Analise de IA em andamento</p>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">
                    Seus concorrentes estao sendo analisados com inteligencia artificial para criar um ranking contextual preciso.
                    Os resultados aparecerao em breve.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topCompetitors.map((c, i) => {
                    const winRatePct = Math.round(c.win_rate * 100)
                    const scoreVal = c.relevance_score ?? 0
                    const scoreColor = scoreVal >= 80
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : scoreVal >= 60
                        ? 'text-blue-700 bg-blue-50 border-blue-200'
                        : scoreVal >= 40
                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : 'text-gray-600 bg-gray-50 border-gray-200'
                    const barColor = scoreVal >= 80 ? 'bg-emerald-500' : scoreVal >= 60 ? 'bg-blue-500' : scoreVal >= 40 ? 'bg-amber-500' : 'bg-gray-400'
                    const relationshipConfig: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
                      concorrente_direto: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Direto', icon: '🎯' },
                      concorrente_indireto: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Indireto', icon: '↔️' },
                      potencial_parceiro: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Parceiro', icon: '🤝' },
                    }
                    const relConfig = c.relationship_type ? relationshipConfig[c.relationship_type] : null
                    const isTopThreat = i < 3 && rankingHasAiData

                    return (
                      <div
                        key={c.cnpj}
                        className={`rounded-lg border p-4 transition-all hover:shadow-md ${isTopThreat ? 'border-orange-200 bg-orange-50/30' : 'bg-white hover:bg-gray-50/50'}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Rank number */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                            isTopThreat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {i + 1}
                          </div>

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-gray-900 truncate">
                                  {c.nome || formatCnpj(c.cnpj)}
                                </h3>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {relConfig && (
                                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${relConfig.bg} ${relConfig.text} ${relConfig.border}`}>
                                      <span>{relConfig.icon}</span> {relConfig.label}
                                    </span>
                                  )}
                                  {c.porte && (
                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{c.porte}</span>
                                  )}
                                  {c.uf && (
                                    <span className="text-xs text-gray-400">{c.uf}</span>
                                  )}
                                  {c.segmento_ia && (
                                    <span className="text-xs text-gray-400 hidden md:inline">• {c.segmento_ia}</span>
                                  )}
                                </div>
                              </div>

                              {/* Score badge */}
                              {rankingHasAiData && c.relevance_score != null && (
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${scoreColor} shrink-0`}>
                                  <span className="text-lg font-bold leading-none">{c.relevance_score}</span>
                                  <span className="text-[10px] font-medium opacity-70 leading-none">/100</span>
                                </div>
                              )}
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center gap-4 mt-2">
                              {rankingHasAiData && (
                                <div className="flex-1 max-w-[200px]">
                                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div
                                      className={`h-1.5 rounded-full ${barColor} transition-all duration-500`}
                                      style={{ width: `${scoreVal}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span title="Win Rate" className={`font-semibold ${winRatePct >= 50 ? 'text-green-600' : winRatePct >= 25 ? 'text-amber-600' : 'text-gray-500'}`}>
                                  {winRatePct}% WR
                                </span>
                                <span title="Participacoes">{c.count} part.</span>
                                <span title="Vitorias" className={c.wins > 0 ? 'text-green-600 font-medium' : ''}>
                                  {c.wins} vit.
                                </span>
                                {c.shared_tender_count > 0 && (
                                  <span title="Licitacoes em comum" className="text-blue-500">
                                    {c.shared_tender_count} em comum
                                  </span>
                                )}
                                {c.nivel_ameaca && (
                                  <span className={`font-medium ${
                                    c.nivel_ameaca === 'alto' ? 'text-red-600' : c.nivel_ameaca === 'medio' ? 'text-amber-600' : 'text-green-600'
                                  }`}>
                                    Ameaca {c.nivel_ameaca}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* AI reason (expandable) */}
                            {c.reason && (
                              <details className="mt-2">
                                <summary className="text-xs text-blue-500 cursor-pointer hover:text-blue-700 font-medium">
                                  Ver analise da IA
                                </summary>
                                <p className="text-xs text-gray-500 mt-1.5 pl-3 border-l-2 border-blue-200 leading-relaxed">{c.reason}</p>
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'mercado' && (
        <div className="space-y-4">
          {!isEnterprise ? (
            /* Non-enterprise: upgrade prompt */
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-4 max-w-md mx-auto">
                  <div className="text-4xl">&#x1f512;</div>
                  <h3 className="text-xl font-semibold">Inteligencia de Mercado</h3>
                  <p className="text-sm text-gray-500">Disponivel no plano Enterprise</p>
                  <p className="text-sm text-gray-400">
                    Acompanhe tendencias do seu setor, volume de licitacoes por UF, e identifique janelas de oportunidade com poucos concorrentes.
                  </p>
                  <Link
                    href="/billing"
                    className="inline-block px-6 py-2.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 text-sm font-medium"
                  >
                    Ver planos
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              {mercadoCompetitors.length > 0 && (
                <MercadoSummaryCards competitors={mercadoCompetitors} />
              )}

              {/* A. Visao Geral do Setor */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-5 bg-orange-500 rounded-full" />
                    Visao Geral do Setor
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mercadoSectorStats.length === 0 ? (
                    <p className="text-center text-gray-400 py-6">
                      {companyCnaeDivisions.length === 0
                        ? 'Configure o CNAE da sua empresa para ver dados de mercado.'
                        : 'Dados insuficientes para o seu segmento.'}
                    </p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {mercadoSectorStats.map((s) => (
                        <div key={s.cnaeDiv} className="border rounded-lg p-4 space-y-3 shadow-sm">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-sm">Divisao CNAE {s.cnaeDiv}</p>
                            <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                              {s.totalCompetitors} concorrente{s.totalCompetitors !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-lg font-bold text-orange-600">{(s.avgWinRate * 100).toFixed(1)}%</p>
                              <p className="text-xs text-muted-foreground">Win Rate Med.</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold">{(s.avgDiscount * 100).toFixed(1)}%</p>
                              <p className="text-xs text-muted-foreground">Desconto Med.</p>
                            </div>
                            <div>
                              <p className="text-sm font-bold">
                                {s.totalValue > 0
                                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(s.totalValue)
                                  : 'N/D'}
                              </p>
                              <p className="text-xs text-muted-foreground">Volume Total</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* B. Concorrentes por Segmento IA - sortable interactive table */}
              {mercadoCompetitors.length > 0 && (
                <MercadoTable competitors={mercadoCompetitors} />
              )}

              {/* C. Mapa de Calor por UF */}
              {mercadoUfMap.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="inline-block w-1.5 h-5 bg-orange-500 rounded-full" />
                      Mapa de Calor por UF
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full caption-bottom text-sm">
                        <thead className="[&_tr]:border-b">
                          <tr className="border-b transition-colors hover:bg-muted/50">
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">UF</th>
                            <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Concorrentes</th>
                            <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Win Rate Med.</th>
                            <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Oportunidade</th>
                          </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                          {mercadoUfMap.map((row) => {
                            const isOpportunity = row.competitors <= 3
                            return (
                              <tr key={row.uf} className={`border-b transition-colors hover:bg-muted/50 ${isOpportunity ? 'bg-green-50' : ''}`}>
                                <td className="p-4 text-sm font-medium">
                                  {row.uf}
                                  {isOpportunity && (
                                    <Badge variant="outline" className="ml-2 text-xs text-green-700 border-green-300">
                                      Janela de Oportunidade
                                    </Badge>
                                  )}
                                </td>
                                <td className="p-4 text-center">{row.competitors}</td>
                                <td className="p-4 text-center text-sm">{(row.avgWinRate * 100).toFixed(1)}%</td>
                                <td className="p-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="w-16 bg-gray-200 rounded-full h-2">
                                      <div
                                        className={`h-2 rounded-full ${row.opportunityScore >= 70 ? 'bg-green-500' : row.opportunityScore >= 40 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                        style={{ width: `${row.opportunityScore}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-medium">{row.opportunityScore}</span>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* D. Watchlist Integration */}
              {mercadoWatchlistInSector.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="inline-block w-1.5 h-5 bg-orange-500 rounded-full" />
                      Seus Concorrentes Monitorados no Setor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold text-orange-600">{mercadoWatchlistInSector.length}</p>
                          <p className="text-xs text-muted-foreground">Na watchlist & mesmo CNAE</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-orange-600">
                            {mercadoWatchlistInSector.length > 0
                              ? (mercadoWatchlistInSector.reduce((sum, w) => sum + w.winRate, 0) / mercadoWatchlistInSector.length * 100).toFixed(1)
                              : 0}%
                          </p>
                          <p className="text-xs text-muted-foreground">Win Rate Combinado</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-orange-600">
                            {mercadoWatchlistInSector.reduce((sum, w) => sum + w.participacoes, 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">Participacoes Totais</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {mercadoWatchlistInSector.map((w) => (
                        <div key={w.cnpj} className="border rounded-lg p-3 shadow-sm flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{w.nome}</p>
                            <p className="text-xs text-muted-foreground font-mono">{formatCnpj(w.cnpj)}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-sm font-bold text-orange-600">{(w.winRate * 100).toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground">{w.participacoes} part.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Empty state when no CNAE configured */}
              {companyCnaeDivisions.length === 0 && (
                <Card>
                  <CardContent className="py-12">
                    <p className="text-center text-gray-400">
                      Configure o CNAE da sua empresa nas configuracoes para ver a inteligencia de mercado.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'panorama' && (
        <div className="space-y-4">
          {/* Market Overview Summary Cards */}
          {marketCompetitors.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-orange-600">{marketCompetitors.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Concorrentes no Segmento</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-orange-600">
                      {marketCompetitors.length > 0
                        ? (marketCompetitors.reduce((sum, mc) => sum + Number(mc.total_participacoes || 0), 0) / marketCompetitors.length).toFixed(0)
                        : 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Media de Participacoes por Concorrente</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-orange-600">{Object.keys(ufCompetitionMap).length}</p>
                    <p className="text-xs text-muted-foreground mt-1">UFs com Atividade</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-orange-600">
                      {marketCompetitors.length > 0
                        ? (marketCompetitors.reduce((sum, mc) => sum + Number(mc.win_rate || 0), 0) / marketCompetitors.length * 100).toFixed(1)
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Win Rate Medio do Segmento</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* AI Relevance Summary */}
          {Object.keys(relevanceMap).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-5 bg-orange-500 rounded-full" />
                  Classificacao de Concorrentes por IA
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const allRels = Object.values(relevanceMap)
                  const diretos = allRels.filter((r) => r.type === 'concorrente_direto').length
                  const indiretos = allRels.filter((r) => r.type === 'concorrente_indireto').length
                  const parceiros = allRels.filter((r) => r.type === 'potencial_parceiro').length
                  return (
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="border rounded-lg p-4 border-red-200 bg-red-50">
                        <p className="text-2xl font-bold text-red-600">{diretos}</p>
                        <p className="text-xs text-red-700 mt-1">Concorrentes Diretos</p>
                      </div>
                      <div className="border rounded-lg p-4 border-yellow-200 bg-yellow-50">
                        <p className="text-2xl font-bold text-yellow-600">{indiretos}</p>
                        <p className="text-xs text-yellow-700 mt-1">Concorrentes Indiretos</p>
                      </div>
                      <div className="border rounded-lg p-4 border-blue-200 bg-blue-50">
                        <p className="text-2xl font-bold text-blue-600">{parceiros}</p>
                        <p className="text-xs text-blue-700 mt-1">Parceiros Potenciais</p>
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          )}

          {/* Distribution chart placeholder */}
          {marketCompetitors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Distribuicao de Concorrentes por Porte</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="h-48 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center"
                  data-chart="porte-distribution"
                  data-values={JSON.stringify(
                    (() => {
                      const porteCount: Record<string, number> = {}
                      for (const mc of marketCompetitors) {
                        const porte = (mc.porte as string) || 'N/D'
                        porteCount[porte] = (porteCount[porte] || 0) + 1
                      }
                      return porteCount
                    })()
                  )}
                >
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                      {(() => {
                        const porteCount: Record<string, number> = {}
                        for (const mc of marketCompetitors) {
                          const porte = (mc.porte as string) || 'N/D'
                          porteCount[porte] = (porteCount[porte] || 0) + 1
                        }
                        const colors: Record<string, string> = {
                          'ME': 'bg-blue-500',
                          'EPP': 'bg-indigo-500',
                          'MEDIO': 'bg-purple-500',
                          'DEMAIS': 'bg-gray-500',
                          'N/D': 'bg-gray-300',
                        }
                        const total = marketCompetitors.length
                        return Object.entries(porteCount)
                          .sort((a, b) => b[1] - a[1])
                          .map(([porte, count]) => (
                            <div key={porte} className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${colors[porte.toUpperCase()] || 'bg-gray-400'}`} />
                              <span className="text-sm font-medium">{porte}</span>
                              <span className="text-xs text-muted-foreground">
                                {count} ({Math.round((count / total) * 100)}%)
                              </span>
                            </div>
                          ))
                      })()}
                    </div>
                    {/* Visual bar representation */}
                    <div className="mt-4 flex h-6 rounded-full overflow-hidden w-80 mx-auto">
                      {(() => {
                        const porteCount: Record<string, number> = {}
                        for (const mc of marketCompetitors) {
                          const porte = (mc.porte as string) || 'N/D'
                          porteCount[porte] = (porteCount[porte] || 0) + 1
                        }
                        const colors: Record<string, string> = {
                          'ME': 'bg-blue-500',
                          'EPP': 'bg-indigo-500',
                          'MEDIO': 'bg-purple-500',
                          'DEMAIS': 'bg-gray-500',
                          'N/D': 'bg-gray-300',
                        }
                        const total = marketCompetitors.length
                        return Object.entries(porteCount)
                          .sort((a, b) => b[1] - a[1])
                          .map(([porte, count]) => (
                            <div
                              key={porte}
                              className={`${colors[porte.toUpperCase()] || 'bg-gray-400'}`}
                              style={{ width: `${(count / total) * 100}%` }}
                              title={`${porte}: ${count}`}
                            />
                          ))
                      })()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top 10 Competitors in CNAE */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Concorrentes no Seu Segmento</CardTitle>
            </CardHeader>
            <CardContent>
              {marketCompetitors.length === 0 ? (
                <p className="text-center text-gray-400 py-6">
                  {companyCnaeDivisions.length === 0
                    ? 'Configure o CNAE da sua empresa para ver o panorama de mercado.'
                    : 'Dados insuficientes. O panorama será exibido quando houver dados materializados.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-8">#</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Nome</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Part.</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Vit.</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Win Rate</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground hidden md:table-cell">Valor Ganho</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Porte</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">UF</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {marketCompetitors.map((mc, i) => (
                        <tr key={mc.cnpj as string} className="border-b transition-colors hover:bg-muted/50">
                          <td className="p-4 font-bold">{i + 1}</td>
                          <td className="p-4 text-sm font-medium">{(mc.razao_social as string) || '-'}</td>
                          <td className="p-4 text-center">{mc.total_participacoes as number}</td>
                          <td className="p-4 text-center">
                            <Badge variant={(mc.total_vitorias as number) > 0 ? 'default' : 'secondary'}>
                              {mc.total_vitorias as number}
                            </Badge>
                          </td>
                          <td className="p-4 text-center text-sm">
                            {`${(Number(mc.win_rate || 0) * 100).toFixed(1)}%`}
                          </td>
                          <td className="p-4 text-right text-sm hidden md:table-cell">
                            {Number(mc.valor_total_ganho || 0) > 0
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(mc.valor_total_ganho))
                              : '-'}
                          </td>
                          <td className="p-4 text-sm hidden md:table-cell">
                            {mc.porte ? (
                              <Badge variant="outline" className="text-xs">{mc.porte as string}</Badge>
                            ) : '-'}
                          </td>
                          <td className="p-4 text-sm text-gray-400 hidden md:table-cell">{(mc.uf as string) || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Competition by State */}
          {Object.keys(ufCompetitionMap).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Competição por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">UF</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Concorrentes</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Win Rate Médio</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Desconto Médio</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {Object.entries(ufCompetitionMap)
                        .sort((a, b) => a[1].competitors - b[1].competitors)
                        .map(([uf, data]) => {
                          const avgWinRate = data.competitors > 0 ? data.totalWinRate / data.competitors : 0
                          const avgDiscount = data.competitors > 0 ? data.totalDiscount / data.competitors : 0
                          const isLowCompetition = data.competitors <= 3
                          return (
                            <tr key={uf} className={`border-b transition-colors hover:bg-muted/50 ${isLowCompetition ? 'bg-green-50' : ''}`}>
                              <td className="p-4 text-sm font-medium">
                                {uf}
                                {isLowCompetition && (
                                  <Badge variant="outline" className="ml-2 text-xs text-green-700 border-green-300">Baixa concorrência</Badge>
                                )}
                              </td>
                              <td className="p-4 text-center">{data.competitors}</td>
                              <td className="p-4 text-center text-sm">{`${(avgWinRate * 100).toFixed(1)}%`}</td>
                              <td className="p-4 text-center text-sm">{`${(avgDiscount * 100).toFixed(1)}%`}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Desconto Médio por Modalidade */}
          {Object.keys(modalidadeAgg).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Desconto Médio por Modalidade</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Modalidade</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Desconto Médio</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Participantes Médios</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {Object.entries(modalidadeAgg)
                        .sort((a, b) => b[1].totalParticipants - a[1].totalParticipants)
                        .map(([modId, data]) => {
                          const avgDiscount = data.count > 0 ? data.totalDiscount / data.count : 0
                          const avgParticipants = data.count > 0 ? Math.round(data.totalParticipants / data.count) : 0
                          return (
                            <tr key={modId} className="border-b transition-colors hover:bg-muted/50">
                              <td className="p-4 text-sm font-medium">{modId}</td>
                              <td className="p-4 text-center text-sm">{`${(avgDiscount * 100).toFixed(1)}%`}</td>
                              <td className="p-4 text-center text-sm">{avgParticipants}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Janelas de Oportunidade */}
          {opportunityWindows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Janelas de Oportunidade</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4">
                  Combinações de UF e segmento CNAE com poucos concorrentes identificados.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {opportunityWindows.slice(0, 9).map((ow, i) => (
                    <div key={i} className="border rounded-lg p-3 bg-green-50 border-green-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-green-800">{ow.uf}</span>
                        <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                          {ow.competitorCount === 1 ? '1 concorrente' : `${ow.competitorCount} concorrentes`}
                        </Badge>
                      </div>
                      <div className="text-xs text-green-600">Divisão CNAE {ow.cnaeDiv}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'comparativa' && (
        <div className="space-y-4">
          {!isEnterprise ? (
            /* Non-enterprise: blurred preview with upsell CTA */
            <Card>
              <CardHeader>
                <CardTitle>Analise Comparativa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {/* Blurred preview */}
                  <div className="filter blur-sm pointer-events-none select-none space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-sm">Empresa Exemplo A</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-gray-500">Win Rate:</span> 45%</div>
                          <div><span className="text-gray-500">Part.:</span> 127</div>
                          <div><span className="text-gray-500">Ticket:</span> R$ 85.000</div>
                          <div><span className="text-gray-500">Desconto:</span> 12%</div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500">Top UFs</p>
                          <div className="h-3 bg-gray-200 rounded-full w-full" />
                          <div className="h-3 bg-gray-200 rounded-full w-3/4" />
                          <div className="h-3 bg-gray-200 rounded-full w-1/2" />
                        </div>
                      </div>
                      <div className="border rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-sm">Empresa Exemplo B</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-gray-500">Win Rate:</span> 32%</div>
                          <div><span className="text-gray-500">Part.:</span> 89</div>
                          <div><span className="text-gray-500">Ticket:</span> R$ 62.000</div>
                          <div><span className="text-gray-500">Desconto:</span> 18%</div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500">Top UFs</p>
                          <div className="h-3 bg-gray-200 rounded-full w-full" />
                          <div className="h-3 bg-gray-200 rounded-full w-2/3" />
                          <div className="h-3 bg-gray-200 rounded-full w-1/3" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Upsell overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 rounded-lg">
                    <div className="text-center space-y-3 max-w-sm">
                      <div className="text-3xl">&#x1f512;</div>
                      <h3 className="text-lg font-semibold">Recurso Enterprise</h3>
                      <p className="text-sm text-gray-500">
                        Compare concorrentes lado a lado com win rate, presenca geografica, pricing e pontos fortes/fracos.
                      </p>
                      <Link
                        href="/settings/billing"
                        className="inline-block px-6 py-2.5 bg-brand text-white rounded-md hover:bg-brand-dark text-sm font-medium"
                      >
                        Fazer Upgrade para Enterprise
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Enterprise: full comparative analysis */
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Analise Comparativa</CardTitle>
                </CardHeader>
                <CardContent>
                  {(!watchlist || watchlist.length < 2) ? (
                    <p className="text-center text-gray-400 py-6">
                      Adicione pelo menos 2 concorrentes na sua Watchlist para comparar.
                    </p>
                  ) : (
                    <div className="space-y-6">
                      {/* Selector hint */}
                      <p className="text-sm text-gray-500">
                        Comparando {watchlist.length} concorrentes da sua Watchlist lado a lado.
                      </p>

                      {/* Side-by-side comparison cards */}
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {watchlist.map((w) => {
                          const stats = watchlistStats[w.competitor_cnpj]
                          if (!stats) return null
                          const winRatePct = Math.round(stats.win_rate * 100)
                          const winRateColor = winRatePct >= 60 ? 'text-green-600' : winRatePct >= 30 ? 'text-yellow-600' : 'text-red-600'
                          const discountPct = stats.desconto_medio.toFixed(1)

                          const ufsList = Object.keys(stats.ufs_atuacao || {}).slice(0, 5)

                          // Strengths/weaknesses based on stats
                          const strengths: string[] = []
                          const weaknesses: string[] = []

                          if (winRatePct >= 50) strengths.push(`Win rate alto (${winRatePct}%)`)
                          else weaknesses.push(`Win rate baixo (${winRatePct}%)`)

                          if (stats.total_participacoes >= 50) strengths.push('Experiencia ampla em licitacoes')
                          else if (stats.total_participacoes < 10) weaknesses.push('Pouca experiencia em licitacoes')

                          if (Object.keys(stats.ufs_atuacao || {}).length >= 5) strengths.push('Presenca geografica diversificada')
                          else weaknesses.push('Presenca geografica limitada')

                          if (stats.desconto_medio > 15) strengths.push('Pricing agressivo')
                          else if (stats.desconto_medio < 5 && stats.desconto_medio > 0) weaknesses.push('Desconto conservador')

                          const cmpRel = relevanceMap[w.competitor_cnpj]
                          const cmpRelBadgeConfig: Record<string, { className: string; label: string }> = {
                            concorrente_direto: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Direto' },
                            concorrente_indireto: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Indireto' },
                            potencial_parceiro: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Parceiro' },
                            irrelevante: { className: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Irrelevante' },
                          }
                          const cmpRelConf = cmpRel?.type ? cmpRelBadgeConfig[cmpRel.type] : null

                          return (
                            <div key={w.id} className="border rounded-lg p-4 space-y-3">
                              <div>
                                <p className="font-semibold text-sm truncate">{w.competitor_nome || formatCnpj(w.competitor_cnpj)}</p>
                                <p className="text-xs text-muted-foreground font-mono">{formatCnpj(w.competitor_cnpj)}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {stats.porte && <Badge variant="outline" className="text-xs">{stats.porte}</Badge>}
                                  {stats.uf && (
                                    <Badge variant="outline" className="text-xs">{stats.uf}</Badge>
                                  )}
                                  {cmpRelConf && (
                                    <Badge variant="outline" className={`text-xs ${cmpRelConf.className}`}>{cmpRelConf.label}</Badge>
                                  )}
                                </div>
                              </div>

                              {/* Relevance score */}
                              {cmpRel && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Relevancia IA:</span>
                                  <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${cmpRel.score >= 80 ? 'bg-green-500' : cmpRel.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                      style={{ width: `${cmpRel.score}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-medium text-gray-600">{cmpRel.score}</span>
                                </div>
                              )}

                              {/* Key metrics */}
                              <div className="grid grid-cols-2 gap-2 text-center">
                                <div className="bg-gray-50 rounded p-2">
                                  <p className={`text-lg font-bold ${winRateColor}`}>{winRatePct}%</p>
                                  <p className="text-xs text-muted-foreground">Win Rate</p>
                                </div>
                                <div className="bg-gray-50 rounded p-2">
                                  <p className="text-lg font-bold">{stats.total_participacoes}</p>
                                  <p className="text-xs text-muted-foreground">Participacoes</p>
                                </div>
                                <div className="bg-gray-50 rounded p-2">
                                  <p className="text-sm font-bold">
                                    {stats.valor_total_ganho > 0
                                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.valor_total_ganho)
                                      : 'N/D'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Valor Total Ganho</p>
                                </div>
                                <div className="bg-gray-50 rounded p-2">
                                  <p className="text-sm font-bold">{discountPct}%</p>
                                  <p className="text-xs text-muted-foreground">Desconto Medio</p>
                                </div>
                              </div>

                              {/* Geographic presence */}
                              {ufsList.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground font-medium">Presenca Geografica</p>
                                  <div className="flex flex-wrap gap-1">
                                    {ufsList.map((uf) => (
                                      <Badge key={uf} variant="outline" className="text-xs font-mono">{uf}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Strengths */}
                              {strengths.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-green-700">Pontos Fortes</p>
                                  {strengths.map((s, i) => (
                                    <p key={i} className="text-xs text-green-600 flex items-start gap-1">
                                      <span className="mt-0.5">+</span> {s}
                                    </p>
                                  ))}
                                </div>
                              )}

                              {/* Weaknesses */}
                              {weaknesses.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-red-700">Pontos Fracos</p>
                                  {weaknesses.map((w, i) => (
                                    <p key={i} className="text-xs text-red-600 flex items-start gap-1">
                                      <span className="mt-0.5">-</span> {w}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Summary comparison table */}
                      {watchlist.length >= 2 && (
                        <div className="overflow-x-auto">
                          <table className="w-full caption-bottom text-sm">
                            <thead className="[&_tr]:border-b">
                              <tr className="border-b transition-colors">
                                <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground">Concorrente</th>
                                <th className="h-10 px-3 text-center align-middle font-medium text-muted-foreground">Win Rate</th>
                                <th className="h-10 px-3 text-center align-middle font-medium text-muted-foreground">Part.</th>
                                <th className="h-10 px-3 text-center align-middle font-medium text-muted-foreground">Vit.</th>
                                <th className="h-10 px-3 text-center align-middle font-medium text-muted-foreground hidden md:table-cell">Ticket</th>
                                <th className="h-10 px-3 text-center align-middle font-medium text-muted-foreground hidden md:table-cell">Desconto</th>
                                <th className="h-10 px-3 text-center align-middle font-medium text-muted-foreground hidden lg:table-cell">UFs</th>
                                <th className="h-10 px-3 text-center align-middle font-medium text-muted-foreground">Relev.</th>
                              </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                              {watchlist.map((w) => {
                                const stats = watchlistStats[w.competitor_cnpj]
                                if (!stats) return null
                                const winRatePct = Math.round(stats.win_rate * 100)
                                const winRateColor = winRatePct >= 60 ? 'text-green-600' : winRatePct >= 30 ? 'text-yellow-600' : 'text-red-600'
                                const tblRel = relevanceMap[w.competitor_cnpj]
                                return (
                                  <tr key={w.id} className="border-b transition-colors hover:bg-muted/50">
                                    <td className="p-3 text-sm font-medium truncate max-w-[200px]">
                                      {w.competitor_nome || formatCnpj(w.competitor_cnpj)}
                                    </td>
                                    <td className={`p-3 text-center font-bold ${winRateColor}`}>{winRatePct}%</td>
                                    <td className="p-3 text-center">{stats.total_participacoes}</td>
                                    <td className="p-3 text-center">{stats.total_vitorias}</td>
                                    <td className="p-3 text-center text-sm hidden md:table-cell">
                                      {stats.valor_total_ganho > 0
                                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.valor_total_ganho)
                                        : '-'}
                                    </td>
                                    <td className="p-3 text-center text-sm hidden md:table-cell">
                                      {`${stats.desconto_medio.toFixed(1)}%`}
                                    </td>
                                    <td className="p-3 text-center text-sm hidden lg:table-cell">
                                      {Object.keys(stats.ufs_atuacao || {}).length}
                                    </td>
                                    <td className="p-3 text-center">
                                      {tblRel ? (
                                        <span className="text-xs font-medium text-orange-600">{tblRel.score}</span>
                                      ) : (
                                        <span className="text-xs text-gray-300">--</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === 'buscar' && (
        <Card>
          <CardHeader>
            <CardTitle>Buscar Concorrente</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex gap-3 mb-6">
              <input type="hidden" name="tab" value="buscar" />
              <input
                name="q"
                type="text"
                defaultValue={searchQuery}
                placeholder="Buscar por CNPJ ou nome..."
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="h-10 px-4 bg-brand text-white rounded-md hover:bg-brand-dark text-sm"
              >
                Buscar
              </button>
            </form>

            {searchResults.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((c) => {
                  const winRatePct = c.hasStats && c.win_rate != null
                    ? Math.round(c.win_rate * 100)
                    : c.participacoes > 0 ? Math.round((c.vitorias / c.participacoes) * 100) : 0
                  const winRateColor = winRatePct >= 60 ? 'text-green-600' : winRatePct >= 30 ? 'text-yellow-600' : 'text-red-600'

                  const ufsList = c.hasStats && c.ufs_atuacao
                    ? Object.keys(c.ufs_atuacao).slice(0, 5)
                    : []

                  let activityLabel = 'Inativo'
                  let activityVariant: 'default' | 'secondary' | 'destructive' = 'destructive'
                  if (c.ultima_participacao) {
                    const daysSince = Math.floor((Date.now() - new Date(c.ultima_participacao).getTime()) / (1000 * 60 * 60 * 24))
                    if (daysSince <= 30) { activityLabel = 'Ativo'; activityVariant = 'default' }
                    else if (daysSince <= 90) { activityLabel = 'Moderado'; activityVariant = 'secondary' }
                  }

                  const sRel = relevanceMap[c.cnpj]
                  const sRelBadgeConfig: Record<string, { className: string; label: string }> = {
                    concorrente_direto: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Direto' },
                    concorrente_indireto: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Indireto' },
                    potencial_parceiro: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Parceiro' },
                    irrelevante: { className: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Irrelevante' },
                  }
                  const sRelConf = sRel?.type ? sRelBadgeConfig[sRel.type] : null

                  return (
                    <Card key={c.cnpj}>
                      <CardHeader className="pb-2">
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-semibold truncate">{c.nome || formatCnpj(c.cnpj)}</CardTitle>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatCnpj(c.cnpj)}</p>
                          {c.cnae_divisao && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">CNAE Div. {c.cnae_divisao}</p>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Badges */}
                        <div className="flex flex-wrap gap-1.5">
                          {c.hasStats && <Badge variant={activityVariant} className="text-xs">{activityLabel}</Badge>}
                          {c.porte && <Badge variant="outline" className="text-xs">{c.porte}</Badge>}
                          {c.municipio && c.uf && (
                            <Badge variant="outline" className="text-xs">{c.municipio}/{c.uf}</Badge>
                          )}
                          {!c.municipio && c.uf && (
                            <Badge variant="outline" className="text-xs">{c.uf}</Badge>
                          )}
                          {sRelConf && (
                            <Badge variant="outline" className={`text-xs ${sRelConf.className}`}>{sRelConf.label}</Badge>
                          )}
                          {sRel && (
                            <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                              Relev. {sRel.score}
                            </Badge>
                          )}
                        </div>

                        {/* Key stats */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className={`text-lg font-bold ${winRateColor}`}>{winRatePct}%</p>
                            <p className="text-xs text-muted-foreground">Win Rate</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold">{c.participacoes}</p>
                            <p className="text-xs text-muted-foreground">Part.</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold">{c.vitorias}</p>
                            <p className="text-xs text-muted-foreground">Vit.</p>
                          </div>
                        </div>

                        {/* Valor total ganho (only if stats available) */}
                        {c.hasStats && c.valor_total_ganho != null && c.valor_total_ganho > 0 && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Valor total ganho: </span>
                            <span className="font-medium">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(c.valor_total_ganho)}
                            </span>
                            {c.desconto_medio != null && c.desconto_medio > 0 && (
                              <span className="text-xs text-muted-foreground ml-2">
                                (desconto {c.desconto_medio.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )}

                        {/* UFs de atuacao (only if stats available) */}
                        {ufsList.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">UFs de Atuacao</p>
                            <div className="flex flex-wrap gap-1">
                              {ufsList.map((uf) => (
                                <Badge key={uf} variant="outline" className="text-xs font-mono">{uf}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {!c.hasStats && (
                          <p className="text-xs text-gray-400 italic">Dados detalhados indisponiveis (menos de 3 participacoes)</p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : searchQuery ? (
              <p className="text-center text-gray-400 py-6">Nenhum resultado para &quot;{searchQuery}&quot;</p>
            ) : (
              <p className="text-center text-gray-400 py-6">Digite um CNPJ ou nome para buscar</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}
