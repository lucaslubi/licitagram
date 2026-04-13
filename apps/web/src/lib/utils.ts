import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitize user input for safe interpolation into Supabase PostgREST
 * filter strings (.or(), .ilike(), etc.).
 *
 * Strips characters that have special meaning in PostgREST filter syntax:
 *   %  _  ,  .  (  )  \
 */
export function sanitizePostgrestFilterValue(value: string): string {
  return value.replace(/[%_,.()\\]/g, '')
}
