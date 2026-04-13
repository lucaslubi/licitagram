import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import pdf from 'pdf-parse'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { buildTenderAnalysisPrompt } from '@/lib/tender-analysis-prompt'
import { streamAIWithFallback } from '@/lib/ai-client'

export const maxDuration = 120



/**
 * SSRF Protection: comprehensive blocking of private, internal, loopback,
 * link-local, cloud metadata, and other non-routable addresses.
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false

    // Block non-default ports that could target internal services
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return false

    // Strip square brackets from IPv6 addresses for uniform checks
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')

    // --- Blocked hostnames / suffixes ---
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.corp') ||
      hostname.endsWith('.home') ||
      hostname.endsWith('.lan') ||
      hostname.endsWith('.intranet')
    ) {
      return false
    }

    // --- IPv4 checks ---
    // Loopback 127.0.0.0/8
    if (/^127\./.test(hostname)) return false
    // 0.0.0.0/8 (current network)
    if (/^0\./.test(hostname) || hostname === '0.0.0.0') return false
    // Private 10.0.0.0/8
    if (/^10\./.test(hostname)) return false
    // Private 172.16.0.0/12
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false
    // Private 192.168.0.0/16
    if (/^192\.168\./.test(hostname)) return false
    // Link-local 169.254.0.0/16 (includes AWS metadata 169.254.169.254)
    if (/^169\.254\./.test(hostname)) return false
    // Shared address space 100.64.0.0/10 (CGN / Tailscale / internal)
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)) return false
    // Documentation / TEST-NET ranges
    if (/^192\.0\.2\./.test(hostname)) return false   // TEST-NET-1
    if (/^198\.51\.100\./.test(hostname)) return false // TEST-NET-2
    if (/^203\.0\.113\./.test(hostname)) return false  // TEST-NET-3
    // Benchmarking 198.18.0.0/15
    if (/^198\.1[89]\./.test(hostname)) return false
    // Protocol assignments 192\.0\.0\.0/24
    if (/^192\.0\.0\./.test(hostname)) return false

    // --- IPv6 checks (hostname already stripped of brackets) ---
    // Loopback ::1 and any zero-expanded form
    if (/^(0*:)*:?0*1$/.test(hostname) || hostname === '::1') return false
    // Unspecified address ::
    if (/^(0*:)*:?0*$/.test(hostname) || hostname === '::') return false
    // IPv4-mapped IPv6 ::ffff:x.x.x.x — re-check the embedded IPv4
    const v4Mapped = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (v4Mapped) {
      // Recursively validate the embedded IPv4
      return isSafeUrl(`${parsed.protocol}//${v4Mapped[1]}${parsed.pathname}`)
    }
    // Unique local addresses fd00::/8 and fc00::/7
    if (/^f[cd][0-9a-f]{2}:/.test(hostname)) return false
    // Link-local fe80::/10
    if (/^fe[89ab][0-9a-f]:/.test(hostname)) return false
    // Any IPv6 starting with :: that could encode internal addresses
    if (hostname.startsWith('::ffff:') || hostname.startsWith('::ffff:0:')) return false
    // Teredo 2001:0000::/32
    if (/^2001:0*:/.test(hostname)) return false
    // 6to4 2002::/16 — can embed private IPv4
    if (/^2002:/.test(hostname)) return false

    // --- Cloud metadata endpoints ---
    // GCP, Azure, DigitalOcean metadata (via link-local, already caught above)
    // AWS IMDSv1/v2 fd00:ec2::254
    if (hostname === 'fd00:ec2::254') return false
    // Alibaba Cloud metadata
    if (hostname === '100.100.100.200') return false

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

/** Process an already-fetched response into extracted PDF/ZIP text */
async function extractPdfFromResponse(response: Response, url: string): Promise<{ text: string | null; error: string | null }> {
  const contentType = response.headers.get('content-type') || ''
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
  const buffer = Buffer.from(await response.arrayBuffer())
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
}

