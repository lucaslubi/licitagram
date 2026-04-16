/**
 * Public Bot API — bearer token authentication.
 *
 * Clients send `Authorization: Bearer <token>` on every request to the
 * `/api/v1/bot/*` surface. The token is a 48-char random URL-safe string
 * generated via crypto.randomBytes(36).toString('base64url'); the web
 * stores only its SHA-256 in `bot_api_keys.key_hash`.
 *
 * Lookup:
 *   1. Compute SHA-256 of the incoming plaintext.
 *   2. Query bot_api_keys by key_hash (UNIQUE index) with revoked_at IS NULL
 *      and (expires_at IS NULL OR expires_at > now()).
 *   3. Update last_used_at (best-effort) and return { companyId, keyId, scopes }.
 *
 * Failure modes all return HTTP 401 — we intentionally do not distinguish
 * "missing" / "revoked" / "expired" to avoid token oracle attacks.
 */

import * as crypto from 'node:crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export interface ApiKeyContext {
  keyId: string
  companyId: string
  scopes: string[]
}

export interface AuthSuccess {
  ok: true
  key: ApiKeyContext
}

export interface AuthFailure {
  ok: false
  status: 401
  error: string
}

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Generate a new plaintext token and its metadata. The caller stores only
 * the hash; the plaintext is returned ONCE to show the user.
 */
export function generateApiKey(): {
  plaintext: string
  hash: Buffer
  preview: string
} {
  const plaintext = crypto.randomBytes(36).toString('base64url')
  const hash = crypto.createHash('sha256').update(plaintext).digest()
  const preview = plaintext.slice(0, 8)
  return { plaintext, hash, preview }
}

/**
 * Hash a plaintext token for lookup.
 */
export function hashApiKey(plaintext: string): Buffer {
  return crypto.createHash('sha256').update(plaintext).digest()
}

/**
 * Authenticate a request. Returns { ok: true, key } on success.
 */
export async function authenticate(req: Request): Promise<AuthSuccess | AuthFailure> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!authHeader) {
    return { ok: false, status: 401, error: 'Missing Authorization header' }
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return { ok: false, status: 401, error: 'Authorization must be Bearer' }
  }
  const plaintext = match[1].trim()
  if (plaintext.length < 20) {
    return { ok: false, status: 401, error: 'Invalid token' }
  }

  const supabase = getServiceSupabase()
  const hash = hashApiKey(plaintext)

  const { data, error } = await supabase
    .from('bot_api_keys')
    .select('id, company_id, scopes, revoked_at, expires_at')
    .eq('key_hash', hash)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, status: 401, error: 'Invalid token' }
  }
  if (data.revoked_at) {
    return { ok: false, status: 401, error: 'Invalid token' }
  }
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 401, error: 'Invalid token' }
  }

  // Best-effort last_used_at bump
  supabase
    .from('bot_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => undefined, () => undefined)

  return {
    ok: true,
    key: {
      keyId: data.id as string,
      companyId: data.company_id as string,
      scopes: (data.scopes as string[] | null) ?? [],
    },
  }
}

export function requireScope(ctx: ApiKeyContext, required: string): boolean {
  return ctx.scopes.includes(required) || ctx.scopes.includes('admin')
}
