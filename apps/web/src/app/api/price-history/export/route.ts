import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  computeStatistics,
  analyzeTrend,
  formatAsCSV,
  type PriceRecord,
  type PriceSearchResult,
  type PriceSearchQuery,
} from '@licitagram/price-history'

const MAX_EXPORT = 5000

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const q = body.query?.trim()
    const format = body.format || 'csv'

    if (!q || q.length < 3) {
      return NextResponse.json(
        { error: 'Query must be at least 3 characters' },
        { status: 400 },
      )
    }

    // Build query — same as search but no pagination, limit MAX_EXPORT
    let query = supabase
      .from('tenders')
      .select(
        'id, objeto, valor_estimado, valor_homologado, uf, municipio, modalidade_nome, orgao_nome, data_publicacao, data_encerramento, competitors!inner(cnpj, nome, valor_proposta, situacao, porte, uf_fornecedor)',
      )
      .textSearch('objeto', q, { type: 'websearch', config: 'portuguese' })
      .not('valor_homologado', 'is', null)
      .order('data_encerramento', { ascending: false })
      .limit(MAX_EXPORT)

    if (body.uf) query = query.eq('uf', body.uf.toUpperCase())
    if (body.modalidade) query = query.eq('modalidade_nome', body.modalidade)
    if (body.date_from) query = query.gte('data_encerramento', body.date_from)
    if (body.date_to) query = query.lte('data_encerramento', body.date_to)

    const { data, error } = await query

    if (error) {
      console.error('Price history export error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform to PriceRecord[]
    const records: PriceRecord[] = []
    if (data) {
      for (const tender of data) {
        const competitors = (tender.competitors || []) as Array<{
          cnpj: string | null
          nome: string | null
          valor_proposta: number | null
          situacao: string | null
          porte: string | null
          uf_fornecedor: string | null
        }>

        if (competitors.length > 0) {
          for (const comp of competitors) {
            if (!comp.valor_proposta || comp.valor_proposta <= 0) continue
            records.push({
              id: `${tender.id}-${comp.cnpj || 'unknown'}`,
              licitacao_id: tender.id,
              licitacao_numero: tender.id,
              licitacao_modalidade: tender.modalidade_nome || 'N/I',
              orgao_nome: tender.orgao_nome || 'N/I',
              orgao_uf: tender.uf || '',
              orgao_municipio: tender.municipio || '',
              fonte: 'pncp',
              item_description: tender.objeto || '',
              item_unit: 'SV',
              item_quantity: 1,
              unit_price: comp.valor_proposta,
              total_price: comp.valor_proposta,
              supplier_name: comp.nome || 'N/I',
              supplier_cnpj: comp.cnpj || '',
              supplier_uf: comp.uf_fornecedor || '',
              supplier_porte: mapPorte(comp.porte),
              date_homologation: new Date(tender.data_encerramento || tender.data_publicacao || Date.now()),
              date_opening: new Date(tender.data_publicacao || Date.now()),
              is_valid: true,
              confidence_score: 1,
            })
          }
        } else {
          records.push({
            id: tender.id,
            licitacao_id: tender.id,
            licitacao_numero: tender.id,
            licitacao_modalidade: tender.modalidade_nome || 'N/I',
            orgao_nome: tender.orgao_nome || 'N/I',
            orgao_uf: tender.uf || '',
            orgao_municipio: tender.municipio || '',
            fonte: 'pncp',
            item_description: tender.objeto || '',
            item_unit: 'SV',
            item_quantity: 1,
            unit_price: tender.valor_homologado as number,
            total_price: tender.valor_homologado as number,
            supplier_name: 'N/I',
            supplier_cnpj: '',
            supplier_uf: '',
            supplier_porte: 'N/A',
            date_homologation: new Date(tender.data_encerramento || tender.data_publicacao || Date.now()),
            date_opening: new Date(tender.data_publicacao || Date.now()),
            is_valid: true,
            confidence_score: 0.7,
          })
        }
      }
    }

    const statistics = computeStatistics(records)
    const trend = analyzeTrend(records)

    const searchQuery: PriceSearchQuery = {
      query: q,
      uf: body.uf,
      modalidade: body.modalidade,
      date_from: body.date_from ? new Date(body.date_from) : undefined,
      date_to: body.date_to ? new Date(body.date_to) : undefined,
    }

    const result: PriceSearchResult = {
      records,
      statistics,
      trend,
      total_count: records.length,
      page: 1,
      page_size: records.length,
      query: searchQuery,
    }

    if (format === 'csv') {
      const csv = formatAsCSV(result)
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="precos-mercado-${q.replace(/\s+/g, '-').substring(0, 30)}.csv"`,
        },
      })
    }

    // Default: return JSON
    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Price history export error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function mapPorte(porte: string | null | undefined): PriceRecord['supplier_porte'] {
  if (!porte) return 'N/A'
  const upper = porte.toUpperCase()
  if (upper.includes('ME') && !upper.includes('MEDIO')) return 'ME'
  if (upper.includes('EPP')) return 'EPP'
  if (upper.includes('MEDIO') || upper.includes('MÉDIA')) return 'MEDIO'
  if (upper.includes('GRANDE')) return 'GRANDE'
  return 'N/A'
}
