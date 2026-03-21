import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchTCU, buildCNDEstadualManual } from '@/lib/certidoes'
import { fetchCNDFederalAuto, fetchCNDTAuto, fetchFGTSAuto } from '@/lib/certidoes-auto'

// Worker needs time to process captchas
export const maxDuration = 120

/**
 * POST /api/certidoes
 *
 * 1. Runs TCU/CEIS/CNEP check synchronously
 * 2. Creates job for VPS worker (TST, Receita, FGTS)
 * 3. Polls job until complete (max 90s)
 * 4. Returns ALL results together
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

    // 1. TCU/CEIS/CNEP — sync (instant)
    const tcu = await fetchTCU(cleanCnpj)

    // Save TCU
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

    // 2. CND Estadual — manual
    const cndEstadual = buildCNDEstadualManual(cleanCnpj, company.uf || undefined)

    // 3. Create job for VPS worker
    const { data: job } = await supabase
      .from('certidao_jobs')
      .insert({
        company_id: profile.company_id,
        cnpj: cleanCnpj,
        status: 'pending',
        progress: {},
      })
      .select('id')
      .single()

    // 4. Wait for VPS worker to complete (poll every 3s, max 90s)
    let workerCertidoes: Array<{ tipo: string; label: string; situacao: string; detalhes: string; numero: string | null; emissao: string | null; validade: string | null; pdf_url: string | null; consulta_url: string | null }> = []

    if (job?.id) {
      const maxWait = 90_000
      const pollInterval = 3_000
      const start = Date.now()

      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval))

        const { data: jobData } = await supabase
          .from('certidao_jobs')
          .select('status, result_json')
          .eq('id', job.id)
          .single()

        if (jobData?.status === 'completed' && jobData.result_json?.certidoes) {
          workerCertidoes = jobData.result_json.certidoes
          break
        }
        if (jobData?.status === 'failed') {
          break
        }
      }
    }

    // 5. Combine ALL results
    const allCertidoes = [tcu, ...workerCertidoes, cndEstadual]
    const saved = allCertidoes
      .filter(c => c.situacao === 'regular' || c.situacao === 'irregular')
      .map(c => c.tipo)

    return NextResponse.json({
      success: true,
      consultado_em: new Date().toISOString(),
      razao_social: company.razao_social,
      certidoes: allCertidoes,
      saved,
      errors: [],
      jobId: job?.id || null,
      jobStatus: 'completed',
    })
  } catch (err) {
    console.error('[API certidoes] Error:', err)
    return NextResponse.json(
      { error: 'Erro interno ao consultar certidões' },
      { status: 500 },
    )
  }
}
