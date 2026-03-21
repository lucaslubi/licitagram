/**
 * Certidões — VPS Worker Dispatch + Poll
 *
 * Dispatches certidão jobs to the VPS Puppeteer worker via the
 * certidao_jobs Supabase table and polls for results.
 *
 * The VPS worker runs Puppeteer with CapSolver extension to automatically
 * solve captchas on government sites (TST, Receita Federal, Caixa/FGTS).
 *
 * Flow:
 * 1. Insert row into certidao_jobs with status='pending'
 * 2. VPS worker polls every 15s, picks up job, runs Puppeteer scrapers
 * 3. Worker updates certidao_jobs with status='completed' and result_json
 * 4. This module polls every 2s until complete or timeout
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CertidaoResult } from './certidoes'

export function isAutoSolveAvailable(): boolean {
  return true // VPS worker handles automation
}

/**
 * Dispatch a certidão job to the VPS worker and poll for results.
 *
 * @returns The certidão results from the worker, or empty array on timeout/failure
 */
export async function dispatchAndPollCertidoes(
  supabase: SupabaseClient,
  companyId: string,
  cnpj: string,
  options?: { maxWaitMs?: number; pollIntervalMs?: number },
): Promise<{
  certidoes: CertidaoResult[]
  status: 'completed' | 'failed' | 'timeout'
  error?: string
}> {
  const maxWait = options?.maxWaitMs ?? 100_000
  const pollInterval = options?.pollIntervalMs ?? 2_000

  // 1. Insert pending job
  const { data: job, error: insertErr } = await supabase
    .from('certidao_jobs')
    .insert({
      company_id: companyId,
      cnpj,
      status: 'pending',
      progress: {},
    })
    .select('id')
    .single()

  if (insertErr || !job?.id) {
    console.error('[certidoes-auto] Failed to create job:', insertErr?.message)
    return { certidoes: [], status: 'failed', error: insertErr?.message ?? 'Insert failed' }
  }

  // 2. Poll for results
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval))

    const { data: jobData } = await supabase
      .from('certidao_jobs')
      .select('status, result_json, error_message')
      .eq('id', job.id)
      .single()

    if (jobData?.status === 'completed' && jobData.result_json?.certidoes) {
      return { certidoes: jobData.result_json.certidoes, status: 'completed' }
    }

    if (jobData?.status === 'failed') {
      return {
        certidoes: jobData.result_json?.certidoes ?? [],
        status: 'failed',
        error: jobData.error_message ?? 'Worker failed',
      }
    }
  }

  return { certidoes: [], status: 'timeout', error: 'VPS worker did not respond in time' }
}

/**
 * Legacy compatibility wrapper — used by consultarCertidoes in certidoes.ts
 */
export async function consultarCertidoesAuto(
  cnpj: string,
  _options?: { uf?: string; municipio?: string },
): Promise<{
  certidoes: CertidaoResult[]
  errors: string[]
  autoCount: number
}> {
  // This function cannot dispatch jobs because it doesn't have a Supabase client
  // or company_id. The route.ts handles dispatch directly.
  // Return empty results — the route adds manual fallbacks for missing types.
  return {
    certidoes: [],
    errors: ['Auto dispatch requires Supabase client — use dispatchAndPollCertidoes directly'],
    autoCount: 0,
  }
}
