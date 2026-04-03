'use client'

interface NeuralRiskGaugeProps {
  score: number // 0 to 1
  size?: number
  label?: string
}

/**
 * NeuralRiskGauge — Animated circular gauge showing risk score.
 * Styled for Licitagram dark theme.
 */
export function NeuralRiskGauge({ score, size = 160, label }: NeuralRiskGaugeProps) {
  const pct = Math.min(1, Math.max(0, score))
  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct * 0.75) // 270deg arc

  const color = pct >= 0.7 ? '#ef4444' : pct >= 0.4 ? '#f59e0b' : '#10b981'
  const bg = pct >= 0.7 ? 'rgba(239,68,68,0.1)' : pct >= 0.4 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'
  const levelText = pct >= 0.7 ? 'CRITICO' : pct >= 0.4 ? 'MEDIO' : 'BAIXO'

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-[135deg]">
          {/* Background arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth={8}
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeDasharray={`${circumference * 0.75 * pct} ${circumference}`}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${color}66)`,
              transition: 'stroke-dasharray 1s ease-out',
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold font-[family-name:var(--font-geist-mono)]"
            style={{ color }}
          >
            {(pct * 100).toFixed(0)}
          </span>
          <span className="text-[10px] font-semibold tracking-wider" style={{ color }}>
            {levelText}
          </span>
        </div>
      </div>
      {label && <p className="text-gray-400 text-xs mt-2">{label}</p>}
    </div>
  )
}
