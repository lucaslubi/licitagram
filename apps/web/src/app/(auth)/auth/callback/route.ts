import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle Supabase error params (e.g. expired link)
  if (error) {
    const msg = errorDescription || 'Erro ao confirmar email. Tente fazer login novamente.'
    return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent(msg)}&type=error`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}/map`)
    }
    console.error('[Auth Callback] Exchange error:', exchangeError.message)
    // Common case: link expired or already used
    const msg = exchangeError.message.includes('expired')
      ? 'Link de confirmação expirado. Tente fazer login — um novo email será enviado.'
      : 'Erro ao confirmar email. Tente fazer login novamente.'
    return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent(msg)}&type=error`)
  }

  return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent('Link inválido. Tente fazer login novamente.')}&type=error`)
}
