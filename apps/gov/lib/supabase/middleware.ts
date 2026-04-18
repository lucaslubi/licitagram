import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/cadastro',
  '/recuperar-senha',
  '/redefinir-senha',
  '/mfa',
  '/sobre',
  '/precos',
  '/termos',
  '/privacidade',
])

const AUTH_PATHS = new Set(['/login', '/cadastro', '/recuperar-senha', '/redefinir-senha'])

/** Paths that authed-but-not-onboarded users can access without being bounced. */
const ONBOARDING_PATHS = new Set(['/onboarding', '/mfa'])

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  if (pathname.startsWith('/api/auth/')) return true
  if (pathname.startsWith('/_next/')) return true
  if (pathname === '/favicon.ico') return true
  return false
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return response

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value: '', ...options })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  // Authed users hitting auth pages → bounce to dashboard.
  if (user && AUTH_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Anon users hitting protected pages → bounce to login with return path.
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  // MFA gate: if user enrolled MFA but current session is only aal1, force /mfa.
  if (user && pathname !== '/mfa' && !isPublicPath(pathname)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      return NextResponse.redirect(new URL('/mfa', request.url))
    }
  }

  // Onboarding gate: authed user without licitagov.usuarios row → /onboarding.
  // Skip on public paths and on the onboarding path itself (the page handles
  // the inverse: if onboarded, redirect to /dashboard).
  if (user && !isPublicPath(pathname) && !ONBOARDING_PATHS.has(pathname)) {
    const { data: profile } = await supabase.rpc('get_current_profile')
    const onboarded = Array.isArray(profile) && profile.length > 0 && profile[0]?.orgao_id != null
    if (!onboarded) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return response
}
