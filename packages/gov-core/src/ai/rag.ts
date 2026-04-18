import { embed } from './embeddings'

// Tipo mínimo de SupabaseClient consumido aqui — evita dep em @supabase/supabase-js
// no gov-core. O app real passa o client tipado; usamos `any` interno via
// interface compatível com PostgrestBuilder (thenable).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalSupabase = { rpc: (fn: string, params?: Record<string, unknown>) => any }

export interface KnowledgeChunk {
  id: string
  source: string
  sourceType: string
  documentTitle: string
  section: string | null
  chunkText: string
  modalidade: string | null
  artefatoTipo: string | null
  sourceUrl: string | null
  dataPublicacao: string | null
  dataVerificacao: string | null
  distance: number
}

/**
 * Busca top-K trechos do corpus RAG por similaridade de embedding.
 * Filtros opcionais por artefato_tipo e modalidade (aplica OR com NULL —
 * inclui chunks "gerais" que não são específicos de um tipo).
 */
export async function retrieveContext(
  supabase: MinimalSupabase,
  query: string,
  opts: { artefatoTipo?: string; modalidade?: string; limit?: number } = {},
): Promise<KnowledgeChunk[]> {
  if (!query || query.trim().length < 3) return []
  const queryEmbedding = await embed(query, 'retrieval_query')
  const { data, error } = await supabase.rpc('search_knowledge', {
    p_query_embedding: queryEmbedding as unknown as string,
    p_artefato_tipo: opts.artefatoTipo ?? null,
    p_modalidade: opts.modalidade ?? null,
    p_limit: opts.limit ?? 8,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    source: r.source as string,
    sourceType: r.source_type as string,
    documentTitle: r.document_title as string,
    section: (r.section as string | null) ?? null,
    chunkText: r.chunk_text as string,
    modalidade: (r.modalidade as string | null) ?? null,
    artefatoTipo: (r.artefato_tipo as string | null) ?? null,
    sourceUrl: (r.source_url as string | null) ?? null,
    dataPublicacao: (r.data_publicacao as string | null) ?? null,
    dataVerificacao: (r.data_verificacao as string | null) ?? null,
    distance: Number(r.distance ?? 0),
  }))
}

/**
 * Formata chunks recuperados como bloco "REFERÊNCIAS" pronto pra injetar
 * no system prompt. Limita ~4000 tokens (~16000 chars) pra não estourar
 * context window do Gemini Flash.
 */
export function formatContext(chunks: KnowledgeChunk[], maxChars = 16000): string {
  if (chunks.length === 0) return ''
  const lines: string[] = [
    'REFERÊNCIAS OFICIAIS (use estes trechos literalmente quando pertinente, citando a fonte):',
    '',
  ]
  let total = 0
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!
    const cite = [c.source, c.section].filter(Boolean).join(' — ')
    const verifiedAt = c.dataVerificacao
      ? new Date(c.dataVerificacao).toLocaleDateString('pt-BR')
      : null
    const freshness = verifiedAt ? ` [verificado em ${verifiedAt}]` : ''
    const block = `[${i + 1}] ${c.documentTitle}${cite ? ` (${cite})` : ''}${freshness}\n${c.chunkText}\n`
    if (total + block.length > maxChars) break
    lines.push(block)
    total += block.length
  }
  lines.push(
    '',
    'REGRAS:',
    '- Ao usar trechos das REFERÊNCIAS, cite "(conforme [N])" no texto gerado.',
    '- Se uma referência for menos autoritativa ou estiver com verificação antiga (> 90 dias), use com cautela e sinalize "sujeito a verificação de atualização".',
    '- NUNCA invente acórdãos, artigos ou instruções normativas — só cite o que está nas REFERÊNCIAS.',
  )
  return lines.join('\n')
}

/** Estatísticas rápidas do corpus (pra UI/debug). */
export interface KnowledgeStat {
  source: string
  sourceType: string
  chunks: number
  vigentes: number
  revogados: number
  lastIngested: string | null
  lastVerified: string | null
  ageDays: number
  staleness: 'fresh' | 'ok' | 'aging' | 'stale'
}

export async function knowledgeStats(supabase: MinimalSupabase): Promise<KnowledgeStat[]> {
  const { data, error } = await supabase.rpc('knowledge_stats')
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    source: r.source as string,
    sourceType: r.source_type as string,
    chunks: Number(r.chunks ?? 0),
    vigentes: Number(r.vigentes ?? 0),
    revogados: Number(r.revogados ?? 0),
    lastIngested: (r.last_ingested as string | null) ?? null,
    lastVerified: (r.last_verified as string | null) ?? null,
    ageDays: Number(r.age_days ?? 0),
    staleness: (r.staleness as KnowledgeStat['staleness']) ?? 'stale',
  }))
}
