import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  // Auth + plan check
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasFeature(userCtx, 'competitive_intel')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas para planos Enterprise. Faça upgrade do seu plano.' },
      { status: 403 },
    )
  }

  // Rate limiting: 5 requests per minute per user
  const rateCheck = await checkRateLimit(`competitor-analyze:${userCtx.userId}`, 5, 60)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Limite de requisições atingido. Tente novamente em ${rateCheck.retryAfter}s.` },
      { status: 429 },
    )
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const body = await request.json()
  const { competitorCnpj } = body as { competitorCnpj: string }

  if (!competitorCnpj) {
    return NextResponse.json({ error: 'Missing competitorCnpj' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch competitor stats
  const { data: competitor } = await supabase
    .from('competitor_stats')
    .select('*')
    .eq('cnpj', competitorCnpj)
    .single()

  if (!competitor) {
    return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
  }

  // Fetch company profile
  const { data: company } = await supabase
    .from('companies')
    .select('razao_social, nome_fantasia, cnae_principal, cnaes_secundarios, uf')
    .eq('id', userCtx.companyId || '')
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Build company CNAEs list
  const cnaes: string[] = []
  if (company.cnae_principal) cnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) {
    cnaes.push(...(company.cnaes_secundarios as string[]))
  }

  // Build competitor top UFs from participations_by_uf and wins_by_uf
  const participationsByUf = (competitor.participations_by_uf as Record<string, number>) || {}
  const winsByUf = (competitor.wins_by_uf as Record<string, number>) || {}
  const topUfs = Object.entries(participationsByUf)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([uf, count]) => ({
      uf,
      count,
      winRate: count > 0 ? Math.round(((winsByUf[uf] || 0) / count) * 100) : 0,
    }))

  // Build top modalidades
  const modalidades = (competitor.modalidades as Record<string, number>) || {}
  const topModalidades = Object.entries(modalidades)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name)

  const winRate = Math.round(Number(competitor.win_rate || 0) * 100)
  const avgDiscount = Number(competitor.avg_discount_pct || 0)
  const companyName = (company.nome_fantasia || company.razao_social || '') as string
  const competitorName = (competitor.nome || competitorCnpj) as string
  const competitorPorte = (competitor.porte || 'N/I') as string

  // Generate AI insight using Gemini
  try {
    const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `Você é um consultor estratégico de licitações públicas no Brasil.

Analise o perfil deste concorrente comparado à empresa do cliente e gere uma análise estratégica concisa (máx 200 palavras).

**Empresa do cliente:** ${companyName}
- CNAEs: ${cnaes.join(', ')}
- UF: ${company.uf || 'N/I'}

**Concorrente:** ${competitorName}
- Win rate: ${winRate}%
- Participações: ${competitor.total_participations || 0}
- Porte: ${competitorPorte}
- Desconto médio: ${(avgDiscount * 100).toFixed(1)}%
- Principais UFs: ${topUfs.map(u => `${u.uf} (${u.count} participações, ${u.winRate}% win rate)`).join(', ')}
- Modalidades: ${topModalidades.join(', ') || 'N/I'}

Responda em JSON:
{
  "pontos_fortes": ["lista de até 3 pontos fortes do concorrente"],
  "pontos_fracos": ["lista de até 3 pontos fracos/oportunidades"],
  "estrategia": "recomendação de 1-2 frases de como competir contra este concorrente"
}`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    if (!responseText) {
      return NextResponse.json({ error: 'Resposta vazia da IA' }, { status: 502 })
    }

    // Parse JSON — strip markdown code fences if present
    const cleanJson = responseText.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleanJson)
    } catch {
      console.error('[Competitor Analyze] Failed to parse AI response:', responseText.slice(0, 500))
      return NextResponse.json({ error: 'Falha ao interpretar resposta da IA' }, { status: 502 })
    }

    return NextResponse.json({
      insight: {
        competitorCnpj,
        competitorName,
        pontos_fortes: (parsed.pontos_fortes as string[]) || [],
        pontos_fracos: (parsed.pontos_fracos as string[]) || [],
        estrategia: (parsed.estrategia as string) || '',
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('429') || msg.includes('RATE_LIMIT') || msg.includes('quota')) {
      return NextResponse.json(
        { error: 'Limite da API atingido. Tente novamente em alguns segundos.' },
        { status: 429 },
      )
    }

    console.error('[Competitor Analyze] AI error:', error)
    return NextResponse.json({ error: 'Falha ao gerar análise competitiva' }, { status: 500 })
  }
}
