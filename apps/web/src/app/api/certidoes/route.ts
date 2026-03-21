import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchTCU, buildCNDEstadualManual, type ConsultaResult } from '@/lib/certidoes'

// TCU check is fast (sync fetch), no need for long timeout
export const maxDuration = 30

/**
 * POST /api/certidoes
 *
 * 1. Runs TCU/CEIS/CNEP check synchronously (instant, no captcha)
 * 2. Enqueues a background job for TST, Receita, FGTS (Puppeteer on VPS)
 * 3. Returns TCU result immediately + jobId for polling
 */
export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Get company data
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

    // 1. TCU/CEIS/CNEP — sync (instant, no captcha)
    const tcu = await fetchTCU(cleanCnpj)

    // Save TCU result if successful
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

    // 2. CND Estadual — always manual
    const cndEstadual = buildCNDEstadualManual(cleanCnpj, company.uf || undefined)

    // 3. Enqueue background job for TST, Receita, FGTS (Puppeteer worker on VPS)
    const body = await req.json().catch(() => ({}))
    const tipos: string[] | undefined = body.tipos

    const { data: job, error: jobError } = await supabase
      .from('certidao_jobs')
      .insert({
        company_id: profile.company_id,
        cnpj: cleanCnpj,
        status: 'pending',
        progress: {},
      })
      .select('id')
      .single()

    if (jobError) {
      console.error('[API certidoes] Failed to create job:', jobError)
    }

    // Build immediate response with TCU + manual links + jobId
    let certidoes = [tcu, cndEstadual]
    if (tipos && tipos.length > 0) {
      certidoes = certidoes.filter(c => tipos.includes(c.tipo))
    }

    return NextResponse.json({
      success: true,
      consultado_em: new Date().toISOString(),
      razao_social: company.razao_social,
      certidoes,
      saved: tcu.situacao !== 'error' && tcu.situacao !== 'manual' ? ['tcu'] : [],
      errors: tcu.situacao === 'error' ? [tcu.detalhes] : [],
      // Async job for TST, Receita, FGTS
      jobId: job?.id || null,
      jobStatus: 'pending',
    })
  } catch (err) {
    console.error('[API certidoes] Error:', err)
    return NextResponse.json(
      { error: 'Erro interno ao consultar certidões' },
      { status: 500 },
    )
  }
}
