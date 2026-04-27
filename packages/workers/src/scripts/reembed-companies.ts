/**
 * REEMBED COMPANIES — Force-regenerate profile_text + embedding for all companies.
 *
 * Use after changes to buildExpandedProfile() so existing embeddings reflect
 * the new profile shape. Idempotent: writes both company_profile_text and
 * embedding in a single update.
 *
 * Usage: cd packages/workers && npx tsx src/scripts/reembed-companies.ts
 *
 * Flags:
 *   --dry-run      Print before/after sizes only, no Voyage call, no DB write.
 *   --limit=N      Process at most N companies (default: all).
 *   --only=<id>    Process a single company by id (overrides limit).
 */

import 'dotenv/config'
import { supabase } from '../lib/supabase'
import { buildExpandedProfile, buildTenderText } from '../processors/company-profiler'
import { generateEmbedding, formatVector } from '../ai/embedding-client'

interface Args {
  dryRun: boolean
  limit: number | null
  only: string | null
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  let limit: number | null = null
  let only: string | null = null
  for (const a of argv) {
    if (a.startsWith('--limit=')) limit = parseInt(a.split('=')[1]!, 10)
    if (a.startsWith('--only=')) only = a.split('=')[1] || null
  }
  return { dryRun, limit, only }
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
  if (!process.env.VOYAGE_API_KEY && !process.env.JINA_API_KEY) {
    console.error('ERROR: set VOYAGE_API_KEY (or JINA_API_KEY) in env')
    process.exit(1)
  }

  let query = supabase
    .from('companies')
    .select('id, razao_social, nome_fantasia, cnae_principal, cnaes_secundarios, descricao_servicos, palavras_chave, capacidades, certificacoes, porte, company_profile_text, embedding')

  if (args.only) query = query.eq('id', args.only)
  if (args.limit && !args.only) query = query.limit(args.limit)

  const { data: companies, error } = await query
  if (error) { console.error('query failed:', error); process.exit(1) }
  if (!companies || companies.length === 0) { console.log('no companies'); process.exit(0) }

  console.log(`\n=== REEMBED COMPANIES (${companies.length}) — dryRun=${args.dryRun} ===\n`)

  const sizeReport: Array<{ name: string; before: number; after: number }> = []
  let ok = 0, failed = 0
  const t0 = Date.now()

  for (const c of companies) {
    const beforeLen = (c.company_profile_text || '').length
    const newProfile = buildExpandedProfile(c as Record<string, unknown>)
    const afterLen = newProfile.length
    sizeReport.push({ name: (c.razao_social || c.id).slice(0, 40), before: beforeLen, after: afterLen })

    if (args.dryRun) { ok++; continue }

    if (newProfile.length < 50) {
      console.log(`  SKIP (too short) ${c.razao_social}`)
      failed++
      continue
    }

    try {
      const embedding = await generateEmbedding(newProfile)
      const { error: upErr } = await supabase
        .from('companies')
        .update({
          company_profile_text: newProfile,
          embedding: formatVector(embedding),
          profiled_at: new Date().toISOString(),
        })
        .eq('id', c.id)
      if (upErr) { console.log(`  FAIL ${c.razao_social}:`, upErr.message); failed++ }
      else { console.log(`  OK   ${c.razao_social} (${beforeLen} → ${afterLen} chars)`); ok++ }
    } catch (e) {
      console.log(`  FAIL ${c.razao_social}:`, (e as Error).message)
      failed++
    }
    // gentle pacing — embedding-client already rate-limits, this is just a margin
    await new Promise((r) => setTimeout(r, 250))
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  // Sort + print size table
  sizeReport.sort((a, b) => b.before - a.before)
  console.log('\n=== SIZE REPORT ===')
  console.log('name'.padEnd(42) + 'before'.padStart(8) + 'after'.padStart(8) + 'reduction'.padStart(12))
  for (const r of sizeReport) {
    const red = r.before > 0 ? `${((1 - r.after / r.before) * 100).toFixed(0)}%` : '—'
    console.log(r.name.padEnd(42) + String(r.before).padStart(8) + String(r.after).padStart(8) + red.padStart(12))
  }
  const sumBefore = sizeReport.reduce((s, r) => s + r.before, 0)
  const sumAfter = sizeReport.reduce((s, r) => s + r.after, 0)
  console.log('-'.repeat(70))
  console.log('AVG'.padEnd(42)
    + String(Math.round(sumBefore / sizeReport.length)).padStart(8)
    + String(Math.round(sumAfter / sizeReport.length)).padStart(8)
    + `${((1 - sumAfter / sumBefore) * 100).toFixed(0)}%`.padStart(12))

  console.log(`\n=== DONE in ${elapsed}s — ok=${ok} failed=${failed} ===`)

  // Quality check: pick 1 company, recompute cosine vs its top-20 current matches
  if (!args.dryRun) {
    const target = companies[0]
    const { data: newCompany } = await supabase
      .from('companies')
      .select('embedding')
      .eq('id', target.id)
      .single()
    const newVec = parsePgVector(newCompany?.embedding)
    const oldVec = parsePgVector(target.embedding)
    if (newVec && oldVec) {
      // top 20 tenders by current matches (any matches table) — fall back to recent
      const { data: topMatches } = await supabase
        .from('matches')
        .select('tender_id, score')
        .eq('company_id', target.id)
        .order('score', { ascending: false })
        .limit(20)
      const tenderIds = (topMatches || []).map((m: any) => m.tender_id).filter(Boolean)
      if (tenderIds.length > 0) {
        const { data: tenders } = await supabase
          .from('tenders')
          .select('id, embedding')
          .in('id', tenderIds)
          .not('embedding', 'is', null)
        let sumNew = 0, sumOld = 0, n = 0
        for (const t of tenders || []) {
          const tv = parsePgVector((t as any).embedding)
          if (!tv) continue
          sumNew += cosine(newVec, tv)
          sumOld += cosine(oldVec, tv)
          n++
        }
        if (n > 0) {
          console.log(`\n=== QUALITY CHECK (${target.razao_social}) ===`)
          console.log(`  top-${n} cosine — OLD avg: ${(sumOld / n).toFixed(4)}`)
          console.log(`  top-${n} cosine — NEW avg: ${(sumNew / n).toFixed(4)}`)
          console.log(`  Δ: ${((sumNew - sumOld) / n).toFixed(4)}`)
        }
      } else {
        console.log('\n(quality check skipped — no matches for first company)')
      }
    }
  }

  // Suppress unused import warning
  void buildTenderText
  process.exit(0)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
