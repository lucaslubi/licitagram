import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

/**
 * GET /api/admin/semantic — Status of semantic matching infrastructure
 *
 * Returns counts of embedded tenders, profiled companies, and semantic matches.
 * Use this to monitor the progress of embedding backfill and semantic matching.
 *
 * To trigger embedding/matching, use the workers CLI:
 *   pnpm --filter @licitagram/workers backfill-embeddings
 */
export async function GET() {
  try {
    const userCtx = await getUserWithPlan()
    if (!userCtx || !userCtx.isPlatformAdmin) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const supabase = await createClient()

    // Run all counts in parallel
    const [
      { count: embeddedTenders },
      { count: totalTenders },
      { count: profiledCompanies },
      { count: totalCompanies },
      { count: semanticMatches },
      { count: aiVerifiedMatches },
      { count: keywordMatches },
    ] = await Promise.all([
      supabase.from('tenders').select('id', { count: 'exact', head: true }).not('embedding', 'is', null),
      supabase.from('tenders').select('id', { count: 'exact', head: true }).in('status', ['analyzing', 'analyzed']),
      supabase.from('companies').select('id', { count: 'exact', head: true }).not('embedding', 'is', null),
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('match_source', 'semantic'),
      supabase.from('matches').select('id', { count: 'exact', head: true }).in('match_source', ['ai', 'ai_triage', 'semantic']),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('match_source', 'keyword'),
    ])

    const hasProvider = !!(process.env.JINA_API_KEY || process.env.OPENAI_API_KEY)

    return NextResponse.json({
      status: hasProvider ? 'ready' : 'no_provider',
      provider: process.env.JINA_API_KEY ? 'jina' : process.env.OPENAI_API_KEY ? 'openai' : 'none',
      tenders: {
        embedded: embeddedTenders || 0,
        total: totalTenders || 0,
        pending: (totalTenders || 0) - (embeddedTenders || 0),
      },
      companies: {
        profiled: profiledCompanies || 0,
        total: totalCompanies || 0,
        pending: (totalCompanies || 0) - (profiledCompanies || 0),
      },
      matches: {
        semantic: semanticMatches || 0,
        aiVerified: aiVerifiedMatches || 0,
        keywordOnly: keywordMatches || 0,
      },
      cli: 'pnpm --filter @licitagram/workers backfill-embeddings',
    })
  } catch (error) {
    console.error('[GET /api/admin/semantic]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
