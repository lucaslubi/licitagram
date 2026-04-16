import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/price-history/export-report?q=<query>&format=csv
 *
 * Exports price research report in CSV format.
 * Format compatible with government price reference documentation.
 * Includes: item description, unit price, supplier, source, date, confidence.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Query required' }, { status: 400 })

  const uf = url.searchParams.get('uf') || undefined
  const modalidade = url.searchParams.get('modalidade') || undefined

  try {
    // Fetch all matching tenders with competitors (up to 500 for export)
    let query = supabase
      .from('tenders')
      .select(
        'id, objeto, valor_estimado, valor_homologado, uf, municipio, modalidade_nome, orgao_nome, data_publicacao, data_encerramento, competitors!inner(cnpj, nome, valor_proposta, situacao, porte)',
      )
      .textSearch('objeto', q, { type: 'websearch', config: 'portuguese' })
      .not('valor_homologado', 'is', null)
      .order('data_encerramento', { ascending: false })
      .limit(500)

    if (uf) query = query.eq('uf', uf)
    if (modalidade) query = query.eq('modalidade_nome', modalidade)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Build CSV
    const header = [
      'Item/Objeto',
      'Órgão',
      'UF',
      'Modalidade',
      'Fornecedor',
      'CNPJ Fornecedor',
      'Porte',
      'Valor Proposta (R$)',
      'Valor Estimado (R$)',
      'Valor Homologado (R$)',
      'Situação',
      'Data Encerramento',
      'Fonte',
    ].join(';')

    const rows: string[] = [header]
    const now = new Date().toISOString().split('T')[0]

    for (const tender of data || []) {
      const comps = (tender.competitors || []) as Array<Record<string, unknown>>

      if (comps.length > 0) {
        for (const comp of comps) {
          if (!comp.valor_proposta || (comp.valor_proposta as number) <= 0) continue
          rows.push([
            `"${((tender.objeto as string) || '').replace(/"/g, '""').slice(0, 200)}"`,
            `"${((tender.orgao_nome as string) || '').replace(/"/g, '""')}"`,
            tender.uf || '',
            `"${((tender.modalidade_nome as string) || '').replace(/"/g, '""')}"`,
            `"${((comp.nome as string) || '').replace(/"/g, '""')}"`,
            (comp.cnpj as string) || '',
            (comp.porte as string) || '',
            String(comp.valor_proposta),
            String(tender.valor_estimado || ''),
            String(tender.valor_homologado || ''),
            (comp.situacao as string) || '',
            ((tender.data_encerramento as string) || '').split('T')[0],
            'PNCP',
          ].join(';'))
        }
      } else {
        rows.push([
          `"${((tender.objeto as string) || '').replace(/"/g, '""').slice(0, 200)}"`,
          `"${((tender.orgao_nome as string) || '').replace(/"/g, '""')}"`,
          tender.uf || '',
          `"${((tender.modalidade_nome as string) || '').replace(/"/g, '""')}"`,
          'Vencedor (consolidado)',
          '',
          '',
          String(tender.valor_homologado || ''),
          String(tender.valor_estimado || ''),
          String(tender.valor_homologado || ''),
          'Homologado',
          ((tender.data_encerramento as string) || '').split('T')[0],
          'PNCP',
        ].join(';'))
      }
    }

    // Add metadata footer
    rows.push('')
    rows.push(`"Relatório de Pesquisa de Preços — Licitagram"`)
    rows.push(`"Pesquisa: ${q}"`)
    rows.push(`"Data de geração: ${now}"`)
    rows.push(`"Total de registros: ${rows.length - 2}"`)
    rows.push(`"Fonte primária: Portal Nacional de Contratações Públicas (PNCP)"`)
    rows.push(`"Metodologia: Busca textual por objeto em licitações homologadas com dados de propostas de fornecedores"`)

    const csv = '\uFEFF' + rows.join('\n') // BOM for Excel UTF-8

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pesquisa-precos-${q.replace(/\s+/g, '-').slice(0, 30)}-${now}.csv"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
