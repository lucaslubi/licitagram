import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface PriceWatch {
  id: string
  query: string
  uf: string | null
  modalidade: string | null
  threshold_type: string
  threshold_value: number | null
  is_active: boolean
  last_triggered_at: string | null
  last_price: number | null
  notification_channels: string[]
  created_at: string
  unread_alerts: number
}

const MAX_WATCHES_PER_COMPANY = 10

async function authenticate(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, company_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!userData?.company_id) return { user, company_id: null }

  return { user, company_id: userData.company_id as string }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { user, company_id } = await authenticate(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!company_id) return NextResponse.json({ error: 'Company not found' }, { status: 403 })

    const { data: watches, error } = await supabase
      .from('price_watches')
      .select('*')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Price watch list error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get unread alert counts for all watches in one query
    const watchIds = (watches || []).map((w: { id: string }) => w.id)
    let alertCounts: Record<string, number> = {}

    if (watchIds.length > 0) {
      const { data: alerts, error: alertError } = await supabase
        .from('price_watch_alerts')
        .select('price_watch_id')
        .in('price_watch_id', watchIds)
        .is('read_at', null)

      if (!alertError && alerts) {
        alertCounts = alerts.reduce(
          (acc: Record<string, number>, alert: { price_watch_id: string }) => {
            acc[alert.price_watch_id] = (acc[alert.price_watch_id] || 0) + 1
            return acc
          },
          {} as Record<string, number>,
        )
      }
    }

    const result: PriceWatch[] = (watches || []).map(
      (w: {
        id: string
        query: string
        uf: string | null
        modalidade: string | null
        threshold_type: string
        threshold_value: number | null
        is_active: boolean
        last_triggered_at: string | null
        last_price: number | null
        notification_channels: string[] | null
        created_at: string
      }) => ({
        id: w.id,
        query: w.query,
        uf: w.uf,
        modalidade: w.modalidade,
        threshold_type: w.threshold_type,
        threshold_value: w.threshold_value,
        is_active: w.is_active,
        last_triggered_at: w.last_triggered_at,
        last_price: w.last_price,
        notification_channels: w.notification_channels || [],
        created_at: w.created_at,
        unread_alerts: alertCounts[w.id] || 0,
      }),
    )

    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Price watch GET error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, company_id } = await authenticate(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!company_id) return NextResponse.json({ error: 'Company not found' }, { status: 403 })

    const body = await req.json()
    const {
      query,
      uf,
      modalidade,
      threshold_type,
      threshold_value,
      notification_channels,
    } = body as {
      query?: string
      uf?: string
      modalidade?: string
      threshold_type?: string
      threshold_value?: number
      notification_channels?: string[]
    }

    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    if (!threshold_type) {
      return NextResponse.json({ error: 'threshold_type is required' }, { status: 400 })
    }

    // Check max active watches per company
    const { count, error: countError } = await supabase
      .from('price_watches')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id)
      .eq('is_active', true)

    if (countError) {
      console.error('Price watch count error:', countError)
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    if ((count || 0) >= MAX_WATCHES_PER_COMPANY) {
      return NextResponse.json(
        { error: `Limite de ${MAX_WATCHES_PER_COMPANY} alertas ativos por empresa atingido.` },
        { status: 400 },
      )
    }

    const { data: created, error } = await supabase
      .from('price_watches')
      .insert({
        company_id,
        query: query.trim(),
        uf: uf || null,
        modalidade: modalidade || null,
        threshold_type,
        threshold_value: threshold_value ?? null,
        notification_channels: notification_channels || [],
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Price watch create error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ...created, unread_alerts: 0 }, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Price watch POST error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, company_id } = await authenticate(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!company_id) return NextResponse.json({ error: 'No company' }, { status: 403 })

    const body = await req.json()
    const {
      id,
      is_active,
      threshold_type,
      threshold_value,
      notification_channels,
    } = body as {
      id?: string
      is_active?: boolean
      threshold_type?: string
      threshold_value?: number
      notification_channels?: string[]
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (typeof is_active === 'boolean') updates.is_active = is_active
    if (threshold_type !== undefined) updates.threshold_type = threshold_type
    if (threshold_value !== undefined) updates.threshold_value = threshold_value
    if (notification_channels !== undefined) updates.notification_channels = notification_channels

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Scope by company_id to enforce ownership
    const { data: updated, error } = await supabase
      .from('price_watches')
      .update(updates)
      .eq('id', id)
      .eq('company_id', company_id)
      .select()
      .maybeSingle()

    if (error) {
      console.error('Price watch update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updated) {
      return NextResponse.json({ error: 'Watch not found or no access' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Price watch PATCH error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, company_id } = await authenticate(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!company_id) return NextResponse.json({ error: 'No company' }, { status: 403 })

    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
    }

    // Scope by company_id to enforce ownership
    const { data: deleted, error } = await supabase
      .from('price_watches')
      .delete()
      .eq('id', id)
      .eq('company_id', company_id)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Price watch delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!deleted) {
      return NextResponse.json({ error: 'Watch not found or no access' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Price watch DELETE error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
