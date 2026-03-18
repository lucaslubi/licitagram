/**
 * Enrich competitor_stats with contact info (email, telefone) from BrasilAPI.
 * BrasilAPI uses Receita Federal public data — free, no auth required.
 *
 * Usage: pnpm --filter workers enrich-contacts
 *
 * Rate limit: ~3 req/s to be respectful. ~1000 CNPJs takes ~6 min.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

interface BrasilAPICNPJ {
  cnpj: string
  razao_social: string
  email: string | null
  ddd_telefone_1: string | null
  ddd_telefone_2: string | null
  descricao_situacao_cadastral: string
  municipio: string | null
  uf: string | null
  natureza_juridica: string | null
}

async function fetchBrasilAPI(cnpj: string): Promise<BrasilAPICNPJ | null> {
  const clean = cnpj.replace(/\D/g, '')
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited — wait and retry once
        await new Promise((r) => setTimeout(r, 5000))
        const retry = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
          signal: AbortSignal.timeout(15_000),
        })
        if (!retry.ok) return null
        return (await retry.json()) as BrasilAPICNPJ
      }
      return null
    }
    return (await res.json()) as BrasilAPICNPJ
  } catch {
    return null
  }
}

function formatPhone(ddd: string | null): string | null {
  if (!ddd || ddd.trim().length < 8) return null
  // BrasilAPI returns like "1133334444" (ddd + number)
  const clean = ddd.replace(/\D/g, '')
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  return clean
}

async function main() {
  console.log('=== Enriching competitor contacts via BrasilAPI ===\n')

  // Fetch competitors without email (not yet enriched)
  const BATCH = 100
  let offset = 0
  let totalEnriched = 0
  let totalSkipped = 0
  let totalErrors = 0

  while (true) {
    const { data: batch, error } = await supabase
      .from('competitor_stats')
      .select('cnpj, razao_social')
      .is('email', null)
      .order('total_participacoes', { ascending: false })
      .range(offset, offset + BATCH - 1)

    if (error) {
      console.error('DB error:', error.message)
      break
    }

    if (!batch || batch.length === 0) {
      console.log('\nNo more competitors to enrich.')
      break
    }

    console.log(`\nBatch ${Math.floor(offset / BATCH) + 1}: ${batch.length} CNPJs (offset ${offset})`)

    for (const row of batch) {
      try {
        const data = await fetchBrasilAPI(row.cnpj)

        if (!data) {
          // Mark as processed (empty string) to avoid re-processing
          await supabase
            .from('competitor_stats')
            .update({ email: '' })
            .eq('cnpj', row.cnpj)
          totalSkipped++
          continue
        }

        const email = data.email && data.email.trim() && data.email !== '0' ? data.email.trim().toLowerCase() : ''
        const telefone = formatPhone(data.ddd_telefone_1) || formatPhone(data.ddd_telefone_2) || ''
        const municipio = data.municipio || null
        const naturezaJuridica = data.natureza_juridica || null

        await supabase
          .from('competitor_stats')
          .update({
            email,
            telefone,
            municipio,
            natureza_juridica: naturezaJuridica,
          })
          .eq('cnpj', row.cnpj)

        if (email || telefone) {
          totalEnriched++
          console.log(`  ✓ ${row.cnpj} | ${(row.razao_social || '').slice(0, 40)} | ${email || '-'} | ${telefone || '-'}`)
        } else {
          totalSkipped++
        }

        // Rate limit: ~3 req/s
        await new Promise((r) => setTimeout(r, 350))
      } catch (err) {
        totalErrors++
        console.error(`  ✗ ${row.cnpj}: ${err}`)
      }
    }

    offset += BATCH
    console.log(`  Progress: ${totalEnriched} enriched, ${totalSkipped} no contact, ${totalErrors} errors`)
  }

  console.log(`\n=== Done ===`)
  console.log(`Enriched: ${totalEnriched}`)
  console.log(`No contact info: ${totalSkipped}`)
  console.log(`Errors: ${totalErrors}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
