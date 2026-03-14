import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import pdf from 'pdf-parse'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import OpenAI from 'openai'

// ── DeepSeek V3.2 — streaming chat ────────
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''

const deepseekClient = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

/**
 * SSRF Protection: block private/internal IPs only.
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Service-role client — bypasses RLS */
function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Extract text from a PDF URL */
async function extractPdfText(url: string): Promise<{ text: string | null; error: string | null }> {
  try {
    const pdfResponse = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Licitagram/1.0; +https://licitagram.com.br)',
        Accept: 'application/pdf, */*',
      },
      redirect: 'follow',
    })
    if (!pdfResponse.ok) {
      return { text: null, error: `HTTP ${pdfResponse.status}` }
    }
    const contentType = pdfResponse.headers.get('content-type') || ''
    const isPdfLike =
      contentType.includes('pdf') ||
      contentType.includes('octet-stream') ||
      contentType.includes('binary') ||
      url.toLowerCase().endsWith('.pdf')
    if (!isPdfLike && !contentType.includes('application/')) {
      return { text: null, error: `Unexpected content-type: ${contentType}` }
    }
    const buffer = Buffer.from(await pdfResponse.arrayBuffer())
    if (buffer.length > 50 * 1024 * 1024) return { text: null, error: 'PDF too large' }
    if (buffer.length < 100) return { text: null, error: 'PDF empty' }

    const data = await pdf(buffer)
    const text = data.text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    if (!text || text.length < 50) return { text: null, error: 'No extractable text' }

    console.log(`[Chat PDF] Extracted ${text.length} chars from ${url.slice(0, 80)}`)
    return { text, error: null }
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function POST(request: NextRequest) {
  // Auth + plan check
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasFeature(userCtx, 'chat_ia')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas para planos com Chat IA. Faça upgrade do seu plano.' },
      { status: 403 },
    )
  }

  // Rate limiting
  const rateCheck = await checkRateLimit(`chat:${userCtx.userId}`, 20, 60)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Limite de requisições atingido. Tente novamente em ${rateCheck.retryAfter}s.` },
      { status: 429 },
    )
  }

  const supabase = await createClient()

  if (!DEEPSEEK_API_KEY) {
    return NextResponse.json({ error: 'Chat AI not configured' }, { status: 503 })
  }

  const body = await request.json()
  const { tenderId, question, messages: chatHistory, uploadedDocsText } = body as {
    tenderId: string
    question: string
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    uploadedDocsText?: string
  }

  if (!tenderId || !question || question.length > 2000) {
    return NextResponse.json({ error: 'Missing tenderId or question (max 2000 chars)' }, { status: 400 })
  }

  // Fetch tender data + company profile in parallel
  const [tenderResult, userProfile] = await Promise.all([
    supabase
      .from('tenders')
      .select(`
        objeto, orgao_nome, uf, municipio, modalidade_nome, valor_estimado,
        valor_homologado, data_abertura, data_publicacao, data_encerramento,
        requisitos, resumo, situacao_nome,
        tender_documents (id, titulo, tipo, url, texto_extraido, status)
      `)
      .eq('id', tenderId)
      .single(),
    supabase
      .from('users')
      .select('company_id')
      .eq('id', userCtx.userId)
      .single(),
  ])

  const tender = tenderResult.data
  if (!tender) {
    return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
  }

  // Fetch company profile if available
  let company: Record<string, unknown> | null = null
  if (userProfile.data?.company_id) {
    const { data: companyData } = await supabase
      .from('companies')
      .select(`
        razao_social, nome_fantasia, cnpj, porte,
        cnae_principal, cnaes_secundarios,
        descricao_servicos, capacidades, certificacoes,
        palavras_chave, uf, municipio
      `)
      .eq('id', userProfile.data.company_id)
      .single()
    company = companyData as Record<string, unknown> | null
  }

  // Build context
  let context = ''

  // ── Company profile context ─────────────────────────────────────────
  if (company) {
    context += `## Perfil da Empresa (cliente que está analisando este edital)\n`
    context += `**Razão Social:** ${company.razao_social || 'N/A'}\n`
    if (company.nome_fantasia) context += `**Nome Fantasia:** ${company.nome_fantasia}\n`
    if (company.cnpj) context += `**CNPJ:** ${company.cnpj}\n`
    if (company.porte) context += `**Porte:** ${company.porte}\n`
    if (company.uf) context += `**UF:** ${company.uf}${company.municipio ? ` - ${company.municipio}` : ''}\n`

    if (company.cnae_principal) {
      const allCnaes = [company.cnae_principal as string]
      if (Array.isArray(company.cnaes_secundarios) && company.cnaes_secundarios.length > 0) {
        allCnaes.push(...(company.cnaes_secundarios as string[]))
      }
      context += `**CNAEs:** ${allCnaes.join(', ')}\n`
    }

    if (company.descricao_servicos) {
      context += `**Descrição de Serviços:** ${String(company.descricao_servicos).slice(0, 3000)}\n`
    }

    if (Array.isArray(company.capacidades) && company.capacidades.length > 0) {
      context += `**Capacidades Técnicas:** ${(company.capacidades as string[]).join(', ')}\n`
    }

    if (Array.isArray(company.certificacoes) && company.certificacoes.length > 0) {
      context += `**Certificações:** ${(company.certificacoes as string[]).join(', ')}\n`
    }

    if (Array.isArray(company.palavras_chave) && company.palavras_chave.length > 0) {
      context += `**Palavras-chave / Especialidades:** ${(company.palavras_chave as string[]).join(', ')}\n`
    }

    context += '\n'
  }

  // ── Tender context ──────────────────────────────────────────────────
  context += `## Informações do Edital\n`
  context += `**Objeto:** ${tender.objeto || 'N/A'}\n`
  context += `**Órgão:** ${tender.orgao_nome || 'N/A'}\n`
  context += `**UF:** ${tender.uf || 'N/A'}${tender.municipio ? ` - ${tender.municipio}` : ''}\n`
  context += `**Modalidade:** ${tender.modalidade_nome || 'N/A'}\n`
  context += `**Valor Estimado:** ${tender.valor_estimado ? `R$ ${Number(tender.valor_estimado).toLocaleString('pt-BR')}` : 'Não informado'}\n`
  if (tender.valor_homologado) {
    context += `**Valor Homologado:** R$ ${Number(tender.valor_homologado).toLocaleString('pt-BR')}\n`
  }
  context += `**Data de Publicação:** ${tender.data_publicacao || 'N/A'}\n`
  context += `**Data de Abertura:** ${tender.data_abertura || 'N/A'}\n`
  context += `**Data de Encerramento:** ${tender.data_encerramento || 'N/A'}\n`
  context += `**Situação:** ${tender.situacao_nome || 'N/A'}\n\n`

  if (tender.resumo) {
    context += `## Resumo\n${tender.resumo}\n\n`
  }

  if (tender.requisitos) {
    const reqs = tender.requisitos as Record<string, unknown>
    if (reqs.requisitos && Array.isArray(reqs.requisitos)) {
      context += `## Requisitos\n`
      for (const req of reqs.requisitos as Array<{ categoria: string; descricao: string; obrigatorio: boolean }>) {
        context += `- [${req.obrigatorio ? 'Obrigatório' : 'Desejável'}] ${req.categoria}: ${req.descricao}\n`
      }
      context += '\n'
    }
  }

  // ── Document extraction ─────────────────────────────────────────────
  const docs =
    (tender.tender_documents as unknown as Array<{
      id: string
      titulo: string | null
      tipo: string | null
      url: string
      texto_extraido: string | null
      status: string
    }>) || []

  const docsNeedingExtraction = docs.filter((doc) => !doc.texto_extraido && doc.url && isSafeUrl(doc.url))

  if (docsNeedingExtraction.length > 0) {
    const serviceSupabase = getServiceSupabase()
    console.log(`[Chat PDF] Extracting ${docsNeedingExtraction.length} documents`)

    await Promise.allSettled(
      docsNeedingExtraction.map(async (doc) => {
        const { text, error } = await extractPdfText(doc.url)
        if (text) {
          doc.texto_extraido = text
          doc.status = 'done'
          serviceSupabase
            .from('tender_documents')
            .update({ texto_extraido: text, status: 'done' })
            .eq('id', doc.id)
            .then(({ error: dbErr }) => {
              if (dbErr) console.error(`[Chat PDF] DB save failed:`, dbErr)
            })
        } else {
          console.warn(`[Chat PDF] Failed: ${doc.id} — ${error}`)
          serviceSupabase
            .from('tender_documents')
            .update({ status: 'error' })
            .eq('id', doc.id)
            .then(() => {})
        }
      }),
    )
  }

  let docsText = ''
  let docsLoaded = 0
  let docsFailed = 0

  for (const doc of docs) {
    if (doc.texto_extraido) {
      docsText += `\n--- ${doc.titulo || doc.tipo || 'Documento'} ---\n${doc.texto_extraido}\n`
      docsLoaded++
    } else if (doc.url) {
      docsFailed++
    }
  }

  if (docsText) {
    context += `## Texto Extraído dos Documentos (${docsLoaded} documento${docsLoaded > 1 ? 's' : ''})\n${docsText.slice(0, 800_000)}\n`
  }

  // Add user-uploaded document text (from browser-side PDF extraction)
  if (uploadedDocsText && uploadedDocsText.trim().length > 0) {
    const uploadedText = uploadedDocsText.trim()
    context += `## Documentos Enviados pelo Usuário\n${uploadedText.slice(0, 800_000)}\n\n`
    docsLoaded++
    console.log(`[Chat] User-uploaded docs: ${uploadedText.length} chars`)
  }

  if (docsFailed > 0 && docsLoaded === 0) {
    context += `\n⚠️ NOTA: Não foi possível extrair o texto de ${docsFailed} documento(s) PDF automaticamente. O usuário pode anexar o PDF manualmente no chat para análise completa.\n`
  } else if (docsFailed > 0) {
    context += `\n⚠️ NOTA: ${docsFailed} documento(s) não puderam ser carregados automaticamente.\n`
  }

  // ── Build Gemini messages ───────────────────────────────────────────
  const hasCompany = !!company
  const systemPrompt = `Você é um assistente especialista em licitações públicas brasileiras, atuando como consultor dedicado para a empresa do usuário.

${hasCompany ? `CONTEXTO DA EMPRESA:
Você tem acesso ao perfil completo da empresa que está analisando este edital. Use essas informações para:
- Avaliar se a empresa atende aos requisitos técnicos, de qualificação e habilitação do edital
- Identificar quais capacidades, certificações e experiências da empresa são relevantes para esta licitação
- Apontar gaps: o que o edital exige que a empresa talvez não tenha
- Sugerir como a empresa pode se posicionar na proposta com base nas suas especialidades
- Quando o usuário perguntar "minha empresa pode participar?", "tenho chance?", "atendo os requisitos?" etc., analise detalhadamente usando os dados da empresa
- Ao listar requisitos, indique ao lado se a empresa provavelmente atende ou não com base no perfil cadastrado

