'use client'

import { cn } from '@/lib/utils'

interface ScoreRingProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  label?: string
  sublabel?: string
  className?: string
}

function getScoreColor(score: number): { start: string; end: string } {
  if (score >= 80) return { start: '#10B981', end: '#84CC16' }
  if (score >= 60) return { start: '#84CC16', end: '#F59E0B' }
  if (score >= 40) return { start: '#F59E0B', end: '#F97316' }
  return { start: '#EF4444', end: '#F97316' }
}

const SIZES = {
  sm: { outer: 'w-16 h-16', text: 'text-lg', sub: 'text-[7px]', stroke: 5, radius: 28, inset: 'inset-1.5' },
  md: { outer: 'w-24 h-24', text: 'text-2xl', sub: 'text-[8px]', stroke: 6, radius: 40, inset: 'inset-2' },
  lg: { outer: 'w-32 h-32', text: 'text-4xl', sub: 'text-[10px]', stroke: 7, radius: 55, inset: 'inset-2.5' },
}

export function ScoreRing({ score, size = 'md', label = 'Score IA', sublabel, className }: ScoreRingProps) {
  const s = SIZES[size]
  const colors = getScoreColor(score)
  const circumference = 2 * Math.PI * s.radius
  const dashArray = `${(score / 100) * circumference} ${circumference}`
  const gradientId = `score-gradient-${size}-${score}`
  const viewBox = size === 'lg' ? '0 0 120 120' : size === 'md' ? '0 0 90 90' : '0 0 64 64'
  const center = size === 'lg' ? 60 : size === 'md' ? 45 : 32

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className={cn('relative shrink-0', s.outer)}>
        <svg viewBox={viewBox} className="w-full h-full -rotate-90">
          <circle
            cx={center} cy={center} r={s.radius}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={s.stroke}
            fill="none"
          />
          <circle
            cx={center} cy={center} r={s.radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={s.stroke}
            fill="none"
            strokeDasharray={dashArray}
            strokeLinecap="round"
            className="animate-score-fill"
            style={{ animationDuration: '1.2s' }}
          />
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colors.start} />
              <stop offset="100%" stopColor={colors.end} />
            </linearGradient>
          </defs>
        </svg>
        <div className={cn('absolute rounded-full bg-[#0a0a0b] flex items-center justify-center', s.inset)}>
          <div className="text-center">
            <span className={cn('font-bold font-mono tracking-tight text-white', s.text)}>{score}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <span className={cn('uppercase tracking-wider text-[#71717a] font-medium', s.sub)}>{label}</span>
        {sublabel && (
          <span className="text-xs text-[#a1a1aa] mt-0.5">{sublabel}</span>
        )}
      </div>
    </div>
  )
}
