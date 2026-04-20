/**
 * Upstream context builder — propaga artefatos anteriores pro próximo.
 *
 * Sem isto, cada artefato gera em isolamento: o ETP não sabe do DFD, o TR
 * não sabe do Mapa de Riscos, o Edital não sabe do TR. Resultado: docs
 * desconexos, contradições e trabalho do servidor público reconciliando
 * manualmente.
 *
 * Com isto, cada artefato é gerado com excerpt dos anteriores aprovados
 * (ou gerados, se aprovação ainda não rolou) injetado no system prompt.
 * A IA é orientada a fundamentar-se neles, referenciar e não contradizer.
 */

import { getArtefato } from '@/lib/processos/queries'
import { listEstimativas, type EstimativaRow } from '@/lib/precos/actions'
import { listRiscos, type Risco } from '@/lib/processos/queries'
import { logger } from '@/lib/logger'
import type { ArtefatoTipo } from './prompts'

/**
 * Ordem canônica de dependências. Cada artefato herda contexto dos
 * anteriores. Preços e Riscos não são markdown mas dados estruturados.
 */
const UPSTREAM_DEPS: Record<ArtefatoTipo, Array<ArtefatoTipo | 'riscos_json' | 'precos_tabela'>> = {
  dfd: [],
  etp: ['dfd'],
  mapa_riscos: ['dfd', 'etp'],
  tr: ['dfd', 'etp', 'riscos_json', 'precos_tabela'],
  edital: ['dfd', 'etp', 'tr'],
  parecer: ['dfd', 'etp', 'riscos_json', 'tr', 'edital'],
}

const TIPO_LABEL: Record<string, string> = {
  dfd: 'DFD (Documento de Formalização da Demanda)',
  etp: 'ETP (Estudo Técnico Preliminar)',
  mapa_riscos: 'Mapa de Riscos',
  tr: 'TR (Termo de Referência)',
  edital: 'Edital',
  parecer: 'Parecer Jurídico Referencial',
  riscos_json: 'Mapa de Riscos (dados estruturados)',
  precos_tabela: 'Pesquisa de Preços (cesta TCU)',
}

/**
 * Condensa um artefato longo num excerpt útil pra contexto. Dois princípios:
 *   1. Preserva numeração (§1.1, I., A., etc.) — estrutura legal importa
 *   2. Trunca parágrafos longos preservando 1-2 sentenças iniciais
 *
 * Alvo: ~1500 caracteres por artefato (≈ 400 tokens). 6 artefatos × 1500 =
 * 9000 chars, bem dentro do context budget de qualquer provider.
 */
