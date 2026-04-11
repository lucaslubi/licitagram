import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { numberToWordsPtBr } from '@licitagram/proposal-engine'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'

// GET - List proposals for the authenticated user's company
export async function GET(req: NextRequest) {
  const planUser = await getUserWithPlan()
  if (!planUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasActiveSubscription(planUser)) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }

  const supabase = await createClient()
  const user = { id: planUser.userId }

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const tenderId = url.searchParams.get('tender_id')

  try {
    let query = supabase
      .from('proposals')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (tenderId) query = query.eq('tender_id', tenderId)

    const { data: proposals, error } = await query
    if (error) {
      console.error('Proposals query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ proposals: proposals || [] })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Proposals GET error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST - Create a new draft proposal
export async function POST(req: NextRequest) {
  const planUserPost = await getUserWithPlan()
  if (!planUserPost) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasActiveSubscription(planUserPost)) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }

  const supabase = await createClient()
  const user = { id: planUserPost.userId }

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  try {
    const body = await req.json()

    // Auto-calculate valor_global_extenso
    const valorGlobal = Number(body.valor_global) || 0
    const valorGlobalExtenso = valorGlobal > 0 ? numberToWordsPtBr(valorGlobal) : ''

    const { data: proposal, error } = await supabase
      .from('proposals')
      .insert({
        company_id: profile.company_id,
        tender_id: body.tender_id || null,
        match_id: body.match_id || null,
        template_type: body.template_type,
        licitacao_numero: body.licitacao_numero || null,
        licitacao_modalidade: body.licitacao_modalidade || null,
        licitacao_uasg: body.licitacao_uasg || null,
        licitacao_orgao: body.licitacao_orgao || null,
        licitacao_objeto: body.licitacao_objeto || null,
        empresa_razao_social: body.empresa_razao_social || null,
        empresa_cnpj: body.empresa_cnpj || null,
        empresa_endereco: body.empresa_endereco || null,
        empresa_cep: body.empresa_cep || null,
        empresa_telefone: body.empresa_telefone || null,
        empresa_email: body.empresa_email || null,
        empresa_banco: body.empresa_banco || null,
        empresa_agencia: body.empresa_agencia || null,
        empresa_conta: body.empresa_conta || null,
        representante_nome: body.representante_nome || null,
        representante_cpf: body.representante_cpf || null,
        representante_cargo: body.representante_cargo || null,
        items: body.items || [],
        valor_mensal: body.valor_mensal || null,
        valor_global: valorGlobal,
        valor_global_extenso: valorGlobalExtenso,
        validade_dias: body.validade_dias || 60,
        prazo_entrega: body.prazo_entrega || null,
        declarations: body.declarations || ['exequibilidade', 'tributos_inclusos', 'conhecimento_edital', 'validade_proposta'],
        cidade: body.cidade || null,
        observacoes: body.observacoes || null,
        status: body.status || 'draft',
      })
      .select()
      .single()

    if (error) {
      console.error('Proposal insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ proposal })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Proposals POST error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
