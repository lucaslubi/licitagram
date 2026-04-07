import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  indicatorClassName?: string
}

export function Progress({
  value,
  max = 100,
  className,
  indicatorClassName,
  ...rest
}: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]',
        className,
      )}
      {...rest}
    >
      <div
        className={cn(
          'h-full rounded-full bg-brand transition-all duration-300',
          indicatorClassName,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
