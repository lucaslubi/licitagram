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

  revalidatePath('/company')
  revalidatePath('/dashboard')
  revalidatePath('/map')

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

  // 7. Trigger matching for the new company (async, don't block response)
  try {
    const { runRematchForCompany } = await import('@/actions/company')
    // Get company data for matching
    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (companyData) {
      runRematchForCompany(companyId, companyData).catch((err: any) => {
        console.error('[MULTI-COMPANY] Matching failed:', err)
      })
      console.log(`[MULTI-COMPANY] Matching triggered for company ${companyId}`)
    }
  } catch (err) {
    console.error('[MULTI-COMPANY] Could not trigger matching:', err)
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
