import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Props {
  rows?: number
  showHeader?: boolean
  className?: string
}

export function LoadingCard({ rows = 3, showHeader = true, className }: Props) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-6', className)}>
      {showHeader && (
        <div className="mb-6 space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  )
}
