import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { sendVerificationCode } from '@/lib/evolution-api'
import { randomInt } from 'crypto'

export async function POST(request: NextRequest) {
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 3 codes per 5 minutes
  const rl = await checkRateLimit(`wa-code:${userCtx.userId}`, 3, 300)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Muitas tentativas. Tente em ${rl.retryAfter}s.` },
      { status: 429 },
    )
  }

  const { phone } = await request.json()
  const clean = String(phone).replace(/\D/g, '')
  const fullPhone = clean.startsWith('55') ? clean : `55${clean}`

  if (fullPhone.length < 12 || fullPhone.length > 13) {
    return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
  }

  const code = randomInt(100000, 999999).toString()

  const supabase = await createClient()

  // Delete any existing non-verified codes for this user
  await supabase
    .from('whatsapp_verifications')
    .delete()
    .eq('user_id', userCtx.userId)
    .eq('verified', false)

  // Insert new verification code
  const { error: insertError } = await supabase.from('whatsapp_verifications').insert({
    user_id: userCtx.userId,
    phone: fullPhone,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    verified: false,
    attempts: 0,
  })

  if (insertError) {
    console.error('[WhatsApp] Insert verification error:', insertError)
    return NextResponse.json({ error: 'Falha ao gerar código' }, { status: 500 })
  }

  // Send via Evolution API
  try {
    await sendVerificationCode(fullPhone, code)
  } catch (err) {
    console.error('[WhatsApp] Send code error:', err)
    return NextResponse.json({ error: 'Falha ao enviar código via WhatsApp' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
