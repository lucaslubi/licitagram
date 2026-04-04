import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth-helpers'

/**
 * POST /api/admin/assign-plan
 * Assigns a plan directly to a user (user-level plan override).
 *
 * Body: { userId: string, planSlug: 'starter' | 'professional' | 'enterprise' }
 * OR:   { email: string, planSlug: 'starter' | 'professional' | 'enterprise' }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, email, planSlug } = await request.json()
    if (!planSlug) return NextResponse.json({ error: 'planSlug obrigatório' }, { status: 400 })
    if (!userId && !email) return NextResponse.json({ error: 'userId ou email obrigatório' }, { status: 400 })

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Find the plan
    const { data: plan } = await serviceSupabase
      .from('plans')
      .select('id, slug, name')
      .eq('slug', planSlug)
      .single()

    if (!plan) return NextResponse.json({ error: `Plano '${planSlug}' não encontrado` }, { status: 404 })

    // Find the user
    let targetUserId = userId
    if (!targetUserId && email) {
      const { data: userByEmail } = await serviceSupabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle()

      if (!userByEmail) {
        // Try auth.users
        const { data: { users: authUsers } } = await serviceSupabase.auth.admin.listUsers()
        const authUser = authUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase().trim())
        if (authUser) targetUserId = authUser.id
        else return NextResponse.json({ error: `Usuário com email '${email}' não encontrado` }, { status: 404 })
      } else {
        targetUserId = userByEmail.id
      }
    }

    // Assign plan to user
    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        plan_id: plan.id,
        subscription_status: 'active',
      })
      .eq('id', targetUserId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`[ADMIN] Assigned plan ${plan.slug} (${plan.id}) to user ${targetUserId}`)

    return NextResponse.json({
      success: true,
      userId: targetUserId,
      plan: { id: plan.id, slug: plan.slug, name: plan.name },
    })
  } catch (err) {
    console.error('[admin/assign-plan]', err)
    return NextResponse.json({ error: 'Erro ao atribuir plano' }, { status: 500 })
  }
}
