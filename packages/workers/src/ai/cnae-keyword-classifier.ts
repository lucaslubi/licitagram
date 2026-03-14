/**
 * CNAE Keyword-Based Classifier (Local, Zero Cost) — v4
 *
 * Classifies a tender's objeto text into CNAE 2-digit division codes
 * using keyword matching against the CNAE_DIVISIONS database.
 *
 * Matching strategies (weighted scoring):
 * 1. Exact token match — keyword tokens appear verbatim in tender text (1.5 pts)
 * 2. Stem match — Portuguese stem overlap handles plural/conjugation (1.0 pts)
 * 3. Specificity boost — keywords exclusive to 1-2 divisions get +0.5 bonus
 * 4. Division name token match (bonus, max 1.5)
 * 5. Description token match (bonus for niche terms, max 1.5)
 *
 * Confidence levels:
 * - 'high' (score >= 3.0) → use directly, no AI needed
 * - 'low'  (score 2.0-2.9) → AI fallback recommended
 */

import { CNAE_DIVISIONS } from '@licitagram/shared'
import { normalizeText } from '../processors/keyword-matcher'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LocalClassification {
  /** Top CNAE division codes (2-digit), sorted by relevance */
  divisions: string[]
  /** 'high' = score >= 3.0 in best division; 'low' = below that */
  confidence: 'high' | 'low'
  /** Score of the top-scoring division */
  topScore: number
}

// ─── Simple Portuguese Stemmer ───────────────────────────────────────────────

/**
 * Two-phase stemmer: strip plural first, then strip derivational suffixes.
 * Ensures "medicamentos" and "medicamento" both → "medic",
 * "computadores" and "computador" both → "computad", etc.
 */
function stem(word: string): string {
  if (word.length <= 4) return word

  let w = word

  // Phase 1: Normalize plural forms (strip plural BEFORE suffixes)
  if (w.length > 5 && w.endsWith('oes')) w = w.slice(0, -3)                                    // ações → aç
  else if (w.length > 5 && w.endsWith('aes')) w = w.slice(0, -2)                               // capitães → capit
  else if (w.length > 5 && w.endsWith('ais')) w = w.slice(0, -2)                               // parciais → parci
  else if (w.length > 5 && w.endsWith('eis')) w = w.slice(0, -2)                               // acessíveis → acessív
  else if (w.length > 5 && w.endsWith('ens')) { w = w.slice(0, -3) + 'em' }                    // passagens → passagem
  else if (w.length > 5 && w.endsWith('es') && 'rzs'.includes(w[w.length - 3])) w = w.slice(0, -2)  // computadores → computador (consonant+es)
  else if (w.length >= 4 && w.endsWith('s')) w = w.slice(0, -1)                                // uniformes → uniforme, epis → epi

  // Phase 2: Remove common Portuguese derivational suffixes (longest first)
  const suffixes = [
    'amento', 'imento', 'mente', 'encia', 'ancia', 'avel', 'ivel',
    'acao', 'icao', 'oria', 'aria', 'eiro', 'eira', 'ista', 'ismo',
    'ante', 'ente', 'inte', 'endo', 'indo', 'ando',
    'tico', 'tica', 'ario',
    'ado', 'ido', 'oso', 'osa', 'ivo', 'iva',
    'or', 'al', 'ar', 'er', 'ir',
  ]

  for (const suffix of suffixes) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) {
      return w.slice(0, -suffix.length)
    }
  }

  return w
}

// ─── Tokenizer ───────────────────────────────────────────────────────────────

/** Tokenize for classification — less aggressive stopword removal */
function classifyTokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w.length >= 3)
    .filter((w) => !CLASSIFY_STOPWORDS.has(w))
}

/** Minimal stopwords — only truly generic words, keep domain terms */
const CLASSIFY_STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'para',
  'com', 'por', 'uma', 'um', 'que', 'ao', 'aos', 'ou', 'e', 'o', 'a',
  'os', 'as', 'se', 'ser', 'como', 'mais', 'tem', 'sua', 'seu', 'seus',
  'nao', 'sim', 'muito', 'pouco', 'bem', 'mal', 'ate', 'sobre', 'entre',
  'apos', 'antes', 'durante', 'sob', 'contra', 'desde', 'quando', 'onde',
  'quem', 'qual', 'quanto', 'todo', 'toda', 'todos', 'todas', 'cada',
  'outro', 'outra', 'mesmo', 'mesma', 'apenas', 'ainda', 'tambem',
  'presente', 'conforme', 'abaixo', 'acima', 'seguinte', 'referente',
])

// ─── Pre-computed Division Data (built once at module load) ──────────────────

interface DivisionTokenData {
  keywordTokens: string[][]
  keywordStems: Set<string>[]
  keywordExclusive: boolean[]   // true if keyword appears in ≤ 2 divisions
  nomeTokens: string[]
  nomeStems: Set<string>
  descStems: Set<string>
}

const DIVISION_DATA: Record<string, DivisionTokenData> = {}

