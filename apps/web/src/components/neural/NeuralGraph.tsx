'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'

interface GraphNode {
  id: string
  label: string
  type: 'company' | 'partner' | 'tender' | string
  risk?: number
  cnpj?: string
  detail?: string
}

interface GraphEdge {
  source: string
  target: string
  type: string
  weight?: number
  label?: string
}

interface NeuralGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width?: number
  height?: number
  onNodeClick?: (node: GraphNode) => void
  className?: string
}

// Licitagram color palette
const NODE_COLORS: Record<string, string> = {
  company: '#10b981',   // emerald
  partner: '#6366f1',   // indigo
  tender: '#f59e0b',    // amber
  default: '#64748b',   // slate
}

const EDGE_COLORS: Record<string, string> = {
  socio: '#6366f1',
  endereco: '#f59e0b',
  conluio: '#ef4444',
  participacao: '#10b981',
  preco_similar: '#06b6d4',
  default: '#3f3f46',
}

function riskColor(risk: number): string {
  if (risk >= 0.7) return '#ef4444'
  if (risk >= 0.4) return '#f59e0b'
  return '#10b981'
}

/**
 * NeuralGraph — D3 force-directed graph ported from MiroFish GraphPanel.
 * Full zoom/pan, drag nodes, curved edges, hover tooltips, click details.
 * Styled for Licitagram dark theme.
 */
