import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IntelligenceMap } from '@/components/map/IntelligenceMap'
import { UF_CENTERS } from '@/lib/geo/uf-centers'
import { calculateUfOpportunityScore, type UfMapData, type MatchMarker } from '@/lib/geo/map-utils'
import { batchGetMunicipalityCoords } from '@/lib/geo/municipalities'
import { MIN_DISPLAY_SCORE, AI_VERIFIED_SOURCES } from '@/lib/cache'

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

  // Map shows only AI-verified matches (score >= 40, source ai/ai_triage)
  // Split into 2 queries to avoid inner join timeout with 28K+ matches:
  // 1. Fetch top matches (fast — no join)
  // 2. Fetch their tenders in batch (fast — by IDs)
  const today = new Date().toISOString().split('T')[0]
  const { data: rawMatches } = await supabase
    .from('matches')
    .select('id, score, status, recomendacao, match_source, is_hot, competition_score, tender_id')
    .eq('company_id', companyId)
    .in('match_source', [...AI_VERIFIED_SOURCES])
    .gte('score', MIN_DISPLAY_SCORE)
    .order('score', { ascending: false })
    .limit(500)

  // Batch-fetch tenders for these matches
  const tenderIds = [...new Set((rawMatches || []).map((m) => m.tender_id).filter(Boolean))]
  const tenderMap = new Map<string, Record<string, unknown>>()

  if (tenderIds.length > 0) {
    // Fetch in chunks of 200 to avoid URL length limits
    for (let i = 0; i < tenderIds.length; i += 200) {
      const chunk = tenderIds.slice(i, i + 200)
      const { data: tenders } = await supabase
        .from('tenders')
        .select('id, objeto, orgao_nome, uf, municipio, valor_estimado, modalidade_nome, modalidade_id, data_abertura, data_encerramento, status, cnae_classificados')
        .in('id', chunk)
      for (const t of tenders || []) {
        tenderMap.set(t.id, t as Record<string, unknown>)
      }
    }
  }

  // Join in-memory and apply tender filters (modalidade, expiry)
  const matches = (rawMatches || [])
    .map((m) => {
      const t = tenderMap.get(m.tender_id)
      if (!t) return null
      // Filter: exclude non-competitive modalidades
      if (t.modalidade_id === 9 || t.modalidade_id === 14) return null
      // Filter: exclude expired tenders
      if (t.data_encerramento && (t.data_encerramento as string) < today) return null
      return { ...m, tenders: t }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)

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