// Step 1: Build keyword tokens for all divisions
const _tempDivKw: Record<string, string[][]> = {}
for (const [div, data] of Object.entries(CNAE_DIVISIONS)) {
  _tempDivKw[div] = data.keywords.map((kw: string) => classifyTokenize(kw)).filter((t: string[]) => t.length > 0)
}

// Step 2: Compute keyword exclusivity (how many divisions share each keyword stem signature)
const _kwDivCount: Map<string, number> = new Map()
for (const [, kwTokensList] of Object.entries(_tempDivKw)) {
  for (const kwTokens of kwTokensList) {
    const sig = kwTokens.map(stem).sort().join('|')
    _kwDivCount.set(sig, (_kwDivCount.get(sig) || 0) + 1)
  }
}

// Step 3: Build final division data with exclusivity flags
for (const [div, data] of Object.entries(CNAE_DIVISIONS)) {
  const kwTokens = _tempDivKw[div]
  const kwStems = kwTokens.map((tokens: string[]) => new Set(tokens.map(stem)))
  const kwExclusive = kwTokens.map((tokens) => {
    const sig = tokens.map(stem).sort().join('|')
    return (_kwDivCount.get(sig) || 1) <= 2
  })
  const nomeTokens = classifyTokenize(data.nome)
  const nomeStems = new Set(nomeTokens.map(stem))
  const descStems = new Set(classifyTokenize(data.descricao || '').map(stem))

  DIVISION_DATA[div] = { keywordTokens: kwTokens, keywordStems: kwStems, keywordExclusive: kwExclusive, nomeTokens, nomeStems, descStems }
}

// ─── Scoring Constants ───────────────────────────────────────────────────────

const EXACT_MATCH_WEIGHT = 1.5    // Keyword tokens appear verbatim in text
const STEM_MATCH_WEIGHT = 1.0     // Keyword stems match text stems (plural/conjugation)
const EXCLUSIVE_BONUS = 0.5       // Extra points for keywords unique to ≤ 2 divisions
const NAME_TOKEN_WEIGHT = 0.5     // Per matching name token
const NAME_MAX_BONUS = 1.5
const DESC_STEM_WEIGHT = 0.3      // Per matching description stem (≥ 4 chars)
const DESC_MAX_BONUS = 1.5
const INCLUSION_THRESHOLD = 2.0   // Minimum score to include a division
const HIGH_CONFIDENCE = 3.0       // Score threshold for 'high' confidence

// ─── Classification Function ─────────────────────────────────────────────────

export function classifyLocal(objeto: string, resumo?: string | null): LocalClassification {
  const text = normalizeText(objeto + (resumo ? ' ' + resumo : ''))
  const textTokens = text.split(' ').filter((w) => w.length >= 3)
  const textTokenSet = new Set(textTokens)
  const textStems = new Set(textTokens.map(stem))

  const scores: Array<{ div: string; score: number }> = []

  for (const [div, data] of Object.entries(DIVISION_DATA)) {
    let matchScore = 0

    // 1. Exact keyword matches (1.5 pts each, +0.5 if exclusive)
    for (let i = 0; i < data.keywordTokens.length; i++) {
      if (data.keywordTokens[i].every((t) => textTokenSet.has(t))) {
        matchScore += EXACT_MATCH_WEIGHT
        if (data.keywordExclusive[i]) matchScore += EXCLUSIVE_BONUS
      }
    }

    // 2. Stem-based keyword matches (1.0 pts each, +0.5 if exclusive, only if not already exact)
    for (let i = 0; i < data.keywordStems.length; i++) {
      const kwTokens = data.keywordTokens[i]
      const isExact = kwTokens.every((t) => textTokenSet.has(t))
      if (!isExact) {
        const kwStemSet = data.keywordStems[i]
        if (kwStemSet.size > 0 && [...kwStemSet].every((s) => textStems.has(s))) {
          matchScore += STEM_MATCH_WEIGHT
          if (data.keywordExclusive[i]) matchScore += EXCLUSIVE_BONUS
        }
      }
    }

    // 3. Division name match bonus (0.5 per token, max 1.5)
    let nameBonus = 0
    for (const t of data.nomeTokens) {
      if (textTokenSet.has(t) || textStems.has(stem(t))) {
        nameBonus += NAME_TOKEN_WEIGHT
      }
    }
    matchScore += Math.min(nameBonus, NAME_MAX_BONUS)

    // 4. Description stem overlap bonus (0.3 per stem ≥ 4 chars, max 1.5)
    let descBonus = 0
    for (const s of data.descStems) {
      if (s.length >= 4 && textStems.has(s)) {
        descBonus += DESC_STEM_WEIGHT
      }
    }
    matchScore += Math.min(descBonus, DESC_MAX_BONUS)

    if (matchScore >= INCLUSION_THRESHOLD) {
      scores.push({ div, score: Math.round(matchScore * 10) / 10 })
    }
  }

  const sorted = scores.sort((a, b) => b.score - a.score).slice(0, 5)
  const topScore = sorted[0]?.score || 0

  return {
    divisions: sorted.map((s) => s.div),
    confidence: topScore >= HIGH_CONFIDENCE ? 'high' : 'low',
    topScore,
  }
}
