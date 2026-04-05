'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import MapGL, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import Link from 'next/link'
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

// ─── Score → color (new palette: green → lime → amber → slate) ──────────────
function getScoreColor(score: number): string {
  if (score >= 90) return '#10B981' // emerald — excellent
  if (score >= 80) return '#84CC16' // lime — good
  if (score >= 70) return '#F59E0B' // amber — moderate
  return '#64748B'                  // slate — low
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excelente'
  if (score >= 80) return 'Bom'
  if (score >= 70) return 'Moderado'
  return 'Baixo'
}

function getScoreColorClass(score: number): string {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 80) return 'text-lime-400'
  if (score >= 70) return 'text-amber-400'
  return 'text-slate-400'
}

function getScoreBadgeClass(score: number): string {
  if (score >= 90) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (score >= 80) return 'bg-lime-500/10 text-lime-400 border-lime-500/20'
  if (score >= 70) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
}

/** Days until tender closes */
function daysUntilClose(dataEncerramento: string | null): number | null {
  if (!dataEncerramento) return null
  return Math.ceil((new Date(dataEncerramento).getTime() - Date.now()) / 86400000)
}

function DeadlineBadge({ dataEncerramento }: { dataEncerramento: string | null }) {
  const days = daysUntilClose(dataEncerramento)
  if (days === null) return null
  if (days > 3) return null
  return (
    <span className="text-[10px] font-medium text-red-400">
      {days <= 0 ? 'Encerra hoje' : `${days}d restantes`}
    </span>
  )
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
  const [popupInfo, setPopupInfo] = useState<{
    longitude: number
    latitude: number
    matches: MatchMarker[]
  } | null>(null)
  const [scoreFilter, setScoreFilter] = useState(50)
  const [minValor, setMinValor] = useState(0)
  const [regionFilter, setRegionFilter] = useState<Set<string>>(new Set(REGIONS))

  // Mobile
  const [isMobile, setIsMobile] = useState(false)
  const [sheetPosition, setSheetPosition] = useState<SheetPosition>('half')
  const touchStartY = useRef<number>(0)
  const touchStartSheetPos = useRef<SheetPosition>('half')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const sheetHeight = useMemo(() => {
    switch (sheetPosition) {
      case 'collapsed': return '80px'
      case 'half': return '50vh'
      case 'full': return 'calc(100vh - 60px)'
    }
  }, [sheetPosition])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchStartSheetPos.current = sheetPosition
  }, [sheetPosition])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = touchStartY.current - e.changedTouches[0].clientY
    const threshold = 50
    if (deltaY > threshold) {
      if (touchStartSheetPos.current === 'collapsed') setSheetPosition('half')
      else if (touchStartSheetPos.current === 'half') setSheetPosition('full')
    } else if (deltaY < -threshold) {
      if (touchStartSheetPos.current === 'full') setSheetPosition('half')
      else if (touchStartSheetPos.current === 'half') setSheetPosition('collapsed')
    }
  }, [])

  const matchMarkers = initialMarkers

  // UF data lookup
  const ufDataMap = useMemo(() => {
    const map = new Map<string, UfMapData>()
    for (const d of ufData) map.set(d.uf, d)
    return map
  }, [ufData])

  // Build lookup for markers by coordinate key (for popup enrichment)
  const markerLookup = useMemo(() => {
    const map = new Map<string, MatchMarker[]>()
    for (const m of matchMarkers) {
      // Round to 3 decimals (~110m) to group nearby markers
      const key = `${m.lat.toFixed(3)},${m.lng.toFixed(3)}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return map
  }, [matchMarkers])

  // Filter markers
  const filteredMarkers = useMemo(() => {
    const regionUfs = new Set<string>()
    for (const d of ufData) {
      if (regionFilter.has(d.region)) regionUfs.add(d.uf)
    }
    return matchMarkers.filter((m) => {
      if (m.score < scoreFilter) return false
      if (!regionUfs.has(m.uf)) return false
      if (minValor > 0 && (m.valor || 0) < minValor) return false
      return true
    })
  }, [matchMarkers, scoreFilter, minValor, regionFilter, ufData])

  // ─── GeoJSON for Mapbox GL native clustering ────────────────────────────
  const clusterGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
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
        orgao: m.orgao,
        objeto: m.objeto,
        municipio: m.municipio || '',
        modalidade: m.modalidade || '',
        dataEncerramento: m.dataEncerramento || '',
        lat: m.lat,
        lng: m.lng,
      },
    })),
  }), [filteredMarkers])

  // Recompute UF stats from filtered markers
  const filteredUfStats = useMemo(() => {
    const statsMap = new Map<string, {
      uf: string; name: string; region: string;
      count: number; totalValue: number; scoreSum: number;
      avgScore: number; maxScore: number;
    }>()

    for (const m of filteredMarkers) {
      const ufInfo = ufDataMap.get(m.uf)
      if (!ufInfo) continue
      if (!statsMap.has(m.uf)) {
        statsMap.set(m.uf, {
          uf: m.uf, name: ufInfo.name, region: ufInfo.region,
          count: 0, totalValue: 0, scoreSum: 0, avgScore: 0, maxScore: 0,
        })
      }
      const s = statsMap.get(m.uf)!
      s.count++
      s.totalValue += m.valor || 0
      s.scoreSum += m.score
      s.maxScore = Math.max(s.maxScore, m.score)
    }

    for (const s of statsMap.values()) {
      s.avgScore = s.count > 0 ? Math.round(s.scoreSum / s.count) : 0
    }

    return Array.from(statsMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return b.avgScore - a.avgScore
    })
  }, [filteredMarkers, ufDataMap])

  const filteredUfData = useMemo(() => {
    return ufData.filter((d) => regionFilter.has(d.region))
  }, [ufData, regionFilter])

  const maxMatches = useMemo(() => {
    return Math.max(1, ...filteredUfData.map((d) => d.totalMatches))
  }, [filteredUfData])

  // Load Brazil states GeoJSON
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

  // ─── Map click handlers ─────────────────────────────────────────────────

  const onClusterClick = useCallback((e: any) => {
    const feature = e.features?.[0]
    if (!feature || !mapRef.current) return

    const clusterId = feature.properties?.cluster_id
    const source = mapRef.current.getSource('opportunities')
    if (!source || !('getClusterExpansionZoom' in source)) return

    ;(source as any).getClusterExpansionZoom(clusterId, (err: Error | null, zoom: number) => {
      if (err) return
      mapRef.current?.easeTo({
        center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
        zoom: Math.min(zoom, 14),
        duration: 500,
      })
    })
  }, [])

  const onPointClick = useCallback((e: any) => {
    const feature = e.features?.[0]
    if (!feature) return

    const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
    const props = feature.properties || {}

    // Find all markers near this point
    const key = `${parseFloat(props.lat).toFixed(3)},${parseFloat(props.lng).toFixed(3)}`
    const nearbyMarkers = markerLookup.get(key) || []

    // If we have detailed markers, use those; otherwise build from feature props
    const matches: MatchMarker[] = nearbyMarkers.length > 0
      ? nearbyMarkers.filter((m) => m.score >= scoreFilter)
      : [{
          matchId: props.matchId || '',
          tenderId: '',
          objeto: props.objeto || '',
          orgao: props.orgao || '',
          uf: props.uf || '',
          municipio: props.municipio || null,
          score: props.score || 0,
          matchSource: '',
          valor: props.valor || null,
          modalidade: props.modalidade || null,
          recomendacao: null,
          lat: coords[1],
          lng: coords[0],
          isHot: (props.score || 0) >= 80,
          competitionScore: null,
          dataEncerramento: props.dataEncerramento || null,
        }]

    if (matches.length > 0) {
      setPopupInfo({
        longitude: coords[0],
        latitude: coords[1],
        matches: matches.sort((a, b) => b.score - a.score),
      })
    }
  }, [markerLookup, scoreFilter])

  const onMapClick = useCallback((e: any) => {
    const features = e.features
    if (!features?.length) {
      setPopupInfo(null)
      return
    }
    const layerId = features[0].layer?.id
    if (layerId === 'clusters') onClusterClick(e)
    else if (layerId === 'unclustered-point') onPointClick(e)
  }, [onClusterClick, onPointClick])

  // ─── UF navigation ──────────────────────────────────────────────────────

  const selectUf = useCallback((uf: string) => {
    setSelectedUf(uf)
    setPopupInfo(null)
    const center = UF_CENTERS[uf]
    if (center && mapRef.current) {
      mapRef.current.flyTo({
        center: [center.lng, center.lat],
        zoom: 5.5,
        duration: 1200,
      })
    }
  }, [])

  const resetView = useCallback(() => {
    setSelectedUf(null)
    setPopupInfo(null)
    mapRef.current?.flyTo({
      center: [-52, -14],
      zoom: 3.8,
      duration: 1200,
    })
  }, [])

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
    return filteredMarkers
      .filter((m) => m.uf === selectedUf)
      .sort((a, b) => b.score - a.score)
  }, [selectedUf, filteredMarkers])

  const selectedUfFilteredStats = useMemo(() => {
    if (!selectedUfMarkers.length) return null
    const count = selectedUfMarkers.length
    const totalValue = selectedUfMarkers.reduce((s, m) => s + (m.valor || 0), 0)
    const avgScore = Math.round(selectedUfMarkers.reduce((s, m) => s + m.score, 0) / count)
    const maxScore = Math.max(...selectedUfMarkers.map((m) => m.score))
    return { count, totalValue, avgScore, maxScore }
  }, [selectedUfMarkers])

  // ─── Mapbox GL layers ───────────────────────────────────────────────────

  /* eslint-disable @typescript-eslint/no-explicit-any */

  // State choropleth fill (very subtle)
  const fillLayer: any = {
    id: 'uf-fill',
    type: 'fill',
    paint: {
      'fill-color': [
        'step',
        ['get', 'opportunityScore'],
        'rgba(100, 116, 139, 0.08)',  // 0-49: barely visible slate
        50, 'rgba(245, 158, 11, 0.08)', // 50-69: faint amber
        70, 'rgba(132, 204, 22, 0.08)', // 70-79: faint lime
        80, 'rgba(16, 185, 129, 0.10)', // 80+: faint emerald
      ],
      'fill-opacity': [
        'interpolate',
        ['linear'],
        ['get', 'totalMatches'],
        0, 0.3,
        maxMatches, 1,
      ],
    },
  }

  // State borders — very subtle
  const lineLayer: any = {
    id: 'uf-line',
    type: 'line',
    paint: {
      'line-color': 'rgba(255, 255, 255, 0.08)',
      'line-width': 0.5,
    },
  }

  // Cluster circles — dark, neutral
  const clusterLayer: any = {
    id: 'clusters',
    type: 'circle',
    source: 'opportunities',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step',
        ['get', 'point_count'],
        '#1C1C21',     // < 10: dark
        10, '#27272A',  // 10-50: zinc-800
        50, '#3F3F46',  // 50-100: zinc-700
        100, '#52525B', // 100+: zinc-600
      ],
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        20,
        10, 28,
        50, 36,
        100, 44,
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255, 255, 255, 0.1)',
    },
  }

  // Cluster count text
  const clusterCountLayer: any = {
    id: 'cluster-count',
    type: 'symbol',
    source: 'opportunities',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 13,
    },
    paint: {
      'text-color': '#FAFAFA',
    },
  }

  // Individual unclustered points — color by score, size by score
  const unclusteredPointLayer: any = {
    id: 'unclustered-point',
    type: 'circle',
    source: 'opportunities',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': [
        'case',
        ['>=', ['get', 'score'], 90], '#10B981', // emerald
        ['>=', ['get', 'score'], 80], '#84CC16', // lime
        ['>=', ['get', 'score'], 70], '#F59E0B', // amber
        '#64748B',                                // slate
      ],
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['get', 'score'],
        50, 5,
        70, 7,
        85, 9,
        100, 12,
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': [
        'case',
        ['>=', ['get', 'score'], 90], 'rgba(16, 185, 129, 0.3)',
        ['>=', ['get', 'score'], 80], 'rgba(132, 204, 22, 0.3)',
        ['>=', ['get', 'score'], 70], 'rgba(245, 158, 11, 0.3)',
        'rgba(100, 116, 139, 0.3)',
      ],
    },
  }

  // Score label on unclustered points (only at higher zoom)
  const unclusteredLabelLayer: any = {
    id: 'unclustered-label',
    type: 'symbol',
    source: 'opportunities',
    filter: ['!', ['has', 'point_count']],
    minzoom: 8,
    layout: {
      'text-field': ['to-string', ['get', 'score']],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 10,
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#FFFFFF',
      'text-halo-color': 'rgba(0, 0, 0, 0.6)',
      'text-halo-width': 1,
    },
  }

  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ─── Cursor handling ────────────────────────────────────────────────────

  const onMouseEnter = useCallback(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'pointer'
  }, [])

  const onMouseLeave = useCallback(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }, [])

  // ─── Sidebar ────────────────────────────────────────────────────────────

  const totalValue = useMemo(() =>
    filteredMarkers.reduce((s, m) => s + (m.valor || 0), 0),
  [filteredMarkers])

  const sidebarContent = (
    <>
      {/* Header */}
      <div className={`border-b border-border ${isMobile ? 'p-3' : 'p-5 pb-4'}`}>
        <h2 className={`font-semibold text-foreground tracking-tight ${isMobile ? 'text-sm mb-3' : 'text-base mb-4'}`}>
          Mapa de Inteligência
        </h2>

        {/* KPI row — neutral, no colored borders */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
            <p className={`font-semibold text-foreground font-mono tabular-nums ${isMobile ? 'text-base' : 'text-lg'}`}>
              {filteredMarkers.length.toLocaleString('pt-BR')}
            </p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium mt-0.5">
              Oportunidades
            </p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
            <p className={`font-semibold text-foreground font-mono tabular-nums ${isMobile ? 'text-base' : 'text-lg'}`}>
              {formatCompactBRL(totalValue)}
            </p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium mt-0.5">
              Valor Total
            </p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
            <p className={`font-semibold text-foreground font-mono tabular-nums ${isMobile ? 'text-base' : 'text-lg'}`}>
              {filteredUfStats.length > 0 ? filteredUfStats[0].uf : '-'}
            </p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium mt-0.5">
              {filteredUfStats.length > 0 ? `${filteredUfStats[0].count} matches` : 'Melhor UF'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`border-b border-border ${isMobile ? 'p-3' : 'px-5 py-4'}`}>
        {/* Score slider */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Score mínimo: <span className="text-foreground font-mono tabular-nums">{scoreFilter}</span>
            </label>
            {scoreFilter > 60 && (
              <button
                onClick={() => setScoreFilter(50)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Resetar
              </button>
            )}
          </div>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={scoreFilter}
            onChange={(e) => setScoreFilter(Number(e.target.value))}
            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-foreground"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5 font-mono tabular-nums">
            <span>50</span><span>60</span><span>70</span><span>80</span><span>90</span><span>100</span>
          </div>
        </div>

        {/* Value filter */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">
              Valor mínimo: <span className="text-foreground font-mono tabular-nums">
                {minValor > 0
                  ? `R$ ${minValor >= 1_000_000 ? (minValor / 1_000_000).toFixed(1) + 'M' : minValor >= 1_000 ? (minValor / 1_000).toFixed(0) + 'K' : minValor.toString()}`
                  : 'Todos'}
              </span>
            </label>
            {minValor > 0 && (
              <button
                onClick={() => setMinValor(0)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Resetar
              </button>
            )}
          </div>
          <select
            value={minValor}
            onChange={(e) => setMinValor(Number(e.target.value))}
            className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-secondary/50 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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

        {/* Region chips — monochromatic */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Regiões</label>
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => toggleRegion(r)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 border ${
                  regionFilter.has(r)
                    ? 'bg-foreground/10 border-foreground/20 text-foreground'
                    : 'bg-transparent border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground/80'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content: ranking or UF detail */}
      <div className={isMobile ? 'p-3' : 'p-4'}>
        {selectedUf && selectedUfData ? (
          <div>
            <button
              onClick={resetView}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 flex items-center gap-1"
            >
              &larr; Voltar ao ranking
            </button>

            <h3 className="text-base font-semibold text-foreground mb-3">
              {selectedUfData.name} ({selectedUf})
            </h3>

            {selectedUfFilteredStats ? (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Oportunidades</p>
                  <p className="text-lg font-semibold text-foreground font-mono tabular-nums">{selectedUfFilteredStats.count}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Valor Total</p>
                  <p className="text-lg font-semibold text-foreground font-mono tabular-nums">{formatCompactBRL(selectedUfFilteredStats.totalValue)}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Score Médio</p>
                  <p className={`text-lg font-semibold font-mono tabular-nums ${getScoreColorClass(selectedUfFilteredStats.avgScore)}`}>
                    {selectedUfFilteredStats.avgScore}
                  </p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Maior Score</p>
                  <p className={`text-lg font-semibold font-mono tabular-nums ${getScoreColorClass(selectedUfFilteredStats.maxScore)}`}>
                    {selectedUfFilteredStats.maxScore}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">Nenhuma oportunidade com os filtros atuais</p>
            )}

            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              {selectedUfMarkers.length} oportunidade{selectedUfMarkers.length !== 1 ? 's' : ''}
            </h4>
            <div className="space-y-1.5">
              {selectedUfMarkers.map((m: MatchMarker) => (
                <Link
                  key={m.matchId}
                  href={`/opportunities/${m.matchId}`}
                  className="block p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors border border-transparent hover:border-border"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold border font-mono tabular-nums ${getScoreBadgeClass(m.score)}`}
                    >
                      {m.score}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                        {m.objeto}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 truncate">{m.orgao}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {m.municipio && (
                          <span className="text-[10px] text-muted-foreground">{m.municipio}</span>
                        )}
                        {m.valor != null && m.valor > 0 && (
                          <span className="text-[10px] font-medium text-foreground font-mono tabular-nums">
                            {formatCompactBRL(m.valor)}
                          </span>
                        )}
                        {m.modalidade && (
                          <span className="text-[10px] text-muted-foreground">{m.modalidade}</span>
                        )}
                        <DeadlineBadge dataEncerramento={m.dataEncerramento} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {selectedUfMarkers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma oportunidade encontrada com os filtros atuais
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Ranking by UF — avgScore computed per-state from filtered markers */
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              Ranking por Estado ({filteredUfStats.length} UFs)
            </h3>
            <div className="space-y-0.5">
              {filteredUfStats.slice(0, 15).map((d, index) => (
                <button
                  key={d.uf}
                  onClick={() => selectUf(d.uf)}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left group"
                >
                  <span className="text-[10px] text-muted-foreground w-4 font-mono tabular-nums">
                    {index + 1}
                  </span>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground text-[11px] font-bold flex-shrink-0 bg-secondary border border-border">
                    {d.uf}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{d.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
                      {d.count} oportunidade{d.count !== 1 ? 's' : ''} · {formatCompactBRL(d.totalValue)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-bold font-mono tabular-nums ${getScoreColorClass(d.avgScore)}`}>
                      {d.avgScore}
                    </p>
                    <p className="text-[9px] text-muted-foreground">score médio</p>
                  </div>
                </button>
              ))}
              {filteredUfStats.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma oportunidade encontrada com os filtros atuais
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col md:flex-row h-full w-full relative">
      {/* Map */}
      <div className={`relative flex-1 ${isMobile ? 'h-full' : 'min-h-0'} overflow-hidden`}>
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
            interactiveLayerIds={['clusters', 'unclustered-point']}
            onClick={onMapClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <NavigationControl position={isMobile ? 'top-left' : 'top-right'} showCompass={false} />

            {/* State choropleth (subtle) */}
            {geoJson && (
              <Source id="brazil-states" type="geojson" data={geoJson}>
                <Layer {...fillLayer} />
                <Layer {...lineLayer} />
              </Source>
            )}

            {/* Clustered point source */}
            <Source
              id="opportunities"
              type="geojson"
              data={clusterGeoJson}
              cluster={true}
              clusterMaxZoom={14}
              clusterRadius={50}
            >
              <Layer {...clusterLayer} />
              <Layer {...clusterCountLayer} />
              <Layer {...unclusteredPointLayer} />
              <Layer {...unclusteredLabelLayer} />
            </Source>

            {/* Popup */}
            {popupInfo && (
              <Popup
                longitude={popupInfo.longitude}
                latitude={popupInfo.latitude}
                closeButton={true}
                closeOnClick={false}
                onClose={() => setPopupInfo(null)}
                anchor="bottom"
                offset={15}
                className="intelligence-map-popup"
                maxWidth={isMobile ? '260px' : '320px'}
              >
                <div className="min-w-[220px]">
                  {popupInfo.matches.length > 1 && (
                    <div className="px-4 py-2.5 border-b border-border">
                      <p className="text-xs font-medium text-foreground">
                        {popupInfo.matches.length} oportunidades neste local
                      </p>
                    </div>
                  )}
                  <div className={isMobile ? 'p-3' : 'p-4'}>
                    {popupInfo.matches.slice(0, 5).map((match, idx) => (
                      <div key={match.matchId} className={idx > 0 ? 'mt-3 pt-3 border-t border-border' : ''}>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold border font-mono tabular-nums ${getScoreBadgeClass(match.score)}`}
                          >
                            {match.score}
                          </span>
                          <div>
                            <span className={`text-[10px] font-medium ${getScoreColorClass(match.score)}`}>
                              {getScoreLabel(match.score)}
                            </span>
                            <span className="text-muted-foreground text-[10px] ml-1.5">
                              {match.municipio ? `${match.municipio}/${match.uf}` : match.uf}
                            </span>
                          </div>
                        </div>
                        <p className={`font-medium text-foreground leading-snug line-clamp-2 mb-1.5 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                          {match.objeto}
                        </p>
                        <p className={`text-muted-foreground truncate mb-2 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                          {match.orgao}
                        </p>
                        <div className={`flex items-center gap-3 mb-3 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                          {match.valor != null && match.valor > 0 && (
                            <span className="font-medium text-foreground font-mono tabular-nums">
                              {formatCompactBRL(match.valor)}
                            </span>
                          )}
                          {match.modalidade && (
                            <span className="text-muted-foreground">{match.modalidade}</span>
                          )}
                          <DeadlineBadge dataEncerramento={match.dataEncerramento} />
                        </div>
                        <Link
                          href={`/opportunities/${match.matchId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-lg px-3 py-1.5 transition-colors"
                        >
                          Ver detalhes <span className="text-muted-foreground">&rarr;</span>
                        </Link>
                      </div>
                    ))}
                    {popupInfo.matches.length > 5 && (
                      <p className="mt-3 pt-3 border-t border-border text-muted-foreground text-center text-xs">
                        +{popupInfo.matches.length - 5} mais — clique no estado para ver todas
                      </p>
                    )}
                  </div>
                </div>
              </Popup>
            )}
          </MapGL>
        </div>

        {/* Legend — refined, no emojis */}
        <div className={`absolute z-[5] transition-opacity duration-200 ${
          isMobile && sheetPosition !== 'collapsed'
            ? 'opacity-0 pointer-events-none'
            : ''
        } ${
          isMobile ? 'bottom-24 left-2' : 'bottom-2 left-4'
        }`}>
          <div className={`bg-black/80 backdrop-blur-sm border border-white/[0.06] rounded-xl text-white ${isMobile ? 'p-2.5' : 'p-3.5'}`}>
            <p className={`font-medium mb-2.5 text-white/80 ${isMobile ? 'text-[10px]' : 'text-[11px]'}`}>
              Score do Match
            </p>
            <div className="space-y-1.5">
              {[
                { color: '#10B981', label: '90-100', sublabel: 'Excelente' },
                { color: '#84CC16', label: '80-89', sublabel: 'Bom' },
                { color: '#F59E0B', label: '70-79', sublabel: 'Moderado' },
                { color: '#64748B', label: '50-69', sublabel: 'Baixo' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div
                    className={`rounded-full ${isMobile ? 'w-2 h-2' : 'w-2.5 h-2.5'}`}
                    style={{ backgroundColor: item.color }}
                  />
                  <span className={`text-white/70 font-mono tabular-nums ${isMobile ? 'text-[8px]' : 'text-[10px]'}`}>
                    {item.label}
                  </span>
                  <span className={`text-white/40 ${isMobile ? 'text-[8px]' : 'text-[10px]'}`}>
                    {item.sublabel}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
              <span className={`text-white/30 font-mono tabular-nums ${isMobile ? 'text-[8px]' : 'text-[9px]'}`}>
                {filteredMarkers.length.toLocaleString('pt-BR')} oportunidades no mapa
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      {!isMobile && (
        <div className="w-full md:w-[30%] md:min-w-[320px] md:max-w-[400px] h-full overflow-y-auto bg-background border-l border-border">
          {sidebarContent}
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      {isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[35] bg-background rounded-t-2xl shadow-xl flex flex-col"
          style={{
            height: sheetHeight,
            transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            maxHeight: 'calc(100vh - 60px)',
          }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center py-2 cursor-grab active:cursor-grabbing"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{ touchAction: 'none' }}
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Mobile floating toggle */}
      {isMobile && (
        <button
          onClick={() => {
            setSheetPosition((prev) => prev === 'full' ? 'collapsed' : 'full')
          }}
          className="fixed z-[36] w-11 h-11 rounded-xl bg-secondary border border-border text-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{
            right: '12px',
            bottom: sheetPosition === 'collapsed' ? '96px' : sheetPosition === 'half' ? 'calc(50vh + 12px)' : 'calc(100vh - 60px - 56px)',
            transition: 'bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.15s',
          }}
          aria-label={sheetPosition === 'full' ? 'Ver mapa' : 'Ver lista'}
        >
          {sheetPosition === 'full' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
