/**
 * One-shot backfill: encrypt every bot_configs row that still has a plaintext
 * password_hash or cookies column, populate the new bytea cipher columns,
 * then null out the legacy plaintext fields in the SAME UPDATE.
 *
 * Idempotent: safe to re-run. Only processes rows where
 *   (password_hash IS NOT NULL AND password_cipher IS NULL)
 * or
 *   (cookies       IS NOT NULL AND cookies_cipher  IS NULL)
 *
 * Run after migration 20260416200000_bot_phase0_hardening.sql is applied:
 *
 *   pnpm --filter @licitagram/workers exec \
 *     tsx src/bot/scripts/migrate-plaintext-passwords.ts
 *
 * Requires env:
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   - PREGAO_CREDENTIALS_MASTER_KEY
 *
 * The script NEVER prints plaintext, even in debug output.
 */

import { createClient } from '@supabase/supabase-js'
import { encryptSecret } from '../lib/crypto'

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!process.env.PREGAO_CREDENTIALS_MASTER_KEY) {
  console.error('Missing PREGAO_CREDENTIALS_MASTER_KEY — cannot encrypt')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

interface PlaintextRow {
  id: string
  company_id: string
  portal: string
  password_hash: string | null
  password_cipher: string | null // bytea comes back as base64 string via PostgREST
  cookies: string | null
  cookies_cipher: string | null
}

async function main(): Promise<void> {
  console.log('[migrate-plaintext-passwords] starting sweep')

  const { data: rows, error } = await supabase
    .from('bot_configs')
    .select('id, company_id, portal, password_hash, password_cipher, cookies, cookies_cipher')
    .or('and(password_hash.not.is.null,password_cipher.is.null),and(cookies.not.is.null,cookies_cipher.is.null)')

  if (error) {
    console.error('[migrate-plaintext-passwords] query error:', error.message)
    process.exit(2)
  }

  const candidates = (rows ?? []) as PlaintextRow[]
  console.log(`[migrate-plaintext-passwords] ${candidates.length} row(s) need backfill`)

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const row of candidates) {
    const update: Record<string, unknown> = {}

    try {
      // Password
      if (row.password_hash && !row.password_cipher) {
        const { cipher, nonce } = encryptSecret(row.password_hash)
        update.password_cipher = cipher
        update.password_nonce = nonce
        update.password_hash = null
      }

      // Cookies (session storage state, if present)
      if (row.cookies && !row.cookies_cipher) {
        const { cipher, nonce } = encryptSecret(row.cookies)
        update.cookies_cipher = cipher
        update.cookies_nonce = nonce
        update.cookies = null
      }

      if (Object.keys(update).length === 0) {
        skipped++
        continue
      }

      const { error: upErr } = await supabase
        .from('bot_configs')
        .update(update)
        .eq('id', row.id)

      if (upErr) {
        console.error(
          `[migrate-plaintext-passwords] update failed for ${row.id} (${row.portal}): ${upErr.message}`,
        )
        failed++
        continue
      }

      migrated++
      console.log(`[migrate-plaintext-passwords]   encrypted row ${row.id} (portal=${row.portal})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[migrate-plaintext-passwords] encrypt error for ${row.id}: ${msg}`)
      failed++
    }
  }

  console.log(
    `[migrate-plaintext-passwords] done: migrated=${migrated} skipped=${skipped} failed=${failed}`,
  )

  if (failed > 0) {
    process.exit(3)
  }
}

main().catch((err) => {
  console.error('[migrate-plaintext-passwords] fatal:', err)
  process.exit(1)
})
