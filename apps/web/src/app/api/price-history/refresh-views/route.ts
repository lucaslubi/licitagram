import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * POST /api/price-history/refresh-views
 *
 * Refreshes the competitor_bid_patterns materialized view.
 * Called by Vercel Cron or manually by admin.
 * Protected by CRON_SECRET to prevent unauthorized calls.
 */
export async function POST(req: NextRequest) {
  // Verify cron secret or admin auth
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Refresh competitor_bid_patterns materialized view
    const { error } = await supabase.rpc('refresh_competitor_bid_patterns')

    if (error) {
      // If RPC doesn't exist, try direct SQL
      const { error: sqlError } = await supabase.from('competitor_bid_patterns').select('total_bids').limit(1)
      if (sqlError) {
        return NextResponse.json({ error: 'View not available', detail: sqlError.message }, { status: 500 })
      }
      // View exists but RPC doesn't — that's OK, the view is readable
      return NextResponse.json({ status: 'ok', message: 'View exists but auto-refresh RPC not configured' })
    }

    return NextResponse.json({ status: 'refreshed', timestamp: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Also support GET for Vercel Cron (cron jobs use GET)
export async function GET(req: NextRequest) {
  return POST(req)
}
