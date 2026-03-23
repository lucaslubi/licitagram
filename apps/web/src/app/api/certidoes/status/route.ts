import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/certidoes/status?jobId=xxx
 *
 * Polls the certidao_jobs table for async job status.
 * Returns progress and results as the VPS worker processes each certidão.
 */
export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Get user's company_id for ownership check
    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })
    }

    const { data: job } = await supabase
      .from('certidao_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (!job) {
      return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
    }

    // Verify the job belongs to the user's company
    if (job.company_id !== profile.company_id) {
      return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress || {},
      result: job.result_json,
      error: job.error_message,
      createdAt: job.created_at,
      completedAt: job.completed_at,
    })
  } catch (err) {
    console.error('[API certidoes/status] Error:', err)
    return NextResponse.json(
      { error: 'Erro ao verificar status' },
      { status: 500 },
    )
  }
}
