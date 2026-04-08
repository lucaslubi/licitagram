import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const VPS_LOGIN_URL = process.env.VPS_LOGIN_URL || 'http://187.77.241.93:3999'

/**
 * POST /api/certidoes/guided
 * Proxies guided-captcha actions to the VPS login server for certidao emission.
 *
 * Body: { action: 'start' | 'click' | 'screenshot' | 'check_result' | 'close', ...params }
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
        vpsEndpoint = '/start_certidao'
        vpsBody = {
          portal: params.portal,
          cnpj: params.cnpj,
          session_id: params.session_id,
        }
        break
      }

      case 'click': {
        vpsEndpoint = '/action'
        vpsBody = {
          session_id: params.session_id,
          action: 'click',
          selector: params.selector,
        }
        break
      }

      case 'click_coordinates': {
        vpsEndpoint = '/action'
        vpsBody = {
          session_id: params.session_id,
          action: 'click_coordinates',
          value: `${params.x},${params.y}`,
        }
        break
      }

      case 'screenshot': {
        vpsEndpoint = '/action'
        vpsBody = {
          session_id: params.session_id,
          action: 'screenshot',
        }
        break
      }

      case 'check_result': {
        vpsEndpoint = '/check_result'
        vpsBody = {
          session_id: params.session_id,
        }
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
        if (healthData.timestamp && !healthData.sessions) {
          return NextResponse.json({
            error: 'Servidor VPS mal configurado (Enrichment API detectada no lugar do Login Server). Verifique os processos no servidor 187.77.241.93.',
            vps_error: true
          }, { status: 502 })
        }
      }

      vpsRes = await fetch(`${VPS_LOGIN_URL}${vpsEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vpsBody),
        signal: AbortSignal.timeout(55000),
      })
      vpsData = await vpsRes.json()
    } catch (fetchErr) {
      const isTimeout = fetchErr instanceof DOMException && fetchErr.name === 'TimeoutError'
      const msg = isTimeout
        ? 'Servidor de emissao demorou muito para responder. Tente novamente.'
        : 'Servidor de emissao indisponivel. Verifique se o VPS esta online.'
      console.error(`[API certidoes/guided] VPS fetch error (${vpsEndpoint}):`, fetchErr)
      return NextResponse.json({ error: msg, vps_error: true }, { status: 502 })
    }

    // If certidao was emitted, save to company_documents
    if (action === 'check_result' && vpsData.result_status && vpsData.result_status !== 'pending') {
      const situacao = vpsData.result_status === 'negativa' || vpsData.result_status === 'positiva_negativa'
        ? 'regular'
        : vpsData.result_status === 'positiva' || vpsData.result_status === 'error'
          ? 'irregular'
          : null

      if (situacao) {
        const tipo = params.portal === 'receita' ? 'cnd_federal' : 'fgts'
        const { data: existing } = await supabase
          .from('company_documents')
          .select('id')
          .eq('company_id', profile.company_id)
          .eq('tipo', tipo)
          .maybeSingle()

        const doc = {
          company_id: profile.company_id,
          tipo,
          descricao: `[Guided] ${vpsData.detalhes || 'Certidao emitida via captcha guiado'}`,
          validade: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
          arquivo_url: vpsData.url || null,
          updated_at: new Date().toISOString(),
        }

        if (existing) {
          await supabase.from('company_documents').update(doc).eq('id', existing.id)
        } else {
          await supabase.from('company_documents').insert(doc)
        }
      }
    }

    return NextResponse.json(vpsData)
  } catch (err) {
    console.error('[API certidoes/guided] error:', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
