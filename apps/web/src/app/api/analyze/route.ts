import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { invalidateCache, invalidateKey, CacheKeys } from '@/lib/redis'
import OpenAI from 'openai'

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com',
})

const CNAE_GROUPS: Record<string, string> = {
  '62': 'Tecnologia da Informacao - desenvolvimento de software, consultoria em TI, suporte tecnico, processamento de dados',
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

function cleanCompanyProfile(company: Record<string, unknown>): Record<string, unknown> {
  const relevant: Record<string, unknown> = {}
  const fields = [
    'razao_social', 'nome_fantasia', 'cnae_principal', 'cnaes_secundarios',
    'porte', 'descricao_servicos', 'capacidades', 'certificacoes',
    'palavras_chave', 'uf', 'municipio',
  ]
  for (const field of fields) {
    let val = company[field]
    if (val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0)) {
      if (typeof val === 'string' && val.length > 2000) {
        val = val.slice(0, 2000) + '...'
      }
      relevant[field] = val
    }
  }

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
    relevant.atividades_descritas = cnaeDescriptions
  }

  return relevant
}

function buildPrompt(company: Record<string, unknown>, tender: Record<string, unknown>, docsText: string): string {
  const profile = cleanCompanyProfile(company)

  let prompt = `Avalie com PRECISAO se o objeto desta licitacao e compativel com as atividades REAIS da empresa. Seja PRECISO — scores inflados prejudicam o usuario.

PERFIL DA EMPRESA:
${JSON.stringify(profile, null, 2)}

LICITACAO:
Objeto: ${tender.objeto}
${tender.modalidade_nome ? `Modalidade: ${tender.modalidade_nome}` : ''}
${tender.valor_estimado ? `Valor Estimado: ${tender.valor_estimado}` : ''}
${tender.resumo ? `Resumo: ${String(tender.resumo).slice(0, 2000)}` : ''}
${tender.requisitos ? `Requisitos: ${JSON.stringify(tender.requisitos, null, 2).slice(0, 2000)}` : ''}`

  if (docsText) {
    prompt += `\n\nTEXTO DOS DOCUMENTOS DO EDITAL:\n${docsText.slice(0, 200_000)}`
  }

  prompt += `

ANALISE PRINCIPAL: O objeto da licitacao e algo que a empresa pode fornecer com base nos seus CNAEs e atividades? Considere interpretacao AMPLA dos CNAEs e servicos correlatos.

Retorne APENAS JSON valido (sem markdown, sem backticks):
{
  "score": 0-100,
  "fit": "baixo|medio|alto|excelente",
  "breakdown": [
    { "category": "compatibilidade_objeto", "fit": "baixo|medio|alto|excelente", "reason": "explicacao tecnica em 1-2 frases" },
    { "category": "potencial_participacao", "fit": "baixo|medio|alto|excelente", "reason": "explicacao tecnica em 1-2 frases" },
    { "category": "relevancia_estrategica", "fit": "baixo|medio|alto|excelente", "reason": "explicacao tecnica em 1-2 frases" }
  ],
  "justificativa": "justificativa em 2-3 frases",
  "recomendacao": "participar|avaliar_melhor|nao_recomendado",
  "riscos": ["riscos identificados"],
  "acoes_necessarias": ["acoes para participar"]
}

REGRAS PARA O CAMPO "fit":
- "baixo": score 0-40 — empresa nao atua neste ramo ou compatibilidade minima
- "medio": score 41-60 — ha alguma relacao mas nao e foco direto da empresa
- "alto": score 61-85 — atividade alinhada com CNAEs e capacidades da empresa
- "excelente": score 86-100 — match direto, exatamente o que a empresa faz`

  return prompt
}

