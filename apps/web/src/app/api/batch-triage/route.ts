import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { invalidateCache, CacheKeys } from '@/lib/redis'
import OpenAI from 'openai'
import { CNAE_GROUPS } from '@licitagram/shared'

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com',
})

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

interface TriageItem {
  matchId: string
  tenderId: string
  objeto: string
}

interface TriageResult {
  matchId: string
  score: number
  recomendacao: string
}

/**
 * Batch AI triage: scores up to 25 matches at once using a lightweight prompt.
 * Updates DB with AI-triaged scores. Much cheaper than full analysis.
 */
export async function POST(request: NextRequest) {
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasFeature(userCtx, 'chat_ia')) {
    return NextResponse.json({ error: 'Recurso disponivel nos planos Professional e Enterprise' }, { status: 403 })
  }

  // Rate limit: 30 batch calls per minute (sequential, 50 matches each)
  const rateCheck = await checkRateLimit(`batch-triage:${userCtx.userId}`, 30, 60)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Limite atingido. Tente em ${rateCheck.retryAfter}s.` },
      { status: 429 },
    )
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const body = await request.json()
  const { matchIds } = body as { matchIds: string[] }

  if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
    return NextResponse.json({ error: 'matchIds required' }, { status: 400 })
  }

  // Cap at 100 per request (matches BATCH_SIZE in IntelligenceMap)
  const ids = matchIds.slice(0, 100)

  const supabase = await createClient()

  // Fetch matches with tender objects
  const { data: matches } = await supabase
    .from('matches')
    .select('id, company_id, tender_id, score, match_source, tenders(id, objeto)')
    .in('id', ids)

  if (!matches || matches.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // Ownership verification: ensure all matches belong to the user's company
  const companyId = matches[0].company_id
  if (companyId !== userCtx.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const allBelongToUser = matches.every((m) => m.company_id === userCtx.companyId)
  if (!allBelongToUser) {
    return NextResponse.json({ error: 'Forbidden: matches do not belong to your company' }, { status: 403 })
  }

  // Fetch company profile
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const companyContext = buildCompanyContext(company as Record<string, unknown>)

  // Build triage items
  const items: TriageItem[] = matches
    .filter((m) => m.tenders)
    .map((m) => {
      const t = m.tenders as unknown as Record<string, unknown>
      return {
        matchId: m.id,
        tenderId: t.id as string,
        objeto: ((t.objeto as string) || '').slice(0, 200),
      }
    })

  if (items.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // Build batch prompt
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

  try {
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
      // Handle both array and object with array inside
      parsed = Array.isArray(raw) ? raw : (raw.results || raw.items || raw.data || [])
    } catch {
      console.error('Batch triage parse error:', cleanJson.slice(0, 500))
      return NextResponse.json({ error: 'AI parse error' }, { status: 500 })
    }

    // Validate and update DB
    const results: Array<{ matchId: string; score: number; recomendacao: string }> = []

    for (const item of parsed) {
      if (!item.matchId || typeof item.score !== 'number') continue
      const safeScore = Math.min(100, Math.max(0, Math.round(item.score)))
      const match = matches.find((m) => m.id === item.matchId)
      if (!match) continue

      // Preserve keyword score, update with AI triage score
      const updatePayload: Record<string, unknown> = {
        score: safeScore,
        match_source: 'ai_triage',
        recomendacao: item.recomendacao || null,
        analyzed_at: new Date().toISOString(),
      }

      // Save original keyword score if not already saved
      if (match.match_source !== 'ai' && match.match_source !== 'ai_triage') {
        updatePayload.keyword_score = match.score
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

    // Invalidate map cache
    try {
      await invalidateCache(`cache:matches:${companyId}:*`)
    } catch {}

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Batch triage AI error:', err)
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
  }
}
