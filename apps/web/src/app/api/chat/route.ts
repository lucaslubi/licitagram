import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import pdf from 'pdf-parse'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ── Gemini 2.5 Pro — 1M context, excellent for document analysis ────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

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

  if (!GEMINI_API_KEY) {
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

  // Fetch tender data
  const { data: tender } = await supabase
    .from('tenders')
    .select(`
      objeto, orgao_nome, uf, modalidade_nome, valor_estimado,
      data_abertura, data_publicacao, requisitos, resumo, situacao_nome,
      tender_documents (id, titulo, tipo, url, texto_extraido, status)
    `)
    .eq('id', tenderId)
    .single()

  if (!tender) {
    return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
  }

  // Build context
  let context = `## Informações do Edital\n`
  context += `**Objeto:** ${tender.objeto || 'N/A'}\n`
  context += `**Órgão:** ${tender.orgao_nome || 'N/A'}\n`
  context += `**UF:** ${tender.uf || 'N/A'}\n`
  context += `**Modalidade:** ${tender.modalidade_nome || 'N/A'}\n`
  context += `**Valor Estimado:** ${tender.valor_estimado ? `R$ ${Number(tender.valor_estimado).toLocaleString('pt-BR')}` : 'Não informado'}\n`
  context += `**Data de Abertura:** ${tender.data_abertura || 'N/A'}\n`
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
  const systemPrompt = `Você é um assistente especialista em licitações públicas brasileiras.

REGRAS DE RESPOSTA:
- Seja CURTO e DIRETO. Máximo 3-5 parágrafos por resposta.
- Responda APENAS o que foi perguntado — não adicione informações extras não solicitadas.
- Use bullet points curtos, não parágrafos longos.
- Cite valores, datas e prazos de forma direta (ex: "R$ 500.000", "até 15/04/2026").
- NÃO repita informações que já foram ditas em mensagens anteriores.
- NÃO faça introduções longas. Vá direto ao ponto.
- Se a pergunta for simples, a resposta deve ser simples (1-2 parágrafos).
- Use português brasileiro claro e profissional.

Baseie suas respostas EXCLUSIVAMENTE no edital abaixo. Se não encontrar a informação, diga brevemente que não está disponível.

${context}`

  // Build conversation history for Gemini
  const geminiHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []

  if (chatHistory && chatHistory.length > 0) {
    const recentHistory = chatHistory.slice(-20)
    for (const msg of recentHistory) {
      if (msg.content) {
        geminiHistory.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })
      }
    }
  }

  // ── Stream from Gemini ──────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    })

    const chat = model.startChat({
      history: geminiHistory,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.2,
      },
    })

    const result = await chat.sendMessageStream(question)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`))
            }
          }
        } catch (err) {
          console.error('[Chat Gemini] Stream error:', err)
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

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Chat] Gemini error:', error)
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
