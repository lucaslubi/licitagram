/**
 * POST /bot/connect-callback
 *
 * Recebe form-POST do bookmarklet contendo:
 *   - accessToken (JWT do Compras.gov.br)
 *   - refreshToken (JWT opcional)
 *   - key (UUID do bot_connect_tokens, gerado enquanto user estava logado)
 *
 * A chave (key) substitui a necessidade de cookie de sessão do Licitagram,
 * permitindo que o bookmarklet funcione mesmo se o cookie expirou.
 *
 * A chave:
 *   - É válida por 10 minutos
 *   - É consumida uma vez (used_at setado)
 *   - Associa a company_id automaticamente
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { encryptCredential, bufferToBytea } from '@/lib/bot-crypto'

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
  .card{max-width:460px;padding:2rem;text-align:center}
  .icon{font-size:3rem;margin-bottom:1rem}
  h1{font-size:1.4rem;margin:0 0 .75rem}
  p{color:#9aa0a6;font-size:.9rem;line-height:1.5;margin:.35rem 0}
  .mono{font-family:ui-monospace,monospace;font-size:.82rem}
  a{display:inline-block;margin-top:1.25rem;padding:.65rem 1.25rem;background:${ok ? '#2563eb' : '#3f3f46'};color:#fff;text-decoration:none;border-radius:.5rem;font-weight:500;font-size:.9rem}
</style></head><body>
<div class="card">
  <div class="icon">${ok ? '✅' : '❌'}</div>
  <h1>${ok ? 'Conta Compras.gov.br conectada!' : 'Não conseguimos conectar'}</h1>
  ${ok && params.cnpj ? `<p class="mono"><span style="color:#6b7280">CNPJ:</span> ${params.cnpj}</p>` : ''}
  ${ok && params.nome ? `<p>${params.nome}</p>` : ''}
  ${ok && params.exp ? `<p>Token válido por ${params.exp} minutos (renovação automática).</p>` : ''}
  ${ok ? '<p style="margin-top:1rem">Pode fechar esta aba — seu robô está pronto.</p>' : ''}
  ${!ok && params.error ? `<p>${params.error}</p>` : ''}
  ${!ok ? '<p style="font-size:.8rem;color:#6b7280;margin-top:.75rem">Volte ao Licitagram e gere um novo link de conexão.</p>' : ''}
  <a href="/bot">${ok ? 'Ir pro Robô de Lances' : 'Voltar pro Licitagram'}</a>
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
    return redirectTo(req, '/bot/connect-callback', { error: 'Formulário inválido' })
  }

  const accessToken = String(formData.get('accessToken') || '')
  const refreshTokenValue = String(formData.get('refreshToken') || '')
  const key = String(formData.get('key') || '')

  if (!accessToken) {
    return redirectTo(req, '/bot/connect-callback', {
      error: 'Não encontramos seu login no Compras.gov.br. Verifique se está logado lá.',
    })
  }

  if (!key) {
    return redirectTo(req, '/bot/connect-callback', {
      error: 'Link de conexão inválido. Gere um novo no Licitagram e tente de novo.',
    })
  }

  const payload = decodeJwtPayload(accessToken)
  if (!payload) {
    return redirectTo(req, '/bot/connect-callback', { error: 'Token do Compras inválido' })
  }

  const now = Math.floor(Date.now() / 1000)
  const accessExp = typeof payload.exp === 'number' ? payload.exp : 0
  if (accessExp <= now) {
    return redirectTo(req, '/bot/connect-callback', {
      error: 'Seu login no Compras.gov.br expirou. Entre de novo lá e tente outra vez.',
    })
  }
  if (payload.identificacao_fornecedor === undefined) {
    return redirectTo(req, '/bot/connect-callback', {
      error: 'Você precisa entrar na área do fornecedor do Compras.gov.br antes de clicar no atalho.',
    })
  }

  // ─── Valida a chave única (sem depender de cookie de auth) ──────────
  // Usa service role pra ignorar RLS (o callback é chamado sem sessão
  // do usuário — a segurança vem da própria UUID curta + expires_at).
  const serviceUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!serviceUrl || !serviceKey) {
    console.error('[connect-callback] missing service role env')
    return redirectTo(req, '/bot/connect-callback', { error: 'Erro interno do servidor' })
  }
  const admin = createAdminClient(serviceUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: keyRow, error: keyErr } = await admin
    .from('bot_connect_tokens')
    .select('id, company_id, expires_at, used_at')
    .eq('id', key)
    .maybeSingle()

  if (keyErr || !keyRow) {
    return redirectTo(req, '/bot/connect-callback', {
      error: 'Link de conexão não encontrado. Gere um novo no Licitagram.',
    })
  }
  if (keyRow.used_at) {
    return redirectTo(req, '/bot/connect-callback', {
      error: 'Este link já foi usado. Gere um novo se precisar reconectar.',
    })
  }
  if (new Date(keyRow.expires_at).getTime() < Date.now()) {
    return redirectTo(req, '/bot/connect-callback', {
      error: 'Link de conexão expirou (válido por 10 min). Gere um novo.',
    })
  }

  // Metadata do token
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

  const { error: upsertErr } = await admin.from('bot_tokens').upsert(
    {
      company_id: keyRow.company_id,
      portal: 'comprasgov',
      access_token_cipher: bufferToBytea(accessEnc.cipher),
      access_token_nonce: bufferToBytea(accessEnc.nonce),
      refresh_token_cipher: refreshEnc ? bufferToBytea(refreshEnc.cipher) : null,
      refresh_token_nonce: refreshEnc ? bufferToBytea(refreshEnc.nonce) : null,
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

  if (upsertErr) {
    console.error('[connect-callback] upsert bot_tokens error', upsertErr)
    return redirectTo(req, '/bot/connect-callback', { error: 'Erro ao salvar sua conexão' })
  }

  // Marca a chave como usada
  await admin
    .from('bot_connect_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', keyRow.id)

  const minutes = Math.max(0, Math.floor((accessExp - now) / 60))
  return redirectTo(req, '/bot/connect-callback', {
    success: '1',
    ...(cnpj ? { cnpj } : {}),
    ...(nome ? { nome } : {}),
    exp: String(minutes),
  })
}
