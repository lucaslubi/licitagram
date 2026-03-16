/**
 * BACKFILL AI TRIAGE — Enqueue all keyword-only matches for AI triage
 *
 * This script finds all matches with match_source='keyword' and enqueues
 * them for AI triage via BullMQ. The ai-triage worker will process them
 * in batches using DeepSeek.
 *
 * Usage: cd packages/workers && npx tsx src/scripts/backfill-triage.ts
 *
 * Requires: DEEPSEEK_API_KEY in .env
 */

import 'dotenv/config'
import { supabase } from '../lib/supabase'
import { aiTriageQueue } from '../queues/ai-triage.queue'

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('ERROR: Set DEEPSEEK_API_KEY in your .env')
    process.exit(1)
  }

  console.log('\n=== BACKFILL AI TRIAGE ===\n')

  // Count keyword matches
  const { count: keywordCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('match_source', 'keyword')

  console.log(`Keyword matches to triage: ${keywordCount || 0}`)

  if (!keywordCount || keywordCount === 0) {
    console.log('Nothing to do!')
    process.exit(0)
  }

  // Get all companies
  const { data: companies } = await supabase
    .from('companies')
    .select('id, razao_social')

  if (!companies || companies.length === 0) {
    console.log('No companies found!')
    process.exit(0)
  }

  console.log(`Companies: ${companies.length}`)

  let totalEnqueued = 0

  for (const company of companies) {
    // Fetch all keyword matches for this company
    const { data: matches } = await supabase
      .from('matches')
      .select('id')
      .eq('company_id', company.id)
      .eq('match_source', 'keyword')
      .order('score', { ascending: false })

    if (!matches || matches.length === 0) {
      console.log(`  ${company.razao_social}: 0 keyword matches, skipping`)
      continue
    }

    const matchIds = matches.map((m) => m.id)
    console.log(`  ${company.razao_social}: ${matchIds.length} keyword matches`)

    // Enqueue in chunks of 50 match IDs per job (matches the BATCH_SIZE in the worker)
    const CHUNK_SIZE = 50
    for (let i = 0; i < matchIds.length; i += CHUNK_SIZE) {
      const chunk = matchIds.slice(i, i + CHUNK_SIZE)
      const jobId = `backfill-triage-${company.id}-${i}`

      await aiTriageQueue.add(
        jobId,
        { companyId: company.id, matchIds: chunk },
        { jobId },
      )
      totalEnqueued++
    }

    console.log(`    Enqueued ${Math.ceil(matchIds.length / CHUNK_SIZE)} triage jobs`)
  }

  console.log(`\n=== DONE: ${totalEnqueued} triage jobs enqueued ===`)
  console.log('The ai-triage worker will process them automatically.')
  console.log('Monitor with: pm2 logs worker-main --lines 50\n')

  // Give BullMQ time to flush
  await new Promise((resolve) => setTimeout(resolve, 2000))
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
