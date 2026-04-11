import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProposalWizard } from '@/components/proposals/ProposalWizard'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

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
  const planUser = await getUserWithPlan()
  if (!planUser) redirect('/login')
  if (!hasFeature(planUser, 'proposal_generator')) {
    redirect('/billing?upgrade=true')
  }

  const supabase = await createClient()
  const user = { id: planUser.userId }

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

  // Fetch real tender items
  let tenderItems: any[] = []
  if (tender?.id) {
    const { data: items } = await supabase
      .from('tender_items')
      .select('*')
      .eq('tender_id', tender.id)
      .order('numero_item', { ascending: true })
    if (items) tenderItems = items
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

  // Auto-detect template type from tender object
  function suggestTemplate(): string {
    const objeto = ((tender?.objeto as string) || '').toLowerCase()
    const ticKeywords = ['software', 'saas', 'licença', 'licenca', 'subscrição', 'subscricao',
      'nuvem', 'cloud', 'sistema', 'plataforma digital', 'assinatura', 'informatiza', 'tic ',
      'solução tecnológica', 'solucao tecnologica']
    if (ticKeywords.some(k => objeto.includes(k))) return 'tic_saas'
    const servicosKeywords = ['limpeza', 'vigilância', 'vigilancia', 'manutenção predial',
      'manutencao predial', 'terceirização', 'terceirizacao', 'prestação de serviço continuado',
      'postos de trabalho', 'serviço continuado', 'locação de mão de obra', 'locacao de mao de obra']
    if (servicosKeywords.some(k => objeto.includes(k))) return 'servicos'
    return 'bens'
  }

  // Build initial data for wizard
  const initialData = {
    proposalId: existingProposal?.id as string | undefined,
    matchId: match?.id || undefined,
    tenderId: match?.tender_id || (existingProposal?.tender_id as string) || undefined,
    templateType: (existingProposal?.template_type as string) || suggestTemplate(),
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
    // Proposal fields — pre-fill items from real tender items if available
    items: (existingProposal?.items as Array<Record<string, unknown>>)
      || (tenderItems.length > 0
        ? tenderItems.map(item => ({
            item_number: Number(item.numero_item) || 1,
            description: item.descricao_completa || item.descricao || '',
            quantity: Number(item.quantidade) || 1,
            unit: item.unidade_medida || item.unidade || 'unidade',
            unit_price: Number(item.valor_unitario_estimado) || Number(item.valor_estimado) || 0,
            total_price: Number(item.valor_total_estimado) || 0,
          }))
        : (tender?.objeto ? [{
            item_number: 1,
            description: (tender.objeto as string).slice(0, 500),
            quantity: 1,
            unit: 'unidade',
            unit_price: (tender.valor_estimado as number) || 0,
            total_price: (tender.valor_estimado as number) || 0,
          }] : [])
      ),
    valorMensal: (existingProposal?.valor_mensal as number) || undefined,
    valorGlobal: (existingProposal?.valor_global as number) || (tender?.valor_estimado as number) || 0,
    validadeDias: (existingProposal?.validade_dias as number) || 60,
    prazoEntrega: (existingProposal?.prazo_entrega as string) || '30 (trinta) dias corridos',
    declarations: (existingProposal?.declarations as string[]) || ['exequibilidade', 'tributos_inclusos', 'custos_trabalhistas', 'conhecimento_edital', 'prazo_entrega', 'validade_proposta'],
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
