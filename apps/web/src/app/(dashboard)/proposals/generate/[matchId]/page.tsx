import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProposalWizard } from '@/components/proposals/ProposalWizard'

interface MatchData {
  id: string
  tender_id: string
  tenders: Record<string, unknown> | null
}

export default async function GenerateProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>
  searchParams: Promise<{ proposalId?: string }>
}) {
  const { matchId } = await params
  const { proposalId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) redirect('/company')

  // Fetch company data
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', profile.company_id)
    .single()

  // Fetch match + tender data if a real match ID is provided
  let match: MatchData | null = null
  let tender: Record<string, unknown> | null = null

  if (matchId !== 'new') {
    const { data: matchData } = await supabase
      .from('matches')
      .select('id, tender_id, tenders(*)')
      .eq('id', matchId)
      .single()

    if (matchData) {
      match = matchData as unknown as MatchData
      tender = (matchData.tenders || null) as unknown as Record<string, unknown> | null
    }
  }

  // If editing an existing proposal, fetch it
  let existingProposal: Record<string, unknown> | null = null
  if (proposalId) {
    const { data: p } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single()
    if (p) existingProposal = p
  }

  // Build initial data for wizard
  const initialData = {
    proposalId: existingProposal?.id as string | undefined,
    matchId: match?.id || undefined,
    tenderId: match?.tender_id || (existingProposal?.tender_id as string) || undefined,
    templateType: (existingProposal?.template_type as string) || undefined,
    // Licitacao snapshot — extract numero from pncp_id (format: "CNPJ-ANO-SEQ")
    licitacao: {
      numero: (existingProposal?.licitacao_numero as string)
        || (() => {
          const pncpId = tender?.pncp_id as string || ''
          const parts = pncpId.split('-')
          return parts.length >= 3 ? `${parts[parts.length - 1]}/${parts[parts.length - 2]}` : pncpId
        })(),
      modalidade: (existingProposal?.licitacao_modalidade as string)
        || (tender?.modalidade_nome as string)
        || '',
      uasg: (existingProposal?.licitacao_uasg as string)
        || (tender?.orgao_cnpj as string)
        || '',
      orgao: (existingProposal?.licitacao_orgao as string)
        || (tender?.orgao_nome as string)
        || '',
      objeto: (existingProposal?.licitacao_objeto as string)
        || (tender?.objeto as string)
        || '',
    },
    // Company snapshot
    empresa: {
      razao_social: (existingProposal?.empresa_razao_social as string) || (company?.razao_social as string) || '',
      cnpj: (existingProposal?.empresa_cnpj as string) || (company?.cnpj as string) || '',
      endereco: (existingProposal?.empresa_endereco as string) || (company?.endereco as string) || '',
      cep: (existingProposal?.empresa_cep as string) || (company?.cep as string) || '',
      telefone: (existingProposal?.empresa_telefone as string) || (company?.telefone as string) || '',
      email: (existingProposal?.empresa_email as string) || (company?.email as string) || '',
      banco: (existingProposal?.empresa_banco as string) || (company?.banco as string) || '',
      agencia: (existingProposal?.empresa_agencia as string) || (company?.agencia as string) || '',
      conta: (existingProposal?.empresa_conta as string) || (company?.conta as string) || '',
      representante_nome: (existingProposal?.representante_nome as string) || (company?.representante_nome as string) || '',
      representante_cpf: (existingProposal?.representante_cpf as string) || (company?.representante_cpf as string) || '',
      representante_cargo: (existingProposal?.representante_cargo as string) || (company?.representante_cargo as string) || '',
    },
    // Proposal fields — pre-fill items from tender data
    items: (existingProposal?.items as Array<Record<string, unknown>>)
      || (tender?.objeto ? [{
        item_number: 1,
        description: (tender.objeto as string).slice(0, 500),
        quantity: 1,
        unit: 'unidade',
        unit_price: (tender.valor_estimado as number) || 0,
        total_price: (tender.valor_estimado as number) || 0,
      }] : []),
    valorMensal: (existingProposal?.valor_mensal as number) || undefined,
    valorGlobal: (existingProposal?.valor_global as number) || (tender?.valor_estimado as number) || 0,
    validadeDias: (existingProposal?.validade_dias as number) || 60,
    prazoEntrega: (existingProposal?.prazo_entrega as string) || '30 (trinta) dias corridos',
    declarations: (existingProposal?.declarations as string[]) || ['exequibilidade', 'tributos_inclusos', 'conhecimento_edital', 'validade_proposta'],
    cidade: (existingProposal?.cidade as string) || (company?.municipio as string) || '',
    observacoes: (existingProposal?.observacoes as string) || '',
    status: (existingProposal?.status as string) || 'draft',
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <a href="/proposals" className="text-sm text-gray-400 hover:text-white">
          &larr; Voltar
        </a>
        <h1 className="text-xl sm:text-2xl font-bold flex-1">
          {existingProposal ? 'Editar Proposta' : 'Nova Proposta Comercial'}
        </h1>
      </div>
      <ProposalWizard initialData={initialData} />
    </div>
  )
}
