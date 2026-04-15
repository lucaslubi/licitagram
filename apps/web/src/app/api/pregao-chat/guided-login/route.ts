import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature, hasActiveSubscription } from '@/lib/auth-helpers'

/**
 * POST /api/pregao-chat/guided-login
 *
 * Proxy for the guided login server running on the VPS.
 * Forwards requests to the login-server and returns screenshots + status.
 *
 * Body: { action: 'start' | 'screenshot' | 'click' | 'type' | 'cookies' | 'close', ...params }
 */

const LOGIN_SERVER_URL = process.env.LOGIN_SERVER_URL || 'http://localhost:3999'

export async function POST(req: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasActiveSubscription(user)) return NextResponse.json({ error: 'Assinatura ativa necessária' }, { status: 403 })
    if (!hasFeature(user, 'pregao_chat_monitor')) return NextResponse.json({ error: 'Recurso disponível no plano Profissional+' }, { status: 403 })
    if (!user.companyId) return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })

    const body = await req.json()
    const { action, ...params } = body as { action: string; [key: string]: unknown }

    // Use companyId as session_id for isolation
    const sessionId = `pregao-${user.companyId}`

    let endpoint: string
    let payload: Record<string, unknown>

    switch (action) {
      case 'start':
        endpoint = '/start'
        payload = { session_id: sessionId, portal: 'comprasgov' }
        break

      case 'screenshot':
        endpoint = '/screenshot'
        payload = { session_id: sessionId }
        break

      case 'click':
        endpoint = '/action'
        payload = { session_id: sessionId, action: 'click', selector: params.selector }
        break

      case 'type':
        endpoint = '/action'
        payload = { session_id: sessionId, action: 'type', selector: params.selector, value: params.value }
        break

      case 'cookies':
        endpoint = '/cookies'
        payload = { session_id: sessionId }
        break

      case 'close':
        endpoint = '/close'
        payload = { session_id: sessionId }
        break

      default:
        return NextResponse.json({ error: `Ação inválida: ${action}` }, { status: 400 })
    }

    const res = await fetch(`${LOGIN_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })

    const data = await res.json()

    // If cookies action and logged in, save the cookies encrypted
    if (action === 'cookies' && data.logged_in && data.cookies) {
      const { createClient: createServiceClient } = await import('@supabase/supabase-js')
      const serviceSupabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      // Encrypt cookies using AES-256-GCM
      const crypto = await import('node:crypto')
      const keyHex = process.env.PREGAO_CREDENTIALS_MASTER_KEY || ''
      const key = Buffer.from(keyHex, 'hex')

      const cookiesJson = JSON.stringify(data.cookies)
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      const encrypted = Buffer.concat([cipher.update(cookiesJson, 'utf8'), cipher.final(), cipher.getAuthTag()])

      // Check if credential already exists for this company + comprasgov
      const { data: existing } = await serviceSupabase
        .from('pregao_portais_credenciais')
        .select('id')
        .eq('company_id', user.companyId)
        .eq('portal_slug', 'comprasgov')
        .maybeSingle()

      if (existing) {
        // Update existing credential with session cookies
        await serviceSupabase
          .from('pregao_portais_credenciais')
          .update({
            status: 'ativo',
            ultimo_login_sucesso_em: new Date().toISOString(),
          })
          .eq('id', existing.id)

        // Save session
        await serviceSupabase
          .from('pregao_sessoes_portal')
          .upsert({
            credencial_id: existing.id,
            storage_state_cipher: encrypted,
            storage_state_nonce: iv,
            expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            worker_id: 'guided-login',
          }, { onConflict: 'credencial_id' })
      } else {
        // Create new credential record (with dummy encrypted fields since we use cookies)
        const dummyCipher = Buffer.from('guided-login')
        const dummyNonce = crypto.randomBytes(24)

        const { data: newCred } = await serviceSupabase
          .from('pregao_portais_credenciais')
          .insert({
            company_id: user.companyId,
            portal_slug: 'comprasgov',
            cnpj_licitante: (params.cnpj as string) || 'guided-login',
            login_usuario_cipher: dummyCipher,
            login_senha_cipher: dummyCipher,
            login_nonce: dummyNonce,
            metodo_login: 'gov_br',
            status: 'ativo',
            ultimo_login_sucesso_em: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (newCred) {
          await serviceSupabase
            .from('pregao_sessoes_portal')
            .upsert({
              credencial_id: newCred.id,
              storage_state_cipher: encrypted,
              storage_state_nonce: iv,
              expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              worker_id: 'guided-login',
            }, { onConflict: 'credencial_id' })
        }
      }

      // Don't send raw cookies to frontend
      return NextResponse.json({ logged_in: true, message: 'Sessão capturada com sucesso' })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[API pregao-chat/guided-login] error:', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
