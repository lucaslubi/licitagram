import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { invalidateCache } from '@/lib/redis'

/**
 * Cache invalidation endpoint.
 * Called by workers after writing new data.
 *
 * POST /api/revalidate
 * Headers: { Authorization: Bearer <REVALIDATION_SECRET> }
 * Body: { target: 'tenders' | 'matches' | 'all', companyId?: string }
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATION_SECRET
  if (!secret) {
    console.error('[revalidate] REVALIDATION_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''

  // Constant-time comparison to prevent timing attacks
  if (
    !token ||
    token.length !== secret.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { target, companyId } = body as { target: string; companyId?: string }

    let deleted = 0

    switch (target) {
      case 'tenders':
        deleted += await invalidateCache('cache:tenders:*')
        deleted += await invalidateCache('cache:stats:*')
        break

      case 'matches':
        if (companyId) {
          deleted += await invalidateCache(`cache:matches:${companyId}:*`)
        } else {
          deleted += await invalidateCache('cache:matches:*')
        }
        break

      case 'all':
        deleted += await invalidateCache('cache:*')
        break

      default:
        return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
