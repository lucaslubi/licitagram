'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CompanyInfo } from '@/contexts/company-context'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AddCompanyInput {
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
}

interface AddCompanyResult {
  error?: string
  company?: CompanyInfo
}

// ─── Add Company Action ─────────────────────────────────────────────────────

export async function addCompanyAction(
  input: AddCompanyInput,
): Promise<AddCompanyResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  // 1. Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return { error: 'Nenhuma empresa principal vinculada' }
  }

  // 2. Check subscription and plan limits
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id, max_companies, plans(features)')
    .eq('company_id', profile.company_id)
    .single()

  if (!subscription) {
    return { error: 'Assinatura não encontrada' }
  }

  const features = (subscription.plans as any)?.features
  if (!features?.multi_cnpj) {
    return { error: 'Seu plano não permite múltiplas empresas. Faça upgrade para o plano Enterprise.' }
  }

  // 3. Count existing companies for this user
  const { count: existingCount } = await supabase
    .from('user_companies')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const maxCompanies = subscription.max_companies || 1
  if ((existingCount || 0) >= maxCompanies) {
    return {
      error: `NEEDS_PAYMENT:${existingCount}:${maxCompanies}`,
    }
  }

  // 4. Check if CNPJ already exists in companies table
  const cleanCnpj = input.cnpj.replace(/\D/g, '')
  const { data: existingCompany } = await supabase
    .from('companies')
    .select('id, cnpj, razao_social, nome_fantasia')
    .eq('cnpj', cleanCnpj)
    .maybeSingle()

  let companyId: string

  if (existingCompany) {
    // Company already exists — check if user is already linked
    const { data: existingLink } = await supabase
      .from('user_companies')
      .select('id')
      .eq('user_id', user.id)
      .eq('company_id', existingCompany.id)
      .maybeSingle()

    if (existingLink) {
      return { error: 'Esta empresa já está vinculada à sua conta' }
    }

    companyId = existingCompany.id
  } else {
    // Create new company
    const id = crypto.randomUUID()
    const { error: insertError } = await supabase.from('companies').insert({
      id,
      cnpj: cleanCnpj,
      razao_social: input.razao_social,
      nome_fantasia: input.nome_fantasia,
    })

    if (insertError) {
      if (insertError.code === '23505') {
        return { error: 'CNPJ já cadastrado' }
      }
      return { error: insertError.message }
    }

    companyId = id
  }

  // 5. Link company to user via user_companies
  const { error: linkError } = await supabase.from('user_companies').insert({
    user_id: user.id,
    company_id: companyId,
    role: 'admin',
    is_default: false,
  })

  if (linkError) {
    if (linkError.code === '23505') {
      return { error: 'Esta empresa já está vinculada à sua conta' }
    }
    return { error: linkError.message }
  }

  // 5b. Inherit subscription from primary company (Enterprise → all companies get Enterprise)
  try {
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('company_id', companyId)
      .maybeSingle()

    if (!existingSub && subscription) {
      // Copy the primary company's subscription to the new company
      const { data: primarySub } = await supabase
        .from('subscriptions')
        .select('plan, plan_id, status, stripe_subscription_id, stripe_customer_id, max_companies, started_at, expires_at')
        .eq('company_id', profile.company_id)
        .single()

      if (primarySub) {
        const { createClient: createServiceClient } = await import('@supabase/supabase-js')
        const serviceSupabase = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        const { error: subErr } = await serviceSupabase.from('subscriptions').insert({
          company_id: companyId,
          plan: primarySub.plan,
          plan_id: primarySub.plan_id,
          status: primarySub.status,
          stripe_subscription_id: primarySub.stripe_subscription_id,
          stripe_customer_id: primarySub.stripe_customer_id,
          max_companies: primarySub.max_companies,
          started_at: primarySub.started_at,
          expires_at: primarySub.expires_at,
          matches_used_this_month: 0,
        })

        if (subErr) {
          console.error('[MULTI-COMPANY] Failed to inherit subscription:', subErr.message)
        } else {
          console.log(`[MULTI-COMPANY] Inherited ${primarySub.plan} subscription for ${companyId}`)
        }
      }
    }
  } catch (err) {
    console.error('[MULTI-COMPANY] Subscription inheritance failed:', err)
  }

  revalidatePath('/company')
  revalidatePath('/dashboard')
  revalidatePath('/map')
  revalidatePath('/opportunities')

  // 6. Fetch CNAE data from BrasilAPI and save to company profile
  try {
    const brasilRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`)
    if (brasilRes.ok) {
      const brasilData = await brasilRes.json()
      const cnaePrincipal = brasilData.cnae_fiscal?.toString() || ''
      const cnaesSecundarios = (brasilData.cnaes_secundarios || [])
        .map((c: any) => c.codigo?.toString())
        .filter(Boolean)
      const allCnaes = cnaePrincipal ? [cnaePrincipal, ...cnaesSecundarios] : cnaesSecundarios

      // Update company with CNAE data
      await supabase.from('companies').update({
        razao_social: brasilData.razao_social || input.razao_social,
        nome_fantasia: brasilData.nome_fantasia || input.nome_fantasia,
        cnaes: allCnaes,
        uf: brasilData.uf || null,
        municipio: brasilData.municipio || null,
        situacao_cadastral: brasilData.descricao_situacao_cadastral || null,
      }).eq('id', companyId)

      console.log(`[MULTI-COMPANY] Updated company ${companyId} with ${allCnaes.length} CNAEs`)
    }
  } catch (err) {
    console.error('[MULTI-COMPANY] BrasilAPI lookup failed:', err)
  }

  // 7. Set initial matching status and trigger matching via VPS (fire-and-forget, fast)
  await supabase.from('companies').update({ matching_status: 'pending' }).eq('id', companyId)

  try {
    const VPS_URL = process.env.VPS_MONITORING_URL || 'http://187.77.241.93:3998'
    const MONITORING_KEY = process.env.MONITORING_API_KEY || ''
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    fetch(`${VPS_URL}/trigger-matching`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MONITORING_KEY ? { Authorization: `Bearer ${MONITORING_KEY}` } : {}),
      },
      body: JSON.stringify({ companyId }),
      signal: controller.signal,
    })
      .then(res => { clearTimeout(timeout); console.log('[MULTI-COMPANY] VPS trigger:', res.status) })
      .catch(err => { clearTimeout(timeout); console.warn('[MULTI-COMPANY] VPS trigger failed:', err.message) })
  } catch {
    // Non-critical
  }

  // Return the company info for the client to add to context
  const company: CompanyInfo = {
    id: companyId,
    cnpj: cleanCnpj,
    razao_social: existingCompany?.razao_social || input.razao_social,
    nome_fantasia: existingCompany?.nome_fantasia || input.nome_fantasia,
  }

  return { company }
}

// ─── Remove Company from Tenant ──────────────────────────────────────────────

export async function removeCompanyAction(companyId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Não autenticado' }

  // Verify user owns this company
  const { data: link } = await supabase
    .from('user_companies')
    .select('id, is_default')
    .eq('user_id', user.id)
    .eq('company_id', companyId)
    .single()

  if (!link) return { success: false, error: 'Empresa não encontrada' }

  // Can't delete the default/primary company
  if (link.is_default) {
    return { success: false, error: 'Não é possível remover a empresa principal. Defina outra como principal primeiro.' }
  }

  // Count user's companies — must have at least 1
  const { count } = await supabase
    .from('user_companies')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((count || 0) <= 1) {
    return { success: false, error: 'Você precisa ter pelo menos uma empresa cadastrada.' }
  }

  // Check if this is the active company
  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  // Remove the link (keeps the company record for other users)
  const { error: deleteError } = await supabase
    .from('user_companies')
    .delete()
    .eq('user_id', user.id)
    .eq('company_id', companyId)

  if (deleteError) return { success: false, error: deleteError.message }

  // Delete matches for this company owned by this user
  await supabase.from('matches').delete().eq('company_id', companyId)

  // Delete competitor watchlist
  await supabase.from('competitor_watchlist').delete().eq('company_id', companyId)

  // Delete subscription copy (if any)
  await supabase.from('subscriptions').delete().eq('company_id', companyId)

  // If user was on this company, switch to the default
  if (profile?.company_id === companyId) {
    const { data: defaultLink } = await supabase
      .from('user_companies')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single()

    const newCompanyId = defaultLink?.company_id || null
    if (newCompanyId) {
      await supabase.from('users').update({ company_id: newCompanyId }).eq('id', user.id)
    }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── Get User Companies ─────────────────────────────────────────────────────

export async function getUserCompanies(): Promise<CompanyInfo[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  // Get companies via user_companies junction table
  const { data: links } = await supabase
    .from('user_companies')
    .select('company_id, is_default, companies(id, cnpj, razao_social, nome_fantasia)')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (!links || links.length === 0) {
    // Fallback: use the legacy company_id from users table
    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) return []

    const { data: company } = await supabase
      .from('companies')
      .select('id, cnpj, razao_social, nome_fantasia')
      .eq('id', profile.company_id)
      .single()

    if (!company) return []

    return [
      {
        id: company.id,
        cnpj: company.cnpj,
        razao_social: company.razao_social,
        nome_fantasia: company.nome_fantasia,
      },
    ]
  }

  return links
    .map((link) => {
      const c = link.companies as any
      if (!c) return null
      return {
        id: c.id,
        cnpj: c.cnpj,
        razao_social: c.razao_social,
        nome_fantasia: c.nome_fantasia,
      }
    })
    .filter(Boolean) as CompanyInfo[]
}
