'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { invalidateCache, CacheKeys } from '@/lib/redis'
import { CNAE_DIVISIONS, RELATED_DIVISIONS, getCompanyDivisions, NON_COMPETITIVE_MODALITIES, getCompanySectors, detectSectorConflict, stemWord } from '@licitagram/shared'

// ─── Service-role Supabase (bypasses RLS for match writes) ─────────────────

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── Matching Constants ───────────────────────────────────────────────────

const MIN_MATCH_SCORE = 40
const DIRECT_CNAE_SCORE = 100
const RELATED_CNAE_SCORE = 50

// ─── Text Processing ───────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'para',
  'com', 'por', 'uma', 'um', 'que', 'ao', 'aos', 'ou', 'e', 'o', 'a',
  'os', 'as', 'se', 'ser', 'como', 'mais', 'tem', 'sua', 'seu', 'seus',
  'suas', 'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'isso',
  'aquele', 'aquela', 'nao', 'sim', 'muito', 'pouco', 'bem', 'mal',
  'ate', 'sobre', 'entre', 'apos', 'antes', 'durante', 'sob', 'contra',
  'desde', 'conforme', 'segundo', 'quando', 'onde', 'quem', 'qual',
  'quanto', 'todo', 'toda', 'todos', 'todas', 'cada', 'outro', 'outra',
  'outros', 'outras', 'mesmo', 'mesma', 'ja', 'ainda', 'tambem', 'apenas',
  // Licitação-specific stopwords (too generic — match everything)
  'contratacao', 'aquisicao', 'prestacao', 'servico', 'servicos', 'fornecimento',
  'empresa', 'objeto', 'licitacao', 'pregao', 'edital', 'item', 'itens',
  'lote', 'lotes', 'valor', 'preco', 'registro', 'precos', 'ata',
  'processo', 'numero', 'tipo', 'modalidade', 'orgao', 'entidade',
  'publica', 'publico', 'federal', 'estadual', 'municipal', 'governo',
  'secretaria', 'ministerio', 'departamento', 'diretoria', 'coordenacao',
  'referente', 'descrito', 'abaixo', 'acima', 'seguinte',
  'forma', 'modo', 'acordo', 'termos', 'condicoes', 'especificacoes',
  'atender', 'necessidade', 'demanda', 'solicitacao', 'requisicao',
  'prazo', 'dias', 'meses', 'periodo', 'vigencia', 'contrato',
  'execucao', 'realizacao', 'elaboracao', 'instalacao',
  'material', 'equipamento', 'sistema', 'solucao', 'produto', 'produtos',
  'unidade', 'quantidade', 'total', 'global', 'mensal', 'anual',
])

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(stemWord)
}

function computeKeywordScore(
  companyTokens: Set<string>,
  tenderTokens: Set<string>,
): number {
  if (companyTokens.size === 0 || tenderTokens.size === 0) return 0
  let matches = 0
  const matchedTokens: string[] = []
  for (const token of companyTokens) {
    if (tenderTokens.has(token)) {
      matches++
      matchedTokens.push(token)
    }
  }
  if (matches === 0) return 0

  // Require minimum 2 matching tokens to avoid noise from generic word overlap
  if (matches < 2) return 0

  // Percentage-based: what fraction of company keywords appear in the tender
  const percentScore = Math.round((matches / companyTokens.size) * 100)
  // Absolute: slower ramp — 3 matches = 30, 5 = 50, 7 = 70, 10+ = 100
  const absoluteScore = Math.min(100, matches * 10)
  return Math.max(percentScore, absoluteScore)
}

