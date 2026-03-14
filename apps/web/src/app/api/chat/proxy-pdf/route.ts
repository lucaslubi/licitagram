import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * GET /api/chat/proxy-pdf?url=...
 *
 * Proxies a PDF download to bypass CORS restrictions on government sites.
 * The browser can't fetch cross-origin PDFs directly (government sites
 * don't set CORS headers), so we proxy through our server.
 */
export async function GET(request: NextRequest) {
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasFeature(userCtx, 'chat_ia')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit: 30 proxy requests per minute
  const rateCheck = await checkRateLimit(`pdf-proxy:${userCtx.userId}`, 30, 60)
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // SSRF protection: block private/internal IPs
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 })
    }
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  try {
    const pdfResponse = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Licitagram/1.0; +https://licitagram.com.br)',
        Accept: 'application/pdf, */*',
      },
      redirect: 'follow',
    })

    if (!pdfResponse.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${pdfResponse.status}` },
        { status: 502 },
      )
    }

    const buffer = await pdfResponse.arrayBuffer()

    if (buffer.byteLength > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 })
    }

    if (buffer.byteLength < 100) {
      return NextResponse.json({ error: 'File too small' }, { status: 422 })
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[PDF Proxy] Error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch PDF' },
      { status: 502 },
    )
  }
}
