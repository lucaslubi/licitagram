/**
 * POST /bot/connect-callback
 *
 * Recebe form-POST do bookmarklet (que roda no domínio Compras.gov.br).
 * Como é cross-origin, precisa aceitar o POST sem CSRF token e redirecionar
 * pra página de sucesso com os metadados do token.
 *
 * Autenticação: usa o cookie de sessão Supabase (mesmo domínio do nosso app).
 * Se o cliente não estiver logado no nosso site, redireciona pro /login.
 */

import { createClient } from '@/lib/supabase/server'
import { encryptCredential } from '@/lib/bot-crypto'

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

function redirectTo(req: Request, path: string, params: Record<string, string>): Response {
  const url = new URL(path, req.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return Response.redirect(url.toString(), 303)
}

function renderPage(params: {
  success?: boolean
  error?: string
  cnpj?: string
  nome?: string
  exp?: string
}): Response {
  const ok = params.success === true
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${ok ? 'Conectado' : 'Erro'} — Licitagram</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#0a0a0b;color:#e8e8e8;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{max-width:420px;padding:2rem;text-align:center}
  .icon{font-size:3rem;margin-bottom:1rem}
  h1{font-size:1.4rem;margin:0 0 .75rem}
  p{color:#9aa0a6;font-size:.9rem;line-height:1.5;margin:.35rem 0}
  .mono{font-family:ui-monospace,monospace;font-size:.82rem}
  a{display:inline-block;margin-top:1.25rem;padding:.65rem 1.25rem;background:${ok ? '#2563eb' : '#3f3f46'};color:#fff;text-decoration:none;border-radius:.5rem;font-weight:500;font-size:.9rem}
</style></head><body>
<div class="card">
  <div class="icon">${ok ? '✅' : '❌'}</div>
  <h1>${ok ? 'Conta Compras.gov.br conectada!' : 'Erro ao conectar'}</h1>
  ${ok && params.cnpj ? `<p class="mono"><span style="color:#6b7280">CNPJ:</span> ${params.cnpj}</p>` : ''}
  ${ok && params.nome ? `<p>${params.nome}</p>` : ''}
  ${ok && params.exp ? `<p>Token válido por ${params.exp} minutos (renovação automática).</p>` : ''}
  ${!ok && params.error ? `<p>${params.error}</p>` : ''}
  <a href="/bot">${ok ? 'Ir pro Robô de Lances' : 'Voltar'}</a>
</div>
</body></html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export function GET(req: Request): Response {
  const url = new URL(req.url)
  return renderPage({
    success: url.searchParams.get('success') === '1',
    error: url.searchParams.get('error') || undefined,
    cnpj: url.searchParams.get('cnpj') || undefined,
    nome: url.searchParams.get('nome') || undefined,
    exp: url.searchParams.get('exp') || undefined,
  })
}

export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null)
  if (!formData) {
    return redirectTo(req, '/bot/connect-callback', { error: 'Form inválido' })
  }

  const accessToken = String(formData.get('accessToken') || '')
  const refreshTokenValue = String(formData.get('refreshToken') || '')

  if (!accessToken) {
    return redirectTo(req, '/bot/connect-callback', { error: 'accessToken obrigatório' })
  }

  const payload = decodeJwtPayload(accessToken)
  if (!payload) {
    return redirectTo(req, '/bot/connect-callback', { error: 'JWT inválido' })
  }

  const now = Math.floor(Date.now() / 1000)
  const accessExp = typeof payload.exp === 'number' ? payload.exp : 0
  if (accessExp <= now) {
    return redirectTo(req, '/bot/connect-callback', { error: 'Token expirado' })
  }
  if (payload.identificacao_fornecedor === undefined) {
    return redirectTo(req, '/bot/connect-callback', {
      error: 'Faça login no Compras.gov.br primeiro',
    })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const login = new URL('/login', req.url)
    login.searchParams.set('next', '/bot')
    return Response.redirect(login.toString(), 303)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) {
    return redirectTo(req, '/bot/connect-callback', { error: 'Empresa não configurada' })
  }

  const cnpj =
    typeof payload.identificacao_fornecedor === 'string'
      ? (payload.identificacao_fornecedor as string)
      : null
  const nome =
    typeof payload.nome_fornecedor === 'string'
      ? (payload.nome_fornecedor as string)
      : typeof payload.nome === 'string'
        ? (payload.nome as string)
        : null
  const idSessao = typeof payload.id_sessao === 'string' ? (payload.id_sessao as string) : null

  let refreshExp = 0
  if (refreshTokenValue) {
    const rp = decodeJwtPayload(refreshTokenValue)
    if (rp && typeof rp.exp === 'number') refreshExp = rp.exp
  }

  const accessEnc = encryptCredential(accessToken)
  const refreshEnc = refreshTokenValue ? encryptCredential(refreshTokenValue) : null

  const { error } = await supabase.from('bot_tokens').upsert(
    {
      company_id: profile.company_id,
      portal: 'comprasgov',
      access_token_cipher: accessEnc.cipher,
      access_token_nonce: accessEnc.nonce,
      refresh_token_cipher: refreshEnc?.cipher ?? null,
      refresh_token_nonce: refreshEnc?.nonce ?? null,
      access_exp: accessExp,
      refresh_exp: refreshExp || null,
      cnpj_fornecedor: cnpj,
      nome_fornecedor: nome,
      id_sessao: idSessao,
      status: 'active',
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,portal' },
  )

  if (error) {
    console.error('[connect-callback] upsert error', error)
    return redirectTo(req, '/bot/connect-callback', { error: 'Erro ao salvar' })
  }

  const minutes = Math.max(0, Math.floor((accessExp - now) / 60))
  return redirectTo(req, '/bot/connect-callback', {
    success: '1',
    ...(cnpj ? { cnpj } : {}),
    ...(nome ? { nome } : {}),
    exp: String(minutes),
  })
}
