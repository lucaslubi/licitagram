import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'
import { encryptSecret, hasCredentialMasterKey } from '@/lib/credential-crypto'

/**
 * Masking placeholder returned in GET responses. Fixed-width so the real
 * cipher value cannot be inferred from the string length.
 */
const PASSWORD_MASK = '••••••••'

/**
 * Strip every secret-bearing field from a bot_configs row before echoing it
 * back to the browser. Replaces password with a mask if one is set.
 */
function stripSecrets(row: Record<string, unknown>): Record<string, unknown> {
  const {
    password_hash,
    password_cipher,
    password_nonce,
    cookies,
    cookies_cipher,
    cookies_nonce,
    ...rest
  } = row
  const hasPassword = !!(password_cipher || password_hash)
  const hasCookies = !!(cookies_cipher || cookies)
  return {
    ...rest,
    password: hasPassword ? PASSWORD_MASK : '',
    has_cookies: hasCookies,
  }
}

/**
 * GET /api/bot/config
 * List bot configs for the authenticated user's company.
 */
export async function GET() {
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

    const { data: configs, error } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API bot/config] GET error:', error)
      return NextResponse.json({ error: 'Erro ao listar configuracoes' }, { status: 500 })
    }

    // Never return plaintext or ciphertext. Always send a fixed mask when a
    // credential is present, so the caller only learns "is set / is not set".
    // Strips password_hash, password_cipher, password_nonce, cookies_cipher,
    // cookies_nonce — nothing server-secret should reach the browser.
    const mapped = (configs ?? []).map((cfg: Record<string, unknown>) => {
      const {
        password_hash,
        password_cipher,
        password_nonce,
        cookies,
        cookies_cipher,
        cookies_nonce,
        ...rest
      } = cfg
      const hasPassword = !!(password_cipher || password_hash)
      const hasCookies = !!(cookies_cipher || cookies)
      return {
        ...rest,
        password: hasPassword ? PASSWORD_MASK : '',
        has_cookies: hasCookies,
      }
    })

    return NextResponse.json({ configs: mapped })
  } catch (err) {
    console.error('[API bot/config] GET error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * POST /api/bot/config
 * Create or update a bot portal configuration.
 *
 * Body: { id?, portal, username, password, strategy, min_decrease_value?, min_decrease_percent?, enabled? }
 */
export async function POST(req: NextRequest) {
  try {
    const planUserPost = await getUserWithPlan()
    if (!planUserPost) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUserPost)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const supabase = await createClient()
    const user = { id: planUserPost.userId }

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    const body = await req.json()
    const {
      id,
      portal,
      username,
      password,
      strategy,
      min_decrease_value,
      min_decrease_percent,
      enabled,
    } = body

    // Callers that are only updating non-secret fields (strategy, enabled, etc.)
    // may send the mask placeholder. Distinguish a real password update from a
    // round-trip of the mask.
    const isMaskedPassword = typeof password === 'string' && password === PASSWORD_MASK
    const hasNewPassword = typeof password === 'string' && password.length > 0 && !isMaskedPassword

    if (!portal || !username || !strategy) {
      return NextResponse.json(
        { error: 'Campos obrigatorios: portal, username, strategy' },
        { status: 400 },
      )
    }

    // On create, a real password is required. On update, it's optional.
    if (!id && !hasNewPassword) {
      return NextResponse.json(
        { error: 'Senha obrigatoria ao criar uma nova configuracao' },
        { status: 400 },
      )
    }

    if (hasNewPassword && !hasCredentialMasterKey()) {
      return NextResponse.json(
        { error: 'Servidor nao configurado para criptografar credenciais (master key ausente)' },
        { status: 500 },
      )
    }

    // Build the record. If the caller supplied a new password, encrypt it and
    // ALSO null out the legacy plaintext column so we never leave stale
    // plaintext around after an update.
    const record: Record<string, unknown> = {
      company_id: profile.company_id,
      portal,
      username,
      strategy,
      min_decrease_value: min_decrease_value ?? 0.01,
      min_decrease_percent: min_decrease_percent ?? 0.1,
      is_active: enabled !== false,
    }

    if (hasNewPassword) {
      const { cipher, nonce } = encryptSecret(password)
      record.password_cipher = cipher
      record.password_nonce = nonce
      record.password_hash = null // always clear legacy plaintext on write
    }

    if (id) {
      // Update existing — verify ownership
      const { data: existing } = await supabase
        .from('bot_configs')
        .select('id')
        .eq('id', id)
        .eq('company_id', profile.company_id)
        .single()

      if (!existing) {
        return NextResponse.json({ error: 'Configuracao nao encontrada' }, { status: 404 })
      }

      const { data: updated, error } = await supabase
        .from('bot_configs')
        .update(record)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[API bot/config] UPDATE error:', error)
        return NextResponse.json({ error: 'Erro ao atualizar configuracao' }, { status: 500 })
      }

      return NextResponse.json({ config: stripSecrets(updated as Record<string, unknown>) })
    } else {
      // Create new — use upsert to handle existing configs for same portal
      const { data: created, error } = await supabase
        .from('bot_configs')
        .upsert(record, { onConflict: 'company_id,portal' })
        .select()
        .single()

      if (error) {
        console.error('[API bot/config] INSERT error:', error)
        // Return the actual DB error for debugging
        const msg = error.code === '23514'
          ? `Valor invalido: ${error.message}`
          : error.code === '23505'
            ? 'Ja existe uma configuracao para este portal'
            : `Erro ao criar configuracao: ${error.message}`
        return NextResponse.json({ error: msg }, { status: 500 })
      }

      return NextResponse.json({ config: stripSecrets(created as Record<string, unknown>) }, { status: 201 })
    }
  } catch (err) {
    console.error('[API bot/config] POST error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * DELETE /api/bot/config?id=<config_id>
 * Removes a bot config that didn't connect or is no longer needed.
 * Cascades: foreign keys on bot_sessions ON DELETE RESTRICT — if there
 * are sessions, returns 409 and asks the user to clear them first.
 */
export async function DELETE(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
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

    // Block delete if there are non-terminal sessions referencing this config
    const { data: liveSessions } = await supabase
      .from('bot_sessions')
      .select('id, status')
      .eq('company_id', profile.company_id)
      .eq('config_id', id)
      .in('status', ['pending', 'active', 'paused'])
      .limit(1)

    if (liveSessions && liveSessions.length > 0) {
      return NextResponse.json(
        { error: 'Há sessões ativas/pausadas usando essa configuração. Cancele-as primeiro.' },
        { status: 409 },
      )
    }

    const { error } = await supabase
      .from('bot_configs')
      .delete()
      .eq('id', id)
      .eq('company_id', profile.company_id)

    if (error) {
      console.error('[API bot/config] DELETE error:', error)
      // Surface the FK message so the user understands what's blocking
      const msg = error.code === '23503'
        ? 'Configuração tem sessões antigas vinculadas. Limpe o histórico antes de excluir.'
        : `Erro ao excluir: ${error.message}`
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[API bot/config] DELETE error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
