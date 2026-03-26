import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { invalidateCache } from '@/lib/redis'
import OpenAI from 'openai'
import { CNAE_GROUPS } from '@licitagram/shared'

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
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
    if (CNAE_GROUPS[group]) cnaeDescriptions.push(`${cnae}: ${CNAE_GROUPS[group]}`)
  }
  if (cnaeDescriptions.length > 0) parts.push(`CNAEs e atividades:\n${cnaeDescriptions.join('\n')}`)
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

/**
 * Admin-only endpoint: retriage all keyword-only matches for all companies.
 * Processes in batches of 50, streaming progress.
 * GET /api/admin/retriage
 */
export async function GET(request: NextRequest) {
  // Admin auth check
  const userCtx = await getUserWithPlan()
  if (!userCtx || !userCtx.isPlatformAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 503 })
  }

  const supabase = await createClient()
  const companyId = request.nextUrl.searchParams.get('company_id') || null

  // Fetch all untriaged matches (keyword-only) for open tenders
  const today = new Date().toISOString().split('T')[0]
  let query = supabase
    .from('matches')
    .select('id, company_id, score, match_source, tenders!inner(id, objeto, data_encerramento)')
    .eq('match_source', 'keyword')
    .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
    .order('company_id')
    .limit(2000)

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { data: allMatches, error: fetchError } = await query

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!allMatches || allMatches.length === 0) {
    return NextResponse.json({ message: 'No untriaged matches found', total: 0 })
  }

  // Group by company
  const byCompany = new Map<string, typeof allMatches>()
  for (const m of allMatches) {
    const cid = m.company_id as string
    if (!byCompany.has(cid)) byCompany.set(cid, [])
    byCompany.get(cid)!.push(m)
  }

  const results: Array<{ companyId: string; processed: number; lowScore: number }> = []
  const BATCH_SIZE = 50

  for (const [cid, matches] of byCompany) {
    // Fetch company profile
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', cid)
      .single()

    if (!company) continue

    const companyContext = buildCompanyContext(company as Record<string, unknown>)
    let processed = 0
    let lowScore = 0

    // Process in batches
    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
      const batch = matches.slice(i, i + BATCH_SIZE)
      const items = batch.map((m) => {
        const t = m.tenders as unknown as Record<string, unknown>
        return {
          matchId: m.id as string,
          objeto: ((t?.objeto as string) || '').slice(0, 200),
          originalScore: m.score as number,
        }
      })

      const tenderList = items
        .map((item, idx) => `${idx + 1}. [${item.matchId}] ${item.objeto}`)
        .join('\n')

      const userPrompt = `${companyContext}\n\n---\n\nAvalie CADA licitacao abaixo. Retorne um JSON array com o score de compatibilidade de cada uma.\n\nLICITACOES:\n${tenderList}\n\nRetorne APENAS JSON valido (sem markdown):\n[\n  {"matchId": "id_aqui", "score": 0-100, "recomendacao": "participar|avaliar_melhor|nao_recomendado"},\n  ...\n]\n\nLEMBRE: score 0-15 para objetos TOTALMENTE fora do escopo da empresa.`

      try {
        const response = await groqClient.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
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

        let parsed: Array<{ matchId: string; score: number; recomendacao: string }>
        try {
          const raw = JSON.parse(cleanJson)
          parsed = Array.isArray(raw) ? raw : (raw.results || raw.items || raw.data || [])
        } catch {
          console.error('Retriage parse error:', cleanJson.slice(0, 300))
          continue
        }

        for (const item of parsed) {
          if (!item.matchId || typeof item.score !== 'number') continue
          const safeScore = Math.min(100, Math.max(0, Math.round(item.score)))
          const match = items.find((m) => m.matchId === item.matchId)
          if (!match) continue

          await supabase
            .from('matches')
            .update({
              score: safeScore,
              match_source: 'ai_triage',
              recomendacao: item.recomendacao || null,
              analyzed_at: new Date().toISOString(),
              keyword_score: match.originalScore,
            })
            .eq('id', item.matchId)

          processed++
          if (safeScore < 40) lowScore++
        }
      } catch (err) {
        console.error('Retriage batch error:', err)
      }

      // Small delay between batches
      if (i + BATCH_SIZE < matches.length) {
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }

    // Invalidate caches for this company
    try {
      await invalidateCache(`cache:matches:${cid}:*`)
    } catch {}

    results.push({ companyId: cid, processed, lowScore })
  }

  const totalProcessed = results.reduce((s, r) => s + r.processed, 0)
  const totalLow = results.reduce((s, r) => s + r.lowScore, 0)

  return NextResponse.json({
    message: `Retriage complete`,
    total: allMatches.length,
    processed: totalProcessed,
    hiddenLowScore: totalLow,
    visibleAfterTriage: totalProcessed - totalLow,
    companies: results,
  })
}
