import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultarCertidoes, isInfoSimplesConfigured } from '@/lib/certidoes'
import type { CertidaoResult } from '@/lib/certidoes'

/**
 * POST /api/certidoes
 *
 * Automatically fetches all available certidões for the authenticated user's company.
 * Saves results to company_documents and returns the consultation result.
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

    if (!isInfoSimplesConfigured()) {
      return NextResponse.json(
        { error: 'Integração com InfoSimples não configurada. Contate o administrador.' },
        { status: 503 },
      )
    }

    // Optional: check which certidões to fetch (default: all)
    const body = await req.json().catch(() => ({}))
    const tipos: string[] | undefined = body.tipos

    // Fetch certidões
    const result = await consultarCertidoes(company.cnpj, {
      uf: company.uf || undefined,
      municipio: company.municipio || undefined,
    })

    result.razao_social = company.razao_social

    // Filter by requested tipos if specified
    let certidoes = result.certidoes
    if (tipos && tipos.length > 0) {
      certidoes = certidoes.filter(c => tipos.includes(c.tipo))
    }

    // Save/update each certidão in company_documents
    const saved: string[] = []
    for (const cert of certidoes) {
      if (cert.situacao === 'error') continue // Don't save errored ones

      const docTipo = cert.tipo
      const descricao = cert.detalhes
      const numero = cert.numero
      const validade = cert.validade
      const arquivoUrl = cert.pdf_url

      // Check if document of this type already exists
      const { data: existing } = await supabase
        .from('company_documents')
        .select('id, validade')
        .eq('company_id', profile.company_id)
        .eq('tipo', docTipo)
        .maybeSingle()

      if (existing) {
        // Update only if new data has a later validity or the existing one is expired
        const existingValidade = existing.validade ? new Date(existing.validade) : new Date(0)
        const newValidade = validade ? new Date(validade) : new Date()

        if (newValidade >= existingValidade) {
          await supabase
            .from('company_documents')
            .update({
              descricao: `[Auto] ${descricao}`,
              numero,
              validade,
              arquivo_url: arquivoUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
          saved.push(docTipo)
        }
      } else {
        // Insert new
        await supabase
          .from('company_documents')
          .insert({
            company_id: profile.company_id,
            tipo: docTipo,
            descricao: `[Auto] ${descricao}`,
            numero,
            validade,
            arquivo_url: arquivoUrl,
          })
        saved.push(docTipo)
      }
    }

    return NextResponse.json({
      success: true,
      consultado_em: result.consultado_em,
      razao_social: result.razao_social,
      certidoes: certidoes.map(({ raw, ...rest }) => rest), // Strip raw data from response
      saved,
      errors: result.errors,
    })
  } catch (err) {
    console.error('[API certidoes] Error:', err)
    return NextResponse.json(
      { error: 'Erro interno ao consultar certidões' },
      { status: 500 },
    )
  }
}
