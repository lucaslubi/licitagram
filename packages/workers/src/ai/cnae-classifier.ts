/**
 * CNAE Classifier — Hybrid (Local Keywords + Gemini AI Fallback)
 *
 * Strategy:
 * 1. If tender already has cnae_classificados → return cached
 * 2. If requisitos.cnae_relacionados exists → extract divisions from it
 * 3. Try LOCAL keyword classification (zero cost, instant)
 *    - If confidence HIGH (3+ keyword matches) → use directly
 *    - If confidence LOW → try Gemini AI as fallback
 * 4. If Gemini fails (429/timeout) → use local result anyway
 * 5. Persist result in cnae_classificados column
 */

import { callLLM, parseJsonResponse } from './llm-client'
import { classifyLocal } from './cnae-keyword-classifier'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { CNAE_DIVISIONS } from '@licitagram/shared'

const SYSTEM_PROMPT = `Voce e um especialista em licitacoes publicas brasileiras e no sistema CNAE (Classificacao Nacional de Atividades Economicas).

Sua tarefa e classificar o objeto de uma licitacao nos codigos CNAE de DIVISAO (2 digitos) que sao necessarios para uma empresa participar.

Regras:
- Retorne APENAS os codigos de DIVISAO (2 digitos) mais relevantes
- Retorne entre 1 e 5 divisoes, priorizando as mais diretamente relacionadas
- Considere o objeto COMPLETO, incluindo servicos, materiais e equipamentos mencionados
- NAO inclua divisoes que sao apenas tangencialmente relacionadas
- Responda APENAS com um JSON array de strings, sem markdown, sem texto adicional

Exemplo: Para "Contratacao de empresa para desenvolvimento de sistema web de gestao":
["62"]

Exemplo: Para "Aquisicao de computadores e impressoras para o departamento de TI":
["26","47"]

Exemplo: Para "Servicos de limpeza, conservacao e jardinagem":
["81"]`

function buildClassificationPrompt(objeto: string, resumo?: string | null, documentText?: string | null): string {
  let prompt = `Classifique o objeto desta licitacao nos codigos CNAE de DIVISAO (2 digitos) necessarios para participar.

OBJETO: ${objeto}`

  if (resumo) {
    prompt += `\n\nRESUMO: ${resumo}`
  }

  if (documentText) {
    const truncated = documentText.slice(0, 2000)
    prompt += `\n\nTRECHO DO EDITAL: ${truncated}`
  }

  prompt += `\n\nRetorne APENAS um JSON array de codigos de 2 digitos (ex: ["62","63"]). Nada mais.`

  return prompt
}

/**
 * Validate and normalize CNAE division codes.
 * Only accepts codes that exist in our CNAE_DIVISIONS database.
 */
function validateCNAECodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return []

  const valid: string[] = []
  for (const code of codes) {
    const str = String(code).trim().replace(/\D/g, '').substring(0, 2)
    if (str.length === 2 && CNAE_DIVISIONS[str]) {
      if (!valid.includes(str)) {
        valid.push(str)
      }
    }
  }

  return valid.slice(0, 5) // Max 5 divisions
}

/**
 * Classify a tender into relevant CNAE divisions.
 *
 * Hybrid strategy:
 * 1. Cached/requisitos → instant
 * 2. Local keyword match (high confidence) → instant, zero cost
 * 3. Gemini AI (low confidence fallback) → 1-2s, costs tokens
 * 4. Local result as safety net if AI fails
 */