function condenseMarkdown(raw: string, maxChars = 1500): string {
  if (!raw || raw.trim().length === 0) return ''
  const cleaned = raw.replace(/```[\s\S]*?```/g, '[código omitido]').trim()
  if (cleaned.length <= maxChars) return cleaned

  // Pega cabeçalhos + primeiros parágrafos preservando marcadores numéricos
  const lines = cleaned.split('\n')
  const preserved: string[] = []
  let used = 0
  for (const line of lines) {
    if (used >= maxChars) break
    const t = line.trim()
    // Headers (numeração, caps) — sempre inclui
    if (/^(\d+\.|[IVX]+\.|[A-Z]\.|###?|##|#)\s/.test(t) || /^[A-ZÁÂÃÊÔÇ ]{4,}$/.test(t)) {
      preserved.push(line)
      used += line.length + 1
      continue
    }
    // Parágrafo — inclui até 1.5x a média de sentence
    if (t.length > 0 && t.length < 240) {
      preserved.push(line)
      used += line.length + 1
    } else if (t.length >= 240) {
      // Parágrafo longo — primeira sentença só
      const firstSentence = t.match(/^[^.!?]+[.!?]/)?.[0] ?? t.slice(0, 200)
      preserved.push(firstSentence)
      used += firstSentence.length + 1
    }
  }
  const joined = preserved.join('\n')
  return joined.length > maxChars ? joined.slice(0, maxChars) + '\n[…truncado para contexto]' : joined
}

function formatRiscosJson(riscos: Risco[]): string {
  if (riscos.length === 0) return ''
  const top = riscos
    .sort((a, b) => (nivelRank(b.nivelRisco) - nivelRank(a.nivelRisco)))
    .slice(0, 10)
  const lines = top.map((r, i) => {
    return `${i + 1}. [${(r.nivelRisco ?? 'medio').toUpperCase()}] ${r.descricao} — ${r.fase ?? 'n/i'} — trata: ${r.tratamento ?? 'n/i'}`
  })
  return `Total: ${riscos.length} riscos catalogados. Top ${top.length} por nível:\n${lines.join('\n')}`
}

function nivelRank(n: string | null): number {
  if (n === 'alto') return 3
  if (n === 'medio') return 2
  if (n === 'baixo') return 1
  return 0
}

function formatPrecosTabela(rows: EstimativaRow[]): string {
  if (rows.length === 0) return ''
  const lines = rows.map((r) => {
    const v = r.valorFinal ?? r.mediana ?? r.media ?? 0
    const cv = r.cv != null ? ` CV=${r.cv.toFixed(1)}%` : ''
    return `- ${r.itemDescricao}: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${r.metodo}, n=${r.qtdAmostras}${cv})`
  })
  const total = rows.reduce((s, r) => s + (r.valorFinal ?? r.mediana ?? 0), 0)
  return `${lines.length} item(ns) — valor total estimado R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n${lines.join('\n')}`
}

/**
 * Constrói o bloco de contexto upstream pra injetar no system prompt.
 * Retorna string vazia se não há dependências ou se nenhuma delas está
 * disponível ainda. Falhas em buscar individuais não quebram a geração.
 */
export async function buildUpstreamContext(
  processoId: string,
  tipo: ArtefatoTipo,
): Promise<string> {
  const deps = UPSTREAM_DEPS[tipo]
  if (!deps || deps.length === 0) return ''

  const blocks: string[] = []
  for (const dep of deps) {
    try {
      if (dep === 'riscos_json') {
        const riscos = await listRiscos(processoId)
        const formatted = formatRiscosJson(riscos)
        if (formatted) {
          blocks.push(`## ${TIPO_LABEL[dep]}\n${formatted}`)
        }
      } else if (dep === 'precos_tabela') {
        const estimativas = await listEstimativas(processoId)
        const formatted = formatPrecosTabela(estimativas)
        if (formatted) {
          blocks.push(`## ${TIPO_LABEL[dep]}\n${formatted}`)
        }
      } else {
        const art = await getArtefato(processoId, dep)
        const excerpt = condenseMarkdown(art?.markdown ?? '')
        if (excerpt) {
          const status = art?.status === 'aprovado' ? ' [APROVADO]' : ' [GERADO]'
          blocks.push(`## ${TIPO_LABEL[dep]}${status}\n${excerpt}`)
        }
      }
    } catch (e) {
      logger.warn(
        { err: e instanceof Error ? e.message : String(e), processoId, dep, tipo },
        'upstream context fetch failed — proceeding without this dep',
      )
    }
  }

  if (blocks.length === 0) return ''

  return `CONTEXTO DOS ARTEFATOS ANTERIORES (use pra fundamentar e não contradizer):

${blocks.join('\n\n---\n\n')}

DIRETRIZES:
- Referencie explicitamente os artefatos anteriores quando pertinente ("conforme ETP elaborado na fase interna", "consoante Mapa de Riscos aprovado").
- NÃO contradiga objeto, modalidade, valor estimado, riscos já definidos. Se precisar divergir, justifique.
- Preserve numeração do processo (§, artigos, incisos) citada nos artefatos anteriores.`
}
