/**
 * GET/POST/DELETE /api/bot/api-keys
 *
 * Internal (session-cookie) endpoint to manage the API keys a user has
 * provisioned for the Supreme Bot public API.
 *
 * On POST, the PLAINTEXT token is returned ONCE. Subsequent reads only
 * see the 8-char preview. Users must copy it immediately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'
import { generateApiKey } from '@/lib/api/bot-api-auth'

export async function GET() {
  const planUser = await getUserWithPlan()
  if (!planUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  if (!hasActiveSubscription(planUser)) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }
  if (!planUser.companyId) {
    return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bot_api_keys')
    .select('id, name, key_preview, scopes, last_used_at, expires_at, revoked_at, created_at')
    .eq('company_id', planUser.companyId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Erro ao listar' }, { status: 500 })
  }
  return NextResponse.json({ keys: data ?? [] })
}

export async function POST(req: NextRequest) {
  const planUser = await getUserWithPlan()
  if (!planUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  if (!hasActiveSubscription(planUser)) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }
  if (!planUser.companyId) {
    return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s: unknown) => typeof s === 'string') : ['read']
  const expires_at = typeof body.expires_at === 'string' ? body.expires_at : null

  if (!name || name.length < 3) {
    return NextResponse.json({ error: 'name deve ter ao menos 3 caracteres' }, { status: 400 })
  }
  const validScopes = ['read', 'write', 'admin']
  if (!scopes.every((s: string) => validScopes.includes(s))) {
    return NextResponse.json({ error: `scopes inválidos (permitidos: ${validScopes.join(', ')})` }, { status: 400 })
  }

  const { plaintext, hash, preview } = generateApiKey()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bot_api_keys')
    .insert({
      company_id: planUser.companyId,
      name,
      key_hash: hash,
      key_preview: preview,
      scopes,
      expires_at,
      created_by: planUser.userId,
    })
    .select('id, name, key_preview, scopes, expires_at, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Erro ao criar chave' }, { status: 500 })
  }

  // IMPORTANT: the plaintext is returned ONLY here. Never again.
  return NextResponse.json(
    {
      key: data,
      plaintext,
      message: 'Guarde este token com segurança — ele não será mostrado novamente.',
    },
    { status: 201 },
  )
}

export async function DELETE(req: NextRequest) {
  const planUser = await getUserWithPlan()
  if (!planUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  if (!planUser.companyId) {
    return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatorio' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase
    .from('bot_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', planUser.companyId)
  if (error) {
    return NextResponse.json({ error: 'Erro ao revogar' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