export async function classifyTenderCNAEs(tenderId: string): Promise<string[]> {
  // 1. Fetch tender data
  const { data: tender } = await supabase
    .from('tenders')
    .select('id, objeto, resumo, requisitos, cnae_classificados')
    .eq('id', tenderId)
    .single()

  if (!tender || !tender.objeto) {
    logger.warn({ tenderId }, 'No tender or objeto for CNAE classification')
    return []
  }

  // 2. If already classified, return existing
  const existing = tender.cnae_classificados as string[] | null
  if (existing && Array.isArray(existing) && existing.length > 0) {
    return existing
  }

  // 3. Check if requisitos.cnae_relacionados already has data
  const requisitos = tender.requisitos as Record<string, unknown> | null
  if (requisitos?.cnae_relacionados) {
    const rawCnaes = requisitos.cnae_relacionados as string[]
    if (Array.isArray(rawCnaes) && rawCnaes.length > 0) {
      const divisions = [...new Set(rawCnaes.map(c => String(c).substring(0, 2)))]
      const validated = validateCNAECodes(divisions)

      if (validated.length > 0) {
        await persistClassification(tenderId, validated)
        logger.info({ tenderId, source: 'requisitos', cnaes: validated }, 'CNAE classification from requisitos')
        return validated
      }
    }
  }

  // 4. LOCAL keyword classification (zero cost, instant)
  const localResult = classifyLocal(tender.objeto, tender.resumo as string | null)

  if (localResult.confidence === 'high') {
    // High confidence → use local result directly, no AI needed
    const validated = validateCNAECodes(localResult.divisions)
    if (validated.length > 0) {
      await persistClassification(tenderId, validated)
      logger.info(
        { tenderId, source: 'keyword-local', cnaes: validated, topScore: localResult.topScore },
        'CNAE from local keywords (high confidence)',
      )
      return validated
    }
  }

  // 5. Low confidence or no local result → try Gemini AI as fallback
  let classified: string[] = []

  try {
    // Only fetch document text when we actually need AI (saves a DB query for 80% of cases)
    let documentText: string | null = null
    const { data: docs } = await supabase
      .from('tender_documents')
      .select('texto_extraido')
      .eq('tender_id', tenderId)
      .eq('status', 'done')
      .limit(1)

    if (docs && docs.length > 0 && docs[0].texto_extraido) {
      documentText = docs[0].texto_extraido as string
    }

    const prompt = buildClassificationPrompt(tender.objeto, tender.resumo as string | null, documentText)

    const response = await callLLM({
      task: 'classification',
      system: SYSTEM_PROMPT,
      prompt,
      maxRetries: 2,
      jsonMode: true,
    })

    if (response && response.trim().length > 0) {
      const parsed = parseJsonResponse<string[]>(response)
      classified = validateCNAECodes(parsed)
    }
  } catch (llmErr) {
    logger.warn({ tenderId, err: llmErr }, 'AI classification failed, using local fallback')
  }

  // 6. If AI succeeded → use AI result
  if (classified.length > 0) {
    await persistClassification(tenderId, classified)
    logger.info({ tenderId, source: 'ai-gemini', cnaes: classified }, 'CNAE classification from Gemini')
    return classified
  }

  // 7. AI failed → use local result as safety net
  if (localResult.divisions.length > 0) {
    const validated = validateCNAECodes(localResult.divisions)
    if (validated.length > 0) {
      await persistClassification(tenderId, validated)
      logger.info(
        { tenderId, source: 'keyword-fallback', cnaes: validated, topScore: localResult.topScore },
        'CNAE from local keywords (AI failed, using as fallback)',
      )
      return validated
    }
  }

  logger.warn({ tenderId }, 'No CNAE codes classified for tender (all methods failed)')
  return []
}

/**
 * Persist CNAE classification to the tenders table.
 */
async function persistClassification(tenderId: string, cnaes: string[]) {
  const { error } = await supabase
    .from('tenders')
    .update({ cnae_classificados: cnaes })
    .eq('id', tenderId)

  if (error) {
    logger.error({ tenderId, error }, 'Failed to persist CNAE classification')
  }
}

/**
 * Batch classify multiple tenders that don't have CNAE classifications yet.
 * Now much faster since most classifications are done locally.
 */
export async function batchClassifyTenders(limit: number = 200): Promise<number> {
  const { data: tenders } = await supabase
    .from('tenders')
    .select('id')
    .or('cnae_classificados.is.null,cnae_classificados.eq.{}')
    .not('objeto', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!tenders || tenders.length === 0) {
    logger.info('No tenders need CNAE classification')
    return 0
  }

  logger.info({ count: tenders.length }, 'Starting batch CNAE classification (hybrid)')

  let classified = 0
  const CONCURRENCY = 20 // Higher concurrency since most are local (instant)

  // Process in parallel chunks
  for (let i = 0; i < tenders.length; i += CONCURRENCY) {
    const chunk = tenders.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(async (tender) => {
        const result = await classifyTenderCNAEs(tender.id)
        return result.length > 0
      }),
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        classified++
      }
    }
  }

  logger.info({ classified, total: tenders.length }, 'Batch CNAE classification complete (hybrid)')
  return classified
}
