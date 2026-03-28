import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeStatistics, analyzeTrend, type PriceRecord } from '@licitagram/price-history'
import { getPriceHistoryCacheAdapter } from '@/lib/price-history-cache'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Get user's company
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'No company' }, { status: 404 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('palavras_chave, cnae_principal')
      .eq('id', profile.company_id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const keywords = (company.palavras_chave as string[] | null) || []
    const keyword = keywords[0]

    if (!keyword) {
      return NextResponse.json({ error: 'No keywords configured' }, { status: 404 })
    }

    // Check cache (24h)
    const cache = getPriceHistoryCacheAdapter()
    const cacheKey = `segment:${profile.company_id}`
    const cached = await cache.get<{
      median: number
      count: number
      variation_percent: number | undefined
      direction: string
      keyword: string
    }>(cacheKey)

    if (cached) {
      return NextResponse.json(cached)
    }

    // Search price history for the first keyword
    const { data, error } = await supabase
      .from('tenders')
      .select(
        'id, objeto, valor_estimado, valor_homologado, uf, municipio, modalidade_nome, orgao_nome, data_publicacao, data_encerramento, competitors!inner(cnpj, nome, valor_proposta, situacao, porte, uf_fornecedor)',
      )
      .textSearch('objeto', keyword, { type: 'websearch', config: 'portuguese' })
      .not('valor_homologado', 'is', null)
      .order('data_encerramento', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Segment summary error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

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
              supplier_porte: 'N/A',
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

    if (records.length === 0) {
      return NextResponse.json({ error: 'No data for segment' }, { status: 404 })
    }

    const statistics = computeStatistics(records)
    const trend = analyzeTrend(records)

    const summary = {
      median: statistics.median,
      count: statistics.count,
      variation_percent: trend.variation_12m_percent,
      direction: trend.direction,
      keyword,
    }

    // Cache for 24h
    cache.set(cacheKey, summary, 86400).catch(() => {})

    return NextResponse.json(summary)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Segment summary error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
