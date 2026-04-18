import Image from 'next/image'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
  withWordmark?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const FULL_SIZES: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-7',
  md: 'h-10',
  lg: 'h-14',
  xl: 'h-20',
  '2xl': 'h-28',
}

const MARK_SIZES: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-7 w-7',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
  xl: 'h-20 w-20',
  '2xl': 'h-28 w-28',
}

export function Logo({ className, withWordmark = true, size = 'md' }: Props) {
  if (withWordmark) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <Image
          src="/logo.png"
          alt="LicitaGram Gov"
          width={738}
          height={338}
          priority
          className={cn('w-auto shrink-0', FULL_SIZES[size])}
        />
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center', className)}>
      <Image
        src="/logo.png"
        alt="LicitaGram Gov"
        width={738}
        height={338}
        priority
        className={cn('shrink-0 object-contain object-left', MARK_SIZES[size])}
        style={{ objectPosition: 'left center', objectFit: 'cover', aspectRatio: '1 / 1' }}
      />
    </span>
  )
}
