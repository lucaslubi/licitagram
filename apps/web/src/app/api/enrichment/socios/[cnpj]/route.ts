import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSocios } from '@/lib/data-api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ cnpj: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { cnpj } = await params
    const data = await getSocios(cnpj.replace(/\D/g, ''))
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ socios: data })
  } catch (error) {
    console.error('[GET /api/enrichment/socios]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
