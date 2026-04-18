import Image from 'next/image'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
  withWordmark?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const FULL_SIZES: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-5',
  md: 'h-7',
  lg: 'h-10',
}

const MARK_SIZES: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
  lg: 'h-10 w-10',
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
