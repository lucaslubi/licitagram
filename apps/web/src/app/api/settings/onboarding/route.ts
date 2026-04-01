import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

export async function POST() {
  try {
    const userCtx = await getUserWithPlan()
    if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createClient()

    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', userCtx.userId)

    if (error) {
      return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[POST /api/settings/onboarding]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
