import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateProposalDocx } from '@licitagram/proposal-engine'
import type { ProposalData, ProposalItem, TemplateType, DeclarationType } from '@licitagram/proposal-engine'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'

export async function POST(
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

  // Get user's company
  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  try {
    // Fetch proposal from DB (RLS ensures ownership)
    const { data: proposal, error: fetchError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    // Build ProposalData from DB fields
    const items: ProposalItem[] = (proposal.items as Array<Record<string, unknown>> || []).map((item, i) => ({
      item_number: (item.item_number as number) || i + 1,
      description: (item.description as string) || '',
      quantity: Number(item.quantity) || 1,
      unit: (item.unit as string) || 'UN',
      unit_price: Number(item.unit_price) || 0,
      total_price: Number(item.total_price) || 0,
      details: (item.details as string) || undefined,
    }))

    const proposalData: ProposalData = {
      licitacao: {
        numero: proposal.licitacao_numero || '',
        modalidade: proposal.licitacao_modalidade || '',
        uasg: proposal.licitacao_uasg || '',
        orgao: proposal.licitacao_orgao || '',
        objeto: proposal.licitacao_objeto || '',
      },
      empresa: {
        razao_social: proposal.empresa_razao_social || '',
        cnpj: proposal.empresa_cnpj || '',
        endereco: proposal.empresa_endereco || '',
        cep: proposal.empresa_cep || '',
        telefone: proposal.empresa_telefone || '',
        email: proposal.empresa_email || '',
        banco: proposal.empresa_banco || '',
        agencia: proposal.empresa_agencia || '',
        conta: proposal.empresa_conta || '',
        representante_nome: proposal.representante_nome || '',
        representante_cpf: proposal.representante_cpf || '',
        representante_cargo: proposal.representante_cargo || '',
      },
      items,
      valor_mensal: proposal.valor_mensal ? Number(proposal.valor_mensal) : undefined,
      valor_global: Number(proposal.valor_global) || 0,
      validade_dias: proposal.validade_dias || 60,
      prazo_entrega: proposal.prazo_entrega || '',
      declarations: (proposal.declarations as DeclarationType[]) || [],
      cidade: proposal.cidade || '',
      data: new Date(),
      observacoes: proposal.observacoes || undefined,
    }

    // Generate DOCX
    const templateType = proposal.template_type as TemplateType
    const result = await generateProposalDocx(proposalData, templateType)

    // Upload to Supabase Storage
    const storagePath = `${profile.company_id}/proposals/${id}/${result.filename}`
    const { error: uploadError } = await supabase.storage
      .from('drive')
      .upload(storagePath, result.buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      })

    if (uploadError) {
      console.error('DOCX upload error:', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Update docx_storage_path in proposals table
    await supabase
      .from('proposals')
      .update({
        docx_storage_path: storagePath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Create signed URL (3600s = 1 hour)
    const { data: signedUrlData, error: signedError } = await supabase.storage
      .from('drive')
      .createSignedUrl(storagePath, 3600)

    if (signedError) {
      console.error('Signed URL error:', signedError)
      return NextResponse.json({ error: signedError.message }, { status: 500 })
    }

    return NextResponse.json({
      url: signedUrlData.signedUrl,
      filename: result.filename,
      storage_path: storagePath,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Generate DOCX error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
