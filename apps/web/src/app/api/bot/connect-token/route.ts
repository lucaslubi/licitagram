import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'
import { encryptCredential, bufferToBytea } from '@/lib/bot-crypto'

/**
 * POST /api/bot/connect-token
 *
 * Recebe JWTs do Compras.gov.br extraídos do navegador do cliente
 * (via bookmarklet ou extensão chrome). Armazena criptografado em
 * `bot_tokens` pra que o worker use quando for dar lance.
 *
 * Body:
 * {
 *   portal?: 'comprasgov',
 *   accessToken: string,
 *   refreshToken?: string
 * }
 *
 * Valida:
 *   - JWT tem formato válido
 *   - exp > NOW (não já expirado)
 *   - payload tem identificacao_fornecedor (é access token, não refresh)
 *
 * Retorna dados do fornecedor extraídos do payload pra UI mostrar
 * "conectado como <CNPJ> <nome>".
 */

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', planUser.userId)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const accessToken: string | undefined = body?.accessToken
    const refreshTokenValue: string | undefined = body?.refreshToken
    const portal: string = body?.portal || 'comprasgov'

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'accessToken obrigatório (string JWT)' },
        { status: 400 },
      )
    }

    // Valida formato e expiração do access
    const payload = decodeJwtPayload(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'accessToken não é um JWT válido' }, { status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    const accessExp = typeof payload.exp === 'number' ? payload.exp : 0
    if (accessExp <= now) {
      return NextResponse.json(
        { error: 'accessToken já expirou. Faça login novamente no Compras.gov.br' },
        { status: 400 },
      )
    }
    if (payload.identificacao_fornecedor === undefined) {
      return NextResponse.json(
        {
          error:
            'Token inválido: faltando identificacao_fornecedor. Você mandou o refresh em vez do access?',
        },
        { status: 400 },
      )
    }

    // Metadata extraída do payload
    const cnpjFornecedor =
      typeof payload.identificacao_fornecedor === 'string'
        ? (payload.identificacao_fornecedor as string)
        : null
    const nomeFornecedor =
      typeof payload.nome_fornecedor === 'string'
        ? (payload.nome_fornecedor as string)
        : typeof payload.nome === 'string'
          ? (payload.nome as string)
          : null
    const idSessao = typeof payload.id_sessao === 'string' ? (payload.id_sessao as string) : null

    // Valida e decoda refresh se mandou
    let refreshExp = 0
    if (refreshTokenValue) {
      const rp = decodeJwtPayload(refreshTokenValue)
      if (!rp) {
        return NextResponse.json({ error: 'refreshToken não é um JWT válido' }, { status: 400 })
      }
      refreshExp = typeof rp.exp === 'number' ? rp.exp : 0
    }

    // Criptografa tokens (reutiliza mesma crypto do bot_configs)
    const accessEnc = encryptCredential(accessToken)
    const refreshEnc = refreshTokenValue ? encryptCredential(refreshTokenValue) : null

    // Upsert (substitui token anterior da mesma company+portal)
    const { error: upErr } = await supabase.from('bot_tokens').upsert(
      {
        company_id: profile.company_id,
        portal,
        access_token_cipher: bufferToBytea(accessEnc.cipher),
        access_token_nonce: bufferToBytea(accessEnc.nonce),
        refresh_token_cipher: refreshEnc ? bufferToBytea(refreshEnc.cipher) : null,
        refresh_token_nonce: refreshEnc ? bufferToBytea(refreshEnc.nonce) : null,
        access_exp: accessExp,
        refresh_exp: refreshExp || null,
        cnpj_fornecedor: cnpjFornecedor,
        nome_fornecedor: nomeFornecedor,
        id_sessao: idSessao,
        status: 'active',
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,portal' },
    )

    if (upErr) {
      console.error('[bot/connect-token] upsert error', upErr)
      return NextResponse.json({ error: 'Erro ao salvar token' }, { status: 500 })
    }

    return NextResponse.json({
      connected: true,
      portal,
      cnpj: cnpjFornecedor,
      nome: nomeFornecedor,
      expires_in_minutes: Math.max(0, Math.floor((accessExp - now) / 60)),
      has_refresh: !!refreshTokenValue,
    })
  } catch (err) {
    console.error('[bot/connect-token] POST error', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function GET() {
  /**
   * Status da conexão — a UI usa pra mostrar "conectado como X" ou
   * "conecte sua conta Gov.br".
   */
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', planUser.userId)
      .single()
    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    const { data: tok } = await supabase
      .from('bot_tokens')
      .select('portal, cnpj_fornecedor, nome_fornecedor, access_exp, status, connected_at, last_used_at')
      .eq('company_id', profile.company_id)
      .eq('status', 'active')

    const now = Math.floor(Date.now() / 1000)
    const connections = (tok || []).map((t) => ({
      portal: t.portal,
      cnpj: t.cnpj_fornecedor,
      nome: t.nome_fornecedor,
      expires_in_minutes:
        typeof t.access_exp === 'number' ? Math.max(0, Math.floor((t.access_exp - now) / 60)) : 0,
      connected_at: t.connected_at,
      last_used_at: t.last_used_at,
      is_expired: typeof t.access_exp === 'number' ? t.access_exp <= now : false,
    }))

    return NextResponse.json({ connections })
  } catch (err) {
    console.error('[bot/connect-token] GET error', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
