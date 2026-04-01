import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 120

const VPS_LOGIN_URL = process.env.VPS_LOGIN_URL || 'http://187.77.241.93:3999'

/**
 * POST /api/bot/connect
 * Proxies guided-login actions to the VPS Playwright login server.
 *
 * Body: { action: 'start' | 'type' | 'click' | 'screenshot' | 'cookies' | 'close', ...params }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    const body = await req.json()
    const { action, ...params } = body

    if (!action) {
      return NextResponse.json({ error: 'action required' }, { status: 400 })
    }

    let vpsEndpoint: string
    let vpsBody: Record<string, unknown>

    switch (action) {
      case 'start': {
        vpsEndpoint = '/start'
        vpsBody = {
          portal: params.portal,
          session_id: params.session_id,
        }
        break
      }

      case 'type':
      case 'click':
      case 'screenshot': {
        vpsEndpoint = '/action'
        vpsBody = {
          session_id: params.session_id,
          action,
          selector: params.selector,
          value: params.value,
        }
        break
      }

      case 'cookies': {
        vpsEndpoint = '/cookies'
        vpsBody = { session_id: params.session_id }
        break
      }

      case 'close': {
        vpsEndpoint = '/close'
        vpsBody = { session_id: params.session_id }
        break
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    // Proxy to VPS
    const vpsRes = await fetch(`${VPS_LOGIN_URL}${vpsEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vpsBody),
      signal: AbortSignal.timeout(110000),
    })

    const vpsData = await vpsRes.json()

    // If cookies action and logged_in, save cookies to bot_configs
    if (action === 'cookies' && vpsData.logged_in && params.config_id) {
      await supabase
        .from('bot_configs')
        .update({ cookies: JSON.stringify(vpsData.cookies) })
        .eq('id', params.config_id)
        .eq('company_id', profile.company_id)
    }

    return NextResponse.json(vpsData)
  } catch (err) {
    console.error('[API bot/connect] error:', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
