import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

export const maxDuration = 60

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * POST /api/neural/analyze
 *
 * SYNCHRONOUS approach: triggers MiroFish via VPS, waits for completion
 * (up to 45s), then returns the result directly. No polling needed.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!hasFeature(user, 'competitive_intel') && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Recurso disponivel no plano Enterprise' }, { status: 403 })
    }

    const body = await request.json()
    const { type, tenderId, queryHash } = body as {
      type: 'fraud' | 'price'
      tenderId?: string
      queryHash?: string
    }

    if (!type || !['fraud', 'price'].includes(type)) {
      return NextResponse.json({ error: 'type must be fraud or price' }, { status: 400 })
    }

    if (!user.companyId) {
      return NextResponse.json({ error: 'Empresa nao vinculada ao perfil' }, { status: 400 })
    }

    const serviceSupabase = getServiceSupabase()
    const VPS_URL = process.env.VPS_MONITORING_URL || 'http://85.31.60.53:3998'

    // ── FRAUD ──────────────────────────────────────────────────────────
    if (type === 'fraud') {
      if (!tenderId) return NextResponse.json({ error: 'tenderId required' }, { status: 400 })

      // Check cache
      const { data: existing } = await serviceSupabase
        .from('mirofish_fraud_analysis')
        .select('*')
        .eq('tender_id', tenderId)
        .eq('company_id', user.companyId)
        .maybeSingle()

      if (existing && existing.status === 'completed') {
        return NextResponse.json({ analysis: existing, cached: true })
      }

      // Create record
      const { data: record } = await serviceSupabase
        .from('mirofish_fraud_analysis')
        .insert({ tender_id: tenderId, company_id: user.companyId, status: 'pending' })
        .select('id')
        .single()

      if (!record) {
        // Conflict — fetch existing
        const { data: ex } = await serviceSupabase
          .from('mirofish_fraud_analysis')
          .select('*')
          .eq('tender_id', tenderId)
          .eq('company_id', user.companyId)
          .single()
        if (ex?.status === 'completed') return NextResponse.json({ analysis: ex, cached: true })
      }

      const analysisId = record?.id

      // Trigger VPS and WAIT for result
      try {
        await fetch(`${VPS_URL}/trigger-neural`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'fraud', analysisId, tenderId, companyId: user.companyId }),
          signal: AbortSignal.timeout(10000),
        })
      } catch {}

      // Poll Supabase for result (up to 45s)
      for (let i = 0; i < 22; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const { data: result } = await serviceSupabase
          .from('mirofish_fraud_analysis')
          .select('*')
          .eq('id', analysisId)
          .single()

        if (result?.status === 'completed') {
          return NextResponse.json({ analysis: result, cached: false })
        }
        if (result?.status === 'failed') {
          return NextResponse.json({ error: result.error_message || 'Analise falhou' }, { status: 500 })
        }
      }

      return NextResponse.json({ error: 'Timeout — analise demorou mais que o esperado' }, { status: 504 })
    }

    // ── PRICE ──────────────────────────────────────────────────────────
    if (type === 'price') {
      if (!queryHash) return NextResponse.json({ error: 'queryHash required' }, { status: 400 })

      // Check cache
      const { data: existing } = await serviceSupabase
        .from('mirofish_price_predictions')
        .select('*')
        .eq('query_hash', queryHash)
        .eq('company_id', user.companyId)
        .maybeSingle()

      if (existing && existing.status === 'completed') {
        return NextResponse.json({ prediction: existing, cached: true })
      }

      // Create record
      const { data: record } = await serviceSupabase
        .from('mirofish_price_predictions')
        .insert({
          query_hash: queryHash,
          company_id: user.companyId,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single()

      if (!record) {
        const { data: ex } = await serviceSupabase
          .from('mirofish_price_predictions')
          .select('*')
          .eq('query_hash', queryHash)
          .eq('company_id', user.companyId)
          .single()
        if (ex?.status === 'completed') return NextResponse.json({ prediction: ex, cached: true })
      }

      const predictionId = record?.id

      // Trigger VPS and WAIT
      try {
        await fetch(`${VPS_URL}/trigger-neural`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'price', analysisId: predictionId, queryHash, companyId: user.companyId }),
          signal: AbortSignal.timeout(10000),
        })
      } catch {}

      // Poll for result (up to 45s)
      for (let i = 0; i < 22; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const { data: result } = await serviceSupabase
          .from('mirofish_price_predictions')
          .select('*')
          .eq('id', predictionId)
          .single()

        if (result?.status === 'completed') {
          return NextResponse.json({ prediction: result, cached: false })
        }
        if (result?.status === 'failed') {
          return NextResponse.json({ error: result.error_message || 'Analise falhou' }, { status: 500 })
        }
      }

      return NextResponse.json({ error: 'Timeout — analise demorou mais que o esperado' }, { status: 504 })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[neural/analyze]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
