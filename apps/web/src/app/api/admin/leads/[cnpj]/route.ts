/**
 * Admin Lead Detail API — Proxy to VPS2 Data API
 * GET /api/admin/leads/:cnpj → Lead detail
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3997'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cnpj: string }> },
) {
  const user = await getUserWithPlan()
  if (!user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { cnpj } = await params

  try {
    const res = await fetch(`${DATA_API_URL}/api/leads/${cnpj}`, {
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 502 })
  }
}
