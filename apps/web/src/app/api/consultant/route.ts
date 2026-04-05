import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { buildConsultantPrompt, type PageContext } from '@/lib/consultant-prompts'
import { streamAIWithFallback } from '@/lib/ai-client'

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

  const body = await request.json()
  const {
    messages: chatMessages,
    pageContext,
    action,
  } = body as {
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    pageContext?: PageContext
    action?: string
  }

  if (!chatMessages || chatMessages.length === 0) {
    return NextResponse.json({ error: 'Messages are required' }, { status: 400 })
  }

  // Validate last message
  const lastMessage = chatMessages[chatMessages.length - 1]
  if (!lastMessage || lastMessage.role !== 'user' || !lastMessage.content) {
    return NextResponse.json({ error: 'Last message must be from user' }, { status: 400 })
  }

  if (lastMessage.content.length > 4000) {
    return NextResponse.json({ error: 'Mensagem muito longa (máximo 4000 caracteres)' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch company profile for context
  let company: { razao_social: string | null; cnae: string | null; descricao_servicos: string | null } | null = null

  const { data: userProfile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', userCtx.userId)
    .single()

  if (userProfile?.company_id) {
    const { data: companyData } = await supabase
      .from('companies')
      .select('razao_social, cnae_principal, descricao_servicos')
      .eq('id', userProfile.company_id)
      .single()

    if (companyData) {
      company = {
        razao_social: companyData.razao_social || null,
        cnae: companyData.cnae_principal || null,
        descricao_servicos: companyData.descricao_servicos || null,
      }
    }
  }

  // Build system prompt
  const systemPrompt = buildConsultantPrompt(pageContext || null, company)

  console.log(`[Consultant] System prompt: ${systemPrompt.length} chars, Page: ${pageContext?.page || 'none'}`)

  // Build conversation messages
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  // Add chat history (keep last 20 messages for Gemini's large context)
  const recentMessages = chatMessages.slice(-20)
  for (const msg of recentMessages) {
    if (msg.content) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  // ── Stream with automatic fallback: Google AI (free) → OpenRouter → Groq ──
  try {
    const { stream, provider } = await streamAIWithFallback({
      messages,
      max_tokens: 2048,
      temperature: 0.2,
    })

    console.log(`[Consultant] Streaming via ${provider}`)

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
          console.error(`[Consultant] ${provider} stream error:`, streamErr)
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
    console.error('[Consultant] All providers failed:', { message: msg })
    return NextResponse.json({ error: `Serviço de IA indisponível. Tente novamente mais tarde.` }, { status: 503 })
  }
}
