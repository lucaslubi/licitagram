import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'
import { encryptSecret, hasCredentialMasterKey } from '@/lib/credential-crypto'

export const maxDuration = 120

// Hard-coded default points to the production VPS that runs the latest
// login-server (with /solve_captcha). Env var override allowed for staging.
const VPS_LOGIN_URL = process.env.VPS_LOGIN_URL || 'http://187.77.241.93:3999'

/**
 * POST /api/bot/connect
 * Proxies guided-login actions to the VPS Playwright login server.
 *
 * Body: { action: 'start' | 'type' | 'click' | 'screenshot' | 'cookies' | 'close', ...params }
 */
export async function POST(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const supabase = await createClient()
    const user = { id: planUser.userId }

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

      case 'solve_captcha': {
        vpsEndpoint = '/solve_captcha'
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
    let vpsRes: Response
    let vpsData: Record<string, unknown>
    try {
      // 1. Quick health check to detect misconfiguration
      const healthRes = await fetch(`${VPS_LOGIN_URL}/`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
      if (healthRes && healthRes.ok) {
        const healthData = await healthRes.json()
        // Login server responds with { status, timestamp, sessions }
        // Enrichment API does NOT have a "sessions" field at all
        if (healthData.timestamp && !('sessions' in healthData)) {
          return NextResponse.json({
            error: 'Servidor VPS mal configurado (Enrichment API detectada no lugar do Login Server). Verifique os processos no servidor 85.31.60.53.',
            vps_error: true
          }, { status: 502 })
        }
      }

      vpsRes = await fetch(`${VPS_LOGIN_URL}${vpsEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vpsBody),
        signal: AbortSignal.timeout(110000),
      })
      vpsData = await vpsRes.json()
    } catch (err) {
      console.error('[API bot/connect] error:', err)
      const message = err instanceof Error ? err.message : 'Erro interno'
      return NextResponse.json({ error: message }, { status: 500 })
    }

    // If cookies action and logged_in, save the session storage state to
    // bot_configs — ENCRYPTED. These cookies are portal bearer tokens and
    // must never land in the DB as plaintext.
    if (action === 'cookies' && vpsData?.logged_in && params.config_id) {
      const cookiesJson = JSON.stringify(vpsData.cookies)

      if (!hasCredentialMasterKey()) {
        // Fail loud — we don't want to silently fall back to plaintext.
        console.error('[API bot/connect] PREGAO_CREDENTIALS_MASTER_KEY missing — refusing to persist cookies')
        return NextResponse.json({
          ...vpsData,
          warning: 'Cookies nao persistidos: servidor sem chave de criptografia configurada',
        })
      }

      const { cipher, nonce } = encryptSecret(cookiesJson)

      const { error: updateError } = await supabase
        .from('bot_configs')
        .update({
          cookies_cipher: cipher,
          cookies_nonce: nonce,
          cookies: null, // always clear legacy plaintext column on write
        })
        .eq('id', params.config_id)
        .eq('company_id', profile.company_id)

      if (updateError) {
        console.error('[API bot/connect] failed to persist encrypted cookies:', updateError)
        // Don't leak the cookies back to the client on DB failure either.
        return NextResponse.json({
          ...vpsData,
          warning: 'Login capturado, mas falhou ao persistir a sessao. Tente novamente.',
        })
      }
    }

    return NextResponse.json(vpsData)
  } catch (err) {
    console.error('[API bot/connect] error:', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
