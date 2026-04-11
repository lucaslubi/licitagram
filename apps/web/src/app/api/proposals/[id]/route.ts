import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { numberToWordsPtBr } from '@licitagram/proposal-engine'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'

// GET - Return single proposal
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const planUser = await getUserWithPlan()
  if (!planUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasActiveSubscription(planUser)) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }

  const supabase = await createClient()
  const user = { id: planUser.userId }

  const { data: proposal, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  return NextResponse.json({ proposal })
}

// PUT - Update proposal fields
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const planUserPut = await getUserWithPlan()
  if (!planUserPut) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasActiveSubscription(planUserPut)) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }
  const supabase = await createClient()

  try {
    const body = await req.json()

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {}
    const allowedFields = [
      'template_type', 'licitacao_numero', 'licitacao_modalidade', 'licitacao_uasg',
      'licitacao_orgao', 'licitacao_objeto', 'empresa_razao_social', 'empresa_cnpj',
      'empresa_endereco', 'empresa_cep', 'empresa_telefone', 'empresa_email',
      'empresa_banco', 'empresa_agencia', 'empresa_conta', 'representante_nome',
      'representante_cpf', 'representante_cargo', 'items', 'valor_mensal',
      'valor_global', 'validade_dias', 'prazo_entrega', 'declarations',
      'cidade', 'observacoes', 'status', 'notes',
    ]

    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }

    // Recalculate valor_global_extenso if valor_global changes
    if ('valor_global' in body) {
      const valorGlobal = Number(body.valor_global) || 0
      updates.valor_global_extenso = valorGlobal > 0 ? numberToWordsPtBr(valorGlobal) : ''
    }

    updates.updated_at = new Date().toISOString()

    const { data: proposal, error } = await supabase
      .from('proposals')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Proposal update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ proposal })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Proposal PUT error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE - Hard delete if draft, otherwise archive
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const planUserDel = await getUserWithPlan()
  if (!planUserDel) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasActiveSubscription(planUserDel)) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }
  const supabase = await createClient()

  // Get current status
  const { data: proposal } = await supabase
    .from('proposals')
    .select('status')
    .eq('id', id)
    .single()

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  if (proposal.status === 'draft') {
    // Hard delete for drafts
    const { error } = await supabase
      .from('proposals')
      .delete()
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Archive non-drafts
    const { error } = await supabase
      .from('proposals')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
