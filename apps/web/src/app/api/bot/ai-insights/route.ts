import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 30

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  // Auth check
  const userCtx = await getUserWithPlan()
  if (!userCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasFeature(userCtx, 'chat_ia') && !hasFeature(userCtx, 'bidding_bot')) {
    return NextResponse.json({ error: 'Recurso disponível nos planos Profissional e Enterprise' }, { status: 403 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, tender, competitors, strategy, lances, nossa_posicao, nosso_lance, melhor_lance } = body

  if (!type || !['pre-disputa', 'ao-vivo'].includes(type)) {
    return NextResponse.json({ error: 'type must be pre-disputa or ao-vivo' }, { status: 400 })
  }

  try {
    const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' })

    let prompt: string

    if (type === 'pre-disputa') {
      const competitorList = (competitors || [])
        .map((c: any, i: number) =>
          `${i + 1}. ${c.razao_social} — Win rate: ${Math.round((c.win_rate || 0) * 100)}%, Participacoes: ${c.total_participacoes || 0}, Valor medio ganho: R$ ${(c.valor_medio_ganho || 0).toLocaleString('pt-BR')}, Desconto medio: ${c.desconto_medio || 0}%`
        )
        .join('\n')

      prompt = `Voce e um estrategista especialista em licitacoes publicas brasileiras. Analise o cenario abaixo e gere insights estrategicos para ajudar o licitante a vencer esta disputa.

LICITACAO:
- Objeto: ${tender?.objeto || 'N/I'}
- Orgao: ${tender?.orgao_nome || 'N/I'}
- Valor estimado: R$ ${(tender?.valor_estimado || 0).toLocaleString('pt-BR')}
- Modalidade: ${tender?.modalidade_nome || 'N/I'}

CONCORRENTES HABILITADOS:
${competitorList || 'Nenhum concorrente identificado'}

ESTRATEGIA DO LICITANTE:
- Lance inicial planejado: R$ ${(strategy?.lance_inicial || 0).toLocaleString('pt-BR')}
- Lance minimo: R$ ${(strategy?.lance_minimo || 0).toLocaleString('pt-BR')}
- Modo: ${strategy?.modo || 'conservador'}

Responda EXCLUSIVAMENTE em JSON valido (sem markdown, sem code fences) com esta estrutura:
{
  "insights": [
    {
      "tipo": "alerta" | "oportunidade" | "estrategia" | "risco",
      "titulo": "titulo curto do insight",
      "descricao": "descricao detalhada em 1-2 frases",
      "acao_sugerida": "acao pratica que o licitante deve tomar"
    }
  ],
  "resumo": "resumo geral da disputa em 1-2 frases",
  "score_confianca": 0-100
}

Gere entre 3 e 5 insights relevantes. Seja direto, pratico e estrategico. Use dados concretos dos concorrentes nas suas analises. Foque em padroes, riscos e oportunidades reais.`
    } else {
      // ao-vivo
      const lancesStr = (lances || [])
        .slice(-10) // last 10 bids
        .map((l: any) => `${l.tipo === 'nosso' ? 'NOSSO' : l.empresa || 'CONCORRENTE'}: R$ ${(l.valor || 0).toLocaleString('pt-BR')}`)
        .join('\n')

      prompt = `Voce e um estrategista de licitacoes publicas brasileiras monitorando um pregao AO VIVO. Analise a situacao atual e gere insights em tempo real.

LICITACAO:
- Objeto: ${tender?.objeto || 'N/I'}
- Valor estimado: R$ ${(tender?.valor_estimado || 0).toLocaleString('pt-BR')}

SITUACAO ATUAL:
- Nossa posicao: ${nossa_posicao || 'N/I'}o lugar
- Nosso lance atual: R$ ${(nosso_lance || 0).toLocaleString('pt-BR')}
- Melhor lance da disputa: R$ ${(melhor_lance || 0).toLocaleString('pt-BR')}

ULTIMOS LANCES:
${lancesStr || 'Nenhum lance ainda'}

Responda EXCLUSIVAMENTE em JSON valido (sem markdown, sem code fences) com esta estrutura:
{
  "insights": [
    {
      "tipo": "alerta" | "oportunidade" | "estrategia" | "risco",
      "titulo": "titulo curto do insight",
      "descricao": "descricao curta e direta em 1 frase",
      "acao_sugerida": "acao imediata"
    }
  ],
  "resumo": "resumo da situacao atual em 1 frase",
  "score_confianca": 0-100
}

Gere entre 2 e 4 insights focados em ACAO IMEDIATA. Detecte padroes nos lances (desaceleracao, agressividade), riscos de margem, e oportunidades taticas. Seja conciso e direto.`
    }

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    if (!responseText) {
      return NextResponse.json({ error: 'Resposta vazia da IA' }, { status: 502 })
    }

    // Parse JSON — strip markdown code fences if present
    const cleanJson = responseText.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(cleanJson)
    } catch {
      console.error('[AI Insights] Failed to parse AI response:', responseText.slice(0, 500))
      return NextResponse.json({ error: 'Falha ao interpretar resposta da IA' }, { status: 502 })
    }

    // Add icons based on type
    const iconMap: Record<string, string> = {
      alerta: '\u26a0\ufe0f',
      oportunidade: '\ud83d\udca1',
      estrategia: '\ud83c\udfaf',
      risco: '\ud83d\udd34',
    }

    const insights = (parsed.insights || []).map((ins: any) => ({
      ...ins,
      icone: iconMap[ins.tipo] || '\ud83d\udca1',
    }))

    return NextResponse.json({
      insights,
      resumo: parsed.resumo || '',
      score_confianca: parsed.score_confianca || 75,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('429') || msg.includes('RATE_LIMIT') || msg.includes('quota')) {
      return NextResponse.json(
        { error: 'Limite da API atingido. Tente novamente em alguns segundos.' },
        { status: 429 },
      )
    }

    console.error('[AI Insights] AI error:', error)
    return NextResponse.json({ error: 'Falha ao gerar insights' }, { status: 500 })
  }
}
