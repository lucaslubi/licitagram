'use client'

import { useEffect, useRef, useState } from 'react'

interface GraphNode {
  id: string
  label: string
  type: 'company' | 'partner' | 'tender'
  risk?: number // 0-1
  cnpj?: string
  detail?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphEdge {
  source: string
  target: string
  type: 'socio' | 'endereco' | 'participacao' | 'conluio'
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

function riskColor(risk: number): string {
  if (risk >= 0.7) return '#ef4444' // red
  if (risk >= 0.4) return '#f59e0b' // amber
  return '#10b981' // emerald
}

function riskGlow(risk: number): string {
  if (risk >= 0.7) return '0 0 12px #ef444488'
  if (risk >= 0.4) return '0 0 8px #f59e0b66'
  return '0 0 6px #10b98144'
}

function edgeColor(type: string): string {
  switch (type) {
    case 'socio': return '#6366f1'     // indigo
    case 'endereco': return '#f59e0b'  // amber
    case 'conluio': return '#ef4444'   // red
    case 'participacao': return '#64748b' // slate
    default: return '#3f3f46'          // zinc
  }
}

/**
 * NeuralGraph — Interactive D3-style force-directed graph visualization
 * Renders corporate relationship networks with risk coloring.
 *
 * Uses pure SVG + requestAnimationFrame instead of D3 library
 * to avoid bundle size impact. The force simulation is simplified
 * but produces visually similar results.
 */
export function NeuralGraph({ nodes, edges, width = 800, height = 500, onNodeClick, className }: NeuralGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [dragging, setDragging] = useState<string | null>(null)
  const animRef = useRef<number>(0)

  // Simple force simulation
  useEffect(() => {
    if (nodes.length === 0) return

    const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>()
    const cx = width / 2
    const cy = height / 2

    // Initialize positions in a circle
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length
      const r = Math.min(width, height) * 0.35
      pos.set(n.id, {
        x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * 30,
        y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
      })
    })

    // Edge index for quick lookup
    const edgeIndex = new Map<string, string[]>()
    for (const e of edges) {
      const src = typeof e.source === 'string' ? e.source : (e.source as any).id
      const tgt = typeof e.target === 'string' ? e.target : (e.target as any).id
      if (!edgeIndex.has(src)) edgeIndex.set(src, [])
      if (!edgeIndex.has(tgt)) edgeIndex.set(tgt, [])
      edgeIndex.get(src)!.push(tgt)
      edgeIndex.get(tgt)!.push(src)
    }

    let iter = 0
    const maxIter = 200
    const alpha = 0.3

    function tick() {
      if (iter >= maxIter) {
        setPositions(new Map(Array.from(pos.entries()).map(([k, v]) => [k, { x: v.x, y: v.y }])))
        return
      }
      iter++
      const decay = 1 - iter / maxIter

      // Repulsion (all pairs)
      const nodeArr = Array.from(pos.entries())
      for (let i = 0; i < nodeArr.length; i++) {
        for (let j = i + 1; j < nodeArr.length; j++) {
          const [, a] = nodeArr[i]
          const [, b] = nodeArr[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (150 * decay) / dist
          dx = (dx / dist) * force
          dy = (dy / dist) * force
          a.vx -= dx
          a.vy -= dy
          b.vx += dx
          b.vy += dy
        }
      }

      // Attraction (edges)
      for (const e of edges) {
        const src = typeof e.source === 'string' ? e.source : (e.source as any).id
        const tgt = typeof e.target === 'string' ? e.target : (e.target as any).id
        const a = pos.get(src)
        const b = pos.get(tgt)
        if (!a || !b) continue
        let dx = b.x - a.x
        let dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (dist - 120) * 0.01 * decay
        dx = (dx / dist) * force
        dy = (dy / dist) * force
        a.vx += dx
        a.vy += dy
        b.vx -= dx
        b.vy -= dy
      }

      // Center gravity
      for (const [, p] of pos) {
        p.vx += (cx - p.x) * 0.005 * decay
        p.vy += (cy - p.y) * 0.005 * decay
        p.vx *= 0.8
        p.vy *= 0.8
        p.x += p.vx * alpha
        p.y += p.vy * alpha
        // Clamp to bounds
        p.x = Math.max(40, Math.min(width - 40, p.x))
        p.y = Math.max(40, Math.min(height - 40, p.y))
      }

      if (iter % 5 === 0 || iter >= maxIter - 1) {
        setPositions(new Map(Array.from(pos.entries()).map(([k, v]) => [k, { x: v.x, y: v.y }])))
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [nodes, edges, width, height])

  if (nodes.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-[#111214] rounded-lg border border-zinc-800 ${className || ''}`} style={{ width, height }}>
        <p className="text-gray-500 text-sm">Sem dados de grafo</p>
      </div>
    )
  }

  return (
    <div className={`relative bg-[#111214] rounded-lg border border-zinc-800 overflow-hidden ${className || ''}`}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="select-none"
      >
        {/* Edges */}
        {edges.map((e, i) => {
          const srcId = typeof e.source === 'string' ? e.source : (e.source as any).id
          const tgtId = typeof e.target === 'string' ? e.target : (e.target as any).id
          const srcPos = positions.get(srcId)
          const tgtPos = positions.get(tgtId)
          if (!srcPos || !tgtPos) return null
          return (
            <line
              key={`edge-${i}`}
              x1={srcPos.x}
              y1={srcPos.y}
              x2={tgtPos.x}
              y2={tgtPos.y}
              stroke={edgeColor(e.type)}
              strokeWidth={e.type === 'conluio' ? 2.5 : 1.5}
              strokeOpacity={e.type === 'conluio' ? 0.9 : 0.5}
              strokeDasharray={e.type === 'conluio' ? '6 3' : undefined}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const pos = positions.get(n.id)
          if (!pos) return null
          const risk = n.risk ?? 0
          const r = n.type === 'company' ? 18 : n.type === 'partner' ? 12 : 10
          const isHovered = hoveredNode?.id === n.id
          const color = riskColor(risk)

          return (
            <g
              key={n.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredNode(n)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => onNodeClick?.(n)}
            >
              {/* Glow */}
              <circle
                r={r + 4}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? 3 : 1}
                strokeOpacity={isHovered ? 0.6 : 0.2}
                style={{ filter: `drop-shadow(${riskGlow(risk)})` }}
              />
              {/* Node body */}
              <circle
                r={r}
                fill={n.type === 'company' ? color : '#27272a'}
                stroke={color}
                strokeWidth={2}
                opacity={isHovered ? 1 : 0.85}
              />
              {/* Icon */}
              <text
                textAnchor="middle"
                dy="0.35em"
                fontSize={r * 0.7}
                fill="white"
                fontFamily="var(--font-geist-mono)"
              >
                {n.type === 'company' ? 'E' : n.type === 'partner' ? 'S' : 'L'}
              </text>
              {/* Label */}
              <text
                textAnchor="middle"
                dy={r + 14}
                fontSize={10}
                fill="#a1a1aa"
                fontFamily="var(--font-geist-sans)"
                className="pointer-events-none"
              >
                {n.label.length > 20 ? n.label.slice(0, 18) + '...' : n.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {hoveredNode && (
        <div className="absolute top-3 right-3 bg-[#1a1c1f] border border-zinc-700 rounded-lg p-3 max-w-[250px] shadow-xl z-10">
          <p className="text-white text-sm font-semibold font-[family-name:var(--font-geist-sans)]">{hoveredNode.label}</p>
          {hoveredNode.cnpj && (
            <p className="text-gray-400 text-xs font-[family-name:var(--font-geist-mono)] mt-1">{hoveredNode.cnpj}</p>
          )}
          {hoveredNode.detail && (
            <p className="text-gray-400 text-xs mt-1">{hoveredNode.detail}</p>
          )}
          {hoveredNode.risk != null && (
            <div className="flex items-center gap-2 mt-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: riskColor(hoveredNode.risk) }}
              />
              <span className="text-xs font-[family-name:var(--font-geist-mono)]" style={{ color: riskColor(hoveredNode.risk) }}>
                Risco: {(hoveredNode.risk * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Baixo</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Medio</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Alto</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0 border-t border-dashed border-red-500" /> Conluio</span>
      </div>
    </div>
  )
}