/** Extract text from a PDF or ZIP URL with SSRF-safe redirect handling */
async function extractPdfText(url: string): Promise<{ text: string | null; error: string | null }> {
  try {
    const pdfResponse = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Licitagram/1.0; +https://licitagram.com.br)',
        Accept: 'application/pdf, application/zip, */*',
      },
      redirect: 'manual',
    })
    // If redirect, validate the target URL before following
    if ([301, 302, 303, 307, 308].includes(pdfResponse.status)) {
      const location = pdfResponse.headers.get('location')
      if (!location) return { text: null, error: 'Redirect with no Location header' }
      const redirectUrl = new URL(location, url).toString()
      if (!isSafeUrl(redirectUrl)) {
        return { text: null, error: 'Redirect target blocked by SSRF protection' }
      }
      // Follow one safe redirect manually (no further redirects allowed)
      const redirectedResponse = await fetch(redirectUrl, {
        signal: AbortSignal.timeout(60_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Licitagram/1.0; +https://licitagram.com.br)',
          Accept: 'application/pdf, application/zip, */*',
        },
        redirect: 'error',
      })
      if (!redirectedResponse.ok) {
        return { text: null, error: `HTTP ${redirectedResponse.status} after redirect` }
      }
      return extractPdfFromResponse(redirectedResponse, url)
    }
    if (!pdfResponse.ok) {
      return { text: null, error: `HTTP ${pdfResponse.status}` }
    }
    return extractPdfFromResponse(pdfResponse, url)
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function POST(request: NextRequest) {
  try {
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
  let companyDocuments: Record<string, unknown>[] = []
  if (userProfile.data?.company_id) {
    const [companyResult, docsResult] = await Promise.all([
      supabase
        .from('companies')
        .select(`
          razao_social, nome_fantasia, cnpj, porte,
          cnae_principal, cnaes_secundarios,
          descricao_servicos, capacidades, certificacoes,
          palavras_chave, uf, municipio
        `)
        .eq('id', userProfile.data.company_id)
        .single(),
      supabase
        .from('company_documents')
        .select('id, tipo, descricao, validade, numero, status')
        .eq('company_id', userProfile.data.company_id)
    ])
    company = companyResult.data as Record<string, unknown> | null
    companyDocuments = (docsResult.data || []) as Record<string, unknown>[]
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

    if (companyDocuments && companyDocuments.length > 0) {
      context += `\n**Documentos / Certidões da Empresa já cadastrados no sistema (use isso para certificar conformidade):**\n`
      for (const doc of companyDocuments) {
        let validadeText = 'N/A'
        if (doc.validade) {
          const valDate = new Date(String(doc.validade))
          // ensure valDate is adjusted if we want local timezone, but toLocaleDateString without arguments uses node's default. Let's just do a simple check.
          const isVencido = valDate < new Date()
          validadeText = isVencido ? `VENCIDO (Venceu em ${valDate.toLocaleDateString('pt-BR')})` : valDate.toLocaleDateString('pt-BR')
        }
        context += `- Tipo: ${doc.tipo || 'Desconhecido'} | Status: ${doc.status || 'N/A'} | Validade: ${validadeText} | Descrição: ${doc.descricao || 'N/A'} | Número: ${doc.numero || 'N/A'}\n`
      }
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
    // Use VPS proxy for PDF extraction (no timeout issues, direct access to PNCP)
    const VPS_URL = (process.env.VPS_MONITORING_URL || 'http://85.31.60.53:3998').replace(/\/+$/, '')
    const VPS_TOKEN = process.env.VPS_MONITORING_TOKEN || ''

    console.log(`[Chat PDF] Extracting ${docsNeedingExtraction.length} documents via VPS: ${VPS_URL}`)

    await Promise.allSettled(
      docsNeedingExtraction.map(async (doc) => {
        try {
          // Try VPS proxy first (45s timeout, no Vercel limits)
          const vpsEndpoint = `${VPS_URL}/extract-pdf`
          const vpsRes = await fetch(vpsEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(VPS_TOKEN ? { Authorization: `Bearer ${VPS_TOKEN}` } : {}),
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
            console.warn(`[Chat PDF] VPS returned ok but empty text for ${doc.id}`)
          } else {
            const errBody = await vpsRes.text().catch(() => '(no body)')
            console.warn(`[Chat PDF] VPS failed ${vpsRes.status} for ${doc.id}: ${errBody.slice(0, 200)}`)
          }

          // Fallback: try direct extraction from Vercel
          console.log(`[Chat PDF] Trying direct extraction for ${doc.id}`)
          const { text, error } = await extractPdfText(doc.url)
          if (text) {
            doc.texto_extraido = text
            doc.status = 'done'
            console.log(`[Chat PDF] Direct extracted ${text.length} chars for ${doc.id}`)
            const serviceSupabase = getServiceSupabase()
            serviceSupabase.from('tender_documents').update({ texto_extraido: text, status: 'done' }).eq('id', doc.id).then(() => {})
          } else {
            console.warn(`[Chat PDF] All extraction failed for ${doc.id}: ${error}`)
          }
        } catch (err) {
          console.error(`[Chat PDF] Error extracting ${doc.id}:`, err instanceof Error ? err.message : err)
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

  console.log(`[Chat PDF] Summary: ${docs.length} total, ${docsLoaded} extracted, ${docsFailed} failed, ${docsNeedingExtraction.length} attempted on-demand`)

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

  // ── Stream with automatic fallback: Google AI (free) → OpenRouter → Groq ──
  try {
    const { stream, provider } = await streamAIWithFallback({
      messages,
      max_tokens: 8192,
      temperature: 0.2,
    })

    console.log(`[Chat] Streaming via ${provider} — ${context.length} chars context`)

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices?.[0]?.delta?.content
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          }
        } catch (streamErr) {
          console.error(`[Chat] ${provider} stream error:`, streamErr)
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
    console.error('[Chat] All providers failed:', msg)
    return NextResponse.json({ error: 'Serviço de IA indisponível. Tente novamente mais tarde.' }, { status: 503 })
  }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Chat] Unhandled error:', msg, err instanceof Error ? err.stack : '')
    return NextResponse.json({ error: `Erro interno: ${msg.slice(0, 200)}` }, { status: 500 })
  }
}
