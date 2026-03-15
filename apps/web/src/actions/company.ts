'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { invalidateCache, CacheKeys, isRedisAvailable, getRedis } from '@/lib/redis'
import { CNAE_DIVISIONS, RELATED_DIVISIONS, getCompanyDivisions } from '@licitagram/shared'

// ─── Service-role Supabase (bypasses RLS for match writes) ─────────────────

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── Matching Constants ───────────────────────────────────────────────────

const MIN_MATCH_SCORE = 30
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
  if (matches === 0) return 0

  // Hybrid scoring: best of percentage-based and absolute-count-based
  // Percentage: what fraction of company keywords appear in the tender
  const percentScore = Math.round((matches / companyTokens.size) * 100)
  // Absolute: diminishing returns on match count (3 matches = 45, 5 = 75, 7+ = 100)
  const absoluteScore = Math.min(100, matches * 15)
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

  // ── Create trial subscription if company is new (no existing subscription) ──
  if (!existingId) {
    try {
      const serviceSupabase = getServiceSupabase()
      const { data: existingSub } = await serviceSupabase
        .from('subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle()

      if (!existingSub) {
        await serviceSupabase.from('subscriptions').insert({
          company_id: companyId,
          plan: 'trial',
          plan_id: null,
          status: 'trialing',
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          matches_used_this_month: 0,
        })
        console.log('[COMPANY] Created trial subscription for', companyId)
      }
    } catch (subErr) {
      console.error('[COMPANY] Failed to create trial subscription (non-critical):', subErr)
    }
  }

  // Run matching SYNCHRONOUSLY so it completes before Vercel kills the function
  let matchesFound = 0
  try {
    matchesFound = await runRematchForCompany(companyId, sanitized)
  } catch (err) {
    console.error('[REMATCH] Failed:', err)
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

// ─── Unified Keyword-First Re-Matching Logic ────────────────────────────

// Prevent concurrent rematches for the same company
const activeRematches = new Map<string, Promise<number>>()

/**
 * Unified keyword-first matching for a single company against all tenders.
 * Debounced: if a rematch is already running for this company, waits for it.
 */
async function runRematchForCompany(
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

  console.log('[REMATCH] Keywords:', companyKeywords.size, '| Desc tokens:', descTokens.size)

  if (allCnaes.length === 0 && companyKeywords.size === 0 && descTokens.size === 0) {
    console.log('[REMATCH] No matching criteria — aborting')
    return 0
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

      // Tokenize tender text
      const objetoTokens = tokenize(tender.objeto)
      const resumoTokens = tender.resumo ? tokenize(tender.resumo as string) : []
      const tenderTokens = new Set([...objetoTokens, ...resumoTokens])

      // 1. Keyword score
      const kwScore = computeKeywordScore(companyKeywords, tenderTokens)

      // 2. Description score
      const descScore = computeKeywordScore(descTokens, tenderTokens)

      // Scoring: keyword (60%) + description (40%)
      const finalScore = Math.round(kwScore * 0.60 + descScore * 0.40)

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

  // Invalidate caches only if Redis is available
  if (isRedisAvailable()) {
    try {
      const deleted = await invalidateCache(CacheKeys.allCompanyMatches(companyId))
      console.log('[REMATCH] Cache invalidated, keys deleted:', deleted)

      const r = getRedis()
      const scoreKeys = [10, 15, 20, 25, 30, 40, 50, 60].map(
        (s) => CacheKeys.matchCount(companyId, s),
      )
      await r.del(...scoreKeys)
      await invalidateCache('cache:stats:dashboard:*')

      // Trigger pending notifications immediately so Telegram alerts go out
      if (matchCount > 0) {
        await r.publish('licitagram:rematch-done', JSON.stringify({ companyId, matchCount }))
        console.log('[REMATCH] Published rematch-done event for notifications')
      }
    } catch (err) {
      console.error('[REMATCH] Redis operations failed (non-critical):', err)
    }
  } else {
    console.log('[REMATCH] Redis not available, skipping cache invalidation')
  }

  return matchCount
}
