import Stripe from 'stripe'

/**
 * Centralized Stripe client for server-side use.
 *
 * Lazy-instantiated so importing this module never throws when STRIPE_SECRET_KEY
 * is missing (e.g. during build of unrelated routes).
 */
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  _stripe = new Stripe(key)
  return _stripe
}

/** Convenience proxy: import { stripe } and use any SDK method. */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const s = getStripe() as unknown as Record<string | symbol, unknown>
    return s[prop as string]
  },
}) as Stripe
