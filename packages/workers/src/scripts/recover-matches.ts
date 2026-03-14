/**
 * RECOVER MATCHES — One-time script to create matches for all tenders
 * that were missed due to the match_source constraint bug.
 *
 * Only processes tenders that have 0 matches, making it fast and safe.
 *
 * Usage: cd packages/workers && npx tsx src/scripts/recover-matches.ts
 */

import 'dotenv/config'
import { supabase } from '../lib/supabase'
import { runKeywordMatching } from '../processors/keyword-matcher'
import { classifyTenderCNAEs } from '../ai/cnae-classifier'
import { logger } from '../lib/logger'

async function recoverMatches() {
  logger.info('=== MATCH RECOVERY STARTED ===')

  // 1. Find all tenders that have ZERO matches
  const PAGE_SIZE = 200
  let page = 0
  let totalProcessed = 0
  let totalMatched = 0
  let totalClassified = 0

  while (true) {
    // Get tenders with no matches using a left join approach
    const { data: tenders, error } = await supabase
      .from('tenders')
      .select(`
        id,
        objeto,
        cnae_classificados,
        status,
        source
      `)
      .not('objeto', 'is', null)
      .in('status', ['analyzed', 'new'])
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) {
      logger.error({ error }, 'Failed to fetch tenders')
      break
    }

    if (!tenders || tenders.length === 0) break

    // Filter to only those with 0 matches (batch check)
    const tenderIds = tenders.map((t) => t.id)
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('tender_id')
      .in('tender_id', tenderIds)

    const tendersWithMatches = new Set(
      (existingMatches || []).map((m) => m.tender_id),
    )
    const tendersToProcess = tenders.filter(
      (t) => !tendersWithMatches.has(t.id),
    )

    if (tendersToProcess.length > 0) {
      logger.info(
        {
          page,
          total: tenders.length,
          toProcess: tendersToProcess.length,
          alreadyMatched: tenders.length - tendersToProcess.length,
        },
        'Processing page',
      )

      for (const tender of tendersToProcess) {
        try {
          // Classify CNAE if not done yet
          const cnaes = (tender.cnae_classificados as string[]) || []
          if (cnaes.length === 0) {
            try {
              const result = await classifyTenderCNAEs(tender.id)
              if (result.length > 0) totalClassified++
            } catch {
              // Will use keyword-only mode
            }
          }

          // Run matching
          await runKeywordMatching(tender.id)
          totalProcessed++

          // Check if matches were actually created
          const { count } = await supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('tender_id', tender.id)

          if (count && count > 0) {
            totalMatched++
          }

          // Progress log every 50 tenders
          if (totalProcessed % 50 === 0) {
            logger.info(
              { totalProcessed, totalMatched, totalClassified },
              'Recovery progress',
            )
          }
        } catch (err) {
          logger.warn(
            { tenderId: tender.id, err },
            'Failed to process tender',
          )
        }
      }
    } else {
      logger.debug({ page }, 'All tenders on this page already have matches')
    }

    if (tenders.length < PAGE_SIZE) break
    page++
  }

  logger.info(
    {
      totalProcessed,
      totalMatched,
      totalClassified,
    },
    '=== MATCH RECOVERY COMPLETED ===',
  )

  process.exit(0)
}

recoverMatches().catch((err) => {
  logger.error({ err }, 'Match recovery failed')
  process.exit(1)
})
