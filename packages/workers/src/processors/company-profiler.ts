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

/**
 * Build an expanded text profile for a company.
 * This text is what gets embedded into a vector for semantic matching.
 */
export function buildExpandedProfile(company: Record<string, unknown>): string {
  const parts: string[] = []

  // Company identity
  if (company.razao_social) parts.push(`Empresa: ${company.razao_social}`)
  if (company.nome_fantasia) parts.push(`Nome fantasia: ${company.nome_fantasia}`)

  // CNAE descriptions (rich semantic context)
  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) {
    allCnaes.push(...(company.cnaes_secundarios as string[]))
  }

  const cnaeTexts: string[] = []
  for (const cnae of allCnaes) {
    const division = cnae.substring(0, 2)
    const div = CNAE_DIVISIONS[division]
    if (div) {
      cnaeTexts.push(`CNAE ${cnae}: ${div.nome} — ${div.descricao}`)
    } else {
      cnaeTexts.push(`CNAE ${cnae}`)
    }
  }
  if (cnaeTexts.length > 0) {
    parts.push(`Atividades econômicas:\n${cnaeTexts.join('\n')}`)
  }

  // Company-provided descriptions
  if (company.descricao_servicos) {
    parts.push(`Descrição de serviços: ${String(company.descricao_servicos).slice(0, 2000)}`)
  }

  if (Array.isArray(company.palavras_chave) && (company.palavras_chave as string[]).length > 0) {
    parts.push(`Palavras-chave: ${(company.palavras_chave as string[]).join(', ')}`)
  }

  if (Array.isArray(company.capacidades) && (company.capacidades as string[]).length > 0) {
    parts.push(`Capacidades: ${(company.capacidades as string[]).join(', ')}`)
  }

  if (Array.isArray(company.certificacoes) && (company.certificacoes as string[]).length > 0) {
    parts.push(`Certificações: ${(company.certificacoes as string[]).join(', ')}`)
  }

  if (company.porte) parts.push(`Porte: ${company.porte}`)

  // Include CNAE keywords for additional semantic coverage
  const cnaeKeywords = new Set<string>()
  for (const cnae of allCnaes) {
    const division = cnae.substring(0, 2)
    const div = CNAE_DIVISIONS[division]
    if (div?.keywords) {
      for (const kw of div.keywords) cnaeKeywords.add(kw)
    }
  }
  if (cnaeKeywords.size > 0) {
    parts.push(`Termos relacionados: ${Array.from(cnaeKeywords).slice(0, 50).join(', ')}`)
  }

  return parts.join('\n\n')
}

/**
 * Build the text used to embed a tender for semantic matching.
 */
export function buildTenderText(tender: Record<string, unknown>): string {
  const parts: string[] = []

  if (tender.objeto) parts.push(`Objeto: ${String(tender.objeto)}`)
  if (tender.modalidade_nome) parts.push(`Modalidade: ${tender.modalidade_nome}`)
  if (tender.resumo) parts.push(`Resumo: ${String(tender.resumo).slice(0, 3000)}`)

  if (tender.requisitos) {
    const reqStr = JSON.stringify(tender.requisitos)
    if (reqStr.length > 5) {
      parts.push(`Requisitos: ${reqStr.slice(0, 2000)}`)
    }
  }

  if (tender.orgao_nome) parts.push(`Órgão: ${tender.orgao_nome}`)

  return parts.join('\n\n')
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
 */
export async function embedTender(tenderId: string): Promise<boolean> {
  const { data: tender, error } = await supabase
    .from('tenders')
    .select('id, objeto, modalidade_nome, resumo, requisitos, orgao_nome, embedding')
    .eq('id', tenderId)
    .single()

  if (error || !tender) {
    logger.error({ tenderId, error }, 'Tender not found for embedding')
    return false
  }

  // Skip if already embedded
  if (tender.embedding) return true

  const text = buildTenderText(tender as Record<string, unknown>)

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
