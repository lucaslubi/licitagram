/**
 * Local smoke test: run the BotSessionRunner against MockPortal.
 *
 * Useful for:
 *   - Verifying the whole pipeline (crypto → browser pool → runner →
 *     strategy → DB writes → bot_events) end-to-end without hitting a
 *     real government portal.
 *   - Reproducing bug reports locally.
 *
 * Requirements:
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - PREGAO_CREDENTIALS_MASTER_KEY (32-byte hex)
 *   - REDIS_URL is NOT required — this script skips the queue and calls
 *     the runner directly.
 *
 * Usage:
 *   pnpm --filter @licitagram/workers exec tsx \
 *     src/bot/scripts/run-local-mock.ts <company_id> [config_id]
 *
 * If config_id is omitted, a temporary bot_configs row is created with a
 * throwaway credential (encrypted) and a bot_sessions row for portal=mock.
 */

import { createClient } from '@supabase/supabase-js'
import { encryptSecret } from '../lib/crypto'
import { BotSessionRunner } from '../bot-session-runner'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!process.env.PREGAO_CREDENTIALS_MASTER_KEY) {
  console.error('Missing PREGAO_CREDENTIALS_MASTER_KEY')
  process.exit(1)
}

const companyId = process.argv[2]
if (!companyId) {
  console.error('Usage: run-local-mock.ts <company_id>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

async function main(): Promise<void> {
  // 1. Create (or reuse) a mock bot_config
  const username = 'mock-user'
  const password = 'mock-password-do-not-use'
  const { cipher, nonce } = encryptSecret(password)

  const { data: cfg, error: cfgErr } = await supabase
    .from('bot_configs')
    .upsert(
      {
        company_id: companyId,
        portal: 'comprasgov', // the CHECK on bot_configs doesn't include 'mock'; use an allowed value
        username,
        password_cipher: cipher,
        password_nonce: nonce,
        strategy: 'minimal_decrease',
        min_decrease_value: 1,
        min_decrease_percent: 0,
        is_active: true,
      },
      { onConflict: 'company_id,portal' },
    )
    .select('id')
    .single()

  if (cfgErr || !cfg) {
    console.error('Failed to create bot_config:', cfgErr?.message)
    process.exit(2)
  }

  // 2. Create a mock bot_session
  const { data: session, error: sessErr } = await supabase
    .from('bot_sessions')
    .insert({
      company_id: companyId,
      config_id: cfg.id,
      pregao_id: 'MOCK-' + Date.now(),
      portal: 'mock', // MockPortal branch in runner.makePortal
      status: 'pending',
      mode: 'auto_bid',
      strategy_config: { type: 'minimal_decrease' },
      min_price: 100,
      max_bids: 5,
    })
    .select('id')
    .single()

  if (sessErr || !session) {
    console.error('Failed to create bot_session:', sessErr?.message)
    process.exit(3)
  }

  console.log('Running session', session.id)

  // 3. Run
  const runner = new BotSessionRunner(session.id, `local-${process.pid}`)
  const result = await runner.run()
  console.log('result:', result)

  // 4. Dump the bot_events for inspection
  const { data: events } = await supabase
    .from('bot_events')
    .select('t_ms, kind, payload')
    .eq('session_id', session.id)
    .order('occurred_at', { ascending: true })

  console.log('\n── Forensic timeline ──')
  for (const e of events ?? []) {
    console.log(`+${String(e.t_ms).padStart(7, ' ')}ms  ${e.kind.padEnd(24, ' ')} ${JSON.stringify(e.payload)}`)
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
