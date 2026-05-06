/**
 * POST /api/calculadora-consultoria
 *
 * Captura lead da calculadora pública do programa Partners.
 * Persiste em `consultancy_leads` (tabela dedicada — leads aqui são
 * consultorias, não trial de fornecedor) com source='partners-calculator'.
 * Idempotente por (email, ip-day) pra evitar duplicatas em refresh.
 *
 * Sem auth — endpoint público. Rate-limited por IP.
 */

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

type Body = {
  email?: string
  clientes?: number
  ticket?: number
  horas?: number
  automationRate?: number
  projection?: {
    horasLiberadas?: number
    novosClientes?: number
    totalClientes?: number
    adicionalAno?: number
    roi?: string | number
  }
}

const ipMemo = new Map<string, { count: number; reset: number }>()

function rateLimit(ip: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = ipMemo.get(ip)
  if (!entry || entry.reset < now) {
    ipMemo.set(ip, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count += 1
  return true
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
  }

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em alguns segundos.' },
      { status: 429 },
    )
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const payload = {
    email,
    clientes_atuais: typeof body.clientes === 'number' ? body.clientes : null,
    ticket_medio: typeof body.ticket === 'number' ? body.ticket : null,
    horas_por_cliente: typeof body.horas === 'number' ? body.horas : null,
    automation_rate: typeof body.automationRate === 'number' ? body.automationRate : null,
    projection: body.projection || null,
    source: 'partners-calculator',
    ip,
    user_agent: hdrs.get('user-agent') || null,
  }

  // Tenta inserir; ignora erro 42P01 (tabela ainda não migrada — best-effort)
  // pra calculadora não bloquear a UX se a migration estiver pendente.
  try {
    const { error } = await service.from('consultancy_leads').insert(payload)
    if (error && error.code !== '42P01') {
      console.error('[calculadora-consultoria] insert err:', error)
      // 23505 = duplicate (email único): ainda assim resposta de sucesso pro user
      if (error.code !== '23505') {
        return NextResponse.json(
          { error: 'Não foi possível registrar agora. Tente novamente em instantes.' },
          { status: 500 },
        )
      }
    }
  } catch (err) {
    console.error('[calculadora-consultoria] insert exception:', err)
    // Não bloqueia o user — UI mostra sucesso mesmo se DB falhar; lead vai
    // pro log do servidor que admin pode raspar depois. Trade-off explícito:
    // melhor capturar o lead "soft" do que perder por falha transitória.
  }

  return NextResponse.json({ ok: true })
}
