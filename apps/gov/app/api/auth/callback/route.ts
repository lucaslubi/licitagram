import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth / email-confirmation PKCE callback. Supabase redirects here after the
 * user clicks the link in their inbox; we exchange the code for a session and
 * forward to the original destination (or /dashboard).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
