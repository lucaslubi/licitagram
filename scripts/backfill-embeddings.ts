#!/usr/bin/env tsx
/**
 * Backfill de embeddings em companies e tenders pra habilitar pgvector matching.
 *
 * Idempotente: só computa embedding se hash do texto mudou ou se nunca foi computado.
 * Batch processing com commit parcial pra não perder progresso em crash.
 *
 * Uso:
 *   pnpm tsx scripts/backfill-embeddings.ts [--only=companies|tenders|all] [--limit=N] [--days-back=N]
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']),
)
const ONLY = args.only ?? 'all'
const LIMIT = args.limit ? Number(args.limit) : undefined
const DAYS_BACK = args['days-back'] ? Number(args['days-back']) : 90

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMBEDDINGS_URL = process.env.EMBEDDINGS_URL ?? 'http://85.31.60.53:8081'
const EMBEDDINGS_API_KEY = process.env.EMBEDDINGS_API_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('× SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return []
  try {
    const res = await fetch(`${EMBEDDINGS_URL}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(EMBEDDINGS_API_KEY ? { Authorization: `Bearer ${EMBEDDINGS_API_KEY}` } : {}),
      },
      body: JSON.stringify({ inputs: texts }),
      // @ts-expect-error Node 20+
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return texts.map(() => null)
    return (await res.json()) as (number[] | null)[]
  } catch {
    return texts.map(() => null)
  }
}

// ─── Companies ───────────────────────────────────────────────────────────
function companyText(c: Record<string, unknown>): string {
  const parts: string[] = []
  if (c.razao_social) parts.push(`Empresa: ${c.razao_social}`)
  if (c.nome_fantasia) parts.push(`Fantasia: ${c.nome_fantasia}`)
  if (c.descricao_servicos) parts.push(`Descrição: ${c.descricao_servicos}`)
  if (Array.isArray(c.capacidades) && c.capacidades.length > 0) {
    parts.push(`Capacidades: ${(c.capacidades as string[]).join(', ')}`)
  }
  if (Array.isArray(c.palavras_chave) && c.palavras_chave.length > 0) {
    parts.push(`Keywords: ${(c.palavras_chave as string[]).join(', ')}`)
  }
  if (c.cnae_principal) parts.push(`CNAE principal: ${c.cnae_principal}`)
  return parts.join(' | ').slice(0, 2000)
}

async function backfillCompanies(): Promise<number> {
  console.log('→ Backfill de embeddings em companies')
  const BATCH = 20
  let total = 0
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('companies')
      .select('id, razao_social, nome_fantasia, descricao_servicos, capacidades, palavras_chave, cnae_principal, embedding_text_hash')
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH - 1)

    if (error) {
      console.error(`  × ${error.message}`)
      break
    }
    if (!data || data.length === 0) break

    const needsEmbed = data.filter((c) => {
      const text = companyText(c)
      if (!text || text.length < 10) return false
      const h = sha(text)
      return h !== c.embedding_text_hash
    })

    if (needsEmbed.length > 0) {
      const texts = needsEmbed.map((c) => companyText(c))
      const embs = await embedBatch(texts)
      for (let i = 0; i < needsEmbed.length; i++) {
        const emb = embs[i]
        if (!emb) continue
        const c = needsEmbed[i]!
        const { error: upErr } = await supabase
          .from('companies')
          .update({
            embedding: emb,
            embedding_text_hash: sha(texts[i]!),
            embedding_updated_at: new Date().toISOString(),
          })
          .eq('id', c.id)
        if (!upErr) total++
      }
    }
    offset += data.length
    process.stdout.write(`  companies ${offset} offset · ${total} embedded\r`)
    if (LIMIT && total >= LIMIT) break
  }
  process.stdout.write('\n')
  return total
}

// ─── Tenders ─────────────────────────────────────────────────────────────
function tenderText(t: Record<string, unknown>): string {
  const parts: string[] = []
  if (t.objeto) parts.push(`Objeto: ${t.objeto}`)
  if (t.modalidade_nome) parts.push(`Modalidade: ${t.modalidade_nome}`)
  if (t.orgao_nome) parts.push(`Órgão: ${t.orgao_nome}`)
  if (t.uf) parts.push(`UF: ${t.uf}`)
  if (t.resumo) parts.push(`Resumo: ${t.resumo}`)
  if (Array.isArray(t.cnae_classificados) && t.cnae_classificados.length > 0) {
    parts.push(`CNAEs: ${(t.cnae_classificados as string[]).join(', ')}`)
  }
  return parts.join(' | ').slice(0, 2500)
}

async function backfillTenders(): Promise<number> {
  console.log('→ Backfill de embeddings em tenders (últimos', DAYS_BACK, 'dias)')
  const BATCH = 20
  let total = 0
  let offset = 0
  const sinceIso = new Date(Date.now() - DAYS_BACK * 86400_000).toISOString()

  while (true) {
    const { data, error } = await supabase
      .from('tenders')
      .select('id, objeto, modalidade_nome, orgao_nome, uf, resumo, cnae_classificados, embedding_text_hash')
      .gte('data_publicacao', sinceIso)
      .order('data_publicacao', { ascending: false })
      .range(offset, offset + BATCH - 1)

    if (error) {
      console.error(`  × ${error.message}`)
      break
    }
    if (!data || data.length === 0) break

    const needsEmbed = data.filter((t) => {
      const text = tenderText(t)
      if (!text || text.length < 10) return false
      const h = sha(text)
      return h !== t.embedding_text_hash
    })

    if (needsEmbed.length > 0) {
      const texts = needsEmbed.map((t) => tenderText(t))
      const embs = await embedBatch(texts)
      for (let i = 0; i < needsEmbed.length; i++) {
        const emb = embs[i]
        if (!emb) continue
        const t = needsEmbed[i]!
        const { error: upErr } = await supabase
          .from('tenders')
          .update({
            embedding: emb,
            embedding_text_hash: sha(texts[i]!),
            embedding_updated_at: new Date().toISOString(),
          })
          .eq('id', t.id)
        if (!upErr) total++
      }
    }
    offset += data.length
    process.stdout.write(`  tenders ${offset} offset · ${total} embedded\r`)
    if (LIMIT && total >= LIMIT) break
  }
  process.stdout.write('\n')
  return total
}

async function main() {
  const t0 = Date.now()
  const results: Record<string, number> = {}

  if (ONLY === 'all' || ONLY === 'companies') {
    results.companies = await backfillCompanies()
  }
  if (ONLY === 'all' || ONLY === 'tenders') {
    results.tenders = await backfillTenders()
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\nConcluído em ${elapsed}s:`, results)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
