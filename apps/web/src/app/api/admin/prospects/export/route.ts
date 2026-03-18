import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const user = await getUserWithPlan()
  if (!user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search')
  const uf = searchParams.get('uf')
  const porte = searchParams.get('porte')
  const minParticipacoes = parseInt(searchParams.get('min_participacoes') || '0')
  const sortField = searchParams.get('sort') || 'total_participacoes'
  const sortOrder = searchParams.get('order') === 'asc'

  let query = supabase
    .from('competitor_stats')
    .select('*')
    .order(sortField, { ascending: sortOrder })
    .limit(10000)

  if (search) {
    const s = search.replace(/[^a-zA-Z0-9\s]/g, '')
    query = query.or(`razao_social.ilike.%${s}%,cnpj.ilike.%${s}%`)
  }
  if (uf) query = query.eq('uf', uf)
  if (porte) query = query.eq('porte', porte)
  if (minParticipacoes > 0) query = query.gte('total_participacoes', minParticipacoes)

  const { data: competitors, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build CSV (Excel-compatible with BOM for UTF-8)
  const headers = [
    'CNPJ',
    'Razao Social',
    'Email',
    'Telefone',
    'Porte',
    'UF',
    'Municipio',
    'CNAE Divisao',
    'Natureza Juridica',
    'Total Participacoes',
    'Total Vitorias',
    'Win Rate (%)',
    'Valor Total Ganho (R$)',
    'Desconto Medio (%)',
    'UFs de Atuacao',
    'Modalidades',
    'Orgaos Frequentes',
    'Ultima Participacao',
  ]

  const rows = (competitors || []).map((c) => {
    const ufsAtuacao = Object.keys((c.ufs_atuacao as Record<string, boolean>) || {}).join(', ')
    const modalidades = Object.keys((c.modalidades as Record<string, boolean>) || {}).join(', ')
    const orgaos = Object.keys((c.orgaos_frequentes as Record<string, boolean>) || {}).join(', ')
    const winRate = c.win_rate ? (Number(c.win_rate) * 100).toFixed(1) : '0'
    const descontoMedio = c.desconto_medio ? (Number(c.desconto_medio) * 100).toFixed(1) : '0'
    const valorGanho = Number(c.valor_total_ganho || 0).toFixed(2)
    const ultimaParticipacao = c.ultima_participacao
      ? new Date(c.ultima_participacao).toLocaleDateString('pt-BR')
      : ''

    return [
      c.cnpj,
      (c.razao_social || '').replace(/"/g, '""'),
      c.email || '',
      c.telefone || '',
      c.porte || '',
      c.uf || '',
      c.municipio || '',
      c.cnae_divisao || '',
      c.natureza_juridica || '',
      c.total_participacoes || 0,
      c.total_vitorias || 0,
      winRate,
      valorGanho,
      descontoMedio,
      ufsAtuacao,
      modalidades,
      orgaos,
      ultimaParticipacao,
    ]
  })

  // CSV with BOM for Excel UTF-8 compatibility
  const BOM = '\ufeff'
  const csvContent = BOM + [
    headers.join(';'),
    ...rows.map((row) =>
      row.map((cell) => {
        const str = String(cell)
        // Quote fields that contain semicolons, quotes, or newlines
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return `"${str}"`
        }
        return str
      }).join(';')
    ),
  ].join('\r\n')

  const now = new Date().toISOString().slice(0, 10)
  const filename = `prospectos-concorrentes-${now}.csv`

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