const SYSTEM_PROMPT = `Voce e um consultor especialista em licitacoes publicas brasileiras. Sua funcao e avaliar com PRECISAO se o OBJETO da licitacao e COMPATIVEL com os CNAEs e atividades REAIS da empresa.

PRINCIPIO FUNDAMENTAL: PRECISAO acima de tudo. Uma oportunidade so deve ter score alto se a empresa REALMENTE pode atende-la. Scores inflados prejudicam o usuario — ele perde tempo analisando licitacoes irrelevantes.

ANALISE DE CNAEs:
- Analise o CNAE principal e secundarios da empresa e verifique se o OBJETO da licitacao se enquadra ESPECIFICAMENTE nas atividades desses CNAEs
- NAO assuma que um CNAE generico cobre qualquer coisa — verifique a atividade ESPECIFICA
- Se a empresa tem CNAE 62 (TI) mas a licitacao pede seguranca patrimonial, score BAIXO
- Se a empresa tem CNAE 62 (TI) e a licitacao pede desenvolvimento de software, score ALTO

REGRAS DE PONTUACAO (PRECISAS):
- Score 0-20: INCOMPATIVEL — empresa nao atua neste ramo de forma alguma
- Score 21-40: MUITO BAIXA compatibilidade — ramos diferentes com intersecao minima
- Score 41-55: BAIXA compatibilidade — ha alguma relacao mas nao e a atividade principal
- Score 56-70: MODERADA — empresa poderia participar mas nao e foco direto
- Score 71-85: BOA compatibilidade — atividade alinhada com CNAEs da empresa
- Score 86-100: EXCELENTE — objeto e EXATAMENTE o que a empresa faz, match direto

CRITERIOS PARA SCORE 86-100 (EXCELENTE):
- O objeto da licitacao descreve EXATAMENTE um servico/produto que a empresa oferece
- Os CNAEs da empresa cobrem DIRETAMENTE a atividade solicitada
- As palavras-chave e descricao de servicos da empresa mencionam este tipo de trabalho

CRITERIOS PARA SCORE 71-85 (BOA):
- O objeto esta no escopo dos CNAEs mas pode requerer alguma adaptacao
- A empresa tem capacidade tecnica mas nao e sua especialidade principal

REGRAS:
- NAO penalize por localizacao — licitacoes publicas permitem participacao nacional
- NAO penalize por porte da empresa
- Se faltam informacoes sobre a empresa, seja CONSERVADOR (score 50), NAO generoso
- Analise o OBJETO REAL da licitacao — nao apenas palavras-chave soltas
- Se o objeto menciona multiplos itens/lotes, avalie se a empresa pode fornecer PELO MENOS os itens principais

Sempre responda com JSON valido, sem texto adicional, sem markdown.`

