import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  fetchTCU,
  buildCNDEstadualManual,
  buildCNDTManual,
  buildCNDFederalManual,
  buildFGTSManual,
} from '@/lib/certidoes'
import type { CertidaoResult } from '@/lib/certidoes'

// Vercel Pro: 120s max for waiting on VPS worker captcha solving
export const maxDuration = 120

/**
 * POST /api/certidoes
 *
 * Flow:
 * 1. TCU/CEIS/CNEP — runs inline (instant HTTP call, no captcha)
 * 2. CND Estadual — returns manual link (too many state variations)
 * 3. TST, Receita, FGTS — dispatches job to VPS Puppeteer worker via
 *    certidao_jobs table, then polls for results (max 100s)
 * 4. Returns ALL results together (auto + manual fallbacks for timeouts)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('cnpj, uf, municipio, razao_social')
      .eq('id', profile.company_id)
      .single()

    if (!company?.cnpj) {
      return NextResponse.json({ error: 'CNPJ não cadastrado' }, { status: 400 })
    }

    const cleanCnpj = company.cnpj.replace(/\D/g, '')

    // ── 1. TCU/CEIS/CNEP — sync (instant, no captcha) ──────────────────
    const tcu = await fetchTCU(cleanCnpj)

    // Save TCU result to company_documents
    if (tcu.situacao === 'regular' || tcu.situacao === 'irregular') {
      const { data: existing } = await supabase
        .from('company_documents')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('tipo', 'tcu')
        .maybeSingle()

      const doc = {
        company_id: profile.company_id,
        tipo: 'tcu',
        descricao: `[Auto] ${tcu.detalhes}`,
        numero: tcu.numero,
        validade: tcu.validade,
        arquivo_url: tcu.consulta_url,
        updated_at: new Date().toISOString(),
      }

      if (existing) {
        await supabase.from('company_documents').update(doc).eq('id', existing.id)
      } else {
        await supabase.from('company_documents').insert(doc)
      }
    }

    // ── 2. CND Estadual — always manual ─────────────────────────────────
    const cndEstadual = buildCNDEstadualManual(cleanCnpj, company.uf || undefined)

    // ── 3. Dispatch job to VPS worker for TST + Receita + FGTS ──────────
    const { data: job, error: insertErr } = await supabase
      .from('certidao_jobs')
      .insert({
        company_id: profile.company_id,
        cnpj: cleanCnpj,
        status: 'pending',
        progress: {},
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[API certidoes] Failed to create job:', insertErr.message)
    }

    // ── 4. Poll for VPS worker results (every 2s, max 100s) ─────────────
    // Worker polls certidao_jobs every 15s, then runs 3 scrapers (~30s each)
    // Total expected: ~15s pickup + ~90s scraping = ~105s worst case
    let workerCertidoes: CertidaoResult[] = []
    let jobStatus: 'completed' | 'failed' | 'timeout' = 'timeout'

    if (job?.id) {
      const maxWait = 100_000 // 100s (leaves 20s buffer for maxDuration=120)
      const pollInterval = 2_000
      const start = Date.now()

      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval))

        const { data: jobData } = await supabase
          .from('certidao_jobs')
          .select('status, result_json, error_message')
          .eq('id', job.id)
          .single()

        if (jobData?.status === 'completed' && jobData.result_json?.certidoes) {
          workerCertidoes = jobData.result_json.certidoes
          jobStatus = 'completed'
          break
        }

        if (jobData?.status === 'failed') {
          jobStatus = 'failed'
          console.error('[API certidoes] Worker job failed:', jobData.error_message)
          // Check if there are partial results
          if (jobData.result_json?.certidoes) {
            workerCertidoes = jobData.result_json.certidoes
          }
          break
        }
      }
    }

    // ── 5. Build manual fallbacks for any missing certidão types ────────
    // If the worker didn't return a result for a type, add manual fallback
    const workerTipos = new Set(workerCertidoes.map(c => c.tipo))

    const manualFallbacks: CertidaoResult[] = []
    if (!workerTipos.has('trabalhista')) {
      manualFallbacks.push(buildCNDTManual(cleanCnpj))
    }
    if (!workerTipos.has('cnd_federal')) {
      manualFallbacks.push(buildCNDFederalManual(cleanCnpj))
    }
    if (!workerTipos.has('fgts')) {
      manualFallbacks.push(buildFGTSManual(cleanCnpj))
    }

    // ── 6. Combine ALL results ──────────────────────────────────────────
    const allCertidoes = [tcu, ...workerCertidoes, ...manualFallbacks, cndEstadual]
    const saved = allCertidoes
      .filter(c => c.situacao === 'regular' || c.situacao === 'irregular')
      .map(c => c.tipo)

    return NextResponse.json({
      success: true,
      consultado_em: new Date().toISOString(),
      razao_social: company.razao_social,
      certidoes: allCertidoes,
      saved,
      errors: jobStatus === 'timeout'
        ? ['VPS worker não respondeu a tempo. Certidões com captcha ficaram como link manual.']
        : jobStatus === 'failed'
          ? ['Erro no processamento automático. Certidões com captcha ficaram como link manual.']
          : [],
      jobId: job?.id || null,
      jobStatus,
    })
  } catch (err) {
    console.error('[API certidoes] Error:', err)
    return NextResponse.json(
      { error: 'Erro interno ao consultar certidões' },
      { status: 500 },
    )
  }
}
