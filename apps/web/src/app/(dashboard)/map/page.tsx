import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IntelligenceMap } from '@/components/map/IntelligenceMap'
import { UF_CENTERS } from '@/lib/geo/uf-centers'
import { calculateUfOpportunityScore, type UfMapData, type MatchMarker } from '@/lib/geo/map-utils'
import { batchGetMunicipalityCoords } from '@/lib/geo/municipalities'
import { MIN_DISPLAY_SCORE, AI_VERIFIED_SOURCES } from '@/lib/cache'

// Force dynamic rendering — map must always show fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

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

  // ── Query matches directly (always fresh, no stale cache) ────────────────
  const PAGE_SIZE = 1000
  const today = new Date().toISOString().split('T')[0]
  const liveData: any[] = []

  for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
    const { data: page } = await supabase
      .from('matches')
      .select(`
        id, score, is_hot, match_source, recomendacao,
        tenders!inner (
          id, objeto, orgao_nome, uf, municipio,
          valor_estimado, modalidade_nome, modalidade_id,
          data_abertura, data_encerramento, status
        )
      `)
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', MIN_DISPLAY_SCORE)
      .not('tenders.modalidade_id', 'in', '(9,12,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (!page || page.length === 0) break
    liveData.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  const matches = liveData.map((m: any) => {
    const t = m.tenders as Record<string, any>
    return {
      id: m.id as string,
      score: m.score as number,
      status: 'new' as string,
      recomendacao: m.recomendacao as string | null,
      match_source: (m.match_source || 'ai_triage') as string,
      is_hot: m.is_hot as boolean,
      competition_score: null as number | null,
      tenders: {
        id: t.id as string,
        objeto: (t.objeto || '') as string,
        orgao_nome: (t.orgao_nome || '') as string,
        uf: (t.uf || '') as string,
        municipio: t.municipio as string | null,
        valor_estimado: t.valor_estimado as number | null,
        modalidade_nome: t.modalidade_nome as string | null,
        modalidade_id: t.modalidade_id as number,
        data_abertura: t.data_abertura as string | null,
        data_encerramento: t.data_encerramento as string | null,
        status: t.status as string,
        cnae_classificados: null,
      },
    }
  })

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

    // Use exact coords if available, otherwise fall back to UF center
    const finalCoords = coords || UF_CENTERS[uf]
    if (finalCoords) {
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
        lat: finalCoords.lat,
        lng: finalCoords.lng,
        isHot: match.score >= 80,
        competitionScore: (match as unknown as Record<string, unknown>).competition_score as number | null ?? null,
        dataEncerramento: tender.data_encerramento as string | null,
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

  return (
    <div className="-m-4 md:-m-8 w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] h-[calc(100vh-3.5rem)] md:h-screen overflow-hidden">
      <IntelligenceMap
        ufData={ufData}
        matchMarkers={matchMarkers}
      />
    </div>
  )
}
