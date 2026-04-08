/**
 * Admin Leads Dashboard API — Proxy to VPS2 Data API
 * GET /api/admin/leads/dashboard → Dashboard metrics
 */

import { NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3999'

export async function GET() {
  const user = await getUserWithPlan()
  if (!user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const res = await fetch(`${DATA_API_URL}/api/leads/dashboard`, {
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 502 })
  }
}
