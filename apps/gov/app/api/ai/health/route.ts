import { NextResponse, type NextRequest } from 'next/server'
import { activeProviders } from '@licitagram/gov-core/ai'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ProviderCheck {
  name: string
  status: 'ok' | 'rate_limit' | 'unauthorized' | 'error'
  latencyMs: number
  detail?: string
}

/**
 * Health check por provider — faz 1 request pequeno a cada um e reporta
 * status. Útil pra diagnosticar "qual provider está falhando" quando o
 * chain dá rate limit.
 *
 * Acesso: GET /api/ai/health (só admin)
 */
export async function GET(_req: NextRequest) {
  const results: ProviderCheck[] = []

  const probes: Array<{
    name: string
    baseUrl: string
    key?: string
    model: string
    extraHeaders?: Record<string, string>
  }> = []

  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
    probes.push({
      name: 'gemini_compat',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      key: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY,
      model: 'gemini-2.5-flash',
    })
  }
  if (process.env.MISTRAL_API_KEY) {
    probes.push({
      name: 'mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      key: process.env.MISTRAL_API_KEY,
      model: 'mistral-small-latest',
    })
  }
  if (process.env.OPENROUTER_API_KEY) {
    const orHeaders = {
      'HTTP-Referer': 'https://gov.licitagram.com',
      'X-Title': 'LicitaGram Gov',
    }
    probes.push({
      name: 'openrouter-gpt-oss-120b',
      baseUrl: 'https://openrouter.ai/api/v1',
      key: process.env.OPENROUTER_API_KEY,
      model: 'openai/gpt-oss-120b:free',
      extraHeaders: orHeaders,
    })
    probes.push({
      name: 'openrouter-nemotron-super',
      baseUrl: 'https://openrouter.ai/api/v1',
      key: process.env.OPENROUTER_API_KEY,
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      extraHeaders: orHeaders,
    })
    probes.push({
      name: 'openrouter-glm-air',
      baseUrl: 'https://openrouter.ai/api/v1',
      key: process.env.OPENROUTER_API_KEY,
      model: 'z-ai/glm-4.5-air:free',
      extraHeaders: orHeaders,
    })
    probes.push({
      name: 'openrouter-llama-free',
      baseUrl: 'https://openrouter.ai/api/v1',
      key: process.env.OPENROUTER_API_KEY,
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      extraHeaders: orHeaders,
    })
  }
  if (process.env.CEREBRAS_API_KEY) {
    probes.push({
      name: 'cerebras',
      baseUrl: 'https://api.cerebras.ai/v1',
      key: process.env.CEREBRAS_API_KEY,
      model: 'llama-3.3-70b',
    })
  }
  if (process.env.GROQ_API_KEY) {
    probes.push({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      key: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
    })
  }

  for (const p of probes) {
    const startedAt = Date.now()
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${p.key}`,
          ...(p.extraHeaders ?? {}),
        },
        body: JSON.stringify({
          model: p.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
          stream: false,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      const latencyMs = Date.now() - startedAt
      if (res.ok) {
        results.push({ name: p.name, status: 'ok', latencyMs, detail: `HTTP 200 · ${p.model}` })
      } else {
        const body = await res.text().catch(() => '')
        const snippet = body.slice(0, 200)
        if (res.status === 429) {
          results.push({ name: p.name, status: 'rate_limit', latencyMs, detail: `HTTP 429 · ${snippet}` })
        } else if (res.status === 401 || res.status === 403) {
          results.push({
            name: p.name,
            status: 'unauthorized',
            latencyMs,
            detail: `HTTP ${res.status} · ${snippet}`,
          })
        } else {
          results.push({
            name: p.name,
            status: 'error',
            latencyMs,
            detail: `HTTP ${res.status} · ${snippet}`,
          })
        }
      }
    } catch (e) {
      results.push({
        name: p.name,
        status: 'error',
        latencyMs: Date.now() - startedAt,
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      })
    }
  }

  const summary = {
    active: activeProviders(),
    total: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    rateLimited: results.filter((r) => r.status === 'rate_limit').length,
    unauthorized: results.filter((r) => r.status === 'unauthorized').length,
    errors: results.filter((r) => r.status === 'error').length,
  }

  return NextResponse.json(
    { summary, results },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
