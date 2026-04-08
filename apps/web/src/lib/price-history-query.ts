import { SupabaseClient } from '@supabase/supabase-js'

export async function fetchTendersWithBids(
  supabase: SupabaseClient,
  params: { p_query: string, p_uf: string | null, p_modalidade: string | null, p_date_from: string | null, p_date_to: string | null, p_limit: number }
): Promise<any[]> {
  let queryBuilder = supabase
    .from('tenders')
    .select('id, objeto, valor_estimado, uf, orgao_nome, modalidade_nome, data_encerramento, data_publicacao')
    .textSearch('objeto', params.p_query, { type: 'websearch', config: 'portuguese' })
    .order('data_encerramento', { ascending: false, nullsFirst: false })
    .limit(params.p_limit || 20)

  if (params.p_uf) queryBuilder = queryBuilder.eq('uf', params.p_uf)
  if (params.p_modalidade) queryBuilder = queryBuilder.eq('modalidade_nome', params.p_modalidade)
  if (params.p_date_from) queryBuilder = queryBuilder.gte('data_encerramento', params.p_date_from)
  if (params.p_date_to) queryBuilder = queryBuilder.lte('data_encerramento', params.p_date_to)

  const { data: tendersData, error: tendersError } = await queryBuilder

  if (tendersError) throw new Error(tendersError.message)
  if (!tendersData || tendersData.length === 0) return []

  const tenderIds = tendersData.map(t => t.id)
  
  // Try selecting porte, if it fails it means the schema missed it, but it should be there.
  const { data: competitorsData, error: compsError } = await supabase
    .from('competitors')
    .select('tender_id, valor_proposta, situacao, nome, cnpj, porte')
    .in('tender_id', tenderIds)
    .gt('valor_proposta', 0)

  if (compsError) {
    // Fallback if porte column is the problem
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('competitors')
      .select('tender_id, valor_proposta, situacao, nome, cnpj')
      .in('tender_id', tenderIds)
      .gt('valor_proposta', 0)

    if (fallbackError) throw new Error(fallbackError.message)
    
    return (fallbackData || []).map(comp => {
      const t = tendersData.find(x => x.id === comp.tender_id)
      return {
        tender_id: comp.tender_id,
        objeto: t?.objeto,
        valor_proposta: comp.valor_proposta,
        valor_estimado: t?.valor_estimado,
        situacao: comp.situacao,
        uf: t?.uf,
        nome: comp.nome,
        cnpj: comp.cnpj,
        porte: 'N/A',
        orgao_nome: t?.orgao_nome,
        modalidade_nome: t?.modalidade_nome,
        data_encerramento: t?.data_encerramento,
        data_publicacao: t?.data_publicacao,
        num_competitors: (fallbackData || []).filter(c => c.tender_id === comp.tender_id).length
      }
    })
  }

  return (competitorsData || []).map(comp => {
    const t = tendersData.find(x => x.id === comp.tender_id)
    return {
      tender_id: comp.tender_id,
      objeto: t?.objeto,
      valor_proposta: comp.valor_proposta,
      valor_estimado: t?.valor_estimado,
      situacao: comp.situacao,
      uf: t?.uf,
      nome: comp.nome,
      cnpj: comp.cnpj,
      porte: comp.porte || 'N/A',
      orgao_nome: t?.orgao_nome,
      modalidade_nome: t?.modalidade_nome,
      data_encerramento: t?.data_encerramento,
      data_publicacao: t?.data_publicacao,
      num_competitors: (competitorsData || []).filter(c => c.tender_id === comp.tender_id).length
    }
  })
}
