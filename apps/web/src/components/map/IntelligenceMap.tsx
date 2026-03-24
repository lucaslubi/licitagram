'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import MapGL, { Source, Layer, Marker, Popup, NavigationControl } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
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
}

// ─── Pure helpers (no state/props dependency) ───────────────────────────────

function getScoreBgClass(score: number): string {
  if (score >= 70) return 'bg-emerald-100 text-emerald-800'
  if (score >= 50) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

/** Score color for individual match markers */
function getMatchColor(score: number): string {
  if (score >= 70) return '#10B981'
  if (score >= 50) return '#FBBF24'
  return '#EF4444'
}

/** Whether the match was scored by AI (as opposed to keyword-only estimate) */
function isAiMatch(m: MatchMarker): boolean {
  return m.matchSource === 'ai' || m.matchSource === 'ai_triage' || m.matchSource === 'semantic'
}

/** Days until tender closes. Negative = already closed, null = no date */
function daysUntilClose(dataEncerramento: string | null): number | null {
  if (!dataEncerramento) return null
  return Math.ceil((new Date(dataEncerramento).getTime() - Date.now()) / 86400000)
}

/** Render a deadline badge if closing soon or missing */
function DeadlineBadge({ dataEncerramento, className = '' }: { dataEncerramento: string | null; className?: string }) {
  const days = daysUntilClose(dataEncerramento)
  if (days !== null && days > 3) return null
  if (days !== null) {
    return <span className={`text-red-600 font-medium ${className}`}>⏰ {days <= 0 ? 'HOJE' : `${days}d`}</span>
  }
  return <span className={`text-amber-600 ${className}`}>⚠️ Prazo</span>
}

type SheetPosition = 'collapsed' | 'half' | 'full'

// ─── Component ──────────────────────────────────────────────────────────────

export function IntelligenceMap({
  ufData,
  matchMarkers: initialMarkers,
}: IntelligenceMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [geoJson, setGeoJson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [selectedUf, setSelectedUf] = useState<string | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<MatchMarker | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<MatchMarker[] | null>(null)
  const [scoreFilter, setScoreFilter] = useState(50)
  const [minValor, setMinValor] = useState(0)
  const [regionFilter, setRegionFilter] = useState<Set<string>>(new Set(REGIONS))

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)
  const [sheetPosition, setSheetPosition] = useState<SheetPosition>('half')
  const touchStartY = useRef<number>(0)
  const touchStartSheetPos = useRef<SheetPosition>('half')

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Sheet height calculation
  const sheetHeight = useMemo(() => {
    switch (sheetPosition) {
      case 'collapsed': return '80px'
      case 'half': return '50vh'
      case 'full': return 'calc(100vh - 40px)'
    }
  }, [sheetPosition])

  // Touch handlers for drag
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchStartSheetPos.current = sheetPosition
  }, [sheetPosition])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = touchStartY.current - e.changedTouches[0].clientY
    const threshold = 50

    if (deltaY > threshold) {
      // Swiped up — expand
      if (touchStartSheetPos.current === 'collapsed') setSheetPosition('half')
      else if (touchStartSheetPos.current === 'half') setSheetPosition('full')
    } else if (deltaY < -threshold) {
      // Swiped down — collapse
      if (touchStartSheetPos.current === 'full') setSheetPosition('half')
      else if (touchStartSheetPos.current === 'half') setSheetPosition('collapsed')
    }
  }, [])

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
      if (minValor > 0 && (m.valor || 0) < minValor) return false
      return true
    })
  }, [matchMarkers, scoreFilter, minValor, regionFilter, ufData])

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
    // Sort: low score first (bottom layer), high score last (top layer), hot on top
    // DOM order = render order in Mapbox GL — last rendered = visually on top
    result.sort((a, b) => {
      // Hot markers always on top
      if (a.best.isHot && !b.best.isHot) return 1
      if (!a.best.isHot && b.best.isHot) return -1
      // Then by score ascending (low scores rendered first = behind)
      return a.best.score - b.best.score
    })
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
    const controller = new AbortController()
    fetch(BRAZIL_GEOJSON_URL, { signal: controller.signal })
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
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err)
      })
    return () => controller.abort()
  }, [ufDataMap])

  // GeoJSON for individual match points (used by heatmap layer)
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
    const ufMatches = filteredMarkers.filter((m) => m.uf === selectedUf)
    // Hot matches first, then by score descending
    return ufMatches.sort((a, b) => {
      if (a.isHot !== b.isHot) return a.isHot ? -1 : 1
      return b.score - a.score
    })
  }, [selectedUf, filteredMarkers])

  // Stats for the selected UF based on filtered markers (not original data)
  const selectedUfFilteredStats = useMemo(() => {
    if (!selectedUfMarkers.length) return null
    const count = selectedUfMarkers.length
    const totalValue = selectedUfMarkers.reduce((s, m) => s + (m.valor || 0), 0)
    const avgScore = Math.round(selectedUfMarkers.reduce((s, m) => s + m.score, 0) / count)
    const maxScore = Math.max(...selectedUfMarkers.map((m) => m.score))
    const hotCount = selectedUfMarkers.filter((m) => m.isHot).length
    return { count, totalValue, avgScore, maxScore, hotCount }
  }, [selectedUfMarkers])

  // ─── Layer styles ─────────────────────────────────────────────────────────

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

  // ─── Sidebar content (shared between desktop sidebar and mobile sheet) ───

  const sidebarContent = (
    <>
      {/* Header metrics — always reflect filtered data */}
      <div className={`border-b border-gray-100 bg-gray-50 ${isMobile ? 'p-3' : 'p-4'}`}>
        <h2 className={`font-bold text-gray-900 ${isMobile ? 'text-base mb-2' : 'text-lg mb-3'}`}>Mapa de Inteligencia</h2>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className={`font-bold text-brand ${isMobile ? 'text-lg' : 'text-xl'}`}>{filteredMarkers.length}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Oportunidades</p>
          </div>
          <div className="text-center">
            <p className={`font-bold text-emerald-600 ${isMobile ? 'text-lg' : 'text-xl'}`}>
              {formatCompactBRL(filteredMarkers.reduce((s, m) => s + (m.valor || 0), 0))}
            </p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor Total</p>
          </div>
          <div className="text-center">
            <p className={`font-bold text-amber-600 ${isMobile ? 'text-lg' : 'text-xl'}`}>
              {filteredUfStats.length > 0 ? filteredUfStats[0].uf : '-'}
            </p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">
              {filteredUfStats.length > 0 ? `${filteredUfStats[0].count} matches` : 'Melhor UF'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`border-b border-gray-100 ${isMobile ? 'p-3' : 'p-4'}`}>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">
              Score minimo: {scoreFilter > 0 ? scoreFilter : 'Todos'}
            </label>
            {scoreFilter > 60 && (
              <button
                onClick={() => setScoreFilter(50)}
                className="text-[10px] text-brand hover:underline"
              >
                Resetar
              </button>
            )}
          </div>
          <input
            type="range"
            min={40}
            max={100}
            step={5}
            value={scoreFilter}
            onChange={(e) => setScoreFilter(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand"
          />
          <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
            <span>40</span>
            <span>70</span>
            <span>80</span>
            <span>90</span>
            <span>100</span>
          </div>
        </div>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">
              Valor minimo: {minValor > 0 ? `R$ ${(minValor >= 1_000_000 ? (minValor / 1_000_000).toFixed(1) + 'M' : minValor >= 1_000 ? (minValor / 1_000).toFixed(0) + 'K' : minValor.toString())}` : 'Todos'}
            </label>
            {minValor > 0 && (
              <button
                onClick={() => setMinValor(0)}
                className="text-[10px] text-brand hover:underline"
              >
                Resetar
              </button>
            )}
          </div>
          <select
            value={minValor}
            onChange={(e) => setMinValor(Number(e.target.value))}
            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value={0}>Todos os valores</option>
            <option value={10000}>Acima de R$ 10K</option>
            <option value={50000}>Acima de R$ 50K</option>
            <option value={100000}>Acima de R$ 100K</option>
            <option value={500000}>Acima de R$ 500K</option>
            <option value={1000000}>Acima de R$ 1M</option>
            <option value={5000000}>Acima de R$ 5M</option>
            <option value={10000000}>Acima de R$ 10M</option>
            <option value={50000000}>Acima de R$ 50M</option>
            <option value={100000000}>Acima de R$ 100M</option>
          </select>
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
      <div className={isMobile ? 'p-3' : 'p-4'}>
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
                <div className={`rounded-lg p-2.5 ${selectedUfFilteredStats.hotCount > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'}`}>
                  <p className={`text-xs ${selectedUfFilteredStats.hotCount > 0 ? 'text-orange-600' : 'text-gray-500'}`}>
                    {selectedUfFilteredStats.hotCount > 0 ? '🔥 Super Quentes' : 'Maior Score'}
                  </p>
                  <p className="text-lg font-bold">
                    {selectedUfFilteredStats.hotCount > 0 ? (
                      <span className="text-orange-600">{selectedUfFilteredStats.hotCount}</span>
                    ) : (
                      <span className={selectedUfFilteredStats.maxScore >= 70 ? 'text-emerald-600' : selectedUfFilteredStats.maxScore >= 50 ? 'text-amber-600' : 'text-red-500'}>
                        {selectedUfFilteredStats.maxScore}
                      </span>
                    )}
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
                  className={`block p-3 rounded-lg transition-colors ${
                    m.isHot
                      ? 'bg-orange-50 border border-orange-200 hover:bg-orange-100 ring-1 ring-orange-300/50'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  onMouseEnter={() => setSelectedMatch(m)}
                >
                  {m.isHot && (
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                        🔥 SUPER QUENTE
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <span
                        className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold text-white ${
                          m.isHot
                            ? 'ring-2 ring-orange-400'
                            : isAiMatch(m) ? 'ring-2 ring-blue-400' : ''
                        }`}
                        style={{
                          background: m.isHot
                            ? 'linear-gradient(135deg, #f97316, #ef4444)'
                            : getMatchColor(m.score),
                        }}
                      >
                        {m.isHot ? '🔥' : m.score}
                      </span>
                      <span className={`text-[8px] font-medium ${
                        m.isHot ? 'text-orange-600' :
                        isAiMatch(m) ? 'text-blue-600' : 'text-gray-400'
                      }`}>
                        {m.isHot && m.competitionScore != null ? `C:${m.competitionScore}` : isAiMatch(m) ? 'IA' : 'est.'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-snug line-clamp-2 ${m.isHot ? 'text-orange-900' : 'text-gray-900'}`}>
                        {m.objeto}
                      </p>
                      {m.isHot && m.competitionScore != null && (
                        <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${
                          m.competitionScore >= 75 ? 'bg-green-100 text-green-700' :
                          m.competitionScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {m.competitionScore >= 75 ? 'Baixa competicao' :
                           m.competitionScore >= 50 ? 'Competicao moderada' :
                           'Mercado disputado'}
                        </span>
                      )}
                      <p className="text-[10px] text-gray-500 mt-1 truncate">{m.orgao}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {m.municipio && (
                          <span className="text-[10px] text-blue-500">{m.municipio}</span>
                        )}
                        {m.valor && (
                          <span className={`text-[10px] font-medium ${m.isHot ? 'text-orange-700 font-bold' : 'text-emerald-600'}`}>
                            {m.isHot
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.valor)
                              : formatCompactBRL(m.valor)}
                          </span>
                        )}
                        {m.modalidade && (
                          <span className="text-[10px] text-gray-400">{m.modalidade}</span>
                        )}
                        <DeadlineBadge dataEncerramento={m.dataEncerramento} className="text-[10px]" />
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
    </>
  )

  return (
    <div className="flex flex-col md:flex-row h-full w-full relative">
      {/* Map — full viewport on mobile, flex-1 on desktop */}
      <div className={`relative flex-1 ${isMobile ? 'h-full' : 'min-h-0'} overflow-hidden`}>
        {/* Negative bottom hides the Mapbox attribution bar behind the bottom sheet on mobile */}
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
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position={isMobile ? 'top-left' : 'top-right'} />

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
              const ai = isAiMatch(m)
              const hot = m.isHot
              return (
              <Marker
                key={`match-${m.matchId}`}
                longitude={m.lng}
                latitude={m.lat}
                anchor="center"
                style={{ zIndex: hot ? 20 : Math.min(m.score, 19) }}
                onClick={(e: { originalEvent: MouseEvent }) => {
                  e.originalEvent.stopPropagation()
                  setSelectedMatch(m)
                  setSelectedUf(m.uf)
                  setSelectedGroup(count > 1 ? all : null)
                }}
              >
                <div className="relative">
                  {hot && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 text-base drop-shadow-lg pointer-events-none"
                      style={{ top: -16, filter: 'drop-shadow(0 0 4px rgba(255,100,0,0.8))' }}
                    >
                      🔥
                    </span>
                  )}
                  <div
                    className={`flex items-center justify-center rounded-full cursor-pointer shadow-lg transition-transform hover:scale-125 hover:z-40 ${
                      hot
                        ? 'border-2 border-yellow-400'
                        : ai
                          ? 'border-2 border-blue-400/80'
                          : 'border-2 border-white/50'
                    }`}
                    style={{
                      width: hot ? 36 : 32,
                      height: hot ? 36 : 32,
                      background: hot
                        ? 'linear-gradient(135deg, #f97316, #ef4444)'
                        : getMatchColor(m.score),
                      animation: hot ? 'pulse-hot 1.5s ease-in-out infinite' : undefined,
                    }}
                    title={`${m.objeto} — Score: ${m.score}${hot ? ' 🔥 SUPER QUENTE' : ''}${ai ? ' (IA)' : ' (estimado)'}${count > 1 ? ` (+${count - 1} mais)` : ''}`}
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

            {/* Popup when a match marker is clicked */}
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
                maxWidth={isMobile ? '240px' : '300px'}
                style={{ zIndex: 40 }}
              >
                <div className={isMobile ? 'p-2 min-w-[180px]' : 'p-3 min-w-[220px]'}>
                  {selectedMatch.isHot && (
                    <div className={`pb-2 border-b border-orange-200 bg-gradient-to-r from-orange-500 to-red-500 ${isMobile ? '-m-2 mb-2 p-1.5' : '-m-3 mb-2 p-2'} rounded-t`}>
                      <p className={`font-bold text-white ${isMobile ? 'text-[10px]' : 'text-xs'}`}>🔥 SUPER QUENTE</p>
                    </div>
                  )}
                  {selectedGroup && selectedGroup.length > 1 && (
                    <div className="mb-2 pb-2 border-b border-gray-200">
                      <p className={`font-semibold text-gray-700 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                        {selectedGroup.length} oportunidades em {selectedMatch.municipio || selectedMatch.uf}
                      </p>
                    </div>
                  )}
                  {(selectedGroup && selectedGroup.length > 1 ? selectedGroup.slice(0, 5) : [selectedMatch]).map((match, idx) => (
                    <div key={match.matchId} className={idx > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold ${isMobile ? 'text-[10px]' : 'text-xs'} ${getScoreBgClass(match.score)}`}
                        >
                          {match.score}
                        </span>
                        <span className={`font-medium px-1 py-0.5 rounded ${isMobile ? 'text-[8px]' : 'text-[9px]'} ${
                          isAiMatch(match)
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isAiMatch(match) ? 'IA' : 'estimado'}
                        </span>
                        {!selectedGroup && (
                          <span className={`text-gray-500 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                            {match.municipio ? `${match.municipio}/${match.uf}` : match.uf}
                          </span>
                        )}
                      </div>
                      <p className={`font-medium text-gray-900 leading-snug line-clamp-2 mb-1 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                        {match.objeto}
                      </p>
                      <p className={`text-gray-500 truncate mb-1 ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>{match.orgao}</p>
                      <div className={`flex items-center gap-3 ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>
                        {match.valor && (
                          <span className="font-medium text-emerald-600">
                            {formatCompactBRL(match.valor)}
                          </span>
                        )}
                        {match.modalidade && (
                          <span className="text-gray-400">{match.modalidade}</span>
                        )}
                        <DeadlineBadge dataEncerramento={match.dataEncerramento} />
                      </div>
                      <Link
                        href={`/opportunities/${match.matchId}`}
                        className={`mt-1 block font-medium text-brand hover:underline ${isMobile ? 'text-[10px]' : 'text-xs'}`}
                      >
                        Ver detalhes &rarr;
                      </Link>
                    </div>
                  ))}
                  {selectedGroup && selectedGroup.length > 5 && (
                    <p className={`mt-2 pt-2 border-t border-gray-100 text-gray-500 text-center ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>
                      +{selectedGroup.length - 5} mais oportunidades — clique no estado para ver todas
                    </p>
                  )}
                </div>
              </Popup>
            )}
          </MapGL>
        </div>

        {/* Legend — hidden on mobile when sheet is open, bottom-left otherwise */}
        <div className={`absolute z-[30] transition-opacity duration-200 ${
          isMobile && sheetPosition !== 'collapsed'
            ? 'opacity-0 pointer-events-none'
            : ''
        } ${
          isMobile
            ? 'bottom-24 left-2'
            : 'bottom-2 left-4'
        }`}>
          <Card className={`bg-black/70 border-white/10 text-white ${isMobile ? 'p-2' : 'p-3'}`}>
            <p className={`font-semibold mb-2 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>Score do Match</p>
            <div className="flex items-center gap-1 mb-1">
              {[
                { color: '#10B981', label: '80+' },
                { color: '#FBBF24', label: '60-79' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <div
                    className={`rounded-full border border-white/30 ${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'}`}
                    style={{ backgroundColor: item.color }}
                  />
                  <span className={`text-gray-300 ${isMobile ? 'text-[8px]' : 'text-[10px]'}`}>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className={`rounded-full border-2 border-blue-400 bg-gray-500 ${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
              <span className={`text-gray-300 ${isMobile ? 'text-[8px]' : 'text-[9px]'}`}>Verificado por IA</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`rounded-full border-2 border-yellow-400 ${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }} />
              <span className={`text-gray-300 ${isMobile ? 'text-[8px]' : 'text-[9px]'}`}>🔥 Super Quente</span>
            </div>
            <p className={`text-gray-400 mt-1 ${isMobile ? 'text-[8px]' : 'text-[9px]'}`}>
              {filteredMarkers.length} matches no mapa
            </p>
          </Card>
        </div>
      </div>

      {/* Desktop Sidebar */}
      {!isMobile && (
        <div className="w-full md:w-[30%] md:min-w-[320px] md:max-w-[400px] h-full overflow-y-auto bg-white border-l border-gray-200">
          {sidebarContent}
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      {isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[100] bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] flex flex-col"
          style={{
            height: sheetHeight,
            transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            maxHeight: 'calc(100vh - 40px)',
          }}
        >
          {/* Drag handle */}
          <div
            className="flex-shrink-0 flex items-center justify-center py-2 cursor-grab active:cursor-grabbing"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{ touchAction: 'none' }}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Mobile floating toggle button */}
      {isMobile && (
        <button
          onClick={() => {
            setSheetPosition((prev) => prev === 'full' ? 'collapsed' : 'full')
          }}
          className="fixed z-[110] bottom-24 right-4 w-12 h-12 rounded-full bg-brand text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{
            bottom: sheetPosition === 'collapsed' ? '96px' : sheetPosition === 'half' ? 'calc(50vh + 12px)' : 'calc(100vh - 28px - 48px)',
            transition: 'bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.15s',
          }}
          aria-label={sheetPosition === 'full' ? 'Ver mapa' : 'Ver lista'}
        >
          {sheetPosition === 'full' ? (
            // Map icon
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          ) : (
            // List icon
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
