import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function getWahaConfig() {
  return {
    url: process.env.WAHA_URL || 'http://85.31.60.53:3000',
    key: process.env.WAHA_API_KEY || '',
    session: process.env.WAHA_SESSION || 'default',
  }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_platform_admin) throw new Error('Forbidden')
  return user
}

async function wahaFetch(method: string, path: string, body?: unknown) {
  const { url, key } = getWahaConfig()
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`WAHA ${res.status}: ${text}`)
  }
  return res
}

// Map WAHA status → UI state
function mapState(status: string): string {
  switch (status) {
    case 'WORKING':
      return 'open'
    case 'SCAN_QR_CODE':
      return 'connecting'
    case 'STARTING':
    case 'STOPPED':
      return 'connecting'
    case 'FAILED':
      return 'close'
    default:
      return 'unknown'
  }
}

// GET — status + QR code (as base64 data URL)
export async function GET() {
  try {
    await requireAdmin()
    const { session } = getWahaConfig()

    let status = 'UNKNOWN'
    let me: { id?: string; pushName?: string } | null = null
    try {
      const r = await wahaFetch('GET', `/api/sessions/${session}`)
      const data = await r.json()
      status = data?.status || 'UNKNOWN'
      me = data?.me || null
    } catch (fetchErr: any) {
      // Session may not exist — try to start it
      try {
        await wahaFetch('POST', `/api/sessions/start`, { name: session })
        status = 'STARTING'
      } catch (startErr: any) {
        return NextResponse.json({
          state: 'error',
          error: `WAHA não acessível em ${getWahaConfig().url}`,
          detail: startErr?.message || String(startErr),
        })
      }
    }

    const state = mapState(status)

    let qrBase64: string | null = null
    if (status === 'SCAN_QR_CODE') {
      try {
        const r = await wahaFetch('GET', `/api/${session}/auth/qr?format=image`)
        const buf = Buffer.from(await r.arrayBuffer())
        qrBase64 = `data:image/png;base64,${buf.toString('base64')}`
      } catch {
        // QR not ready yet
      }
    }

    return NextResponse.json({ state, status, qrBase64, me })
  } catch (err: any) {
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — actions: restart, logout, start
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { action } = await req.json()
    const { session } = getWahaConfig()

    if (action === 'restart') {
      await wahaFetch('POST', `/api/sessions/${session}/restart`).catch(async () => {
        await wahaFetch('POST', `/api/sessions/stop`, { name: session })
        await wahaFetch('POST', `/api/sessions/start`, { name: session })
      })
      return NextResponse.json({ ok: true, message: 'Sessão reiniciada' })
    }

    if (action === 'logout') {
      await wahaFetch('POST', `/api/sessions/logout`, { name: session }).catch(async () => {
        await wahaFetch('POST', `/api/sessions/${session}/logout`)
      })
      return NextResponse.json({ ok: true, message: 'Deslogado' })
    }

    if (action === 'start') {
      await wahaFetch('POST', `/api/sessions/start`, { name: session })
      return NextResponse.json({ ok: true, message: 'Sessão iniciada' })
    }

    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
  } catch (err: any) {
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