export async function POST(request: NextRequest) {
  // Auth + plan check
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasFeature(userCtx, 'chat_ia')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas para planos com Análise IA. Faça upgrade do seu plano.' },
      { status: 403 },
    )
  }

  // Rate limiting: 10 requests per minute per user
  const rateCheck = await checkRateLimit(`analyze:${userCtx.userId}`, 10, 60)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Limite de requisições atingido. Tente novamente em ${rateCheck.retryAfter}s.` },
      { status: 429 },
    )
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const supabase = await createClient()

  const body = await request.json()
  const { matchId } = body as { matchId: string }

  if (!matchId) {
    return NextResponse.json({ error: 'Missing matchId' }, { status: 400 })
  }

  // Fetch match with tender and company
  const { data: match } = await supabase
    .from('matches')
    .select('id, company_id, tender_id, ai_justificativa, score, match_source, breakdown, recomendacao, riscos, acoes_necessarias')
    .eq('id', matchId)
    .single()

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // If AI analysis already exists and is valid, return cached
  if (match.ai_justificativa && match.match_source === 'ai' && match.ai_justificativa !== 'Analise automatica') {
    // Return full cached data so the UI can display it
    return NextResponse.json({
      cached: true,
      matchId: match.id,
      score: match.score,
      breakdown: match.breakdown || [],
      justificativa: match.ai_justificativa,
      recomendacao: match.recomendacao || null,
      riscos: match.riscos || [],
      acoes_necessarias: match.acoes_necessarias || [],
    })
  }

  // Fetch tender with documents
  const { data: tender } = await supabase
    .from('tenders')
    .select(`
      id, objeto, orgao_nome, uf, modalidade_nome, valor_estimado,
      data_abertura, resumo, requisitos, situacao_nome,
      tender_documents (titulo, tipo, texto_extraido)
    `)
    .eq('id', match.tender_id)
    .single()

  if (!tender) {
    return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
  }

  // Fetch company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', match.company_id)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Build document text
  const docs = (tender.tender_documents as unknown as Array<{
    titulo: string | null; tipo: string | null; texto_extraido: string | null
  }>) || []

  let docsText = ''
  for (const doc of docs) {
    if (doc.texto_extraido) {
      docsText += `\n--- ${doc.titulo || doc.tipo || 'Documento'} ---\n${doc.texto_extraido}\n`
    }
  }

  try {
    const completion = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 4096,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(company as Record<string, unknown>, tender as Record<string, unknown>, docsText) },
      ],
    })

    const response = completion.choices[0]?.message?.content || ''

    if (!response || response.trim().length === 0) {
      return NextResponse.json({ error: 'Resposta vazia da IA' }, { status: 502 })
    }

    // Parse JSON — strip markdown code fences if present
    const cleanJson = response.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleanJson)
    } catch {
      // Try manual extraction as fallback
      const scoreMatch = response.match(/"score"\s*:\s*(\d+)/)
      const justMatch = response.match(/"justificativa"\s*:\s*"([^"]+)"/)
      if (scoreMatch) {
        parsed = {
          score: Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10))),
          breakdown: [],
          justificativa: justMatch?.[1] || 'Analise automatica',
          recomendacao: 'avaliar_melhor',
          riscos: [],
          acoes_necessarias: [],
        }
      } else {
        console.error('[Analyze] Failed to parse AI response:', response.slice(0, 500))
        return NextResponse.json({ error: 'Falha ao interpretar resposta da IA' }, { status: 502 })
      }
    }

    // Validate score range
    const rawScore = typeof parsed.score === 'number' ? parsed.score : 0
    const safeScore = Math.min(100, Math.max(0, rawScore))

    // Preserve original keyword score before AI overwrites it
    const updatePayload: Record<string, unknown> = {
      score: safeScore,
      breakdown: parsed.breakdown as unknown[],
      ai_justificativa: parsed.justificativa as string,
      riscos: (parsed.riscos as string[]) || [],
      acoes_necessarias: (parsed.acoes_necessarias as string[]) || [],
      recomendacao: (parsed.recomendacao as string) || null,
      match_source: 'ai',
      analyzed_at: new Date().toISOString(),
    }

    // Save original keyword score so we can show the diff in the UI
    if (match.match_source !== 'ai') {
      updatePayload.keyword_score = match.score
    }

    // Update match with AI analysis
    const { error: updateError } = await supabase
      .from('matches')
      .update(updatePayload)
      .eq('id', matchId)

    if (updateError) {
      console.error('Failed to update match:', updateError)
      return NextResponse.json({ error: 'Falha ao salvar analise' }, { status: 500 })
    }

    // Invalidate caches so other pages reflect the AI-updated score immediately
    try {
      await Promise.all([
        invalidateKey(CacheKeys.matchDetail(matchId)),
        invalidateCache(`cache:matches:${match.company_id}:*`),
      ])
    } catch {
      // Cache invalidation is best-effort — don't fail the API call
    }

    return NextResponse.json({
      cached: false,
      matchId: match.id,
      score: safeScore,
      fit: parsed.fit || null,
      breakdown: parsed.breakdown,
      justificativa: parsed.justificativa,
      recomendacao: parsed.recomendacao,
      riscos: parsed.riscos,
      acoes_necessarias: parsed.acoes_necessarias,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('429') || msg.includes('RATE_LIMIT') || msg.includes('quota')) {
      return NextResponse.json(
        { error: 'Limite da API atingido. Tente novamente em alguns segundos.' },
        { status: 429 },
      )
    }

    const isTimeout = (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError'
    if (isTimeout) {
      return NextResponse.json({ error: 'Timeout na analise. Tente novamente.' }, { status: 504 })
    }
    console.error('Analyze error:', error)
    return NextResponse.json({ error: 'Falha ao chamar IA para analise' }, { status: 500 })
  }
}
