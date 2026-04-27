/**
 * Company Profiler — Generates expanded text profiles + embeddings
 *
 * Builds a rich text description from company data (CNAEs, keywords,
 * services, capabilities) and generates a vector embedding for
 * semantic similarity matching against tender embeddings.
 *
 * The expanded profile includes CNAE descriptions from the shared
 * CNAE_DIVISIONS database, providing rich semantic context that
 * simple CNAE codes alone cannot offer.
 */

import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { generateEmbedding, formatVector } from '../ai/embedding-client'
import { CNAE_DIVISIONS } from '@licitagram/shared'

/** Hard cap for the embedded profile (chars). Voyage-3 ≈ 4 chars/token,
 *  so ~1500 chars ≈ 375 tokens — well below the 32k input limit and roughly
 *  3–10× the median tender objeto (~150 chars), avoiding the long/short
 *  asymmetry that flattens cosine similarity. */
const PROFILE_MAX_CHARS = 1500

/**
 * Build an expanded text profile for a company.
 * This text is what gets embedded into a vector for semantic matching.
 *
 * Design: dedup CNAE division descriptions (multiple CNAEs in the same
 * 2-digit division would otherwise repeat the SAME paragraph N times,
 * diluting the embedding). Cap total length to PROFILE_MAX_CHARS.
 */
export function buildExpandedProfile(company: Record<string, unknown>): string {
  const parts: string[] = []

  // Company identity
  if (company.razao_social) parts.push(`Empresa: ${company.razao_social}`)
  if (company.nome_fantasia && company.nome_fantasia !== company.razao_social) {
    parts.push(`Nome fantasia: ${company.nome_fantasia}`)
  }

  // Collect all CNAEs (principal + secundários, dedup raw codes)
  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) {
    allCnaes.push(...(company.cnaes_secundarios as string[]))
  }
  const uniqueCnaes = Array.from(new Set(allCnaes.filter(Boolean)))

  // Group CNAE codes by division so we emit each division description ONCE.
  // Map preserves insertion order → principal's division comes first.
  const codesByDivision = new Map<string, string[]>()
  for (const cnae of uniqueCnaes) {
    const div = cnae.substring(0, 2)
    if (!codesByDivision.has(div)) codesByDivision.set(div, [])
    codesByDivision.get(div)!.push(cnae)
  }

  const cnaeLines: string[] = []
  for (const [div, codes] of codesByDivision) {
    const meta = CNAE_DIVISIONS[div]
    const codeList = codes.join(', ')
    if (meta) {
      cnaeLines.push(`${meta.nome} (CNAE ${codeList}): ${meta.descricao}`)
    } else {
      cnaeLines.push(`CNAE ${codeList}`)
    }
  }
  if (cnaeLines.length > 0) {
    parts.push(`Atividades:\n${cnaeLines.join('\n')}`)
  }

  // Company-provided descriptions (trimmed)
  if (company.descricao_servicos) {
    parts.push(`Serviços: ${String(company.descricao_servicos).slice(0, 600)}`)
  }

  if (Array.isArray(company.palavras_chave) && (company.palavras_chave as string[]).length > 0) {
    parts.push(`Palavras-chave: ${(company.palavras_chave as string[]).slice(0, 30).join(', ')}`)
  }

  if (Array.isArray(company.capacidades) && (company.capacidades as string[]).length > 0) {
    parts.push(`Capacidades: ${(company.capacidades as string[]).slice(0, 20).join(', ')}`)
  }

  if (Array.isArray(company.certificacoes) && (company.certificacoes as string[]).length > 0) {
    parts.push(`Certificações: ${(company.certificacoes as string[]).slice(0, 10).join(', ')}`)
  }

  if (company.porte) parts.push(`Porte: ${company.porte}`)

  // CNAE keywords: only the most distinct ones, dedup across divisions.
  // Cap at 10 (was 50) — Voyage embeds natural prose far better than long
  // keyword lists, and a long tail of generic terms muddies the centroid.
  const cnaeKeywords = new Set<string>()
  for (const cnae of uniqueCnaes) {
    const div = CNAE_DIVISIONS[cnae.substring(0, 2)]
    if (div?.keywords) {
      for (const kw of div.keywords) cnaeKeywords.add(kw)
    }
  }
  if (cnaeKeywords.size > 0) {
    parts.push(`Termos: ${Array.from(cnaeKeywords).slice(0, 10).join(', ')}`)
  }

  let profile = parts.join('\n\n')
  if (profile.length > PROFILE_MAX_CHARS) {
    // Trim at a sentence/space boundary if possible.
    const cut = profile.slice(0, PROFILE_MAX_CHARS)
    const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '), cut.lastIndexOf(', '))
    profile = (lastBreak > PROFILE_MAX_CHARS * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd()
  }
  return profile
}