function computeCNAEScore(companyCnaes: string[], tenderCnaeDivisions: string[]): number {
  if (companyCnaes.length === 0 || tenderCnaeDivisions.length === 0) return 0

  const { direct: companyDirectDivs, related: companyRelatedDivs } = getCompanyDivisions(companyCnaes)
  let bestScore = 0

  for (const tenderDiv of tenderCnaeDivisions) {
    if (companyDirectDivs.has(tenderDiv)) {
      bestScore = Math.max(bestScore, DIRECT_CNAE_SCORE)
      break
    }
    if (companyRelatedDivs.has(tenderDiv)) {
      bestScore = Math.max(bestScore, RELATED_CNAE_SCORE)
    }
  }

  return bestScore
}

// ─── CNPJ Lookup ──────────────────────────────────────────────────────────

export async function lookupCNPJ(cnpj: string) {
  const clean = cnpj.replace(/\D/g, '')
  if (clean.length !== 14) {
    return { error: 'CNPJ deve ter 14 dígitos' }
  }

  // Try BrasilAPI first (more reliable from serverless)
  try {
    const brasilRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (brasilRes.ok) {
      const d = await brasilRes.json()
      // Build full address from BrasilAPI fields
      const enderecoPartes = [
        d.logradouro,
        d.numero,
        d.complemento,
        d.bairro,
        d.municipio ? `${d.municipio} - ${d.uf}` : '',
      ].filter(Boolean)
      return {
        data: {
          nome: d.razao_social,
          fantasia: d.nome_fantasia,
          uf: d.uf,
          municipio: d.municipio,
          porte: d.porte,
          atividade_principal: d.cnae_fiscal
            ? [{ code: String(d.cnae_fiscal), text: d.cnae_fiscal_descricao }]
            : [],
          atividades_secundarias: (d.cnaes_secundarios || []).map((c: { codigo: number; descricao: string }) => ({
            code: String(c.codigo),
            text: c.descricao,
          })),
          // Dados extras para propostas
          endereco: enderecoPartes.join(', '),
          cep: d.cep ? String(d.cep).replace(/\D/g, '') : '',
          telefone: d.ddd_telefone_1 || '',
          email: d.email || '',
        },
      }
    }
  } catch { /* fallback below */ }

  // Fallback to ReceitaWS
  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${clean}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()

    if (data.status === 'ERROR') {
      return { error: data.message || 'CNPJ não encontrado' }
    }

    const enderecoPartes = [
      data.logradouro,
      data.numero,
      data.complemento,
      data.bairro,
      data.municipio ? `${data.municipio} - ${data.uf}` : '',
    ].filter(Boolean)
    return {
      data: {
        nome: data.nome,
        fantasia: data.fantasia,
        uf: data.uf,
        municipio: data.municipio,
        porte: data.porte,
        atividade_principal: data.atividade_principal,
        atividades_secundarias: data.atividades_secundarias,
        endereco: enderecoPartes.join(', '),
        cep: (data.cep || '').replace(/\D/g, ''),
        telefone: data.telefone || '',
        email: data.email || '',
      },
    }
  } catch {
    return { error: 'Erro ao consultar CNPJ. Tente novamente.' }
  }
}

// ─── Save Company ─────────────────────────────────────────────────────────

interface CompanyPayload {
  cnpj: string
  razao_social: string
  nome_fantasia: string
  porte: string
  uf: string
  municipio: string
  cnae_principal: string
  cnaes_secundarios: string[]
  descricao_servicos: string
  capacidades: string[]
  certificacoes: string[]
  palavras_chave: string[]
  // Campos para propostas comerciais
  endereco?: string
  cep?: string
  telefone?: string
  email?: string
  banco?: string
  agencia?: string
  conta?: string
  representante_nome?: string
  representante_cpf?: string
  representante_cargo?: string
}

