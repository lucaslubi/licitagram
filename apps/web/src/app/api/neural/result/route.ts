import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

/**
 * GET /api/neural/result?type=fraud&id=xxx
 * GET /api/neural/result?type=price&id=xxx
 * Returns the full neural analysis result including graph data for D3 visualization.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const id = searchParams.get('id')

    if (!type || !id) {
      return NextResponse.json({ error: 'type and id required' }, { status: 400 })
    }

    const supabase = await createClient()

    if (type === 'fraud') {
      const { data, error } = await supabase
        .from('mirofish_fraud_analysis')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
      }

      return NextResponse.json({ analysis: data })
    }

    if (type === 'price') {
      const { data, error } = await supabase
        .from('mirofish_price_predictions')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Prediction not found' }, { status: 404 })
      }

      return NextResponse.json({ prediction: data })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[neural/result]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
