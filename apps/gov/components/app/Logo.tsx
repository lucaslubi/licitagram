import { cn } from '@/lib/utils'

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 7h16M4 12h10M4 17h16" strokeLinecap="round" />
        </svg>
      </span>
      {withWordmark && (
        <span className="text-sm font-semibold tracking-tight">
          LicitaGram <span className="text-primary">Gov</span>
        </span>
      )}
    </span>
  )
}
