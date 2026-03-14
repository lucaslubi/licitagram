import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  // Auth + plan check
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasFeature(userCtx, 'export_excel')) {
    return NextResponse.json(
      { error: 'Exportação Excel disponível apenas para planos pagos. Faça upgrade do seu plano.' },
      { status: 403 },
    )
  }

  // Rate limiting: 5 exports per minute
  const rateCheck = await checkRateLimit(`export:${userCtx.userId}`, 5, 60)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Limite de exportações atingido. Tente novamente em ${rateCheck.retryAfter}s.` },
      { status: 429 },
    )
  }

  const supabase = await createClient()

  const { searchParams } = request.nextUrl
  const view = searchParams.get('view') || 'tenders'
  const uf = searchParams.get('uf') || ''
  const modalidade = searchParams.get('modalidade') || ''
  const fonte = searchParams.get('fonte') || ''
  const scoreMin = parseInt(searchParams.get('score_min') || '') || 0

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', userCtx.userId)
    .single()

  let rows: Record<string, unknown>[] = []

  if (view === 'matches' && profile?.company_id) {
    let query = supabase
      .from('matches')
      .select(`
        id, score, status, recomendacao,
        tenders!inner(
          objeto, orgao_nome, uf, valor_estimado, data_abertura,
          data_publicacao, modalidade_nome, source
        )
      `)
      .eq('company_id', profile.company_id)
      .gte('score', scoreMin || 45)
      .order('score', { ascending: false })
      .limit(500)

    if (uf) query = query.eq('tenders.uf', uf)
    if (modalidade) query = query.eq('tenders.modalidade_id', parseInt(modalidade))
    if (fonte) query = query.eq('tenders.source', fonte)

    const { data } = await query

    rows = (data || []).map((m) => {
      const t = m.tenders as unknown as Record<string, unknown>
      return {
        'Score': m.score,
        'Recomendacao': m.recomendacao || '-',
        'Status': m.status,
        'Objeto': t?.objeto || '',
        'Orgao': t?.orgao_nome || '',
        'UF': t?.uf || '',
        'Valor Estimado': t?.valor_estimado || '',
        'Data Abertura': t?.data_abertura || '',
        'Data Publicacao': t?.data_publicacao || '',
        'Modalidade': t?.modalidade_nome || '',
        'Fonte': t?.source || 'pncp',
      }
    })
  } else {
    let query = supabase
      .from('tenders')
      .select('objeto, orgao_nome, uf, valor_estimado, data_abertura, data_publicacao, modalidade_nome, status, source')
      .order('data_publicacao', { ascending: false })
      .limit(500)

    if (uf) query = query.eq('uf', uf)
    if (modalidade) query = query.eq('modalidade_id', parseInt(modalidade))
    if (fonte) query = query.eq('source', fonte)

    const { data } = await query

    rows = (data || []).map((t) => ({
      'Objeto': t.objeto || '',
      'Orgao': t.orgao_nome || '',
      'UF': t.uf || '',
      'Valor Estimado': t.valor_estimado || '',
      'Data Abertura': t.data_abertura || '',
      'Data Publicacao': t.data_publicacao || '',
      'Modalidade': t.modalidade_nome || '',
      'Status': t.status || '',
      'Fonte': t.source || 'pncp',
    }))
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nenhum dado encontrado para exportar' }, { status: 404 })
  }

  try {
    // Create Excel
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, view === 'matches' ? 'Matches' : 'Licitacoes')

    // Auto column width
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, 15),
    }))
    ws['!cols'] = colWidths

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="licitagram-${view}-${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao gerar Excel' }, { status: 500 })
  }
}
