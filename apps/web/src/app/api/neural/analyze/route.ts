import { createClient } from '@/lib/supabase/server'
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

const MIROFISH_URL = process.env.MIROFISH_URL || 'http://85.31.60.53:5001'

/**
 * POST /api/neural/analyze
 * Triggers a MiroFish neural analysis on demand.
 * Body: { type: 'fraud' | 'price', tenderId?: string, queryHash?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Neural analysis requires Enterprise plan
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

    const serviceSupabase = getServiceSupabase()

    if (type === 'fraud') {
      if (!tenderId) return NextResponse.json({ error: 'tenderId required for fraud analysis' }, { status: 400 })

      // Check if analysis already exists (cached)
      const { data: existing } = await serviceSupabase
        .from('mirofish_fraud_analysis')
        .select('id, status, risk_score, completed_at')
        .eq('tender_id', tenderId)
        .eq('company_id', user.companyId)
        .maybeSingle()

      if (existing && existing.status === 'completed') {
        return NextResponse.json({ id: existing.id, cached: true, status: 'completed' })
      }

      if (existing && existing.status === 'processing') {
        return NextResponse.json({ id: existing.id, cached: false, status: 'processing' })
      }

      // Create pending analysis record
      const { data: analysis, error: insertErr } = await serviceSupabase
        .from('mirofish_fraud_analysis')
        .upsert({
          tender_id: tenderId,
          company_id: user.companyId,
          status: 'pending',
        }, { onConflict: 'tender_id,company_id' })
        .select('id')
        .single()

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      // Trigger VPS worker to run MiroFish analysis (await to ensure delivery)
      const VPS_URL = process.env.VPS_MONITORING_URL || 'http://85.31.60.53:3998'
      try {
        await fetch(`${VPS_URL}/trigger-neural`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'fraud', analysisId: analysis.id, tenderId, companyId: user.companyId }),
          signal: AbortSignal.timeout(10000),
        })
      } catch (triggerErr) {
        console.error('[neural/analyze] Trigger failed:', triggerErr)
      }

      return NextResponse.json({ id: analysis.id, cached: false, status: 'pending' })
    }

    if (type === 'price') {
      if (!queryHash) return NextResponse.json({ error: 'queryHash required for price analysis' }, { status: 400 })

      // Check cache (7-day TTL)
      const { data: existing } = await serviceSupabase
        .from('mirofish_price_predictions')
        .select('id, status, completed_at, expires_at')
        .eq('query_hash', queryHash)
        .eq('company_id', user.companyId)
        .maybeSingle()

      if (existing && existing.status === 'completed' && existing.expires_at && new Date(existing.expires_at) > new Date()) {
        return NextResponse.json({ id: existing.id, cached: true, status: 'completed' })
      }

      // Create pending prediction record
      const { data: prediction, error: insertErr } = await serviceSupabase
        .from('mirofish_price_predictions')
        .upsert({
          query_hash: queryHash,
          company_id: user.companyId,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'query_hash,company_id' })
        .select('id')
        .single()

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      // Trigger VPS worker (await to ensure delivery)
      const VPS_URL = process.env.VPS_MONITORING_URL || 'http://85.31.60.53:3998'
      try {
        await fetch(`${VPS_URL}/trigger-neural`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'price', analysisId: prediction.id, queryHash, companyId: user.companyId }),
          signal: AbortSignal.timeout(10000),
        })
      } catch (triggerErr) {
        console.error('[neural/analyze] Price trigger failed:', triggerErr)
      }

      return NextResponse.json({ id: prediction.id, cached: false, status: 'pending' })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[neural/analyze]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