export async function saveCompany(payload: CompanyPayload, existingId?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autenticado' }
  }

  // ── Input validation ──────────────────────────────────────────────────
  const cleanCnpj = payload.cnpj?.replace(/\D/g, '') || ''
  if (cleanCnpj.length !== 14) {
    return { error: 'CNPJ deve ter 14 dígitos' }
  }

  if (!payload.razao_social || payload.razao_social.trim().length < 2) {
    return { error: 'Razão social é obrigatória (min. 2 caracteres)' }
  }

  if (payload.descricao_servicos && payload.descricao_servicos.length > 5000) {
    return { error: 'Descrição de serviços deve ter no máximo 5000 caracteres' }
  }

  // Sanitize arrays — limit size and strip HTML
  const sanitizeStr = (s: string) => s.replace(/<[^>]*>/g, '').trim().slice(0, 200)
  const sanitizeArray = (arr: string[], max: number) =>
    (arr || []).slice(0, max).map(sanitizeStr).filter(Boolean)

  const sanitized: CompanyPayload = {
    ...payload,
    cnpj: cleanCnpj,
    razao_social: payload.razao_social.trim().slice(0, 500),
    nome_fantasia: (payload.nome_fantasia || '').trim().slice(0, 500),
    descricao_servicos: (payload.descricao_servicos || '').replace(/<[^>]*>/g, '').trim().slice(0, 5000),
    cnaes_secundarios: sanitizeArray(payload.cnaes_secundarios, 50),
    capacidades: sanitizeArray(payload.capacidades, 50),
    certificacoes: sanitizeArray(payload.certificacoes, 50),
    palavras_chave: sanitizeArray(payload.palavras_chave, 50),
    uf: (payload.uf || '').slice(0, 2).toUpperCase(),
    municipio: (payload.municipio || '').trim().slice(0, 200),
    porte: payload.porte || '',
    cnae_principal: (payload.cnae_principal || '').replace(/\D/g, '').slice(0, 10),
    // Campos para propostas
    endereco: (payload.endereco || '').trim().slice(0, 500),
    cep: (payload.cep || '').replace(/\D/g, '').slice(0, 8),
    telefone: (payload.telefone || '').trim().slice(0, 20),
    email: (payload.email || '').trim().slice(0, 200),
    banco: (payload.banco || '').trim().slice(0, 100),
    agencia: (payload.agencia || '').trim().slice(0, 20),
    conta: (payload.conta || '').trim().slice(0, 30),
    representante_nome: (payload.representante_nome || '').trim().slice(0, 200),
    representante_cpf: (payload.representante_cpf || '').replace(/\D/g, '').slice(0, 11),
    representante_cargo: (payload.representante_cargo || '').trim().slice(0, 100),
  }

  let companyId: string

  if (existingId) {
    // Update existing company
    console.log('[COMPANY] Updating company:', existingId, '| descricao length:', sanitized.descricao_servicos?.length || 0, '| palavras_chave count:', sanitized.palavras_chave?.length || 0)
    const { error, data: updated } = await supabase.from('companies').update(sanitized).eq('id', existingId).select('id')
    if (error) {
      console.error('[COMPANY] Update error:', error.message, error.code, error.details)
      return { error: error.message }
    }
    if (!updated || updated.length === 0) {
      console.error('[COMPANY] Update returned 0 rows — RLS may be blocking')
      return { error: 'Erro ao atualizar: permissao negada. Tente fazer login novamente.' }
    }
    console.log('[COMPANY] Update success, rows:', updated.length)
    companyId = existingId
  } else {
    // Create new company — pre-generate UUID to avoid RETURNING + RLS conflict
    const id = crypto.randomUUID()
    const { error: insertError } = await supabase.from('companies').insert({ id, ...sanitized })

    if (insertError) {
      // If CNPJ already exists (orphaned from a previous deletion), reuse it
      // Uses service client to bypass RLS (orphaned companies are invisible to normal queries)
      if (insertError.code === '23505' && cleanCnpj) {
        const serviceSupabase = getServiceSupabase()
        const { data: orphaned } = await serviceSupabase
          .from('companies')
          .select('id')
          .eq('cnpj', cleanCnpj)
          .maybeSingle()

        if (orphaned) {
          // Check if anyone else is using this company
          const { count: otherLinks } = await serviceSupabase
            .from('user_companies')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', orphaned.id)

          if ((otherLinks || 0) === 0) {
            // No one is linked — update the orphaned record with new data
            await serviceSupabase.from('companies').update(sanitized).eq('id', orphaned.id)
            await supabase.from('users').update({ company_id: orphaned.id }).eq('id', user.id)
            companyId = orphaned.id
            console.log('[COMPANY] Reused orphaned company:', orphaned.id, 'for CNPJ:', cleanCnpj)
          } else {
            return { error: 'CNPJ já cadastrado por outra conta' }
          }
        } else {
          return { error: insertError.message }
        }
      } else {
        return { error: insertError.message }
      }
    } else {
      // Link company to user
      const { error: linkError } = await supabase
        .from('users')
        .update({ company_id: id })
        .eq('id', user.id)
      if (linkError) return { error: linkError.message }
      companyId = id
    }
  }

  // ── Create subscription for new company ─────────────────────────────────
  // If user already has a paid plan on another company, INHERIT it.
  // Otherwise, create a trial subscription. This ensures Enterprise users
  // get Enterprise on ALL their companies automatically.
  if (!existingId) {
    const serviceSupabase = getServiceSupabase()

    // Check if subscription already exists
    const { data: existingSub } = await serviceSupabase
      .from('subscriptions')
      .select('id')
      .eq('company_id', companyId)
      .maybeSingle()

    if (!existingSub) {
      // Look for an existing paid subscription from the same user's other companies
      let inheritedSub = false
      try {
        // Get all companies this user owns via user_companies
        const { data: userCompanies } = await serviceSupabase
          .from('user_companies')
          .select('company_id')
          .eq('user_id', user.id)

        // Also check the legacy company_id on users table
        const { data: userProfile } = await serviceSupabase
          .from('users')
          .select('company_id')
          .eq('id', user.id)
          .single()

        const allCompanyIds = new Set<string>()
        if (userCompanies) userCompanies.forEach(uc => allCompanyIds.add(uc.company_id))
        if (userProfile?.company_id) allCompanyIds.add(userProfile.company_id)
        allCompanyIds.delete(companyId) // Exclude the new company

        if (allCompanyIds.size > 0) {
          // Find the best active subscription from user's other companies
          const { data: bestSub } = await serviceSupabase
            .from('subscriptions')
            .select('plan, plan_id, status, stripe_subscription_id, stripe_customer_id, max_companies, started_at, expires_at')
            .in('company_id', Array.from(allCompanyIds))
            .in('status', ['active', 'trialing'])
            .order('plan_id', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()

          if (bestSub && (bestSub.plan_id || bestSub.plan !== 'trial')) {
            // Inherit the paid plan
            const { error: inheritErr } = await serviceSupabase.from('subscriptions').insert({
              company_id: companyId,
              plan: bestSub.plan || 'enterprise',
              plan_id: bestSub.plan_id,
              status: bestSub.status,
              stripe_subscription_id: bestSub.stripe_subscription_id,
              stripe_customer_id: bestSub.stripe_customer_id,
              max_companies: bestSub.max_companies,
              started_at: bestSub.started_at,
              expires_at: bestSub.expires_at,
              matches_used_this_month: 0,
            })

            if (!inheritErr) {
              inheritedSub = true
              console.log(`[COMPANY] Inherited ${bestSub.plan} subscription for ${companyId} from user group`)
            } else {
              console.error('[COMPANY] Failed to inherit subscription:', inheritErr.message)
            }
          }
        }
      } catch (err) {
        console.error('[COMPANY] Subscription inheritance check failed:', err)
      }

      // Fallback: create trial if no plan to inherit
      if (!inheritedSub) {
        const { error: subInsertError } = await serviceSupabase.from('subscriptions').insert({
          company_id: companyId,
          plan: 'trial',
          plan_id: null,
          status: 'trialing',
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          matches_used_this_month: 0,
        })

        if (subInsertError) {
          console.error(`[COMPANY] Failed to create trial subscription for ${companyId}:`, subInsertError.message)
        } else {
          console.log('[COMPANY] Created trial subscription for', companyId)
        }
      }
    }
  }

  // ── MATCHING: Fire-and-forget to VPS ─────────────────────────────────────
  // All matching runs on VPS (no Vercel timeout). saveCompany() returns FAST.
  const VPS_URL = process.env.VPS_MONITORING_URL || 'http://85.31.60.53:3998'
  const MONITORING_KEY = process.env.MONITORING_API_KEY || ''
  try {
    console.log('[COMPANY] Triggering VPS matching pipeline for', companyId)
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
      .then(res => {
        clearTimeout(timeout)
        console.log('[COMPANY] VPS trigger response:', res.status)
      })
      .catch(err => {
        clearTimeout(timeout)
        console.warn('[COMPANY] VPS trigger failed (non-critical):', err.message)
      })
  } catch {
    // Non-critical — VPS handles all matching
  }

  // Invalidate in-memory caches so dashboard reflects the save
  try {
    await invalidateCache(CacheKeys.allCompanyMatches(companyId))
    await invalidateCache('cache:stats:dashboard:*')
    await invalidateCache(`cache:company:${companyId}`)
  } catch { /* non-critical */ }

  // Force Next.js to revalidate company page so reloading shows fresh data
  revalidatePath('/company')
  revalidatePath('/dashboard')
  revalidatePath('/map')
  revalidatePath('/opportunities')

  return { id: companyId }
}

