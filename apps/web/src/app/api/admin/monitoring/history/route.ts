export const dynamic = 'force-dynamic'
export const maxDuration = 15

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserWithPlan } from '@/lib/auth-helpers'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

/**
 * GET /api/admin/monitoring/history
 *
 * Returns historical metrics from the system_metrics table.
 *
 * Query params:
 *   - type: metric_type filter (queue, worker, vps, database) — optional
 *   - name: metric_name filter (extraction_wait, ram_used, etc.) — optional
 *   - hours: how many hours of history to return (default: 24, max: 168 = 7 days)
 *   - limit: max rows (default: 500, max: 5000)
 */
export async function GET(req: NextRequest) {
  // Auth check — admin only
  const user = await getUserWithPlan()
  if (!user || !user.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = req.nextUrl
    const metricType = searchParams.get('type')
    const metricName = searchParams.get('name')
    const hours = Math.min(parseInt(searchParams.get('hours') || '24', 10), 168)
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 5000)

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from('system_metrics')
      .select('id, metric_type, metric_name, metric_value, recorded_at')
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: false })
      .limit(limit)

    if (metricType) {
      query = query.eq('metric_type', metricType)
    }
    if (metricName) {
      query = query.eq('metric_name', metricName)
    }

    const { data, error } = await query

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json({
          metrics: [],
          message: 'system_metrics table not found. Run the migration first.',
        })
      }
      throw error
    }

    // Group by metric_name for easier charting
    const grouped: Record<string, Array<{ value: number; time: string }>> = {}
    for (const row of data || []) {
      const key = `${row.metric_type}:${row.metric_name}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push({
        value: Number(row.metric_value),
        time: row.recorded_at,
      })
    }

    return NextResponse.json({
      hours,
      since,
      total_rows: (data || []).length,
      metrics: grouped,
    })
  } catch (err) {
    console.error('Monitoring history failed:', err)
    return NextResponse.json(
      { error: 'Failed to fetch monitoring history', detail: String(err) },
      { status: 500 },
    )
  }
}
