/**
 * Admin Leads API — Proxy to VPS2 Data API
 *
 * GET  /api/admin/leads           → List leads with filters
 * POST /api/admin/leads           → Export CSV
 *
 * Protected: requirePlatformAdmin()
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3999'

export async function GET(request: NextRequest) {
  const user = await getUserWithPlan()
  if (!user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const queryString = searchParams.toString()

  try {
    const res = await fetch(`${DATA_API_URL}/api/leads?${queryString}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getUserWithPlan()
  if (!user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json()

    // Rate limit: check export count today (simple in-memory for now)
    // TODO: move to Redis for multi-instance

    const res = await fetch(`${DATA_API_URL}/api/leads/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        adminEmail: user.email,
        adminUserId: user.userId,
      }),
    })

    if (res.headers.get('content-type')?.includes('text/csv')) {
      const csvData = await res.text()
      return new NextResponse(csvData, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="leads.csv"',
          'X-Total-Leads': res.headers.get('x-total-leads') || '0',
          'X-Total-Blocked-LGPD': res.headers.get('x-total-blocked-lgpd') || '0',
        },
      })
    }

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to export leads' }, { status: 502 })
  }
}
