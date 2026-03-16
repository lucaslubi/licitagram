import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type AiTriageJobData } from '../queues/ai-triage.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { invalidateMatchCaches } from '../lib/redis-cache'
import OpenAI from 'openai'

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com',
})

// ─── CNAE Group Descriptions ─────────────────────────────────────────────────

const CNAE_GROUPS: Record<string, string> = {
  '62': 'Tecnologia da Informacao - desenvolvimento de software, consultoria em TI, suporte tecnico',
  '63': 'Servicos de informacao - portais, provedores de conteudo, processamento de dados',
  '70': 'Consultoria em gestao empresarial, assessoria, planejamento estrategico',
  '72': 'Pesquisa e desenvolvimento',
  '82': 'Servicos administrativos, de escritorio e apoio empresarial',
  '85': 'Educacao, treinamento, capacitacao',
  '46': 'Comercio atacadista de equipamentos, maquinas, materiais',
  '47': 'Comercio varejista',
  '77': 'Aluguel de maquinas e equipamentos',
  '33': 'Manutencao e reparacao de maquinas e equipamentos',
  '43': 'Servicos especializados para construcao',
  '41': 'Construcao de edificios',
  '42': 'Obras de infraestrutura',
  '71': 'Servicos de engenharia, arquitetura, testes e analises tecnicas',
  '73': 'Publicidade, pesquisa de mercado, design',
  '80': 'Vigilancia e seguranca',
  '81': 'Limpeza, conservacao, manutencao predial, facilities',
  '95': 'Reparacao e manutencao de equipamentos de informatica',
  '26': 'Fabricacao de equipamentos de informatica e eletronicos',
  '61': 'Telecomunicacoes, telefonia, internet',
}

// ─── Company Context Builder ─────────────────────────────────────────────────

function buildCompanyContext(company: Record<string, unknown>): string {
  const parts: string[] = []

  if (company.razao_social) parts.push(`Empresa: ${company.razao_social}`)
  if (company.nome_fantasia) parts.push(`Nome fantasia: ${company.nome_fantasia}`)

  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) allCnaes.push(...(company.cnaes_secundarios as string[]))

  const cnaeDescriptions: string[] = []
  for (const cnae of allCnaes) {
    const group = cnae.substring(0, 2)
    if (CNAE_GROUPS[group]) {
      cnaeDescriptions.push(`${cnae}: ${CNAE_GROUPS[group]}`)
    }
  }
  if (cnaeDescriptions.length > 0) {
    parts.push(`CNAEs e atividades:\n${cnaeDescriptions.join('\n')}`)
  }

  if (company.descricao_servicos) parts.push(`Servicos: ${String(company.descricao_servicos).slice(0, 1000)}`)
  if (Array.isArray(company.palavras_chave) && (company.palavras_chave as string[]).length > 0) {
    parts.push(`Palavras-chave: ${(company.palavras_chave as string[]).join(', ')}`)
  }
  if (Array.isArray(company.capacidades) && (company.capacidades as string[]).length > 0) {
    parts.push(`Capacidades: ${(company.capacidades as string[]).join(', ')}`)
  }

  return parts.join('\n')
}

// ─── AI Triage Prompt ────────────────────────────────────────────────────────

const TRIAGE_SYSTEM_PROMPT = `Voce e um classificador de licitacoes. Recebe o perfil de uma empresa e uma lista de objetos de licitacoes. Para CADA licitacao, avalie se o objeto e compativel com as atividades da empresa.

REGRAS DE PONTUACAO:
- 0-15: TOTALMENTE INCOMPATIVEL — objeto nao tem NENHUMA relacao com os CNAEs/atividades da empresa (ex: empresa de TI e licitacao de transporte escolar, limpeza, alimentacao)
- 16-35: INCOMPATIVEL — ramos diferentes, intersecao minima
- 36-55: BAIXA — alguma relacao mas nao e atividade principal
- 56-75: MODERADA — empresa poderia participar, atividade relacionada aos CNAEs
- 76-90: BOA — objeto alinhado com CNAEs e servicos da empresa
- 91-100: EXCELENTE — match direto, exatamente o que a empresa faz

IMPORTANTE:
- Seja RIGOROSO. Scores inflados prejudicam o usuario.
- Se a empresa e de TI e a licitacao pede servicos de limpeza, transporte, alimentacao, seguranca patrimonial, construcao civil = score 0-15
- Analise o OBJETO REAL, nao palavras soltas
- NAO penalize por localizacao
- Responda APENAS com JSON valido, sem texto adicional, sem markdown`

// ─── Triage a Single Batch ───────────────────────────────────────────────────

interface TriageResult {
  matchId: string
  score: number
  recomendacao: string
}

const LOW_SCORE_THRESHOLD = 20 // Matches below this are hidden (fora do escopo)

