/**
 * PRICE INTELLIGENCE: Auto-classify tender items with CATMAT/CATSER codes
 *
 * Uses the existing LLM cascade (Groq/Gemini/OpenRouter) to suggest
 * CATMAT (materials) or CATSER (services) codes for tender items
 * that don't have them yet.
 *
 * STANDALONE script — does NOT touch any existing worker.
 * Run via: node dist/price-intel/classify-catmat.js
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { callLLM } from '../ai/llm-client'
import { logger } from '../lib/logger'

const log = logger.child({ module: 'price-intel-catmat' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const BATCH_SIZE = 10
const DELAY_MS = 2000
const MAX_ITEMS_PER_RUN = 200

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

const SYSTEM_PROMPT = `Você é especialista em classificação de itens de licitação pública brasileira.
Dado a descrição de um item, classifique-o com o código CATMAT (material) ou CATSER (serviço) mais apropriado.

CATMAT = Catálogo de Materiais do SIASG (para bens/produtos físicos)
CATSER = Catálogo de Serviços do SIASG (para serviços)

Responda APENAS em JSON válido com este formato:
{
  "tipo": "CATMAT" ou "CATSER",
  "codigo": "código numérico mais provável (6 dígitos)",
  "categoria": "nome da categoria geral",
  "confianca": 0.0 a 1.0
}

Se não conseguir classificar com confiança, retorne confianca < 0.5.`

async function classifyItem(descricao: string): Promise<{
  tipo: string
  codigo: string
  categoria: string
  confianca: number
} | null> {
  try {
    const result = await callLLM({
      task: 'classification',
      system: SYSTEM_PROMPT,
      prompt: `Classifique este item de licitação:\n"${descricao.slice(0, 500)}"`,
      jsonMode: true,
      maxRetries: 1,
    })

    const parsed = JSON.parse(result)
    if (parsed.tipo && parsed.codigo) {
      return {
        tipo: parsed.tipo,
        codigo: String(parsed.codigo),
        categoria: parsed.categoria || '',
        confianca: Math.min(1, Math.max(0, parsed.confianca || 0.5)),
      }
    }
    return null
  } catch (err) {
    log.warn({ descricao: descricao.slice(0, 50), error: err instanceof Error ? err.message : String(err) }, 'LLM classification failed')
    return null
  }
}

async function main() {
  log.info('Starting CATMAT/CATSER classification...')

  // Find tender_items without categoria_nome (not yet classified)
  const { data: items, error } = await supabase
    .from('tender_items')
    .select('id, descricao')
    .is('categoria_nome', null)
    .not('descricao', 'is', null)
    .limit(MAX_ITEMS_PER_RUN)

  if (error) {
    log.error({ error }, 'Failed to fetch items')
    process.exit(1)
  }

  if (!items || items.length === 0) {
    log.info('No items need classification')
    process.exit(0)
  }

  log.info({ count: items.length }, 'Items to classify')

  let classified = 0
  let failed = 0

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)

    for (const item of batch) {
      const result = await classifyItem(item.descricao as string)

      if (result && result.confianca >= 0.5) {
        const catmatCatser = `${result.tipo}-${result.codigo}`

        await supabase
          .from('tender_items')
          .update({
            categoria_nome: result.categoria,
          })
          .eq('id', item.id)

        // Also update price_references if this item has one
        await supabase
          .from('price_references')
          .update({ catmat_catser: catmatCatser })
          .eq('descricao', item.descricao)
          .is('catmat_catser', null)

        classified++
      } else {
        failed++
      }

      await sleep(DELAY_MS)
    }

    log.info({
      progress: `${Math.min(i + BATCH_SIZE, items.length)}/${items.length}`,
      classified,
      failed,
    }, 'Classification progress')
  }

  log.info({ classified, failed, total: items.length }, 'CATMAT/CATSER classification complete')
  process.exit(0)
}

main().catch(err => {
  log.error({ err: err.message }, 'Fatal error')
  process.exit(1)
})
