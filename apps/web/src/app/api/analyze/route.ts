import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { callNvidiaAI, parseJsonResponse } from '@/lib/nvidia'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

const SYSTEM_PROMPT = `Voce e um consultor especialista em licitacoes publicas brasileiras. Sua UNICA funcao e avaliar se o OBJETO da licitacao e COMPATIVEL com os CNAEs e atividades da empresa.

PRINCIPIO FUNDAMENTAL: E MUITO MELHOR mostrar uma oportunidade que talvez nao seja perfeita do que PERDER uma boa oportunidade. Na duvida, INCLUA. O usuario pode descartar, mas nao pode encontrar o que voce escondeu.

ANALISE INTELIGENTE DE CNAEs:
- Cada CNAE cobre um UNIVERSO de atividades relacionadas. Interprete de forma AMPLA.
- CNAE 6202/6203/6204 (TI): software, sistemas, suporte, consultoria TI, outsourcing, cloud, dados, automacao, seguranca digital, treinamento TI, help desk, infraestrutura, redes, telecom, licencas
- CNAE 7020 (consultoria): assessoria, planejamento, gestao, auditoria, projetos, treinamento, capacitacao, estudos, diagnosticos, mapeamento
- CNAEs de comercio (46xx, 47xx): fornecimento de TODOS os produtos daquele ramo, inclusive acessorios, pecas, consumiveis relacionados
- CNAEs de servicos (80xx, 81xx, 82xx): terceirizacao, limpeza, seguranca, manutencao, apoio administrativo, facilities
- CNAEs de construcao (41xx, 42xx, 43xx): obras, reformas, instalacoes, manutencao predial, servicos de engenharia
- Se a empresa tem MULTIPLOS CNAEs, considere COMBINACOES de servicos que ela pode oferecer

REGRAS DE PONTUACAO (SEJA GENEROSO):
- Score 0-25: TOTALMENTE incompativel, ramos COMPLETAMENTE diferentes
- Score 26-45: ramos diferentes mas com alguma intersecao possivel
- Score 46-65: ha conexao razoavel, empresa PODERIA fornecer com adaptacao
- Score 66-80: boa compatibilidade, atividade dentro do escopo dos CNAEs
- Score 81-100: compatibilidade direta e clara

REGRAS CRITICAS:
- NAO penalize por falta de informacao. Se um campo esta vazio, assuma NEUTRO (score 70)
- NAO penalize por localizacao — licitacoes publicas permitem participacao nacional
- NAO penalize por porte da empresa
- Se ha QUALQUER CNAE (principal ou secundario) que cubra o objeto = score 70+

Sempre responda com JSON valido, sem texto adicional.`

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

  let prompt = `Avalie se esta empresa pode participar desta licitacao. LEMBRE: na duvida, INCLUA a oportunidade.

PERFIL DA EMPRESA:
${JSON.stringify(profile, null, 2)}

LICITACAO:
Objeto: ${tender.objeto}
${tender.modalidade_nome ? `Modalidade: ${tender.modalidade_nome}` : ''}
${tender.valor_estimado ? `Valor Estimado: ${tender.valor_estimado}` : ''}
${tender.resumo ? `Resumo: ${String(tender.resumo).slice(0, 2000)}` : ''}
${tender.requisitos ? `Requisitos: ${JSON.stringify(tender.requisitos, null, 2).slice(0, 2000)}` : ''}`

  if (docsText) {
    prompt += `\n\nTEXTO DOS DOCUMENTOS DO EDITAL:\n${docsText.slice(0, 80_000)}`
  }

  prompt += `

ANALISE PRINCIPAL: O objeto da licitacao e algo que a empresa pode fornecer com base nos seus CNAEs e atividades? Considere interpretacao AMPLA dos CNAEs e servicos correlatos.

Retorne APENAS JSON valido (sem markdown):
{
  "score": 0-100,
  "breakdown": [
    { "category": "compatibilidade_objeto", "score": 0-100, "reason": "..." },
    { "category": "potencial_participacao", "score": 0-100, "reason": "..." },
    { "category": "relevancia_estrategica", "score": 0-100, "reason": "..." }
  ],
  "justificativa": "justificativa em 2-3 frases",
  "recomendacao": "participar|avaliar_melhor|nao_recomendado",
  "riscos": ["riscos identificados"],
  "acoes_necessarias": ["acoes para participar"]
}`

  return prompt
}

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

  const supabase = await createClient()

  const body = await request.json()
  const { matchId } = body as { matchId: string }

  if (!matchId) {
    return NextResponse.json({ error: 'Missing matchId' }, { status: 400 })
  }

  // Fetch match with tender and company
  const { data: match } = await supabase
    .from('matches')
    .select('id, company_id, tender_id, ai_justificativa, score, match_source')
    .eq('id', matchId)
    .single()

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // If AI analysis already exists, return cached
  if (match.ai_justificativa && match.match_source === 'ai') {
    return NextResponse.json({ cached: true, matchId: match.id })
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
    const response = await callNvidiaAI({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(company as Record<string, unknown>, tender as Record<string, unknown>, docsText),
      maxTokens: 2048,
      maxRetries: 2,
    })

    if (!response || response.trim().length === 0) {
      return NextResponse.json({ error: 'Resposta vazia da IA' }, { status: 502 })
    }

    let parsed: Record<string, unknown>
    try {
      parsed = parseJsonResponse<Record<string, unknown>>(response)
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
        return NextResponse.json({ error: 'Falha ao interpretar resposta da IA' }, { status: 502 })
      }
    }

    // Validate score range
    const rawScore = typeof parsed.score === 'number' ? parsed.score : 0
    const safeScore = Math.min(100, Math.max(0, rawScore))

    // Update match with AI analysis
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        score: safeScore,
        breakdown: parsed.breakdown as unknown[],
        ai_justificativa: parsed.justificativa as string,
        riscos: (parsed.riscos as string[]) || [],
        acoes_necessarias: (parsed.acoes_necessarias as string[]) || [],
        recomendacao: (parsed.recomendacao as string) || null,
        match_source: 'ai',
      })
      .eq('id', matchId)

    if (updateError) {
      console.error('Failed to update match:', updateError)
      return NextResponse.json({ error: 'Falha ao salvar analise' }, { status: 500 })
    }

    return NextResponse.json({
      cached: false,
      matchId: match.id,
      score: safeScore,
      breakdown: parsed.breakdown,
      justificativa: parsed.justificativa,
      recomendacao: parsed.recomendacao,
      riscos: parsed.riscos,
      acoes_necessarias: parsed.acoes_necessarias,
    })
  } catch (error) {
    const isTimeout = (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError'
    if (isTimeout) {
      return NextResponse.json({ error: 'Timeout na analise. Tente novamente.' }, { status: 504 })
    }
    console.error('Analyze error:', error)
    return NextResponse.json({ error: 'Falha ao chamar IA para analise' }, { status: 500 })
  }
}