async function triageBatch(
  matchIds: string[],
  companyContext: string,
  companyId: string,
): Promise<TriageResult[]> {
  // Fetch matches with tender objects, skipping expired tenders
  const today = new Date().toISOString().split('T')[0]
  const { data: matches } = await supabase
    .from('matches')
    .select('id, company_id, tender_id, score, match_source, tenders!inner(id, objeto, data_encerramento)')
    .in('id', matchIds)
    .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })

  const skippedCount = matchIds.length - (matches?.length || 0)
  if (skippedCount > 0) {
    logger.info({ companyId, skipped: skippedCount }, 'Skipped expired tender matches')
  }

  if (!matches || matches.length === 0) return []

  // Build items
  const items = matches
    .filter((m) => m.tenders)
    .map((m) => {
      const t = m.tenders as unknown as Record<string, unknown>
      return {
        matchId: m.id as string,
        tenderId: t.id as string,
        objeto: ((t.objeto as string) || '').slice(0, 200),
        originalScore: m.score as number,
        matchSource: m.match_source as string,
      }
    })

  if (items.length === 0) return []

  const tenderList = items
    .map((item, i) => `${i + 1}. [${item.matchId}] ${item.objeto}`)
    .join('\n')

  const userPrompt = `${companyContext}

---

Avalie CADA licitacao abaixo. Retorne um JSON array com o score de compatibilidade de cada uma.

LICITACOES:
${tenderList}

Retorne APENAS JSON valido (sem markdown):
[
  {"matchId": "id_aqui", "score": 0-100, "recomendacao": "participar|avaliar_melhor|nao_recomendado"},
  ...
]

LEMBRE: score 0-15 para objetos TOTALMENTE fora do escopo da empresa.`

  const response = await deepseekClient.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 2048,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content || '[]'
  const cleanJson = content.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim()

  let parsed: TriageResult[]
  try {
    const raw = JSON.parse(cleanJson)
    parsed = Array.isArray(raw) ? raw : (raw.results || raw.items || raw.data || [])
  } catch {
    logger.error({ content: cleanJson.slice(0, 500) }, 'AI triage parse error')
    return []
  }

  // Update DB for each result
  const results: TriageResult[] = []

  for (const item of parsed) {
    if (!item.matchId || typeof item.score !== 'number') continue
    const safeScore = Math.min(100, Math.max(0, Math.round(item.score)))
    const match = items.find((m) => m.matchId === item.matchId)
    if (!match) continue

    const updatePayload: Record<string, unknown> = {
      score: safeScore,
      match_source: 'ai_triage',
      recomendacao: item.recomendacao || null,
      analyzed_at: new Date().toISOString(),
    }

    // Save original keyword score if not already saved by a previous AI analysis
    if (match.matchSource !== 'ai' && match.matchSource !== 'ai_triage') {
      updatePayload.keyword_score = match.originalScore
    }

    await supabase
      .from('matches')
      .update(updatePayload)
      .eq('id', item.matchId)

    results.push({
      matchId: item.matchId,
      score: safeScore,
      recomendacao: item.recomendacao || 'avaliar_melhor',
    })
  }

  // Invalidate caches
  try {
    await invalidateMatchCaches(companyId)
  } catch { /* non-critical */ }

  return results
}

// ─── Worker ──────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50 // Items per DeepSeek call

const aiTriageWorker = new Worker<AiTriageJobData>(
  'ai-triage',
  async (job) => {
    const { companyId, matchIds } = job.data

    if (!process.env.DEEPSEEK_API_KEY) {
      logger.warn('DEEPSEEK_API_KEY not set — skipping AI triage')
      return
    }

    logger.info({ companyId, matchCount: matchIds.length }, 'Starting background AI triage')

    // Fetch company profile
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (!company) {
      logger.error({ companyId }, 'Company not found for AI triage')
      return
    }

    const companyContext = buildCompanyContext(company as Record<string, unknown>)

    // Process in batches of BATCH_SIZE
    let triaged = 0
    let lowScoreCount = 0

    for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
      const batch = matchIds.slice(i, i + BATCH_SIZE)

      try {
        const results = await triageBatch(batch, companyContext, companyId)
        triaged += results.length

        for (const r of results) {
          if (r.score < LOW_SCORE_THRESHOLD) lowScoreCount++
        }

        logger.info(
          { companyId, batch: Math.floor(i / BATCH_SIZE) + 1, triaged, total: matchIds.length },
          'AI triage batch complete',
        )
      } catch (err) {
        logger.error({ companyId, err, batch: Math.floor(i / BATCH_SIZE) + 1 }, 'AI triage batch failed')
        // Continue with next batch — don't fail the whole job
      }

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < matchIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    logger.info(
      { companyId, triaged, lowScoreCount, total: matchIds.length },
      'Background AI triage complete',
    )

    // Enqueue semantic matching if embedding provider is available and company has embedding
    if (process.env.JINA_API_KEY || process.env.OPENAI_API_KEY) {
      try {
        const { data: co } = await supabase
          .from('companies')
          .select('embedding')
          .eq('id', companyId)
          .single()

        if (co?.embedding) {
          const { semanticMatchingQueue } = await import('../queues/semantic-matching.queue')
          await semanticMatchingQueue.add(
            `post-triage-semantic-${companyId}`,
            { companyId },
            { jobId: `post-triage-semantic-${companyId}-${Date.now()}` },
          )
          logger.info({ companyId }, 'Enqueued semantic matching after triage')
        }
      } catch {
        // Non-critical — semantic matching will run in scheduled sweep
      }
    }
  },
  {
    connection,
    concurrency: 3, // 3 companies can be triaged in parallel
    limiter: { max: 10, duration: 60_000 }, // Max 10 jobs per minute
    stalledInterval: 300_000, // 5 min stall timeout
  },
)

aiTriageWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'AI triage job failed')
})

export { aiTriageWorker }
