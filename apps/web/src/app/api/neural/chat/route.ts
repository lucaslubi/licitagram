import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

export const maxDuration = 30

const MIROFISH_URL = process.env.MIROFISH_URL || 'http://85.31.60.53:5001'

/**
 * POST /api/neural/chat
 * Interactive chat with MiroFish report agent about an analysis.
 * Body: { simulationId: string, message: string, history?: Array<{role, content}> }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!hasFeature(user, 'chat_ia') && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Recurso disponivel no plano Profissional ou Enterprise' }, { status: 403 })
    }

    const body = await request.json()
    const { simulationId, message, history } = body as {
      simulationId: string
      message: string
      history?: Array<{ role: string; content: string }>
    }

    if (!simulationId || !message) {
      return NextResponse.json({ error: 'simulationId and message required' }, { status: 400 })
    }

    // Forward to MiroFish report chat endpoint
    const res = await fetch(`${MIROFISH_URL}/api/report/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulation_id: simulationId,
        message,
        chat_history: history || [],
      }),
      signal: AbortSignal.timeout(25_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `MiroFish error: ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({
      response: data.data?.response || 'Sem resposta do agente.',
      sources: data.data?.sources || [],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[neural/chat]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
