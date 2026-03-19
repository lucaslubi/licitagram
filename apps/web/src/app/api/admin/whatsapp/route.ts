import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'licitagram'

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

async function evolutionFetch(method: string, path: string) {
  const res = await fetch(`${EVOLUTION_API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Evolution API ${res.status}: ${text}`)
  }
  return res.json()
}

// GET — status + QR code
export async function GET() {
  try {
    await requireAdmin()

    // Get connection state
    let state = 'unknown'
    try {
      const stateRes = await evolutionFetch('GET', `/instance/connectionState/${EVOLUTION_INSTANCE}`)
      state = stateRes?.instance?.state || 'unknown'
    } catch {
      return NextResponse.json({ state: 'error', error: 'Evolution API not reachable' })
    }

    // If not connected, get QR code
    let qrBase64: string | null = null
    if (state !== 'open') {
      try {
        const connectRes = await evolutionFetch('GET', `/instance/connect/${EVOLUTION_INSTANCE}`)
        qrBase64 = connectRes?.base64 || null
      } catch {
        // Instance may not exist yet
      }
    }

    return NextResponse.json({ state, qrBase64 })
  } catch (err: any) {
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — actions: restart, logout
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { action } = await req.json()

    if (action === 'restart') {
      await evolutionFetch('PUT', `/instance/restart/${EVOLUTION_INSTANCE}`)
      return NextResponse.json({ ok: true, message: 'Instance restarted' })
    }

    if (action === 'logout') {
      await evolutionFetch('DELETE', `/instance/logout/${EVOLUTION_INSTANCE}`)
      return NextResponse.json({ ok: true, message: 'Logged out' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
