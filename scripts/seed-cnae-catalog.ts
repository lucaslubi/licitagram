#!/usr/bin/env tsx
/**
 * Seed da tabela public.cnae_catalog com as 1.331 subclasses CNAE 2.3
 * oficial IBGE. Busca a lista via API pública do IBGE (sem auth) e popula.
 *
 * Em seguida, computa embeddings via TEI (85.31.60.53:8081) em lote.
 *
 * Idempotente: pode rodar várias vezes — UPSERT por código.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     EMBEDDINGS_URL=http://85.31.60.53:8081 \
 *     EMBEDDINGS_API_KEY=... \
 *     pnpm tsx scripts/seed-cnae-catalog.ts
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMBEDDINGS_URL = process.env.EMBEDDINGS_URL ?? 'http://85.31.60.53:8081'
const EMBEDDINGS_API_KEY = process.env.EMBEDDINGS_API_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('× SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

interface IbgeCnae {
  id: { secao: string; divisao: string; grupo: string; classe: string; subclasse: string }
  classe: { id: string; descricao: string; grupo: { id: string; descricao: string; divisao: { id: string; descricao: string } } }
  descricao: string
}

async function fetchIbgeCnae(): Promise<IbgeCnae[]> {
  console.log('→ Buscando CNAE 2.3 oficial do IBGE…')
  const res = await fetch('https://servicodados.ibge.gov.br/api/v2/cnae/subclasses', {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`IBGE API retornou HTTP ${res.status}`)
  }
  const data = (await res.json()) as IbgeCnae[]
  console.log(`  ✓ ${data.length} subclasses recebidas`)
  return data
}

function extractKeywords(descricao: string): string[] {
  // Extrai keywords significativas da descrição (remove stopwords, pontuação).
  const STOPWORDS = new Set([
    'de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'para', 'em', 'no', 'na',
    'nos', 'nas', 'com', 'sem', 'sobre', 'sob', 'ao', 'aos', 'à', 'às', 'por',
    'ou', 'como', 'que', 'se', 'mais', 'menos', 'muito', 'pouco', 'um', 'uma',
  ])
  return Array.from(
    new Set(
      descricao
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // remove diacritics
        .replace(/[^\p{L}\s]/gu, ' ')     // only letters + spaces
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 30)
}

interface CnaeRow {
  codigo: string
  codigo_formatado: string
  codigo_divisao: string
  codigo_grupo: string
  codigo_classe: string
  descricao: string
  descricao_divisao: string
  descricao_grupo: string
  descricao_classe: string
  palavras_chave: string[]
  embedding_text_hash: string
  ativo: boolean
}

function normalize(ibge: IbgeCnae[]): CnaeRow[] {
  return ibge.map((item) => {
    const codigoFormatado = item.id.subclasse  // ex: "4120-4/00"
    const codigo = codigoFormatado.replace(/[^0-9]/g, '').padStart(7, '0')  // "4120400"
    const divisao = item.id.divisao.padStart(2, '0')
    const grupo = item.id.grupo.padStart(3, '0')
    const classe = item.id.classe.replace(/[^0-9]/g, '').padStart(5, '0')

    const descricao = item.descricao
    const embedText = `${item.classe.grupo.divisao.descricao} · ${item.classe.grupo.descricao} · ${item.classe.descricao} · ${descricao}`
    const hash = createHash('sha256').update(embedText).digest('hex').slice(0, 16)

    return {
      codigo,
      codigo_formatado: codigoFormatado,
      codigo_divisao: divisao,
      codigo_grupo: grupo,
      codigo_classe: classe,
      descricao,
      descricao_divisao: item.classe.grupo.divisao.descricao,
      descricao_grupo: item.classe.grupo.descricao,
      descricao_classe: item.classe.descricao,
      palavras_chave: extractKeywords(embedText),
      embedding_text_hash: hash,
      ativo: true,
    }
  })
}

async function upsertBatch(rows: CnaeRow[]): Promise<number> {
  const CHUNK = 200
  let total = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('cnae_catalog')
      .upsert(chunk, { onConflict: 'codigo' })
    if (error) {
      console.error(`  × Erro no batch ${i}: ${error.message}`)
    } else {
      total += chunk.length
      process.stdout.write(`  upsert ${total}/${rows.length}\r`)
    }
  }
  process.stdout.write('\n')
  return total
}

async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${EMBEDDINGS_URL}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(EMBEDDINGS_API_KEY ? { Authorization: `Bearer ${EMBEDDINGS_API_KEY}` } : {}),
      },
      body: JSON.stringify({ inputs: [text] }),
      // @ts-expect-error Node 20+
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const arr = (await res.json()) as number[][]
    return arr[0] ?? null
  } catch {
    return null
  }
}

async function populateEmbeddings(): Promise<void> {
  console.log('→ Populando embeddings faltantes…')
  const BATCH = 50
  let offset = 0
  let totalEmbedded = 0

  while (true) {
    const { data: rows, error } = await supabase
      .from('cnae_catalog')
      .select('codigo, descricao, descricao_divisao, descricao_grupo, descricao_classe')
      .is('embedding', null)
      .limit(BATCH)

    if (error) {
      console.error(`  × Erro: ${error.message}`)
      break
    }
    if (!rows || rows.length === 0) {
      console.log(`  ✓ Todos os CNAEs embedidos (${totalEmbedded} nesta sessão)`)
      break
    }

    for (const row of rows) {
      const text = [row.descricao_divisao, row.descricao_grupo, row.descricao_classe, row.descricao]
        .filter(Boolean)
        .join(' · ')
      const emb = await embedText(text)
      if (!emb) {
        console.warn(`  ! Embedding falhou pra ${row.codigo}`)
        continue
      }
      const { error: upErr } = await supabase
        .from('cnae_catalog')
        .update({
          embedding: emb,
          atualizado_em: new Date().toISOString(),
        })
        .eq('codigo', row.codigo)
      if (upErr) {
        console.warn(`  ! Update falhou pra ${row.codigo}: ${upErr.message}`)
      } else {
        totalEmbedded++
        process.stdout.write(`  embed ${totalEmbedded}\r`)
      }
    }
    offset += rows.length
  }
  process.stdout.write('\n')
}

async function main() {
  const t0 = Date.now()

  // 1) Puxa catálogo IBGE
  const ibge = await fetchIbgeCnae()

  // 2) Normaliza pra schema
  const rows = normalize(ibge)
  console.log(`  ✓ ${rows.length} rows normalizadas`)

  // 3) Upsert no Supabase
  const upserted = await upsertBatch(rows)
  console.log(`  ✓ ${upserted} rows upsertadas`)

  // 4) Popular embeddings
  await populateEmbeddings()

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`Concluído em ${elapsed}s`)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
