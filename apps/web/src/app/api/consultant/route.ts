import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { buildConsultantPrompt, type PageContext } from '@/lib/consultant-prompts'
import OpenAI from 'openai'

// ── AI Providers ────────────────────────────────────────────────────────────
// Primary: Gemini 2.5 Flash Preview via OpenRouter (1M token context)
// Fallback: DeepSeek V3 (64K context, if OpenRouter fails)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'

const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://licitagram.com',
    'X-Title': 'Licitagram',
  },
})

const deepseek = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: DEEPSEEK_BASE_URL,
})

// DeepSeek fallback limit: ~64K tokens ≈ ~150K chars
const DEEPSEEK_MAX_CONTEXT = 150_000

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

  if (!OPENROUTER_API_KEY && !DEEPSEEK_API_KEY) {
    return NextResponse.json({ error: 'Chat AI not configured' }, { status: 503 })
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

  // ── Try Gemini 2.5 Flash via OpenRouter (primary) ───────────────────
  const useOpenRouter = !!OPENROUTER_API_KEY

  if (useOpenRouter) {
    try {
      console.log(`[Consultant] Using Gemini 2.5 Flash via OpenRouter`)

      const completion = await openrouter.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 2048,
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
            console.error('[Consultant] OpenRouter stream error:', streamErr)
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
      console.error('[Consultant] OpenRouter/Gemini failed, falling back to DeepSeek:', errMsg)
      // Fall through to DeepSeek fallback
    }
  }

  // ── Fallback: DeepSeek V3 ──────────────────────────────────────────
  if (!DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: 'Serviço de chat indisponível. Tente novamente mais tarde.' },
      { status: 503 },
    )
  }

  // Truncate system prompt for DeepSeek's 64K limit
  const wasTruncated = systemPrompt.length > DEEPSEEK_MAX_CONTEXT
  const dsSystemPrompt = wasTruncated ? smartTruncate(systemPrompt, DEEPSEEK_MAX_CONTEXT) : systemPrompt

  if (wasTruncated) {
    console.log(`[Consultant] DeepSeek fallback — prompt truncated: ${systemPrompt.length} → ${dsSystemPrompt.length} chars`)
  }

  const dsMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: dsSystemPrompt +
        (wasTruncated ? '\n\nNOTA: O contexto foi parcialmente truncado. Responda com base no que está disponível.' : ''),
    },
  ]

  // Keep fewer messages for DeepSeek
  for (const msg of chatMessages.slice(-10)) {
    if (msg.content) dsMessages.push({ role: msg.role, content: msg.content })
  }

  try {
    console.log(`[Consultant] Using DeepSeek V3 fallback — ${dsSystemPrompt.length} chars prompt`)

    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: dsMessages,
      max_tokens: 2048,
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
          console.error('[Consultant] DeepSeek stream error:', err)
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
    console.error('[Consultant] DeepSeek error:', { message: msg })
    return NextResponse.json({ error: `Falha ao processar: ${msg.slice(0, 200)}` }, { status: 500 })
  }
}
