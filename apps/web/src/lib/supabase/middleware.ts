import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { PlanContext, PlanFeatureKey } from '@licitagram/shared'
import { PLAN_CTX_COOKIE, PLAN_CTX_TTL_MS } from '@licitagram/shared'

/**
 * Feature gating: page routes that require specific plan features.
 * If user doesn't have the feature, redirect to /billing.
 *
 * NOTE: API routes (/api/*) are excluded from the middleware matcher,
 * so feature checks for API routes must happen inside the route handlers.
 */
const FEATURE_GATED_ROUTES: Record<string, PlanFeatureKey> = {
  '/competitors': 'competitive_intel',
  '/documents': 'compliance_checker',
}

/**
 * Routes that require an active subscription.
 * Users without active sub are redirected to /billing?expired=1.
 */
const SUBSCRIPTION_REQUIRED_ROUTES = [
  '/map',
  '/dashboard',
  '/opportunities',
  '/pipeline',
  '/competitors',
  '/documents',
]

/** Public routes (no auth needed) */
const PUBLIC_ROUTES = ['/login', '/register', '/auth']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // ─── Public routes & Authenticated redirect ────────────────────────────
  // If user is already authenticated and visits the landing page or login/register, push them directly to their app homepage (/map).
  if (user && (pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/register'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/map'
    return NextResponse.redirect(url)
  }

  // ─── Public routes: allow access for unauthenticated users ─────────────
  if (pathname === '/' || PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return supabaseResponse
  }

  // ─── Not authenticated → redirect to login (preserve original URL) ───
  if (!user) {
    const url = request.nextUrl.clone()
    const originalPath = pathname + request.nextUrl.search
    url.pathname = '/login'
    if (originalPath !== '/') {
      url.searchParams.set('redirectTo', originalPath)
    }
    return NextResponse.redirect(url)
  }

  // ─── Billing page is always accessible (no plan check) ────────────────
  if (pathname.startsWith('/billing')) {
    return supabaseResponse
  }

  // ─── Try to read plan context from cookie (fast path) ─────────────────
  let planCtx = getPlanContextFromCookie(request)

  // Cookie missing or expired → query DB and set cookie
  if (!planCtx) {
    planCtx = await buildPlanContextFromDB(supabase, user.id)
    if (planCtx) {
      supabaseResponse.cookies.set(PLAN_CTX_COOKIE, JSON.stringify(planCtx), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 300, // 5 minutes
        path: '/',
      })
    }
  }

  // ─── Admin routes: require is_platform_admin ──────────────────────────
  if (pathname.startsWith('/admin')) {
    if (!planCtx?.isPlatformAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/map'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // ─── Platform admin → bypass all plan checks ─────────────────────────
  if (planCtx?.isPlatformAdmin) {
    return supabaseResponse
  }

  // ─── Subscription required routes ─────────────────────────────────────
  const needsSub = SUBSCRIPTION_REQUIRED_ROUTES.some((r) => pathname.startsWith(r))
  if (needsSub && planCtx) {
    const status = planCtx.subscriptionStatus
    if (!status || !['active', 'trialing'].includes(status)) {
      const url = request.nextUrl.clone()
      url.pathname = '/billing'
      url.searchParams.set('expired', '1')
      return NextResponse.redirect(url)
    }
  }

  // ─── Feature gating ───────────────────────────────────────────────────
  for (const [route, feature] of Object.entries(FEATURE_GATED_ROUTES)) {
    if (pathname.startsWith(route)) {
      if (!planCtx?.features || !hasFeatureFromCtx(planCtx.features, feature)) {
        const url = request.nextUrl.clone()
        url.pathname = '/billing'
        url.searchParams.set('upgrade', feature)
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPlanContextFromCookie(request: NextRequest): PlanContext | null {
  try {
    const raw = request.cookies.get(PLAN_CTX_COOKIE)?.value
    if (!raw) return null

    const ctx = JSON.parse(raw) as PlanContext
    // Check TTL
    if (Date.now() - ctx.ts > PLAN_CTX_TTL_MS) return null
    return ctx
  } catch {
    return null
  }
}

async function buildPlanContextFromDB(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<PlanContext | null> {
  try {
    const { data: profile } = await supabase
      .from('users')
      .select('company_id, is_platform_admin, plan_id, subscription_status')
      .eq('id', userId)
      .single()

    if (!profile) return null

    const isPlatformAdmin = profile.is_platform_admin || false

    // Platform admin → no need to fetch plan details
    if (isPlatformAdmin) {
      return {
        planSlug: null,
        planId: null,
        features: null,
        isPlatformAdmin: true,
        subscriptionStatus: null,
        ts: Date.now(),
      }
    }

    // ── 1. Check user-level plan override first ────────────────────────────
    if (profile.plan_id) {
      const { data: userPlan } = await supabase
        .from('plans')
        .select('slug, features')
        .eq('id', profile.plan_id)
        .single()

      if (userPlan) {
        return {
          planSlug: userPlan.slug,
          planId: profile.plan_id,
          features: userPlan.features as any,
          isPlatformAdmin: false,
          subscriptionStatus: (profile.subscription_status || 'active') as any,
          ts: Date.now(),
        }
      }
    }

    // ── 2. Fallback: company-level subscription ────────────────────────────
    if (!profile.company_id) {
      return {
        planSlug: null,
        planId: null,
        features: null,
        isPlatformAdmin: false,
        subscriptionStatus: null,
        ts: Date.now(),
      }
    }

    // Try current company first
    let { data: sub } = await supabase
      .from('subscriptions')
      .select(`status, plan_id, plans(slug, features)`)
      .eq('company_id', profile.company_id)
      .in('status', ['active', 'trialing'])
      .single()

    // Fallback: check sibling companies in the same user group
    if (!sub) {
      const { data: siblings } = await supabase
        .from('user_companies')
        .select('company_id')
        .eq('user_id', userId)

      if (siblings && siblings.length > 0) {
        const siblingIds = siblings
          .map((s: any) => s.company_id)
          .filter((id: string) => id !== profile.company_id)

        if (siblingIds.length > 0) {
          const { data: bestSub } = await supabase
            .from('subscriptions')
            .select(`status, plan_id, company_id, plans(slug, features)`)
            .in('company_id', siblingIds)
            .in('status', ['active', 'trialing'])
            .order('plan_id', { ascending: false })
            .limit(1)
            .single()

          if (bestSub) sub = bestSub
        }
      }
    }

    if (!sub) {
      return {
        planSlug: null,
        planId: null,
        features: null,
        isPlatformAdmin: false,
        subscriptionStatus: null,
        ts: Date.now(),
      }
    }

    const plan = (sub as any).plans
    return {
      planSlug: plan?.slug || null,
      planId: sub.plan_id || null,
      features: plan?.features || null,
      isPlatformAdmin: false,
      subscriptionStatus: sub.status as any,
      ts: Date.now(),
    }
  } catch {
    return null
  }
}

function hasFeatureFromCtx(
  features: Record<string, any>,
  feature: PlanFeatureKey,
): boolean {
  const value = features[feature]
  if (Array.isArray(value)) return value.length > 0
  return !!value
}
