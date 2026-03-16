/**
 * BACKFILL EMBEDDINGS — Batch embed all tenders and profile all companies
 *
 * This script embeds existing tenders and companies that don't have
 * vector embeddings yet, preparing them for semantic matching.
 *
 * Usage: cd packages/workers && npx tsx src/scripts/backfill-embeddings.ts
 *
 * Requires: JINA_API_KEY or OPENAI_API_KEY in .env
 */

import 'dotenv/config'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { batchEmbedTenders, profileAllCompanies } from '../processors/company-profiler'
import { runSemanticMatchingSweep } from '../processors/semantic-matcher'

async function main() {
  if (!process.env.JINA_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error('ERROR: Set JINA_API_KEY or OPENAI_API_KEY in your .env')
    process.exit(1)
  }

  const provider = process.env.JINA_API_KEY ? 'Jina AI v3' : 'OpenAI text-embedding-3-small'
  console.log(`\n=== BACKFILL EMBEDDINGS (provider: ${provider}) ===\n`)

  // 1. Count current state
  const { count: totalTenders } = await supabase
    .from('tenders')
    .select('id', { count: 'exact', head: true })
    .in('status', ['analyzing', 'analyzed'])

  const { count: embeddedTenders } = await supabase
    .from('tenders')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null)

  const { count: totalCompanies } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })

  const { count: profiledCompanies } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null)

  console.log(`Tenders: ${embeddedTenders || 0}/${totalTenders || 0} embedded`)
  console.log(`Companies: ${profiledCompanies || 0}/${totalCompanies || 0} profiled`)
  console.log('')

  // 2. Embed tenders
  const pendingTenders = (totalTenders || 0) - (embeddedTenders || 0)
  if (pendingTenders > 0) {
    console.log(`Embedding ${pendingTenders} tenders...`)
    let totalEmbedded = 0
    let totalFailed = 0

    // Process in rounds of 500
    while (true) {
      const result = await batchEmbedTenders(500)
      totalEmbedded += result.embedded
      totalFailed += result.failed

      console.log(`  Batch done: +${result.embedded} embedded, ${result.failed} failed (total: ${totalEmbedded})`)

      if (result.embedded === 0) break // No more to process
    }

    console.log(`Tenders complete: ${totalEmbedded} embedded, ${totalFailed} failed\n`)
  } else {
    console.log('All tenders already embedded.\n')
  }

  // 3. Profile companies
  const pendingCompanies = (totalCompanies || 0) - (profiledCompanies || 0)
  if (pendingCompanies > 0) {
    console.log(`Profiling ${pendingCompanies} companies...`)
    const result = await profileAllCompanies()
    console.log(`Companies complete: ${result.profiled} profiled, ${result.failed} failed\n`)
  } else {
    console.log('All companies already profiled.\n')
  }

  // 4. Ask if user wants to run semantic sweep
  const skipSweep = process.argv.includes('--no-sweep')
  if (skipSweep) {
    console.log('Skipping semantic matching sweep (--no-sweep flag).\n')
  } else {
    console.log('Running semantic matching sweep...')
    await runSemanticMatchingSweep()
    console.log('Sweep complete.\n')
  }

  // 5. Final stats
  const { count: finalEmbedded } = await supabase
    .from('tenders')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null)

  const { count: finalProfiled } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null)

  const { count: semanticMatches } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('match_source', 'semantic')

  console.log('=== FINAL STATE ===')
  console.log(`Tenders embedded: ${finalEmbedded || 0}/${totalTenders || 0}`)
  console.log(`Companies profiled: ${finalProfiled || 0}/${totalCompanies || 0}`)
  console.log(`Semantic matches: ${semanticMatches || 0}`)
  console.log('')

  process.exit(0)
}

main().catch((err) => {
  logger.error({ err }, 'Backfill embeddings failed')
  console.error('FATAL:', err)
  process.exit(1)
})
