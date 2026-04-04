import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import pdf from 'pdf-parse'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { buildTenderAnalysisPrompt } from '@/lib/tender-analysis-prompt'
import OpenAI from 'openai'

// ── AI Providers ────────────────────────────────────────────────────────────
// Primary: Gemini 2.5 Flash via OpenRouter (1M token context)
// Fallback: Groq Llama 3.3 70B (32K context, if OpenRouter fails)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://licitagram.com',
    'X-Title': 'Licitagram',
  },
})

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

// Groq fallback limit: ~64K tokens ≈ ~150K chars
const DEEPSEEK_MAX_CONTEXT = 150_000

/**
 * Smart truncation for Groq fallback only.
 * Gemini 2.5 Flash has 1M tokens — no truncation needed.
 */
function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const keepStart = Math.floor(maxChars * 0.65)
  const keepEnd = Math.floor(maxChars * 0.30)
  const omitted = ((text.length - keepStart - keepEnd) / 1000).toFixed(0)
  return (
    text.slice(0, keepStart) +
    `\n\n[... ${omitted}K caracteres omitidos por limite de contexto — início e fim preservados ...]\n\n` +
    text.slice(-keepEnd)
  )
}

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

/** Extract text from a PDF or ZIP URL */
async function extractPdfText(url: string): Promise<{ text: string | null; error: string | null }> {
  try {
    const pdfResponse = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Licitagram/1.0; +https://licitagram.com.br)',
        Accept: 'application/pdf, application/zip, */*',
      },
      redirect: 'follow',
    })
    if (!pdfResponse.ok) {
      return { text: null, error: `HTTP ${pdfResponse.status}` }
    }
    const contentType = pdfResponse.headers.get('content-type') || ''
    const isAcceptable =
      contentType.includes('pdf') ||
      contentType.includes('zip') ||
      contentType.includes('octet-stream') ||
      contentType.includes('binary') ||
      url.toLowerCase().endsWith('.pdf') ||
      url.toLowerCase().endsWith('.zip')
    if (!isAcceptable && !contentType.includes('application/')) {
      return { text: null, error: `Unexpected content-type: ${contentType}` }
    }
    const buffer = Buffer.from(await pdfResponse.arrayBuffer())
    if (buffer.length > 50 * 1024 * 1024) return { text: null, error: 'File too large' }
    if (buffer.length < 100) return { text: null, error: 'File empty' }

    // Detect ZIP (magic bytes PK\x03\x04)
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04
    const looksLikeZip = isZip || contentType.includes('zip') || url.toLowerCase().endsWith('.zip')

    if (looksLikeZip) {
      const { default: AdmZip } = await import('adm-zip')
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries()
      const pdfEntries = entries.filter((e: any) =>
        !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf'),
      )
      if (pdfEntries.length === 0) {
        return { text: null, error: 'ZIP contains no PDF files' }
      }
      const texts: string[] = []
      for (const entry of pdfEntries) {
        try {
          const pdfBuffer = entry.getData()
          const data = await pdf(pdfBuffer)
          const t = data.text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
          if (t && t.length >= 50) {
            texts.push(`--- ${entry.entryName} ---\n${t}`)
          }
        } catch { /* skip unreadable PDFs inside ZIP */ }
      }
      if (texts.length === 0) return { text: null, error: 'No text extracted from PDFs in ZIP' }
      const combined = texts.join('\n\n')
      console.log(`[Chat PDF] Extracted ${combined.length} chars from ${pdfEntries.length} PDFs in ZIP: ${url.slice(0, 80)}`)
      return { text: combined, error: null }
    }

    // Regular PDF
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

  const supabase = await createClient()

  if (!OPENROUTER_API_KEY && !GROQ_API_KEY) {
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
        objeto, orgao_nome, uf, municipio, modalidade_id, modalidade_nome, valor_estimado,
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
      context += `**Descrição de Serviços:** ${String(company.descricao_servicos).slice(0, 5000)}\n`
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
    console.log(`[Chat PDF] Extracting ${docsNeedingExtraction.length} documents via VPS proxy`)

    // Use VPS proxy for PDF extraction (no timeout issues, direct access to PNCP)
    const VPS_URL = process.env.VPS_MONITORING_URL || 'http://85.31.60.53:3998'
    const VPS_TOKEN = process.env.VPS_MONITORING_TOKEN || ''

    await Promise.allSettled(
      docsNeedingExtraction.map(async (doc) => {
        try {
          // Try VPS proxy first (45s timeout, no Vercel limits)
          const vpsRes = await fetch(`${VPS_URL}/extract-pdf`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${VPS_TOKEN}`,
            },
            body: JSON.stringify({ pdfUrl: doc.url, docId: doc.id }),
            signal: AbortSignal.timeout(50_000),
          })

          if (vpsRes.ok) {
            const result = await vpsRes.json() as { text: string; chars: number }
            if (result.text) {
              doc.texto_extraido = result.text
              doc.status = 'done'
              console.log(`[Chat PDF] VPS extracted ${result.chars} chars for ${doc.id}`)
              return
            }
          }

          // Fallback: try direct extraction from Vercel
          const { text, error } = await extractPdfText(doc.url)
          if (text) {
            doc.texto_extraido = text
            doc.status = 'done'
            const serviceSupabase = getServiceSupabase()
            serviceSupabase.from('tender_documents').update({ texto_extraido: text, status: 'done' }).eq('id', doc.id).then(() => {})
          } else {
            console.warn(`[Chat PDF] Failed: ${doc.id} — ${error}`)
          }
        } catch (err) {
          console.warn(`[Chat PDF] Error extracting ${doc.id}:`, err)
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
    context += `## Texto Extraído dos Documentos (${docsLoaded} documento${docsLoaded > 1 ? 's' : ''} — texto COMPLETO sem truncamento)\n${docsText}\n`
  }

  if (docsFailed > 0) {
    context += `\n## NOTA: ${docsFailed} documento(s) PDF ainda estão sendo processados pelo sistema. A extração de texto está em andamento. Analise com base nos dados já disponíveis acima (objeto, resumo, requisitos e documentos já extraídos). NÃO diga que "não consegue acessar" os PDFs — diga que "${docsFailed} documento(s) estão sendo processados e a análise será atualizada quando concluírem".\n`
  }

  // Add user-uploaded document text
  if (uploadedDocsText && uploadedDocsText.trim().length > 0) {
    const uploadedText = uploadedDocsText.trim()
    context += `## Documentos Enviados pelo Usuário\n${uploadedText}\n\n`
    docsLoaded++
    console.log(`[Chat] User-uploaded docs: ${uploadedText.length} chars`)
  }

  if (docsFailed > 0 && docsLoaded === 0) {
    context += `\n⚠️ NOTA: Não foi possível extrair o texto de ${docsFailed} documento(s) PDF automaticamente. O usuário pode anexar o PDF manualmente no chat para análise completa.\n`
  } else if (docsFailed > 0) {
    context += `\n⚠️ NOTA: ${docsFailed} documento(s) não puderam ser carregados automaticamente.\n`
  }

  // ── Detect non-competitive modality ─────────────────────────────────
  const modalidadeNome = (tender.modalidade_nome || '').toLowerCase()
  const modalidadeId = (tender as any).modalidade_id as number | null
  const isNonCompetitive =
    modalidadeId === 9 || modalidadeId === 14 ||
    modalidadeNome.includes('inexigibilidade') ||
    modalidadeNome.includes('inaplicabilidade')

  // ── Build system prompt ─────────────────────────────────────────────
  const hasCompany = !!company
  const analysisPrompt = buildTenderAnalysisPrompt({
    hasCompany,
    isNonCompetitive,
    modalidadeNome: tender.modalidade_nome || undefined,
  })

  const systemPrompt = `${analysisPrompt}

EDITAL E DADOS:

${context}`

  console.log(`[Chat] Context: ${context.length} chars, System: ${systemPrompt.length} chars`)

  // ── Build conversation messages ─────────────────────────────────────
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  if (chatHistory && chatHistory.length > 0) {
    // Gemini 2.5 Flash has 1M context — keep full history
    const recentHistory = chatHistory.slice(-20)
    for (const msg of recentHistory) {
      if (msg.content) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }
  }

  messages.push({ role: 'user', content: question })

  // ── Try Gemini 2.5 Flash via OpenRouter (primary) ───────────────────
  const useOpenRouter = !!OPENROUTER_API_KEY

  if (useOpenRouter) {
    try {
      console.log(`[Chat] Using Gemini 2.5 Flash via OpenRouter — ${context.length} chars context`)

      const completion = await openrouter.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 16384,
        temperature: 0.2,
        stream: true,
      })

      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of completion) {
              const content = chunk.choices?.[0]?.delta?.content
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
              }
            }
          } catch (streamErr) {
            console.error('[Chat] OpenRouter stream error:', streamErr)
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
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[Chat] OpenRouter/Gemini failed, falling back to Groq:', errMsg)
      // Fall through to Groq fallback
    }
  }

  // ── Fallback: Groq V3 ──────────────────────────────────────────
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: 'Serviço de chat indisponível. Tente novamente mais tarde.' }, { status: 503 })
  }

  // Truncate context for Groq's 64K limit
  const wasTruncated = context.length > DEEPSEEK_MAX_CONTEXT
  const dsContext = wasTruncated ? smartTruncate(context, DEEPSEEK_MAX_CONTEXT) : context

  if (wasTruncated) {
    console.log(`[Chat] Groq fallback — context truncated: ${context.length} → ${dsContext.length} chars`)
  }

  // Rebuild messages with truncated context for Groq
  const dsMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: systemPrompt.replace(context, dsContext) +
        (wasTruncated ? '\n\nNOTA: O texto do edital foi parcialmente truncado. Responda com base no que está disponível.' : ''),
    },
  ]

  if (chatHistory && chatHistory.length > 0) {
    for (const msg of chatHistory.slice(-10)) {
      if (msg.content) dsMessages.push({ role: msg.role, content: msg.content })
    }
  }
  dsMessages.push({ role: 'user', content: question })

  try {
    console.log(`[Chat] Using Groq V3 fallback — ${dsContext.length} chars context`)

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: dsMessages,
      max_tokens: 8192,
      temperature: 0.2,
      stream: true,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const content = chunk.choices?.[0]?.delta?.content
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          }
        } catch (err) {
          console.error('[Chat] Groq stream error:', err)
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
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[Chat] Groq error:', { message: msg, contextLen: dsContext.length })
    return NextResponse.json({ error: `Falha ao processar: ${msg.slice(0, 200)}` }, { status: 500 })
  }
}
