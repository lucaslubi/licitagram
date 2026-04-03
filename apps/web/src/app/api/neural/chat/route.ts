import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

export const maxDuration = 30

const MIROFISH_URL = process.env.MIROFISH_URL || 'http://85.31.60.53:5001'

/**
 * POST /api/neural/chat
 * Interactive chat about a neural analysis.
 * Body: { message, context?, simulationId?, history? }
 *
 * Works with or without simulationId:
 * - With simulationId: uses Zep memory for context
 * - Without: uses the provided context string
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!hasFeature(user, 'chat_ia') && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Recurso disponivel no plano Profissional ou Enterprise' }, { status: 403 })
    }

    const body = await request.json()
    const { message, context, simulationId, history } = body as {
      message: string
      context?: string
      simulationId?: string
      history?: Array<{ role: string; content: string }>
    }

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    const res = await fetch(`${MIROFISH_URL}/api/report/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulation_id: simulationId || '',
        message,
        context: context || '',
        chat_history: history || [],
      }),
      signal: AbortSignal.timeout(25_000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Erro do servidor de analise: ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({
      response: data.data?.response || 'Sem resposta.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[neural/chat]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
