'use client'

import { useMemo } from 'react'

interface WinCurvePoint {
  discount_pct: number
  ratio: number
  price: number
  win_probability: number
}

interface Strategy {
  strategy: string
  discount_pct: number
  win_probability: number
  price: number
}

interface WinCurveChartProps {
  curve: WinCurvePoint[]
  strategies: Strategy[]
  compact?: boolean
}

const COLORS = {
  agressivo: '#ef4444',
  competitivo: '#f59e0b',
  seguro: '#10b981',
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}mil`
  return n.toFixed(0)
}

export function WinCurveChart({ curve, strategies, compact = false }: WinCurveChartProps) {
  const width = compact ? 320 : 480
  const height = compact ? 160 : 220
  const padding = { top: 20, right: 20, bottom: 32, left: 44 }

  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const { path, areaPath } = useMemo(() => {
    if (curve.length === 0) return { path: '', areaPath: '' }

    // X: discount_pct (reversed: high discount = left, low = right)
    const xMin = Math.min(...curve.map((p) => p.discount_pct))
    const xMax = Math.max(...curve.map((p) => p.discount_pct))
    const xRange = xMax - xMin || 1

    const points = curve.map((p) => {
      const x = padding.left + ((p.discount_pct - xMin) / xRange) * chartW
      const y = padding.top + chartH - (p.win_probability / 100) * chartH
      return { x, y, ...p }
    })

    // Sort by x
    points.sort((a, b) => a.x - b.x)

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const area = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`

    return { path: linePath, areaPath: area }
  }, [curve, chartW, chartH, padding.left, padding.top])

  if (curve.length === 0) return null

  const xMin = Math.min(...curve.map((p) => p.discount_pct))
  const xMax = Math.max(...curve.map((p) => p.discount_pct))
  const xRange = xMax - xMin || 1

  function xPos(discountPct: number): number {
    return padding.left + ((discountPct - xMin) / xRange) * chartW
  }
  function yPos(prob: number): number {
    return padding.top + chartH - (prob / 100) * chartH
  }

  // Y-axis ticks
  const yTicks = compact ? [0, 50, 100] : [0, 25, 50, 75, 100]
  // X-axis ticks (discount %)
  const xStep = Math.max(5, Math.round(xRange / (compact ? 3 : 5) / 5) * 5)
  const xTicks: number[] = []
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    xTicks.push(x)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxWidth: width }}
    >
      {/* Grid lines */}
      {yTicks.map((t) => (
        <line
          key={`y-${t}`}
          x1={padding.left}
          x2={width - padding.right}
          y1={yPos(t)}
          y2={yPos(t)}
          stroke="#2d2f33"
          strokeWidth={0.5}
        />
      ))}

      {/* Area fill */}
      <defs>
        <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill="url(#curveGrad)" />}

      {/* Curve line */}
      {path && <path d={path} fill="none" stroke="#10b981" strokeWidth={2} />}

      {/* Strategy markers */}
      {strategies.map((s) => {
        const color = COLORS[s.strategy as keyof typeof COLORS] || '#888'
        const cx = xPos(s.discount_pct)
        const cy = yPos(s.win_probability)
        return (
          <g key={s.strategy}>
            <line
              x1={cx}
              x2={cx}
              y1={padding.top}
              y2={padding.top + chartH}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.5}
            />
            <circle cx={cx} cy={cy} r={4} fill={color} stroke="#1a1c1f" strokeWidth={2} />
            {!compact && (
              <text
                x={cx}
                y={padding.top - 6}
                fill={color}
                fontSize={9}
                fontWeight={600}
                textAnchor="middle"
              >
                R${formatCompact(s.price)}
              </text>
            )}
          </g>
        )
      })}

      {/* Y-axis labels */}
      {yTicks.map((t) => (
        <text
          key={`yl-${t}`}
          x={padding.left - 6}
          y={yPos(t) + 3}
          fill="#6b7280"
          fontSize={9}
          textAnchor="end"
        >
          {t}%
        </text>
      ))}

      {/* X-axis labels */}
      {xTicks.map((t) => (
        <text
          key={`xl-${t}`}
          x={xPos(t)}
          y={height - 6}
          fill="#6b7280"
          fontSize={9}
          textAnchor="middle"
        >
          {t}%
        </text>
      ))}

      {/* Axis labels */}
      {!compact && (
        <>
          <text
            x={padding.left - 32}
            y={padding.top + chartH / 2}
            fill="#9ca3af"
            fontSize={8}
            textAnchor="middle"
            transform={`rotate(-90, ${padding.left - 32}, ${padding.top + chartH / 2})`}
          >
            P(vitória)
          </text>
          <text
            x={padding.left + chartW / 2}
            y={height - 0}
            fill="#9ca3af"
            fontSize={8}
            textAnchor="middle"
          >
            Desconto sobre valor estimado
          </text>
        </>
      )}
    </svg>
  )
}
