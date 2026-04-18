#!/usr/bin/env tsx
/**
 * Ingestão do corpus RAG pro LicitaGram Gov.
 *
 * Lê PDFs + DOCX de `./materiais/` e afins, quebra em chunks (~800 tokens com
 * overlap 100), chama Gemini text-embedding-004 em batch, e insere em
 * licitagov.knowledge_base.
 *
 * Uso (rodar local, não no Vercel):
 *   pnpm tsx scripts/ingest-knowledge.ts
 *
 * Variáveis de ambiente obrigatórias:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (pra bypass RLS)
 *   - GEMINI_API_KEY
 *
 * Flags opcionais:
 *   --dir=./materiais          pasta raiz dos materiais
 *   --source-prefix=PAM        prefixo pra naming dos sources
 *   --only=pdf|docx            filtro de formato
 *   --limit=100                máx arquivos a processar nesta corrida
 *   --dry-run                  não insere, só imprime
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import pdf from 'pdf-parse'
import mammoth from 'mammoth'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ─── Config ───────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? 'true']),
)

const DIR = args.dir ?? './materiais'
const SOURCE_PREFIX = args['source-prefix'] ?? 'PAM'
const ONLY = args.only as 'pdf' | 'docx' | undefined
const LIMIT = args.limit ? Number(args.limit) : undefined
const DRY_RUN = args['dry-run'] === 'true'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('× SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios no env')
  process.exit(1)
}
if (!GEMINI_KEY) {
  console.error('× GEMINI_API_KEY obrigatório no env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})
const genai = new GoogleGenerativeAI(GEMINI_KEY)
const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIM = 768
const embeddingModel = genai.getGenerativeModel({ model: EMBEDDING_MODEL })

// ─── Chunking ─────────────────────────────────────────────────────────────
const CHUNK_SIZE = 2800 // ~700-800 tokens
const CHUNK_OVERLAP = 350 // ~100 tokens

function chunkText(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
  if (normalized.length <= CHUNK_SIZE) return [normalized]

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length)
    if (end < normalized.length) {
      // Tenta fechar num limite natural (parágrafo, período, palavra)
      const slice = normalized.slice(start, end)
      const paragraphBreak = slice.lastIndexOf('\n\n')
      const sentenceBreak = slice.lastIndexOf('. ')
      if (paragraphBreak > CHUNK_SIZE * 0.6) end = start + paragraphBreak + 2
      else if (sentenceBreak > CHUNK_SIZE * 0.6) end = start + sentenceBreak + 2
    }
    const chunk = normalized.slice(start, end).trim()
    if (chunk.length > 50) chunks.push(chunk)
    start = end - CHUNK_OVERLAP
    if (end === normalized.length) break
  }
  return chunks
}

// ─── Extração de texto ────────────────────────────────────────────────────
async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  const buf = await fs.readFile(filePath)
  if (ext === '.pdf') {
    const result = await pdf(buf)
    return result.text
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer: buf })
    return result.value
  }
  return ''
}

// ─── Classificação heurística (artefato_tipo + modalidade) ────────────────
function classify(fileName: string, dirPath: string): {
  artefatoTipo: string | null
  modalidade: string | null
  sourceType: string
} {
  const hay = `${dirPath} ${fileName}`.toLowerCase()
  let artefatoTipo: string | null = null
  if (/\bdfd\b|documento de (oficializ|formaliz)|oficializacao de demanda/i.test(hay)) artefatoTipo = 'dfd'
  else if (/\betp\b|estudo tecnico preliminar|estudo técnico preliminar/i.test(hay)) artefatoTipo = 'etp'
  else if (/termo de referenc|\btr\b(?!\s*-?\s*dominial)/i.test(hay)) artefatoTipo = 'tr'
  else if (/\bedital\b/i.test(hay)) artefatoTipo = 'edital'
  else if (/\bparecer\b|cju|conjur/i.test(hay)) artefatoTipo = 'parecer'
  else if (/mapa de risco|matriz de risco|gestao de risco|gestão de risco/i.test(hay)) artefatoTipo = 'mapa_riscos'

  let modalidade: string | null = null
  if (/pregao|pregão/i.test(hay)) modalidade = 'pregao'
  else if (/concorrenc/i.test(hay)) modalidade = 'concorrencia'
  else if (/dispensa/i.test(hay)) modalidade = 'dispensa'
  else if (/inexigibilidade/i.test(hay)) modalidade = 'inexigibilidade'
  else if (/credenciamento/i.test(hay)) modalidade = 'credenciamento'
  else if (/dialogo competitivo|diálogo competitivo/i.test(hay)) modalidade = 'dialogo_competitivo'
  else if (/leilao|leilão/i.test(hay)) modalidade = 'leilao'
  else if (/concurso/i.test(hay)) modalidade = 'concurso'
  else if (/convenio|convênio/i.test(hay)) modalidade = 'convenio'

  let sourceType = 'modelo_pam'
  if (/agu|advocacia/i.test(hay)) sourceType = 'modelo_agu'
  else if (/acordao|acórdão/i.test(hay)) sourceType = 'acordao_tcu'
  else if (/lei 14\.?133|lei nº 14\.?133/i.test(hay)) sourceType = 'lei'
  else if (/instrucao normativa|in seges|instrução normativa/i.test(hay)) sourceType = 'instrucao_normativa'
  else if (/parecer/i.test(hay)) sourceType = 'parecer_referencial'
  else if (/manual|tutorial|orientac|orientaç/i.test(hay)) sourceType = 'manual'

  return { artefatoTipo, modalidade, sourceType }
}

// ─── Ingest de um arquivo ─────────────────────────────────────────────────
interface FileStats {
  file: string
  chunks: number
  skipped: boolean
  error?: string
}

// gemini-embedding-001 não suporta batch → chama embedContent em série
// com rate limit leve (free tier: ~150 req/min).
async function embedOne(text: string, title: string): Promise<number[]> {
  const res = await embeddingModel.embedContent({
    content: { role: 'user', parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    title,
    outputDimensionality: EMBEDDING_DIM,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  return res.embedding.values
}

async function embedBatch(texts: string[], titles: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    out.push(await embedOne(texts[i]!, titles[i]!))
    if (i < texts.length - 1) await new Promise((r) => setTimeout(r, 400))
  }
  return out
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80)
}

async function ingestFile(filePath: string): Promise<FileStats> {
  const fileName = path.basename(filePath)
  const dirPath = path.dirname(filePath)
  const stats: FileStats = { file: fileName, chunks: 0, skipped: false }

  try {
    const text = await extractText(filePath)
    if (!text || text.length < 200) {
      stats.skipped = true
      return stats
    }
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      stats.skipped = true
      return stats
    }

    const { artefatoTipo, modalidade, sourceType } = classify(fileName, dirPath)
    const source = `${SOURCE_PREFIX}-${slugify(fileName.replace(/\.(pdf|docx|doc)$/i, ''))}`
    const documentTitle = fileName.replace(/\.(pdf|docx|doc)$/i, '').replace(/[_-]+/g, ' ')

    // Verifica se já foi ingerido (pela chave única source+chunk_index=0)
    const { data: existing } = await supabase
      .schema('licitagov' as never)
      .from('knowledge_base')
      .select('id')
      .eq('source', source)
      .eq('chunk_index', 0)
      .maybeSingle()
    if (existing) {
      stats.skipped = true
      stats.error = 'já ingerido'
      return stats
    }

    // Embedding em batches de 20 pra não estourar rate limits
    const rows: Array<Record<string, unknown>> = []
    const BATCH = 20
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH)
      const titles = slice.map(() => documentTitle)
      const embeddings = await embedBatch(slice, titles)
      slice.forEach((chunk, j) => {
        rows.push({
          source,
          source_type: sourceType,
          document_title: documentTitle,
          modalidade,
          artefato_tipo: artefatoTipo,
          section: null,
          chunk_index: i + j,
          chunk_text: chunk,
          token_count: Math.ceil(chunk.length / 4),
          embedding: embeddings[j],
          metadata: { file: fileName, dir: dirPath.replace(process.cwd() + '/', '') },
        })
      })
      // Rate limit: respirar 250ms entre batches
      if (i + BATCH < chunks.length) await new Promise((r) => setTimeout(r, 250))
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] ${fileName}: ${rows.length} chunks [${sourceType}/${modalidade ?? '-'}/${artefatoTipo ?? '-'}]`)
      stats.chunks = rows.length
      return stats
    }

    // Insert em batches de 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { error } = await supabase
        .schema('licitagov' as never)
        .from('knowledge_base')
        .insert(batch as never)
      if (error) throw new Error(error.message)
    }
    stats.chunks = rows.length
    return stats
  } catch (e) {
    stats.error = e instanceof Error ? e.message : String(e)
    return stats
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function walkDir(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walkDir(full)))
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (ONLY === 'pdf' && ext !== '.pdf') continue
      if (ONLY === 'docx' && ext !== '.docx') continue
      if (['.pdf', '.docx'].includes(ext)) out.push(full)
    }
  }
  return out
}

async function main() {
  console.log(`→ Varrendo ${DIR}…`)
  const files = await walkDir(DIR)
  console.log(`→ ${files.length} arquivo(s) elegível(is) (.pdf + .docx)`)
  const target = LIMIT ? files.slice(0, LIMIT) : files
  console.log(`→ Processando ${target.length} arquivo(s)${DRY_RUN ? ' [DRY-RUN]' : ''}`)

  let totalChunks = 0
  let skipped = 0
  let errors = 0
  for (let i = 0; i < target.length; i++) {
    const f = target[i]!
    const rel = path.relative(process.cwd(), f)
    process.stdout.write(`  [${i + 1}/${target.length}] ${rel.slice(-80)}… `)
    const stats = await ingestFile(f)
    if (stats.skipped) {
      process.stdout.write(`pulado${stats.error ? ` (${stats.error})` : ''}\n`)
      skipped++
    } else if (stats.error) {
      process.stdout.write(`erro: ${stats.error}\n`)
      errors++
    } else {
      process.stdout.write(`${stats.chunks} chunks\n`)
      totalChunks += stats.chunks
    }
  }
  console.log(`\n✓ Concluído. ${totalChunks} chunks ingeridos · ${skipped} pulados · ${errors} erros`)
}

main().catch((e) => {
  console.error('erro fatal:', e)
  process.exit(1)
})
