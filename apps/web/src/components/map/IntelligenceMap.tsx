'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import MapGL, { Source, Layer, Marker, Popup, NavigationControl } from 'react-map-gl/mapbox'
import type { MapRef, MapMouseEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { UF_CENTERS, REGIONS } from '@/lib/geo/uf-centers'
import { BRAZIL_GEOJSON_URL, STATE_NAME_TO_UF } from '@/lib/geo/brazil-states'
import {
  type UfMapData,
  type MatchMarker,
  formatCompactBRL,
} from '@/lib/geo/map-utils'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

interface IntelligenceMapProps {
  ufData: UfMapData[]
  matchMarkers: MatchMarker[]
  totalOpportunities: number
  totalValue: number
  bestUf: string | null
  companyId: string
}

function getScoreBgClass(score: number): string {
  if (score >= 70) return 'bg-emerald-100 text-emerald-800'
  if (score >= 50) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export function IntelligenceMap({
  ufData,
  matchMarkers: initialMarkers,
  totalOpportunities: _totalOpportunities,
  totalValue: _totalValue,
  bestUf,
  companyId: _companyId,
}: IntelligenceMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [geoJson, setGeoJson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [selectedUf, setSelectedUf] = useState<string | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<MatchMarker | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<MatchMarker[] | null>(null)
  const [scoreFilter, setScoreFilter] = useState(0)
  const [regionFilter, setRegionFilter] = useState<Set<string>>(new Set(REGIONS))

  // Matches are pre-triaged by the background AI worker — use directly
  const matchMarkers = initialMarkers

  // Build lookup
  const ufDataMap = useMemo(() => {
    const map = new Map<string, UfMapData>()
    for (const d of ufData) map.set(d.uf, d)
    return map
  }, [ufData])

  // Filter markers independently by their own score + region
  const filteredMarkers = useMemo(() => {
    const activeRegions = regionFilter
    // Build set of UFs in active regions
    const regionUfs = new Set<string>()
    for (const d of ufData) {
      if (activeRegions.has(d.region)) regionUfs.add(d.uf)
    }
    return matchMarkers.filter((m) => {
      if (m.score < scoreFilter) return false
      if (!regionUfs.has(m.uf)) return false
      return true
    })
  }, [matchMarkers, scoreFilter, regionFilter, ufData])

  // Group markers at the same coordinates to handle overlapping pins
  const groupedMarkers = useMemo(() => {
    const groups = new Map<string, MatchMarker[]>()
    for (const m of filteredMarkers) {
      // Round to 3 decimals (~110m) to group nearby markers
      const key = `${m.lat.toFixed(3)},${m.lng.toFixed(3)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }
    // Sort each group by score descending (best score first)
    const result: { best: MatchMarker; count: number; all: MatchMarker[] }[] = []
    for (const markers of groups.values()) {
      markers.sort((a, b) => b.score - a.score)
      result.push({ best: markers[0], count: markers.length, all: markers })
    }
    return result
  }, [filteredMarkers])

  // Recompute UF stats based on filtered markers (so sidebar reflects actual visible data)
  const filteredUfStats = useMemo(() => {
    const statsMap = new Map<string, {
      uf: string; name: string; region: string;
      count: number; totalValue: number; avgScore: number;
      maxScore: number; scoreSum: number;
    }>()

    for (const m of filteredMarkers) {
      const ufInfo = ufDataMap.get(m.uf)
      if (!ufInfo) continue

      if (!statsMap.has(m.uf)) {
        statsMap.set(m.uf, {
          uf: m.uf, name: ufInfo.name, region: ufInfo.region,
          count: 0, totalValue: 0, avgScore: 0, maxScore: 0, scoreSum: 0,
        })
      }
      const s = statsMap.get(m.uf)!
      s.count++
      s.totalValue += m.valor || 0
      s.scoreSum += m.score
      s.maxScore = Math.max(s.maxScore, m.score)
    }

    // Compute averages
    for (const s of statsMap.values()) {
      s.avgScore = s.count > 0 ? Math.round(s.scoreSum / s.count) : 0
    }

    return Array.from(statsMap.values()).sort((a, b) => {
      // Sort by: count desc, then avgScore desc
      if (b.count !== a.count) return b.count - a.count
      return b.avgScore - a.avgScore
    })
  }, [filteredMarkers, ufDataMap])

  // Also keep full UF data for detail panel
  const filteredUfData = useMemo(() => {
    return ufData.filter((d) => regionFilter.has(d.region))
  }, [ufData, regionFilter])

  const maxMatches = useMemo(() => {
    return Math.max(1, ...filteredUfData.map((d) => d.totalMatches))
  }, [filteredUfData])

  // Load GeoJSON and enrich with uf data
  useEffect(() => {
    fetch(BRAZIL_GEOJSON_URL)
      .then((res) => res.json())
      .then((data: GeoJSON.FeatureCollection) => {
        const enriched: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: data.features.map((feature) => {
            const name = feature.properties?.name || ''
            const uf = STATE_NAME_TO_UF[name] || ''
            const ufInfo = uf ? ufDataMap.get(uf) : null
            return {
              ...feature,
              properties: {
                ...feature.properties,
                uf,
                opportunityScore: ufInfo?.opportunityScore || 0,
                totalMatches: ufInfo?.totalMatches || 0,
                totalValue: ufInfo?.totalValue || 0,
                avgScore: ufInfo?.avgScore || 0,
              },
            }
          }),
        }
        setGeoJson(enriched)
      })
      .catch(console.error)
  }, [ufDataMap])

  // GeoJSON for individual match points (used by heatmap + circle layers)
  const matchPointsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: 'FeatureCollection',
      features: filteredMarkers.map((m) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [m.lng, m.lat],
        },
        properties: {
          matchId: m.matchId,
          score: m.score,
          valor: m.valor || 0,
          uf: m.uf,
          objeto: m.objeto,
          orgao: m.orgao,
          municipio: m.municipio || '',
          modalidade: m.modalidade || '',
          recomendacao: m.recomendacao || '',
          weight: m.score / 100,
        },
      })),
    }
  }, [filteredMarkers])

  // Handle click on UF
  const selectUf = useCallback(
    (uf: string) => {
      setSelectedUf(uf)
      setSelectedMatch(null)
      setSelectedGroup(null)
      const center = UF_CENTERS[uf]
      if (center && mapRef.current) {
        mapRef.current.flyTo({
          center: [center.lng, center.lat],
          zoom: 5.5,
          duration: 1200,
        })
      }
    },
    [],
  )

  const resetView = useCallback(() => {
    setSelectedUf(null)
    setSelectedMatch(null)
    setSelectedGroup(null)
    mapRef.current?.flyTo({
      center: [-52, -14],
      zoom: 3.8,
      duration: 1200,
    })
  }, [])

  // Toggle region filter
  const toggleRegion = useCallback((region: string) => {
    setRegionFilter((prev) => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })
  }, [])

  const selectedUfData = selectedUf ? ufDataMap.get(selectedUf) : null
  const selectedUfMarkers = useMemo(() => {
    if (!selectedUf) return []
    return filteredMarkers.filter((m) => m.uf === selectedUf)
  }, [selectedUf, filteredMarkers])

  // Stats for the selected UF based on filtered markers (not original data)
  const selectedUfFilteredStats = useMemo(() => {
    if (!selectedUfMarkers.length) return null
    const count = selectedUfMarkers.length
    const totalValue = selectedUfMarkers.reduce((s, m) => s + (m.valor || 0), 0)
    const avgScore = Math.round(selectedUfMarkers.reduce((s, m) => s + m.score, 0) / count)
    const maxScore = Math.max(...selectedUfMarkers.map((m) => m.score))
    return { count, totalValue, avgScore, maxScore }
  }, [selectedUfMarkers])

  // Choropleth fill layer style
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const fillLayer: any = {
    id: 'uf-fill',
    type: 'fill',
    paint: {
      'fill-color': [
        'interpolate',
        ['linear'],
        ['get', 'opportunityScore'],
        0, '#6B7280',
        20, '#EF4444',
        35, '#F97316',
        50, '#FBBF24',
        65, '#34D399',
        80, '#10B981',
      ],
      'fill-opacity': [
        'interpolate',
        ['linear'],
        ['get', 'totalMatches'],
        0, 0.15,
        maxMatches, 0.5,
      ],
    },
  }

  const lineLayer: any = {
    id: 'uf-line',
    type: 'line',
    paint: {
      'line-color': '#ffffff',
      'line-width': 1,
      'line-opacity': 0.3,
    },
  }

  // Score color for individual match markers
  function getMatchColor(score: number): string {
    if (score >= 70) return '#10B981'
    if (score >= 50) return '#FBBF24'
    return '#EF4444'
  }

  const heatmapLayer: any = {
    id: 'match-heatmap',
    type: 'heatmap',
    maxzoom: 7,
    paint: {
      'heatmap-weight': ['get', 'weight'],
      'heatmap-intensity': [
        'interpolate', ['linear'], ['zoom'],
        3, 0.8,
        7, 1.5,
      ],
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        3, 25,
        5, 40,
        7, 60,
      ],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.15, 'rgba(59,130,246,0.4)',
        0.3, 'rgba(139,92,246,0.5)',
        0.5, 'rgba(245,158,11,0.6)',
        0.7, 'rgba(239,68,68,0.7)',
        1, 'rgba(220,38,38,0.8)',
      ],
      'heatmap-opacity': [
        'interpolate', ['linear'], ['zoom'],
        5, 0.6,
        8, 0,
      ],
    },
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Handle click on circle layer
  const onMapClick = useCallback(
    (e: MapMouseEvent) => {
      const feature = e.features?.[0]
      if (feature?.properties?.matchId) {
        const marker = filteredMarkers.find(
          (m) => m.matchId === feature.properties!.matchId,
        )
        if (marker) {
          setSelectedMatch(marker)
          setSelectedUf(marker.uf)
        }
      }
    },
    [filteredMarkers],
  )

  return (
    <div className="flex flex-col md:flex-row h-full w-full">
      {/* Map — extra padding-bottom hides Mapbox attribution */}
      <div className="relative flex-1 min-h-[50vh] md:min-h-0 overflow-hidden">
        <div className="absolute inset-0" style={{ bottom: '-30px' }}>
          <MapGL
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            initialViewState={{
              longitude: -52,
              latitude: -14,
              zoom: 3.8,
            }}
            dragRotate={false}
            onClick={onMapClick}
            interactiveLayerIds={[]}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />

            {/* Choropleth base (subtle) */}
            {geoJson && (
              <Source id="brazil-states" type="geojson" data={geoJson}>
                <Layer {...fillLayer} />
                <Layer {...lineLayer} />
              </Source>
            )}

            {/* Heatmap layer for density visualization */}
            <Source id="match-points" type="geojson" data={matchPointsGeoJson}>
              <Layer {...heatmapLayer} />
            </Source>

            {/* Individual match markers — grouped by location */}
            {groupedMarkers.map(({ best: m, count, all }) => {
              const isAi = m.matchSource === 'ai' || m.matchSource === 'ai_triage' || m.matchSource === 'semantic'
              return (
              <Marker
                key={`match-${m.matchId}`}
                longitude={m.lng}
                latitude={m.lat}
                anchor="center"
                onClick={(e: { originalEvent: MouseEvent }) => {
                  e.originalEvent.stopPropagation()
                  setSelectedMatch(m)
                  setSelectedUf(m.uf)
                  setSelectedGroup(count > 1 ? all : null)
                }}
              >
                <div className="relative">
                  <div
                    className={`flex items-center justify-center rounded-full cursor-pointer shadow-lg transition-transform hover:scale-125 hover:z-50 ${
                      isAi ? 'border-2 border-blue-400/80' : 'border-2 border-white/50'
                    }`}
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: getMatchColor(m.score),
                    }}
                    title={`${m.objeto} — Score: ${m.score}${isAi ? ' (IA)' : ' (estimado)'}${count > 1 ? ` (+${count - 1} mais)` : ''}`}
                  >
                    <span className="text-white font-bold text-[11px] leading-none drop-shadow-sm">
                      {m.score}
                    </span>
                  </div>
                  {count > 1 && (
                    <div className="absolute -top-1.5 -right-1.5 bg-white text-gray-800 rounded-full min-w-[18px] h-[18px] flex items-center justify-center text-[9px] font-bold shadow-md border border-gray-200 px-0.5">
                      {count}
                    </div>
                  )}
                </div>
              </Marker>
              )
            })}

            {/* Popup when a match circle is clicked */}
            {selectedMatch && (
              <Popup
                longitude={selectedMatch.lng}
                latitude={selectedMatch.lat}
                closeButton={true}
                closeOnClick={false}
                onClose={() => { setSelectedMatch(null); setSelectedGroup(null) }}
                anchor="bottom"
                offset={15}
                className="!p-0"
                maxWidth="300px"
              >
                <div className="p-3 min-w-[220px]">
                  {selectedGroup && selectedGroup.length > 1 && (
                    <div className="mb-2 pb-2 border-b border-gray-200">
                      <p className="text-xs font-semibold text-gray-700">
                        {selectedGroup.length} oportunidades em {selectedMatch.municipio || selectedMatch.uf}
                      </p>
                    </div>
                  )}
                  {(selectedGroup && selectedGroup.length > 1 ? selectedGroup.slice(0, 5) : [selectedMatch]).map((match, idx) => (
                    <div key={match.matchId} className={idx > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${getScoreBgClass(match.score)}`}
                        >
                          {match.score}
                        </span>
                        <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${
                          match.matchSource === 'ai' || match.matchSource === 'ai_triage' || match.matchSource === 'semantic'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {match.matchSource === 'ai' || match.matchSource === 'ai_triage' || match.matchSource === 'semantic' ? 'IA' : 'estimado'}
                        </span>
                        {!selectedGroup && (
                          <span className="text-xs text-gray-500">
                            {match.municipio ? `${match.municipio}/${match.uf}` : match.uf}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-gray-900 leading-snug line-clamp-2 mb-1">
                        {match.objeto}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate mb-1">{match.orgao}</p>
                      <div className="flex items-center gap-3 text-[10px]">
                        {match.valor && (
                          <span className="font-medium text-emerald-600">
                            {formatCompactBRL(match.valor)}
                          </span>
                        )}
                        {match.modalidade && (
                          <span className="text-gray-400">{match.modalidade}</span>
                        )}
                      </div>
                      <Link
                        href={`/opportunities/${match.matchId}`}
                        className="mt-1 block text-xs font-medium text-brand hover:underline"
                      >
                        Ver detalhes &rarr;
                      </Link>
                    </div>
                  ))}
                  {selectedGroup && selectedGroup.length > 5 && (
                    <p className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500 text-center">
                      +{selectedGroup.length - 5} mais oportunidades — clique no estado para ver todas
                    </p>
                  )}
                </div>
              </Popup>
            )}
          </MapGL>
        </div>

        {/* Legend */}
        <div className="absolute bottom-2 left-4 z-10">
          <Card className="bg-black/70 border-white/10 p-3 text-white">
            <p className="text-xs font-semibold mb-2">Score do Match</p>
            <div className="flex items-center gap-1 mb-1">
              {[
                { color: '#10B981', label: '80+' },
                { color: '#FBBF24', label: '60-79' },
                { color: '#EF4444', label: '<60' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-full border border-white/30"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[10px] text-gray-300">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-3 h-3 rounded-full border-2 border-blue-400 bg-gray-500" />
              <span className="text-[9px] text-gray-300">Verificado por IA</span>
            </div>
            <p className="text-[9px] text-gray-400 mt-1">
              {filteredMarkers.length} matches no mapa
            </p>
          </Card>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full md:w-[30%] md:min-w-[320px] md:max-w-[400px] h-1/3 md:h-full overflow-y-auto bg-white border-t md:border-t-0 md:border-l border-gray-200">
        {/* Header metrics — always reflect filtered data */}
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Mapa de Inteligencia</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-xl font-bold text-brand">{filteredMarkers.length}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Oportunidades</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-emerald-600">
                {formatCompactBRL(filteredMarkers.reduce((s, m) => s + (m.valor || 0), 0))}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor Total</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-amber-600">
                {filteredUfStats.length > 0 ? filteredUfStats[0].uf : '-'}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                {filteredUfStats.length > 0 ? `${filteredUfStats[0].count} matches` : 'Melhor UF'}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-100">
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">
                Score minimo: {scoreFilter > 0 ? scoreFilter : 'Todos'}
              </label>
              {scoreFilter > 0 && (
                <button
                  onClick={() => setScoreFilter(0)}
                  className="text-[10px] text-brand hover:underline"
                >
                  Limpar
                </button>
              )}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={scoreFilter}
              onChange={(e) => setScoreFilter(Number(e.target.value))}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand"
            />
            <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Regioes</label>
            <div className="flex flex-wrap gap-1.5">
              {REGIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => toggleRegion(r)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    regionFilter.has(r)
                      ? 'bg-brand text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content: ranking or detail */}
        <div className="p-4">
          {selectedUf && selectedUfData ? (
            /* UF Detail Panel */
            <div>
              <button
                onClick={resetView}
                className="text-xs text-brand hover:underline mb-3 flex items-center gap-1"
              >
                &larr; Voltar ao ranking
              </button>

              <h3 className="text-lg font-bold mb-3">{selectedUfData.name} ({selectedUf})</h3>

              {/* Metrics grid — uses filtered stats so numbers match the list below */}
              {selectedUfFilteredStats ? (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500">Oportunidades</p>
                    <p className="text-lg font-bold">{selectedUfFilteredStats.count}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500">Valor Total</p>
                    <p className="text-lg font-bold">{formatCompactBRL(selectedUfFilteredStats.totalValue)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500">Score Medio</p>
                    <p className="text-lg font-bold">
                      <span className={selectedUfFilteredStats.avgScore >= 70 ? 'text-emerald-600' : selectedUfFilteredStats.avgScore >= 50 ? 'text-amber-600' : 'text-red-500'}>
                        {selectedUfFilteredStats.avgScore}
                      </span>
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500">Maior Score</p>
                    <p className="text-lg font-bold">
                      <span className={selectedUfFilteredStats.maxScore >= 70 ? 'text-emerald-600' : selectedUfFilteredStats.maxScore >= 50 ? 'text-amber-600' : 'text-red-500'}>
                        {selectedUfFilteredStats.maxScore}
                      </span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-4">Nenhuma oportunidade com os filtros atuais</p>
              )}

              {/* List all matches in this UF */}
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                {selectedUfMarkers.length} oportunidade{selectedUfMarkers.length !== 1 ? 's' : ''}
              </h4>
              <div className="space-y-2">
                {selectedUfMarkers.map((m: MatchMarker) => (
                  <Link
                    key={m.matchId}
                    href={`/opportunities/${m.matchId}`}
                    className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    onMouseEnter={() => setSelectedMatch(m)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                        <span
                          className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold text-white ${
                            m.matchSource === 'ai' || m.matchSource === 'ai_triage' || m.matchSource === 'semantic' ? 'ring-2 ring-blue-400' : ''
                          }`}
                          style={{ backgroundColor: getMatchColor(m.score) }}
                        >
                          {m.score}
                        </span>
                        <span className={`text-[8px] font-medium ${
                          m.matchSource === 'ai' || m.matchSource === 'ai_triage' || m.matchSource === 'semantic' ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                          {m.matchSource === 'ai' || m.matchSource === 'ai_triage' || m.matchSource === 'semantic' ? 'IA' : 'est.'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 leading-snug line-clamp-2">
                          {m.objeto}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1 truncate">{m.orgao}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {m.municipio && (
                            <span className="text-[10px] text-blue-500">{m.municipio}</span>
                          )}
                          {m.valor && (
                            <span className="text-[10px] font-medium text-emerald-600">
                              {formatCompactBRL(m.valor)}
                            </span>
                          )}
                          {m.modalidade && (
                            <span className="text-[10px] text-gray-400">{m.modalidade}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {selectedUfMarkers.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    Nenhuma oportunidade encontrada com os filtros atuais
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Ranking by UF — computed from filtered markers */
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Ranking por Estado ({filteredUfStats.length} UFs)
              </h3>
              <div className="space-y-1.5">
                {filteredUfStats.slice(0, 15).map((d, index) => (
                  <button
                    key={d.uf}
                    onClick={() => selectUf(d.uf)}
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="text-xs text-gray-400 w-4">{index + 1}</span>
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gray-700">
                      {d.uf}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{d.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {d.count} oportunidade{d.count !== 1 ? 's' : ''} &middot; {formatCompactBRL(d.totalValue)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold" style={{ color: getMatchColor(d.avgScore) }}>
                        {d.avgScore}
                      </p>
                      <p className="text-[9px] text-gray-400">score medio</p>
                    </div>
                  </button>
                ))}
                {filteredUfStats.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">
                    Nenhuma oportunidade encontrada com os filtros atuais
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
