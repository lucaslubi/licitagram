import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = await request.json()
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  // Verify user has access to this company
  const { data: link } = await supabase
    .from('user_companies')
    .select('id')
    .eq('user_id', user.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!link) {
    return NextResponse.json({ error: 'No access to this company' }, { status: 403 })
  }

  // Update user's active company
  const { error } = await supabase
    .from('users')
    .update({ company_id: companyId })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