` : ''}ESTILO DE RESPOSTA:
- Seja objetivo e prático. Vá direto ao ponto sem introduções desnecessárias.
- Use bullet points e listas quando apropriado para organizar a informação.
- Cite dados concretos: valores em R$, datas dd/mm/aaaa, números de artigos/cláusulas.
- Responda o que foi perguntado de forma completa — inclua todos os detalhes relevantes do edital.
- Se a resposta exigir muitos itens (ex: lista de documentos), liste TODOS, não resuma.
- NÃO repita informações já ditas em mensagens anteriores.
- Se não encontrar a informação no edital, diga claramente "Não consta no edital."
- Quando relevante, personalize a resposta para o contexto da empresa do usuário.
- Use português BR profissional.

Baseie-se neste edital e no perfil da empresa:

${context}`

  // Build conversation history for DeepSeek (OpenAI-compatible flat messages)
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  if (chatHistory && chatHistory.length > 0) {
    const recentHistory = chatHistory.slice(-20)
    for (const msg of recentHistory) {
      if (msg.content) {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        })
      }
    }
  }

  messages.push({ role: 'user', content: question })

  // ── Stream from DeepSeek ──────────────────────────────────────────────
  try {
    const stream = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 20000,
      temperature: 0.2,
      stream: true,
      messages,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`))
            }
          }
        } catch (err) {
          console.error('[Chat DeepSeek] Stream error:', err)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ content: '\n\n⚠️ Erro durante a geração da resposta.' })}\n\n`,
            ),
          )
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Chat] DeepSeek error:', error)
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('429') || msg.includes('RATE_LIMIT')) {
      return NextResponse.json(
        { error: 'Limite da API atingido. Tente novamente em alguns segundos.' },
        { status: 429 },
      )
    }

    return NextResponse.json({ error: 'Falha ao processar a pergunta. Tente novamente.' }, { status: 500 })
  }
}
