'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { enqueueDataExport } from '@/lib/queues/data-export-producer'

export type DataExportJob = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired'
  requested_at: string
  completed_at: string | null
  signed_url_expires_at: string | null
  storage_path: string | null
  error: string | null
}

export type RequestDataExportResult =
  | { success: true; jobId: string }
  | { success: false; error: string }

const COOLDOWN_MS = 24 * 60 * 60 * 1000

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function requestDataExport(): Promise<RequestDataExportResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return { success: false, error: 'no_company' }

  const service = getServiceSupabase()

  // Cooldown 24h: bloqueia se houver job nas últimas 24h
  const cutoff = new Date(Date.now() - COOLDOWN_MS).toISOString()
  const { data: recent } = await service
    .from('data_export_jobs')
    .select('id, requested_at')
    .eq('user_id', user.id)
    .gte('requested_at', cutoff)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recent) {
    return { success: false, error: 'cooldown_24h' }
  }

  const { data: jobRow, error: insErr } = await service
    .from('data_export_jobs')
    .insert({
      user_id: user.id,
      company_id: profile.company_id,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insErr || !jobRow) {
    return { success: false, error: insErr?.message || 'insert_failed' }
  }

  try {
    await enqueueDataExport(jobRow.id)
  } catch (err: any) {
    // Marca como failed pra não ficar zumbi e retorna erro amigável
    await service
      .from('data_export_jobs')
      .update({ status: 'failed', error: `enqueue: ${(err?.message || '').slice(0, 200)}` })
      .eq('id', jobRow.id)
    return { success: false, error: 'enqueue_failed' }
  }

  revalidatePath('/conta/privacidade')
  return { success: true, jobId: jobRow.id }
}

export async function listDataExports(limit = 5): Promise<DataExportJob[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const service = getServiceSupabase()
  const { data } = await service
    .from('data_export_jobs')
    .select('id, status, requested_at, completed_at, signed_url_expires_at, storage_path, error')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(limit)

  return (data || []) as DataExportJob[]
}

/**
 * Gera um signed URL fresco para um job concluído (caso o original tenha
 * expirado ou queiramos renovar). Verifica que o job pertence ao user.
 */
export async function getDataExportDownloadUrl(
  jobId: string,
): Promise<{ success: true; url: string; expiresAt: string } | { success: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const service = getServiceSupabase()
  const { data: job } = await service
    .from('data_export_jobs')
    .select('id, user_id, status, storage_path')
    .eq('id', jobId)
    .single()

  if (!job || job.user_id !== user.id) return { success: false, error: 'not_found' }
  if (job.status !== 'completed' || !job.storage_path) {
    return { success: false, error: 'not_ready' }
  }

  const ttlSec = 7 * 24 * 3600
  const { data: signed, error } = await service.storage
    .from('exports')
    .createSignedUrl(job.storage_path, ttlSec)

  if (error || !signed?.signedUrl) {
    return { success: false, error: error?.message || 'sign_failed' }
  }

  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString()
  await service
    .from('data_export_jobs')
    .update({ signed_url_expires_at: expiresAt })
    .eq('id', jobId)

  return { success: true, url: signed.signedUrl, expiresAt }
}
