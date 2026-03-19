import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IntelligenceMap } from '@/components/map/IntelligenceMap'
import { UF_CENTERS } from '@/lib/geo/uf-centers'
import { calculateUfOpportunityScore, type UfMapData, type MatchMarker } from '@/lib/geo/map-utils'
import { batchGetMunicipalityCoords } from '@/lib/geo/municipalities'
// MIN_DISPLAY_SCORE and AI_VERIFIED_SOURCES now handled inside get_map_matches RPC

export default async function MapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) redirect('/company')

  const companyId = profile.company_id

  // Read pre-computed map cache (paginated — Supabase caps at 1000 rows per request)
  const PAGE_SIZE = 1000
  const cacheData: any[] = []
  for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
    const { data: page } = await supabase
      .from('map_cache')
      .select('*')
      .eq('company_id', companyId)
      .order('score', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (!page || page.length === 0) break
    cacheData.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  // Transform cache rows into the shape the rest of the page expects
  const matches = (cacheData || []).map((r) => ({
    id: r.match_id as string,
    score: r.score as number,
    status: 'new' as string,
    recomendacao: null as string | null,
    match_source: (r.match_source || 'ai_triage') as string,
    is_hot: r.is_hot as boolean,
    competition_score: null as number | null,
    tenders: {
      id: r.tender_id as string,
      objeto: (r.objeto || '') as string,
      orgao_nome: (r.orgao_nome || '') as string,
      uf: (r.uf || '') as string,
      municipio: r.municipio as string | null,
      valor_estimado: r.valor_estimado as number | null,
      modalidade_nome: r.modalidade_nome as string | null,
      modalidade_id: 0 as number,
      data_abertura: r.data_abertura as string | null,
      data_encerramento: r.data_encerramento as string | null,
      status: 'active' as string,
      cnae_classificados: null,
    },
  }))

  // Resolve coordenadas de todos os municípios em batch
  const municipioItems = (matches || [])
    .map((m) => {
      const t = m.tenders as unknown as Record<string, unknown>
      return t ? { municipio: t.municipio as string | null, uf: t.uf as string | null } : null
    })
    .filter((x): x is { municipio: string | null; uf: string | null } => x !== null)

  const coordsMap = await batchGetMunicipalityCoords(municipioItems)

  // Build individual match markers + aggregate by UF
  const matchMarkers: MatchMarker[] = []
  const ufMap = new Map<string, UfMapData>()

  for (const match of matches || []) {
    const tender = match.tenders as unknown as Record<string, unknown>
    if (!tender) continue
    const uf = (tender.uf as string) || ''
    if (!uf || !UF_CENTERS[uf]) continue

    const municipio = (tender.municipio as string) || null
    const coordKey = `${municipio || ''}|${uf}`
    const coords = coordsMap.get(coordKey)

    if (coords) {
      matchMarkers.push({
        matchId: match.id,
        tenderId: tender.id as string,
        objeto: ((tender.objeto as string) || '').slice(0, 120),
        orgao: ((tender.orgao_nome as string) || '').slice(0, 60),
        uf,
        municipio,
        score: match.score,
        matchSource: (match.match_source as string) || 'keyword',
        valor: tender.valor_estimado as number | null,
        modalidade: tender.modalidade_nome as string | null,
        recomendacao: match.recomendacao as string | null,
        lat: coords.lat,
        lng: coords.lng,
        isHot: (match as unknown as Record<string, unknown>).is_hot === true,
        competitionScore: (match as unknown as Record<string, unknown>).competition_score as number | null ?? null,
      })
    }

    // Aggregate by UF
    const ufInfo = UF_CENTERS[uf]

    if (!ufMap.has(uf)) {
      ufMap.set(uf, {
        uf,
        name: ufInfo.name,
        region: ufInfo.region,
        totalMatches: 0,
        avgScore: 0,
        maxScore: 0,
        highScoreCount: 0,
        totalValue: 0,
        avgValue: 0,
        avgCompetitors: null,
        lowCompetitionCount: 0,
        opportunityScore: 0,
        topTenders: [],
      })
    }

    const data = ufMap.get(uf)!
    data.totalMatches++
    data.avgScore = ((data.avgScore * (data.totalMatches - 1)) + match.score) / data.totalMatches
    data.maxScore = Math.max(data.maxScore, match.score)
    if (match.score >= 70) data.highScoreCount++

    const valor = (tender.valor_estimado as number) || 0
    data.totalValue += valor

    if (data.topTenders.length < 5) {
      data.topTenders.push({
        id: tender.id as string,
        matchId: match.id,
        objeto: ((tender.objeto as string) || '').slice(0, 120),
        score: match.score,
        valor: tender.valor_estimado as number | null,
        orgao: ((tender.orgao_nome as string) || '').slice(0, 60),
        modalidade: tender.modalidade_nome as string | null,
      })
    }
  }

  for (const data of ufMap.values()) {
    data.avgValue = data.totalMatches > 0 ? data.totalValue / data.totalMatches : 0
    data.opportunityScore = calculateUfOpportunityScore({
      avgScore: data.avgScore,
      highScoreCount: data.highScoreCount,
      totalMatches: data.totalMatches,
      avgCompetitors: data.avgCompetitors,
      totalValue: data.totalValue,
    })
  }

  const ufData = Array.from(ufMap.values())
    .sort((a, b) => b.opportunityScore - a.opportunityScore)

  const totalOpportunities = ufData.reduce((sum, d) => sum + d.totalMatches, 0)
  const totalValue = ufData.reduce((sum, d) => sum + d.totalValue, 0)
  const bestUf = ufData[0] || null

  return (
    <div className="-m-4 md:-m-8 w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] h-[calc(100vh-3.5rem)] md:h-screen overflow-hidden">
      <IntelligenceMap
        ufData={ufData}
        matchMarkers={matchMarkers}
        totalOpportunities={totalOpportunities}
        totalValue={totalValue}
        bestUf={bestUf?.uf || null}
        companyId={companyId}
      />
    </div>
  )
}
