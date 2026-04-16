/**
 * GET/POST/PATCH/DELETE /api/bot/webhooks
 *
 * Internal endpoint (session-cookie auth) for managing webhook subscriptions.
 *
 * On POST, the caller MUST provide a `secret` — we encrypt it with the
 * same AES-GCM scheme used everywhere else and never return it again.
 * On PATCH, `secret` is optional (omit to keep the existing one).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'
import { encryptSecret, hasCredentialMasterKey } from '@/lib/credential-crypto'

function stripSecrets(row: Record<string, unknown>) {
  const { secret_cipher, secret_nonce, ...rest } = row
  void secret_cipher
  void secret_nonce
  return rest
}

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
    .from('bot_webhooks')
    .select('id, name, url, event_kinds, enabled, created_at, updated_at')
    .eq('company_id', planUser.companyId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Erro ao listar' }, { status: 500 })
  return NextResponse.json({ webhooks: data ?? [] })
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
  if (!hasCredentialMasterKey()) {
    return NextResponse.json({ error: 'Servidor sem master key' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const secret = typeof body.secret === 'string' ? body.secret : ''
  const event_kinds = Array.isArray(body.event_kinds) ? body.event_kinds : []

  if (!name || !url || !secret) {
    return NextResponse.json({ error: 'name, url e secret obrigatorios' }, { status: 400 })
  }
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') {
      return NextResponse.json({ error: 'url deve ser https' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'url invalida' }, { status: 400 })
  }
  if (secret.length < 16) {
    return NextResponse.json({ error: 'secret deve ter ao menos 16 caracteres' }, { status: 400 })
  }

  const { cipher, nonce } = encryptSecret(secret)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bot_webhooks')
    .insert({
      company_id: planUser.companyId,
      name,
      url,
      secret_cipher: cipher,
      secret_nonce: nonce,
      event_kinds,
      created_by: planUser.userId,
    })
    .select('id, name, url, event_kinds, enabled, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Erro ao criar webhook' }, { status: 500 })
  }
  return NextResponse.json({ webhook: stripSecrets(data as Record<string, unknown>) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const planUser = await getUserWithPlan()
  if (!planUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  if (!planUser.companyId) {
    return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id obrigatorio' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.url === 'string') {
    try {
      const u = new URL(body.url)
      if (u.protocol !== 'https:') {
        return NextResponse.json({ error: 'url deve ser https' }, { status: 400 })
      }
      patch.url = body.url
    } catch {
      return NextResponse.json({ error: 'url invalida' }, { status: 400 })
    }
  }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (Array.isArray(body.event_kinds)) patch.event_kinds = body.event_kinds
  if (typeof body.secret === 'string' && body.secret.length >= 16) {
    if (!hasCredentialMasterKey()) {
      return NextResponse.json({ error: 'Servidor sem master key' }, { status: 500 })
    }
    const { cipher, nonce } = encryptSecret(body.secret)
    patch.secret_cipher = cipher
    patch.secret_nonce = nonce
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nada a atualizar' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bot_webhooks')
    .update(patch)
    .eq('id', id)
    .eq('company_id', planUser.companyId)
    .select('id, name, url, event_kinds, enabled, updated_at')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  return NextResponse.json({ webhook: data })
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
    .from('bot_webhooks')
    .delete()
    .eq('id', id)
    .eq('company_id', planUser.companyId)
  if (error) return NextResponse.json({ error: 'Erro ao remover' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