/**
 * Build the text used to embed a tender for semantic matching.
 *
 * Target ~1500–2000 chars to balance against the (recently shrunk)
 * company profile (~1500). Order: objeto → resumo → requisitos →
 * modalidade → orgao. Caps total length at TENDER_TEXT_MAX with a
 * sentence-boundary trim.
 */
const TENDER_TEXT_MAX = 2000

export function buildTenderText(tender: Record<string, unknown>): string {
  const parts: string[] = []

  if (tender.objeto) parts.push(`Objeto: ${String(tender.objeto).trim()}`)

  if (tender.resumo) {
    const r = String(tender.resumo).trim()
    if (r.length > 10) parts.push(`Resumo: ${r}`)
  }

  if (tender.requisitos) {
    let reqStr: string
    if (typeof tender.requisitos === 'string') {
      reqStr = tender.requisitos.trim()
    } else {
      reqStr = JSON.stringify(tender.requisitos)
    }
    // Skip placeholder-only requisitos
    if (reqStr.length > 10 && !/^["']?n[ãa]o especificado/i.test(reqStr)) {
      parts.push(`Requisitos: ${reqStr}`)
    }
  }

  if (tender.modalidade_nome) parts.push(`Modalidade: ${tender.modalidade_nome}`)
  if (tender.orgao_nome) parts.push(`Órgão: ${tender.orgao_nome}`)

  let text = parts.join('\n\n')
  if (text.length > TENDER_TEXT_MAX) {
    const cut = text.slice(0, TENDER_TEXT_MAX)
    const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '), cut.lastIndexOf(', '))
    text = (lastBreak > TENDER_TEXT_MAX * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd()
  }
  return text
}

/**
 * Use a cheap LLM to derive a concise resumo + requisitos from the
 * tender object (and PDF excerpt when available). Persists both columns
 * back to `tenders` so re-embeds skip the LLM.
 *
 * Uses task: 'summary' (Groq → Gemini Flash → OpenRouter free) — ~free
 * at current scale. Returns null on failure.
 */
export async function enrichTenderText(
  tenderId: string,
  objeto: string,
): Promise<{ resumo: string; requisitos: string } | null> {
  try {
    const { callLLM, parseJsonResponse } = await import('../ai/llm-client')

    // Best-effort: include PDF excerpt for richer extraction
    let sourceText = `Objeto: ${objeto}`
    try {
      const { data: docs } = await supabase
        .from('tender_documents')
        .select('texto_extraido')
        .eq('tender_id', tenderId)
        .eq('status', 'done')
        .not('texto_extraido', 'is', null)
        .limit(3)

      if (docs && docs.length > 0) {
        // Cap PDF excerpt aggressively (~2000 chars) — keeps LLM prompt small,
        // avoids burning daily token quotas, and a 2-3 sentence summary needs
        // very little context anyway.
        const pdfText = (docs as Array<{ texto_extraido: string | null }>)
          .map((d) => d.texto_extraido || '')
          .filter((t) => t.length > 200)
          .join('\n')
          .slice(0, 2000)
        if (pdfText.length > 200) {
          sourceText = `Objeto: ${objeto}\n\nTrecho do edital:\n${pdfText}`
        }
      }
    } catch {
      // ignore — fall back to objeto-only
    }

    const system =
      'Você extrai informações estruturadas de licitações públicas brasileiras. ' +
      'Responda APENAS em JSON válido, sem markdown.'
    const prompt =
      `Dada a licitação abaixo, extraia em PT-BR:\n` +
      `- "resumo": 2-3 frases descrevendo TECNICAMENTE o que será contratado (foque em substantivos do objeto, evite redundância com o objeto)\n` +
      `- "requisitos": string com bullets ("- ") dos principais requisitos técnicos, qualificações ou habilitação exigidos. Se não houver, responda "Não especificado".\n\n` +
      `Total combinado <= 800 caracteres.\n\n` +
      `${sourceText}\n\n` +
      `Responda em JSON: {"resumo": "...", "requisitos": "..."}`

    const raw = await callLLM({ task: 'summary', system, prompt, jsonMode: true, maxRetries: 1 })
    const parsed = parseJsonResponse<{ resumo?: string; requisitos?: string }>(raw)

    const resumo = String(parsed.resumo || '').trim().slice(0, 1500)
    const requisitos = String(parsed.requisitos || 'Não especificado').trim().slice(0, 1500)

    if (resumo.length < 10) return null

    try {
      await supabase
        .from('tenders')
        .update({ resumo, requisitos })
        .eq('id', tenderId)
    } catch (err) {
      logger.warn({ tenderId, err: (err as Error).message }, 'Failed to persist enriched tender fields')
    }

    return { resumo, requisitos }
  } catch (err) {
    logger.warn({ tenderId, err: (err as Error).message }, 'Tender enrichment via LLM failed')
    return null
  }
}

/**
 * Profile a single company: generate text + embedding and save to DB.
 */
export async function profileCompany(companyId: string): Promise<boolean> {
  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (error || !company) {
    logger.error({ companyId, error }, 'Company not found for profiling')
    return false
  }

  const profileText = buildExpandedProfile(company as Record<string, unknown>)

  if (profileText.length < 50) {
    logger.warn({ companyId }, 'Company profile too short for meaningful embedding, skipping')
    return false
  }

  try {
    const embedding = await generateEmbedding(profileText)

    const { error: updateError } = await supabase
      .from('companies')
      .update({
        company_profile_text: profileText,
        embedding: formatVector(embedding),
        profiled_at: new Date().toISOString(),
      })
      .eq('id', companyId)

    if (updateError) {
      logger.error({ companyId, error: updateError }, 'Failed to save company profile')
      return false
    }

    logger.info({ companyId, profileLen: profileText.length }, 'Company profiled and embedded')
    return true
  } catch (err) {
    logger.error({ companyId, err: (err as Error).message }, 'Failed to generate company embedding')
    return false
  }
}

/**
 * Profile all companies that don't have an embedding yet (or need refresh).
 * Call this on startup or periodically to keep profiles up-to-date.
 */
export async function profileAllCompanies(): Promise<{ profiled: number; failed: number }> {
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id')
    .is('embedding', null)
    .limit(500)

  if (error || !companies || companies.length === 0) {
    logger.info('No companies need profiling')
    return { profiled: 0, failed: 0 }
  }

  logger.info({ count: companies.length }, 'Profiling companies without embeddings')

  let profiled = 0
  let failed = 0

  for (const company of companies) {
    const success = await profileCompany(company.id)
    if (success) profiled++
    else failed++

    // Small delay between API calls
    if (profiled + failed < companies.length) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  logger.info({ profiled, failed }, 'Company profiling batch complete')
  return { profiled, failed }
}

/**
 * Embed a single tender and save to DB.
 *
 * If `force=true`, re-embed even if `embedding` is already set.
 * If resumo/requisitos are missing, attempts LLM enrichment first
 * (cheap: Groq summary task) so the embedding has richer text.
 */
export async function embedTender(tenderId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const { data: tender, error } = await supabase
    .from('tenders')
    .select('id, objeto, modalidade_nome, resumo, requisitos, orgao_nome, embedding')
    .eq('id', tenderId)
    .single()

  if (error || !tender) {
    logger.error({ tenderId, error }, 'Tender not found for embedding')
    return false
  }

  // Skip if already embedded (unless caller forces re-embed)
  if (tender.embedding && !opts.force) return true

  // Enrich missing resumo/requisitos via LLM (best-effort, cheap)
  const t = tender as Record<string, unknown>
  if (t.objeto && (!t.resumo || String(t.resumo).trim().length < 10)) {
    const enriched = await enrichTenderText(tenderId, String(t.objeto))
    if (enriched) {
      t.resumo = enriched.resumo
      t.requisitos = enriched.requisitos
    }
  }

  const text = buildTenderText(t)

  if (text.length < 20) {
    logger.warn({ tenderId }, 'Tender text too short for embedding, skipping')
    return false
  }

  try {
    const embedding = await generateEmbedding(text)

    const { error: updateError } = await supabase
      .from('tenders')
      .update({
        embedding: formatVector(embedding),
        embedded_at: new Date().toISOString(),
      })
      .eq('id', tenderId)

    if (updateError) {
      logger.error({ tenderId, error: updateError }, 'Failed to save tender embedding')
      return false
    }

    return true
  } catch (err) {
    logger.error({ tenderId, err: (err as Error).message }, 'Failed to generate tender embedding')
    return false
  }
}

/**
 * Batch embed tenders that don't have embeddings yet.
 * Processes in batches of 32 to be efficient with the API.
 */
export async function batchEmbedTenders(limit: number = 200): Promise<{ embedded: number; failed: number }> {
  const { data: tenders, error } = await supabase
    .from('tenders')
    .select('id, objeto, modalidade_nome, resumo, requisitos, orgao_nome')
    .is('embedding', null)
    .in('status', ['analyzing', 'analyzed'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !tenders || tenders.length === 0) {
    logger.info('No tenders need embedding')
    return { embedded: 0, failed: 0 }
  }

  logger.info({ count: tenders.length }, 'Embedding tenders without vectors')

  // Build texts for batch embedding
  const texts = tenders.map((t: any) => buildTenderText(t as Record<string, unknown>))

  // Filter out too-short texts
  const validPairs = tenders
    .map((t: any, i: number) => ({ tender: t, text: texts[i] }))
    .filter((p: any) => p.text.length >= 20)

  if (validPairs.length === 0) {
    return { embedded: 0, failed: 0 }
  }

  let embedded = 0
  let failed = 0
  const BATCH = 32

  for (let i = 0; i < validPairs.length; i += BATCH) {
    const batch = validPairs.slice(i, i + BATCH)
    const batchTexts = batch.map((p: { tender: any; text: string }) => p.text)

    try {
      const { generateEmbeddings } = await import('../ai/embedding-client')
      const embeddings = await generateEmbeddings(batchTexts)

      for (let j = 0; j < batch.length; j++) {
        const { error: updateError } = await supabase
          .from('tenders')
          .update({
            embedding: formatVector(embeddings[j]),
            embedded_at: new Date().toISOString(),
          })
          .eq('id', batch[j].tender.id)

        if (updateError) {
          failed++
          logger.error({ tenderId: batch[j].tender.id, error: updateError }, 'Failed to save embedding')
        } else {
          embedded++
        }
      }
    } catch (err) {
      failed += batch.length
      logger.error({ err: (err as Error).message, batchIdx: i }, 'Batch embedding failed')
    }

    // Rate limit courtesy
    if (i + BATCH < validPairs.length) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  logger.info({ embedded, failed }, 'Tender embedding batch complete')
  return { embedded, failed }
}
