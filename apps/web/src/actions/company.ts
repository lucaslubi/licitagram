'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { invalidateCache, CacheKeys } from '@/lib/redis'
import { CNAE_DIVISIONS, RELATED_DIVISIONS, getCompanyDivisions } from '@licitagram/shared'

// ─── Service-role Supabase (bypasses RLS for match writes) ─────────────────

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── CNAE-First Matching Constants ─────────────────────────────────────────

const CNAE_WEIGHT = 0.55
const KEYWORD_WEIGHT = 0.25
const DESCRIPTION_WEIGHT = 0.20
const MIN_MATCH_SCORE = 40
const DIRECT_CNAE_SCORE = 100
const RELATED_CNAE_SCORE = 50

// ─── Keyword-Only Fallback Constants (when tender has no CNAE data) ────────
const KW_ONLY_KEYWORD_WEIGHT = 0.60
const KW_ONLY_DESCRIPTION_WEIGHT = 0.40
const KW_ONLY_MIN_SCORE = 55

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
  'contratacao', 'aquisicao', 'prestacao', 'servico', 'servicos', 'fornecimento',
  'empresa', 'objeto', 'licitacao', 'pregao', 'edital', 'item', 'itens',
  'lote', 'lotes', 'valor', 'preco', 'registro', 'precos',
  'processo', 'numero', 'tipo', 'modalidade', 'orgao', 'entidade',
  'publica', 'publico', 'federal', 'estadual', 'municipal', 'governo',
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
}