// ─── Load Company Data ────────────────────────────────────────────────────

export async function loadCompanyData() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) return { data: null }

  const { data } = await supabase
    .from('companies')
    .select('*')
    .eq('id', profile.company_id)
    .single()

  return { data }
}

// ─── Inline Map Cache Refresh ─────────────────────────────────────────────

const VALID_UFS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
])
const EXCLUDED_MODALIDADES_MAP = ['Inexigibilidade', 'Credenciamento']

/**
 * Refreshes map_cache for a single company immediately after matching.
 * Same logic as map-cache.processor.ts but runs inline in the web app
 * so the map is populated instantly without waiting for the hourly worker.
 */
async function refreshMapCacheForCompany(
  supabase: any,
  companyId: string,
) {
  const today = new Date().toISOString().split('T')[0]
  const PAGE = 1000
  const MAX = 5000
  const BATCH = 500

  // Fetch all matches with tender data (paginated)
  const allMatches: any[] = []
  for (let offset = 0; offset < MAX; offset += PAGE) {
    const { data: page, error } = await supabase
      .from('matches')
      .select(`
        id, score, is_hot, match_source, company_id,
        tenders (
          id, objeto, orgao_nome, uf, municipio,
          valor_estimado, data_abertura, data_encerramento,
          modalidade_nome
        )
      `)
      .eq('company_id', companyId)
      .in('match_source', ['ai', 'ai_triage', 'semantic', 'keyword'])
      .gte('score', 40)
      .order('score', { ascending: false })
      .range(offset, offset + PAGE - 1)

    if (error) {
      console.error('[MAP_CACHE] Fetch error:', error.message)
      break
    }
    if (!page || page.length === 0) break
    allMatches.push(...page)
    if (page.length < PAGE) break
  }

  if (allMatches.length === 0) return

  // Filter: valid UF, not expired, not non-competitive
  const validRows = allMatches
    .filter((m: any) => {
      const t = m.tenders
      if (!t || !t.uf) return false
      if (!VALID_UFS.has(t.uf)) return false
      if (t.data_encerramento && t.data_encerramento < today) return false
      if (t.modalidade_nome && EXCLUDED_MODALIDADES_MAP.includes(t.modalidade_nome)) return false
      return true
    })
    .map((m: any) => ({
      company_id: companyId,
      match_id: m.id,
      tender_id: m.tenders.id,
      score: m.score,
      is_hot: m.is_hot || false,
      match_source: m.match_source,
      objeto: (m.tenders.objeto || '').slice(0, 500),
      orgao_nome: m.tenders.orgao_nome,
      uf: m.tenders.uf,
      municipio: m.tenders.municipio,
      valor_estimado: m.tenders.valor_estimado,
      data_abertura: m.tenders.data_abertura,
      data_encerramento: m.tenders.data_encerramento,
      modalidade_nome: m.tenders.modalidade_nome,
      created_at: new Date().toISOString(),
    }))

  if (validRows.length === 0) return

  // Delete old cache and insert fresh
  await supabase.from('map_cache').delete().eq('company_id', companyId)

  for (let i = 0; i < validRows.length; i += BATCH) {
    const batch = validRows.slice(i, i + BATCH)
    const { error: insertErr } = await supabase
      .from('map_cache')
      .upsert(batch, { onConflict: 'company_id,match_id', ignoreDuplicates: true })
    if (insertErr) {
      console.error('[MAP_CACHE] Insert error:', insertErr.message)
    }
  }

  console.log(`[MAP_CACHE] Inline refresh: ${validRows.length} rows for company ${companyId}`)
}

