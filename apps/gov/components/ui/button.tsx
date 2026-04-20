import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Button — institutional editorial
 *
 * Changes vs. earlier version:
 *   - `gradient` variant renamed semantically: now a solid azure CTA (accent),
 *     the institutional action color. Kept className so callers don't break.
 *   - Outline variant: hairline border + card bg, not glass.
 *   - Default: tighter radius (sm), smaller height (h-9), tracked typography.
 *   - No more shadow stack on primary. Enterprise = no shadow fanfare.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md text-[13px] font-medium tracking-[-0.005em]',
    'ring-offset-background transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-[14px] [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border border-primary/40 hover:bg-primary/90',
        /**
         * Institutional azure CTA — the "approve", "generate AI", "publish"
         * button. Solid color. No gradient. Clear ring on focus.
         */
        gradient:
          'bg-accent text-accent-foreground border border-accent hover:bg-accent/92 hover:border-accent/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-destructive/40',
        outline:
          'border border-border bg-card text-foreground hover:bg-muted/60 hover:border-muted-foreground/30',
        secondary:
          'bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80',
        ghost:
          'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        link:
          'text-accent underline-offset-4 hover:underline decoration-accent/40 hover:decoration-accent',
      },
      size: {
        default: 'h-9 px-3.5 py-1.5',
        sm: 'h-8 rounded px-2.5 text-[12px]',
        lg: 'h-10 rounded-md px-5 text-[13.5px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
