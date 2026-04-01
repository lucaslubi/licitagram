import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichCNPJ } from '@/lib/data-api'

export async function GET(req: NextRequest, { params }: { params: Promise<{ cnpj: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { cnpj } = await params
    const data = await enrichCNPJ(cnpj.replace(/\D/g, ''))
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    console.error('[GET /api/enrichment/empresa]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