function computeKeywordScore(
  companyTokens: Set<string>,
  tenderTokens: Set<string>,
): number {
  if (companyTokens.size === 0 || tenderTokens.size === 0) return 0
  let matches = 0
  for (const token of companyTokens) {
    if (tenderTokens.has(token)) {
      matches++
    }
  }
  return Math.min(100, Math.round((matches / companyTokens.size) * 100))
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

  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${clean}`, {
      headers: { Accept: 'application/json' },
    })
    const data = await res.json()

    if (data.status === 'ERROR') {
      return { error: data.message || 'CNPJ não encontrado' }
    }

    return {
      data: {
        nome: data.nome,
        fantasia: data.fantasia,
        uf: data.uf,
        municipio: data.municipio,
        porte: data.porte,
        atividade_principal: data.atividade_principal,
        atividades_secundarias: data.atividades_secundarias,
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
  }

  let companyId: string

  if (existingId) {
    // Update existing company
    const { error } = await supabase.from('companies').update(sanitized).eq('id', existingId)
    if (error) return { error: error.message }
    companyId = existingId
  } else {
    // Create new company — pre-generate UUID to avoid RETURNING + RLS conflict
    const id = crypto.randomUUID()
    const { error: insertError } = await supabase.from('companies').insert({ id, ...sanitized })
    if (insertError) return { error: insertError.message }

    // Link company to user
    const { error: linkError } = await supabase
      .from('users')
      .update({ company_id: id })
      .eq('id', user.id)
    if (linkError) return { error: linkError.message }
    companyId = id
  }

  // Trigger re-matching against recent tenders (non-blocking for the save result)
  let matchesFound = 0
  try {
    matchesFound = await runRematchForCompany(companyId, sanitized)
  } catch (err) {
    console.error('Re-matching failed (non-critical):', err)
  }

  return { id: companyId, matchesFound }
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

// ─── Two-Mode Re-Matching Logic ─────────────────────────────────────────

/**
 * Upsert a match record for a company-tender pair.
 * Creates new match or updates score if it changed.
 */
async function upsertMatch(
  serviceSupabase: ReturnType<typeof getServiceSupabase>,
  companyId: string,
  tenderId: string,
  finalScore: number,
  breakdown: Array<{ category: string; score: number; reason: string }>,
): Promise<boolean> {
  const { data: existing } = await serviceSupabase
    .from('matches')
    .select('id, score')
    .eq('company_id', companyId)
    .eq('tender_id', tenderId)
    .maybeSingle()

  if (existing) {
    if (existing.score !== finalScore) {
      await serviceSupabase
        .from('matches')
        .update({
          score: finalScore,
          keyword_score: finalScore,
          breakdown,
        })
        .eq('id', existing.id)
    }
    return false // Not a new match
  }

  const { error } = await serviceSupabase.from('matches').insert({
    company_id: companyId,
    tender_id: tenderId,
    score: finalScore,
    keyword_score: finalScore,
    breakdown,
    ai_justificativa: null,
    riscos: [],
    acoes_necessarias: [],
    recomendacao: null,
    match_source: 'keyword',
    status: 'new',
  })
  return !error
}

/**
 * Run two-mode matching for a single company against recent tenders.
 * Called after company profile update (CNAEs, keywords, etc.)
 *
 * MODE A — CNAE-First: For tenders WITH cnae_classificados, uses weighted
 *          CNAE + keyword + description scoring with CNAE hard gate.
 * MODE B — Keyword-Only: For tenders WITHOUT cnae_classificados, uses only
 *          keyword + description scoring with a higher threshold (55).
 *
 * This ensures NO tender is skipped just because it hasn't been classified yet.
 */
async function runRematchForCompany(
  companyId: string,
  company: CompanyPayload,
): Promise<number> {
  const serviceSupabase = getServiceSupabase()

  // Build company CNAE list
  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(company.cnae_principal)
  if (company.cnaes_secundarios?.length) allCnaes.push(...company.cnaes_secundarios)

  // Build keyword tokens
  const userKwTokens = new Set<string>()
  if (company.palavras_chave?.length) {
    for (const kw of company.palavras_chave) {
      for (const t of tokenize(kw)) userKwTokens.add(t)
    }
  }

  // Add CNAE-derived keywords
  for (const cnae of allCnaes) {
    const div = cnae.substring(0, 2)
    const division = CNAE_DIVISIONS[div]
    if (division) {
      for (const kw of division.keywords) {
        for (const token of tokenize(kw)) userKwTokens.add(token)
      }
    }
  }

  const descTokens = company.descricao_servicos
    ? new Set(tokenize(company.descricao_servicos))
    : new Set<string>()

  // Need at least some matching criteria
  if (allCnaes.length === 0 && userKwTokens.size === 0 && descTokens.size === 0) return 0

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 90)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  let matchCount = 0
  const pageSize = 500

  // ── MODE A: CNAE-First matching (tenders WITH cnae_classificados) ──────
  if (allCnaes.length > 0) {
    const { direct: companyDirectDivs, related: companyRelatedDivs } = getCompanyDivisions(allCnaes)
    const allDivisions = [...companyDirectDivs, ...companyRelatedDivs]

    if (allDivisions.length > 0) {
      let page = 0
      while (true) {
        const { data: tenders } = await serviceSupabase
          .from('tenders')
          .select('id, objeto, resumo, cnae_classificados')
          .not('objeto', 'is', null)
          .not('cnae_classificados', 'eq', '{}')
          .not('cnae_classificados', 'is', null)
          .gte('data_publicacao', cutoff)
          .overlaps('cnae_classificados', allDivisions)
          .order('data_publicacao', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (!tenders || tenders.length === 0) break

        for (const tender of tenders) {
          if (!tender.objeto) continue
          const tenderCnaes = (tender.cnae_classificados as string[]) || []
          if (tenderCnaes.length === 0) continue

          const cnaeScore = computeCNAEScore(allCnaes, tenderCnaes)
          if (cnaeScore === 0) continue

          const objetoTokens = tokenize(tender.objeto)
          const resumoTokens = tender.resumo ? tokenize(tender.resumo as string) : []
          const tenderTokens = new Set([...objetoTokens, ...resumoTokens])

          const kwScore = computeKeywordScore(userKwTokens, tenderTokens)
          const descScore = computeKeywordScore(descTokens, tenderTokens)

          const finalScore = Math.round(
            cnaeScore * CNAE_WEIGHT +
            kwScore * KEYWORD_WEIGHT +
            descScore * DESCRIPTION_WEIGHT,
          )

          if (finalScore < MIN_MATCH_SCORE) continue

          const breakdown = [
            { category: 'cnae', score: cnaeScore, reason: `CNAE: ${tenderCnaes.join(', ')}` },
            { category: 'keywords', score: kwScore, reason: 'Palavras-chave da empresa' },
            { category: 'description', score: descScore, reason: 'Descrição de serviços' },
          ]

          const isNew = await upsertMatch(serviceSupabase, companyId, tender.id, finalScore, breakdown)
          if (isNew) matchCount++
        }

        if (tenders.length < pageSize) break
        page++
      }
    }
  }

  // ── MODE B: Keyword-Only matching (tenders WITHOUT cnae_classificados) ─
  // Catches tenders that haven't been AI-classified yet
  if (userKwTokens.size > 0 || descTokens.size > 0) {
    let page = 0
    while (true) {
      const { data: tenders } = await serviceSupabase
        .from('tenders')
        .select('id, objeto, resumo, cnae_classificados')
        .not('objeto', 'is', null)
        .or('cnae_classificados.is.null,cnae_classificados.eq.{}')
        .gte('data_publicacao', cutoff)
        .order('data_publicacao', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (!tenders || tenders.length === 0) break

      for (const tender of tenders) {
        if (!tender.objeto) continue

        const objetoTokens = tokenize(tender.objeto)
        const resumoTokens = tender.resumo ? tokenize(tender.resumo as string) : []
        const tenderTokens = new Set([...objetoTokens, ...resumoTokens])

        const kwScore = computeKeywordScore(userKwTokens, tenderTokens)
        const descScore = computeKeywordScore(descTokens, tenderTokens)

        const finalScore = Math.round(
          kwScore * KW_ONLY_KEYWORD_WEIGHT +
          descScore * KW_ONLY_DESCRIPTION_WEIGHT,
        )

        if (finalScore < KW_ONLY_MIN_SCORE) continue

        const breakdown = [
          { category: 'cnae', score: 0, reason: 'Sem classificação CNAE (pendente)' },
          { category: 'keywords', score: kwScore, reason: 'Palavras-chave da empresa' },
          { category: 'description', score: descScore, reason: 'Descrição de serviços' },
        ]

        const isNew = await upsertMatch(serviceSupabase, companyId, tender.id, finalScore, breakdown)
        if (isNew) matchCount++
      }

      if (tenders.length < pageSize) break
      page++
    }
  }

  if (matchCount > 0) {
    await invalidateCache(CacheKeys.allCompanyMatches(companyId))
  }

  return matchCount
}