// ─── Unified Keyword-First Re-Matching Logic ────────────────────────────

// Prevent concurrent rematches for the same company
const activeRematches = new Map<string, Promise<number>>()

/**
 * Unified keyword-first matching for a single company against all tenders.
 * Debounced: if a rematch is already running for this company, waits for it.
 */
export async function runRematchForCompany(
  companyId: string,
  company: CompanyPayload,
): Promise<number> {
  const existing = activeRematches.get(companyId)
  if (existing) {
    console.log('[REMATCH] Already running for company, waiting...')
    return existing
  }

  const promise = _runRematchForCompany(companyId, company)
  activeRematches.set(companyId, promise)
  try {
    return await promise
  } finally {
    activeRematches.delete(companyId)
  }
}

async function _runRematchForCompany(
  companyId: string,
  company: CompanyPayload,
): Promise<number> {
  const serviceSupabase = getServiceSupabase()
  const startTime = Date.now()

  console.log('[REMATCH] Starting for company:', companyId)

  // Build company CNAE list
  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(company.cnae_principal)
  if (company.cnaes_secundarios?.length) allCnaes.push(...company.cnaes_secundarios)

  // Build keyword tokens from CNAE activities + user keywords
  const companyKeywords = new Set<string>()
  if (company.palavras_chave?.length) {
    for (const kw of company.palavras_chave) {
      for (const t of tokenize(kw)) companyKeywords.add(t)
    }
  }

  // Add CNAE-derived keywords (activities the company performs)
  for (const cnae of allCnaes) {
    const div = cnae.substring(0, 2)
    const division = CNAE_DIVISIONS[div]
    if (division) {
      for (const kw of division.keywords) {
        for (const token of tokenize(kw)) companyKeywords.add(token)
      }
    }
  }

  // Add capacidades (technical capabilities)
  if (company.capacidades?.length) {
    for (const cap of company.capacidades) {
      for (const t of tokenize(cap)) companyKeywords.add(t)
    }
  }

  const descTokens = company.descricao_servicos
    ? new Set(tokenize(company.descricao_servicos))
    : new Set<string>()

  // Compute company sectors for sector conflict detection
  const companySectors = getCompanySectors(allCnaes)

  console.log('[REMATCH] Keywords:', companyKeywords.size, '| Desc tokens:', descTokens.size, '| Sectors:', [...companySectors].join(','))

  if (allCnaes.length === 0 && companyKeywords.size === 0 && descTokens.size === 0) {
    console.log('[REMATCH] No matching criteria — aborting')
    return 0
  }

  // ── CLEANUP PHASE 1: Delete low-quality keyword-only matches ──────────
  const { count: deletedCount } = await serviceSupabase
    .from('matches')
    .delete({ count: 'exact' })
    .eq('company_id', companyId)
    .eq('match_source', 'keyword')
    .lte('score', 55)
    .in('status', ['new', 'viewed'])

  if (deletedCount && deletedCount > 0) {
    console.log(`[REMATCH] Purged ${deletedCount} low-quality keyword matches`)
  }

  // ── CLEANUP PHASE 2: Sector conflict retroactive cleanup ─────────────
  // Re-check ALL existing keyword matches for sector conflicts
  // (catches old matches created before sector detection was added/expanded)
  let sectorPurged = 0
  let cleanupPage = 0
  while (true) {
    const { data: existingMatches } = await serviceSupabase
      .from('matches')
      .select('id, tender_id, tenders(objeto, resumo)')
      .eq('company_id', companyId)
      .eq('match_source', 'keyword')
      .in('status', ['new', 'viewed'])
      .range(cleanupPage * 500, (cleanupPage + 1) * 500 - 1)

    if (!existingMatches || existingMatches.length === 0) break

    const idsToDelete: string[] = []
    for (const m of existingMatches) {
      const t = m.tenders as any
      if (!t?.objeto) continue
      const text = t.objeto + (t.resumo ? ' ' + t.resumo : '')
      const conflict = detectSectorConflict(text, companySectors)
      if (conflict) {
        idsToDelete.push(m.id)
      }
    }

    if (idsToDelete.length > 0) {
      await serviceSupabase
        .from('matches')
        .delete()
        .in('id', idsToDelete)
      sectorPurged += idsToDelete.length
    }

    if (existingMatches.length < 500) break
    cleanupPage++
  }

  if (sectorPurged > 0) {
    console.log(`[REMATCH] Purged ${sectorPurged} matches with sector conflicts`)
  }

  // ── PRE-LOAD existing match tender IDs (1 query instead of N) ──────────
  const existingMatchIds = new Set<string>()
  let matchPage = 0
  while (true) {
    const { data: existing } = await serviceSupabase
      .from('matches')
      .select('tender_id')
      .eq('company_id', companyId)
      .range(matchPage * 1000, (matchPage + 1) * 1000 - 1)

    if (!existing || existing.length === 0) break
    for (const m of existing) existingMatchIds.add(m.tender_id)
    if (existing.length < 1000) break
    matchPage++
  }

  console.log('[REMATCH] Existing matches loaded:', existingMatchIds.size)

  // Scan last 90 days (optimized for Vercel serverless timeout)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 90)
  const cutoff = cutoffDate.toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  let matchCount = 0
  let scanned = 0
  const pageSize = 1000
  const BATCH_SIZE = 200
  const MAX_RUNTIME_MS = 50_000 // 50s safety limit for Vercel

  // Buffer for batch inserts
  let insertBuffer: Array<{
    company_id: string
    tender_id: string
    score: number
    keyword_score: number
    breakdown: Array<{ category: string; score: number; reason: string }>
    ai_justificativa: null
    riscos: never[]
    acoes_necessarias: never[]
    recomendacao: null
    match_source: 'keyword'
    status: 'new'
  }> = []

  async function flushBuffer() {
    if (insertBuffer.length === 0) return
    const batch = insertBuffer.splice(0)
    const { error, count } = await serviceSupabase
      .from('matches')
      .upsert(batch, { onConflict: 'company_id,tender_id', count: 'exact' })
    if (error) {
      console.error('[REMATCH] Batch upsert error:', error.message)
    } else {
      matchCount += batch.length
    }
  }

  // ── SINGLE PASS: scan ALL tenders ────────────────────────────────────
  let page = 0
  while (true) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data: tenders, error: queryError } = await serviceSupabase
      .from('tenders')
      .select('id, objeto, resumo, data_encerramento')
      .gt('objeto', '')
      .or(`data_publicacao.gte.${cutoff},data_publicacao.is.null`)
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`)
      .not('modalidade_id', 'in', `(${NON_COMPETITIVE_MODALITIES.join(',')})`)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (queryError) {
      console.error('[REMATCH] Query error page', page, ':', queryError.message)
      break
    }

    if (!tenders || tenders.length === 0) {
      if (page === 0) console.log('[REMATCH] 0 tenders found')
      break
    }

    if (page === 0) console.log('[REMATCH] First page:', tenders.length, 'tenders')

    for (const tender of tenders) {
      if (!tender.objeto) continue
      scanned++

      // Skip if already matched (avoids upsert overhead)
      if (existingMatchIds.has(tender.id)) continue

      // SECTOR CONFLICT GATE: block matches from incompatible sectors
      const tenderFullText = tender.objeto + (tender.resumo ? ' ' + tender.resumo : '')
      const conflict = detectSectorConflict(tenderFullText, companySectors)
      if (conflict) continue

      // Tokenize tender text
      const objetoTokens = tokenize(tender.objeto)
      const resumoTokens = tender.resumo ? tokenize(tender.resumo as string) : []
      const tenderTokens = new Set([...objetoTokens, ...resumoTokens])

      // 1. Keyword score
      const kwScore = computeKeywordScore(companyKeywords, tenderTokens)

      // 2. Description score
      const descScore = computeKeywordScore(descTokens, tenderTokens)

      // Scoring: keyword (60%) + description (40%), capped at 50 (keyword-only mode, no CNAE gate)
      // Cap lower than worker's Mode B (60) since this uses tokens not phrases
      const finalScore = Math.min(50, Math.round(kwScore * 0.60 + descScore * 0.40))

      if (finalScore < MIN_MATCH_SCORE) continue

      insertBuffer.push({
        company_id: companyId,
        tender_id: tender.id,
        score: finalScore,
        keyword_score: finalScore,
        breakdown: [
          { category: 'keywords', score: kwScore, reason: 'Palavras-chave (CNAE + empresa)' },
          { category: 'description', score: descScore, reason: 'Descrição de serviços' },
        ],
        ai_justificativa: null,
        riscos: [],
        acoes_necessarias: [],
        recomendacao: null,
        match_source: 'keyword',
        status: 'new',
      })

      // Flush when buffer is full
      if (insertBuffer.length >= BATCH_SIZE) {
        await flushBuffer()
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    if (page % 5 === 0) {
      console.log(`[REMATCH] Page ${page}: scanned ${scanned}, ${matchCount} new matches (${elapsed}s)`)
    }

    if (tenders.length < pageSize) break

    // Safety: abort if approaching Vercel timeout
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log(`[REMATCH] Approaching timeout after ${page + 1} pages, stopping early`)
      break
    }

    page++
  }

  // Flush remaining
  await flushBuffer()

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[REMATCH] COMPLETE: scanned ${scanned} tenders, ${matchCount} new matches in ${totalElapsed}s`)

  // ── INSTANT MAP CACHE REFRESH ──────────────────────────────────────────
  // Populate map_cache immediately so the map shows results without waiting
  // for the hourly worker. This is the same logic as map-cache.processor.ts
  // but runs inline for just this company.
  if (matchCount > 0) {
    try {
      await refreshMapCacheForCompany(serviceSupabase, companyId)
      console.log('[REMATCH] Map cache refreshed inline for company:', companyId)
    } catch (err) {
      console.error('[REMATCH] Inline map cache refresh failed (non-critical):', err)
    }
  }

  // Invalidate in-memory caches
  try {
    const deleted = await invalidateCache(CacheKeys.allCompanyMatches(companyId))
    console.log('[REMATCH] Cache invalidated, keys deleted:', deleted)

    // Invalidate all score-variant match count keys
    for (const s of [10, 15, 20, 25, 30, 40, 50, 60]) {
      await invalidateCache(CacheKeys.matchCount(companyId, s))
    }
    await invalidateCache('cache:stats:dashboard:*')
  } catch (err) {
    console.error('[REMATCH] Cache invalidation failed (non-critical):', err)
  }

  return matchCount
}