export function NeuralGraph({ nodes, edges, width = 800, height = 500, onNodeClick, className }: NeuralGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  const renderGraph = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const w = width
    const h = height

    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`)

    // Build node map
    const nodeMap = new Map<string, GraphNode>()
    nodes.forEach(n => nodeMap.set(n.id, n))

    // D3 simulation nodes
    const simNodes = nodes.map(n => ({
      ...n,
      x: w / 2 + (Math.random() - 0.5) * w * 0.5,
      y: h / 2 + (Math.random() - 0.5) * h * 0.5,
    }))

    // D3 simulation edges (filter valid)
    const nodeIds = new Set(nodes.map(n => n.id))
    const simEdges = edges
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map(e => ({
        source: e.source,
        target: e.target,
        type: e.type || 'default',
        label: e.label || e.type || '',
      }))

    // Calculate edge curvature for parallel edges (MiroFish logic)
    const edgePairCount: Record<string, number> = {}
    const edgePairIndex: Record<string, number> = {}
    simEdges.forEach(e => {
      const key = [e.source, e.target].sort().join('_')
      edgePairCount[key] = (edgePairCount[key] || 0) + 1
    })

    const edgesWithCurve = simEdges.map(e => {
      const key = [e.source, e.target].sort().join('_')
      const total = edgePairCount[key]
      const idx = edgePairIndex[key] || 0
      edgePairIndex[key] = idx + 1

      let curvature = 0
      if (total > 1) {
        const range = Math.min(1.2, 0.6 + total * 0.15)
        curvature = ((idx / (total - 1)) - 0.5) * range * 2
        if (typeof e.source === 'string' && typeof e.target === 'string' && e.source > e.target) {
          curvature = -curvature
        }
      }

      return { ...e, curvature, pairTotal: total }
    })

    // Force simulation (MiroFish parameters)
    const simulation = d3.forceSimulation(simNodes as any)
      .force('link', d3.forceLink(edgesWithCurve as any).id((d: any) => d.id).distance((d: any) => {
        const base = 150
        const count = d.pairTotal || 1
        return base + (count - 1) * 50
      }))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide(50))
      .force('x', d3.forceX(w / 2).strength(0.04))
      .force('y', d3.forceY(h / 2).strength(0.04))

    // Root group for zoom/pan
    const g = svg.append('g')

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [w, h]])
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString())
      })

    svg.call(zoom)

    // Arrow markers
    const defs = svg.append('defs')
    Object.entries(EDGE_COLORS).forEach(([type, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 25)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color)
    })

    // Edge path function (MiroFish bezier curves)
    function getLinkPath(d: any): string {
      const sx = d.source.x, sy = d.source.y
      const tx = d.target.x, ty = d.target.y

      if (d.curvature === 0) return `M${sx},${sy} L${tx},${ty}`

      const dx = tx - sx, dy = ty - sy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const total = d.pairTotal || 1
      const ratio = 0.25 + total * 0.05
      const base = Math.max(35, dist * ratio)
      const ox = -dy / dist * d.curvature * base
      const oy = dx / dist * d.curvature * base
      const cx = (sx + tx) / 2 + ox
      const cy = (sy + ty) / 2 + oy

      return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
    }

    // Edge midpoint for labels
    function getLinkMid(d: any): { x: number; y: number } {
      const sx = d.source.x, sy = d.source.y
      const tx = d.target.x, ty = d.target.y

      if (d.curvature === 0) return { x: (sx + tx) / 2, y: (sy + ty) / 2 }

      const dx = tx - sx, dy = ty - sy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const total = d.pairTotal || 1
      const ratio = 0.25 + total * 0.05
      const base = Math.max(35, dist * ratio)
      const ox = -dy / dist * d.curvature * base
      const oy = dx / dist * d.curvature * base
      const cx = (sx + tx) / 2 + ox
      const cy = (sy + ty) / 2 + oy

      return { x: 0.25 * sx + 0.5 * cx + 0.25 * tx, y: 0.25 * sy + 0.5 * cy + 0.25 * ty }
    }

    // Draw edges
    const linkGroup = g.append('g')
    const link = linkGroup.selectAll('path')
      .data(edgesWithCurve)
      .enter().append('path')
      .attr('stroke', (d: any) => EDGE_COLORS[d.type] || EDGE_COLORS.default)
      .attr('stroke-width', (d: any) => d.type === 'conluio' ? 2.5 : 1.5)
      .attr('fill', 'none')
      .attr('stroke-dasharray', (d: any) => d.type === 'conluio' ? '6 3' : null)
      .attr('marker-end', (d: any) => `url(#arrow-${EDGE_COLORS[d.type] ? d.type : 'default'})`)
      .style('opacity', 0.7)

    // Edge labels
    const labelBg = g.append('g').selectAll('rect')
      .data(edgesWithCurve.filter((d: any) => d.label))
      .enter().append('rect')
      .attr('rx', 3).attr('ry', 3)
      .attr('fill', '#111214')
      .attr('stroke', '#27272a')
      .attr('stroke-width', 0.5)
      .style('opacity', 0.9)

    const labelText = g.append('g').selectAll('text')
      .data(edgesWithCurve.filter((d: any) => d.label))
      .enter().append('text')
      .text((d: any) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#71717a')
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-geist-mono)')

    // Draw nodes
    const nodeGroup = g.append('g')
    const node = nodeGroup.selectAll('g')
      .data(simNodes)
      .enter().append('g')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x; d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null; d.fy = null
        }) as any
      )

    // Node glow
    node.append('circle')
      .attr('r', (d: any) => d.type === 'company' ? 22 : 16)
      .attr('fill', 'none')
      .attr('stroke', (d: any) => d.risk != null ? riskColor(d.risk) : (NODE_COLORS[d.type] || NODE_COLORS.default))
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.3)
      .style('filter', (d: any) => {
        const color = d.risk != null ? riskColor(d.risk) : (NODE_COLORS[d.type] || NODE_COLORS.default)
        return `drop-shadow(0 0 8px ${color}66)`
      })

    // Node body
    node.append('circle')
      .attr('r', (d: any) => d.type === 'company' ? 18 : 12)
      .attr('fill', (d: any) => {
        if (d.risk != null) return riskColor(d.risk)
        return NODE_COLORS[d.type] || NODE_COLORS.default
      })
      .attr('stroke', (d: any) => {
        if (d.risk != null) return riskColor(d.risk)
        return NODE_COLORS[d.type] || NODE_COLORS.default
      })
      .attr('stroke-width', 2)
      .attr('opacity', 0.9)

    // Node icon
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', (d: any) => d.type === 'company' ? 11 : 9)
      .attr('font-family', 'var(--font-geist-mono)')
      .text((d: any) => d.type === 'company' ? 'E' : d.type === 'partner' ? 'S' : 'L')

    // Node label
    node.append('text')
      .attr('dy', (d: any) => (d.type === 'company' ? 18 : 12) + 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#a1a1aa')
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-geist-sans)')
      .text((d: any) => d.label?.length > 22 ? d.label.slice(0, 20) + '...' : d.label)

    // Click handler
    node.on('click', (_event: any, d: any) => {
      setSelectedNode(d)
      onNodeClick?.(d)
    })

    // Hover effects
    node.on('mouseenter', function () {
      d3.select(this).select('circle:nth-child(2)').attr('opacity', 1)
    }).on('mouseleave', function () {
      d3.select(this).select('circle:nth-child(2)').attr('opacity', 0.9)
    })

    // Tick function
    simulation.on('tick', () => {
      link.attr('d', getLinkPath)

      labelBg.each(function (d: any) {
        const mid = getLinkMid(d)
        const textLen = (d.label?.length || 0) * 5.5
        d3.select(this)
          .attr('x', mid.x - textLen / 2 - 4)
          .attr('y', mid.y - 7)
          .attr('width', textLen + 8)
          .attr('height', 14)
      })

      labelText.each(function (d: any) {
        const mid = getLinkMid(d)
        d3.select(this).attr('x', mid.x).attr('y', mid.y)
      })

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    // Click background to deselect
    svg.on('click', () => setSelectedNode(null))

    return () => { simulation.stop() }
  }, [nodes, edges, width, height, onNodeClick])

  useEffect(() => {
    const cleanup = renderGraph()
    return () => { cleanup?.() }
  }, [renderGraph])

  if (nodes.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-[#111214] rounded-lg border border-zinc-800 ${className || ''}`} style={{ width, height }}>
        <p className="text-gray-500 text-sm">Sem dados de grafo</p>
      </div>
    )
  }

  return (
    <div className={`relative bg-[#111214] rounded-lg border border-zinc-800 overflow-hidden ${className || ''}`} ref={containerRef}>
      <svg ref={svgRef} className="select-none" />

      {/* Selected node detail panel */}
      {selectedNode && (
        <div className="absolute top-3 right-3 bg-[#1a1c1f] border border-zinc-700 rounded-lg p-3 max-w-[280px] shadow-xl z-10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white text-sm font-semibold">{selectedNode.label}</p>
            <button onClick={() => setSelectedNode(null)} className="text-gray-500 hover:text-white text-xs">x</button>
          </div>
          {selectedNode.cnpj && (
            <p className="text-gray-400 text-xs font-mono">{selectedNode.cnpj}</p>
          )}
          {selectedNode.type && (
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border" style={{
              borderColor: NODE_COLORS[selectedNode.type] || NODE_COLORS.default,
              color: NODE_COLORS[selectedNode.type] || NODE_COLORS.default,
            }}>
              {selectedNode.type}
            </span>
          )}
          {selectedNode.risk != null && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: riskColor(selectedNode.risk) }} />
              <span className="text-xs font-mono" style={{ color: riskColor(selectedNode.risk) }}>
                Risco: {(selectedNode.risk * 100).toFixed(0)}%
              </span>
            </div>
          )}
          {selectedNode.detail && (
            <p className="text-gray-400 text-xs mt-2">{selectedNode.detail}</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS.company }} /> Empresa</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS.partner }} /> Socio</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0 border-t border-dashed" style={{ borderColor: EDGE_COLORS.conluio }} /> Conluio</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0 border-t" style={{ borderColor: EDGE_COLORS.socio }} /> Societario</span>
      </div>

      {/* Controls hint */}
      <div className="absolute top-3 left-3 text-[9px] text-gray-600">
        Scroll: zoom | Drag: mover
      </div>
    </div>
  )
}
