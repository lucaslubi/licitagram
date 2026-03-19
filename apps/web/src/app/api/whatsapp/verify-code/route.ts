import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserWithPlan } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 10 attempts per 5 minutes
  const rl = await checkRateLimit(`wa-verify:${userCtx.userId}`, 10, 300)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Muitas tentativas. Tente em ${rl.retryAfter}s.` },
      { status: 429 },
    )
  }

  const { code } = await request.json()

  if (!code || String(code).length !== 6) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  // Find latest non-expired, non-verified code for this user
  const { data: verification } = await supabase
    .from('whatsapp_verifications')
    .select('*')
    .eq('user_id', userCtx.userId)
    .eq('verified', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!verification) {
    return NextResponse.json({ error: 'Código expirado ou não encontrado. Solicite um novo.' }, { status: 400 })
  }

  // Increment attempts
  const newAttempts = (verification.attempts || 0) + 1
  await supabase
    .from('whatsapp_verifications')
    .update({ attempts: newAttempts })
    .eq('id', verification.id)

  if (newAttempts > 5) {
    return NextResponse.json({ error: 'Máximo de tentativas atingido. Solicite um novo código.' }, { status: 400 })
  }

  if (verification.code !== String(code)) {
    return NextResponse.json({ error: 'Código incorreto' }, { status: 400 })
  }

  // Code is correct — mark as verified and update user
  await supabase
    .from('whatsapp_verifications')
    .update({ verified: true })
    .eq('id', verification.id)

  // Update user's whatsapp fields
  await supabase
    .from('users')
    .update({
      whatsapp_number: verification.phone,
      whatsapp_verified: true,
      whatsapp_verified_at: new Date().toISOString(),
    })
    .eq('id', userCtx.userId)

  // Enable WhatsApp in notification preferences
  const { data: user } = await supabase
    .from('users')
    .select('notification_preferences')
    .eq('id', userCtx.userId)
    .single()

  if (user) {
    const prefs = (user.notification_preferences as Record<string, boolean>) || {}
    prefs.whatsapp = true
    await supabase
      .from('users')
      .update({ notification_preferences: prefs })
      .eq('id', userCtx.userId)
  }

  return NextResponse.json({ success: true, phone: verification.phone })
}
