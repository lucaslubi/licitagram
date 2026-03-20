import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

export async function POST(request: Request) {
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { keywords?: string[]; ufs?: string[] }

  const supabase = await createClient()

  const updates: Record<string, unknown> = {}
  if (body.keywords) updates.palavras_chave_filtro = body.keywords
  if (body.ufs) updates.ufs_interesse = body.ufs

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userCtx.userId)

  if (error) {
    return NextResponse.json({ error: 'Erro ao salvar preferências' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
