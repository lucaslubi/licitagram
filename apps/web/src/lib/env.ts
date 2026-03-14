/**
 * Environment variable validation.
 * Imported at the root layout to fail-fast on missing configuration.
 *
 * Server-only — never import this file from client components.
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`[ENV] Missing required environment variable: ${name}`)
  }
  return value
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback
}

// ─── Validated Environment ──────────────────────────────────────────────────

/** Supabase */
export const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
export const SUPABASE_ANON_KEY = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

/** Stripe */
export const STRIPE_SECRET_KEY = requireEnv('STRIPE_SECRET_KEY')
export const STRIPE_WEBHOOK_SECRET = requireEnv('STRIPE_WEBHOOK_SECRET')

/** Redis */
export const REDIS_URL = optionalEnv('REDIS_URL', 'redis://localhost:6379')

/** AI */
export const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || ''
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
export const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

/** WhatsApp (Evolution API) */
export const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || ''
export const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
export const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'licitagram'

/** App */
export const APP_URL = optionalEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')

/** Revalidation */
export const REVALIDATION_SECRET = process.env.REVALIDATION_SECRET || ''
