/**
 * REEMBED TENDERS — Force re-enrich (LLM resumo + requisitos) and re-embed
 * active tenders so the embedding reflects the new buildTenderText shape.
 *
 * Use after changes to buildTenderText() / enrichTenderText() in
 * company-profiler.ts. Calls embedTender(id, { force: true }) which
 * lazily LLM-enriches missing resumo/requisitos before embedding.
 *
 * Usage: cd packages/workers && npx tsx src/scripts/reembed-tenders.ts
 *
 * Flags:
 *   --dry-run         No LLM calls, no DB writes; just count.
 *   --limit=N         Process at most N tenders (default: all active).
 *   --only=<id>       Single tender id (overrides limit).
 *   --since=<date>    Only tenders with data_abertura >= date (default: now).
 *   --concurrency=N   Parallel embedTender calls (default: 3).
 *   --no-force        Don't re-embed already-embedded tenders.
 */

import 'dotenv/config'
import { supabase } from '../lib/supabase'
import { embedTender, buildTenderText } from '../processors/company-profiler'

interface Args {
  dryRun: boolean
  limit: number | null
  only: string | null
  since: string
  concurrency: number
  force: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const force = !argv.includes('--no-force')
  let limit: number | null = null
  let only: string | null = null
  let since = new Date().toISOString()
  let concurrency = 3
  for (const a of argv) {
    if (a.startsWith('--limit=')) limit = parseInt(a.split('=')[1]!, 10)
    if (a.startsWith('--only=')) only = a.split('=')[1] || null
    if (a.startsWith('--since=')) since = a.split('=')[1]!
    if (a.startsWith('--concurrency=')) concurrency = parseInt(a.split('=')[1]!, 10)
  }
  return { dryRun, limit, only, since, concurrency, force }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

function parsePgVector(v: unknown): number[] | null {
  if (!v) return null
  if (Array.isArray(v)) return v as number[]
  if (typeof v === 'string') {
    const inner = v.trim().replace(/^\[|\]$/g, '')
    if (!inner) return null
    return inner.split(',').map(Number)
  }
  return null
}

async function main() {
  const args = parseArgs()

  let query = supabase
    .from('tenders')
    .select('id, objeto, resumo, requisitos, data_abertura, embedding')
    .in('status', ['analyzing', 'analyzed'])

  if (args.only) {
    query = query.eq('id', args.only)
  } else {
    query = query.gte('data_abertura', args.since)
    if (args.limit) query = query.limit(args.limit)
  }

  const { data: tenders, error } = await query
  if (error) { console.error('query failed:', error); process.exit(1) }
  if (!tenders || tenders.length === 0) { console.log('no tenders'); process.exit(0) }
  const tendersArr = tenders

  console.log(`\n=== REEMBED TENDERS (${tendersArr.length}) — dryRun=${args.dryRun} force=${args.force} ===\n`)

  // Sample BEFORE state for verification
  const sampleSize = Math.min(5, tendersArr.length)
  const samples: Array<{ id: string; objBefore: number; resBefore: boolean; oldVec: number[] | null }> = []
  for (let i = 0; i < sampleSize; i++) {
    const t = tendersArr[i]
    samples.push({
      id: t.id,
      objBefore: (t.objeto || '').length,
      resBefore: !!t.resumo,
      oldVec: parsePgVector(t.embedding),
    })
  }

  if (args.dryRun) {
    console.log('Would process:', tendersArr.length, 'tenders')
    const withResumo = tendersArr.filter(t => t.resumo).length
    console.log(`  With resumo already: ${withResumo} (${(100 * withResumo / tendersArr.length).toFixed(1)}%)`)
    console.log(`  Need LLM enrichment: ${tendersArr.length - withResumo}`)
    process.exit(0)
  }

  const t0 = Date.now()
  let ok = 0, failed = 0, processed = 0

  // Simple concurrency pool
  const queue = [...tendersArr]
  async function worker() {
    while (queue.length > 0) {
      const t = queue.shift()
      if (!t) break
      try {
        const success = await embedTender(t.id, { force: args.force })
        if (success) ok++; else failed++
      } catch (e) {
        failed++
        console.log(`  FAIL ${t.id}:`, (e as Error).message)
      }
      processed++
      if (processed % 25 === 0) {
        const rate = processed / ((Date.now() - t0) / 1000)
        console.log(`  ... ${processed}/${tendersArr.length} (${rate.toFixed(1)}/s, ok=${ok} fail=${failed})`)
      }
    }
  }
  await Promise.all(Array.from({ length: args.concurrency }, () => worker()))

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n=== DONE in ${elapsed}s — ok=${ok} failed=${failed} ===`)

  // Verification: print sample BEFORE/AFTER
  console.log('\n=== SAMPLE VERIFICATION ===')
  for (const s of samples) {
    const { data: after } = await supabase
      .from('tenders')
      .select('id, objeto, resumo, requisitos, embedding')
      .eq('id', s.id)
      .single()
    if (!after) continue
    const text = buildTenderText(after as Record<string, unknown>)
    console.log(`\n  ${s.id}`)
    console.log(`    objeto: ${(after.objeto || '').length} chars`)
    console.log(`    resumo: ${s.resBefore ? 'EXISTED' : 'NULL'} → ${(after.resumo || '').length} chars`)
    console.log(`    requisitos len: ${(after.requisitos || '').length}`)
    console.log(`    final embed text: ${text.length} chars`)
    if (after.resumo) console.log(`    resumo preview: ${after.resumo.slice(0, 200)}`)
    // Cosine vs first sample's company embedding for relative comparison
    const newVec = parsePgVector(after.embedding)
    if (newVec && s.oldVec && newVec.length === s.oldVec.length) {
      const drift = cosine(newVec, s.oldVec)
      console.log(`    embedding drift cos(old, new): ${drift.toFixed(4)}`)
    }
  }

  process.exit(0)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
