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

    return NextResponse.json({ configs })
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
      password,
      strategy,
      min_decrease_value: min_decrease_value || null,
      min_decrease_percent: min_decrease_percent || null,
      enabled: enabled !== false,
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

      return NextResponse.json({ config: updated })
    } else {
      // Create new
      const { data: created, error } = await supabase
        .from('bot_configs')
        .insert(record)
        .select()
        .single()

      if (error) {
        console.error('[API bot/config] INSERT error:', error)
        return NextResponse.json({ error: 'Erro ao criar configuracao' }, { status: 500 })
      }

      return NextResponse.json({ config: created }, { status: 201 })
    }
  } catch (err) {
    console.error('[API bot/config] POST error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
