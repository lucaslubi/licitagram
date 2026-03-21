import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/bot/config
 * List bot configs for the authenticated user's company.
 */
export async function GET() {
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

    const { data: configs, error } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API bot/config] GET error:', error)
      return NextResponse.json({ error: 'Erro ao listar configuracoes' }, { status: 500 })
    }

    // Map password_hash -> password for frontend compatibility
    const mapped = (configs ?? []).map(({ password_hash, ...rest }: Record<string, unknown>) => ({
      ...rest,
      password: password_hash,
    }))

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

    if (!portal || !username || !password || !strategy) {
      return NextResponse.json(
        { error: 'Campos obrigatorios: portal, username, password, strategy' },
        { status: 400 },
      )
    }

    const record = {
      company_id: profile.company_id,
      portal,
      username,
      password_hash: password,
      strategy,
      min_decrease_value: min_decrease_value ?? 0.01,
      min_decrease_percent: min_decrease_percent ?? 0.1,
      is_active: enabled !== false,
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

      const { password_hash: _pw, ...rest } = updated as Record<string, unknown>
      return NextResponse.json({ config: { ...rest, password: _pw } })
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

      const { password_hash: _pw, ...rest } = created as Record<string, unknown>
      return NextResponse.json({ config: { ...rest, password: _pw } }, { status: 201 })
    }
  } catch (err) {
    console.error('[API bot/config] POST error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
