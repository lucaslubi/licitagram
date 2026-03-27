export interface ProposalItem {
  item_number: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  details?: string;
}

export interface CompanyData {
  razao_social: string;
  cnpj: string;
  endereco: string;
  cep: string;
  telefone: string;
  email: string;
  banco: string;
  agencia: string;
  conta: string;
  representante_nome: string;
  representante_cpf: string;
  representante_cargo: string;
}

export interface LicitacaoRef {
  numero: string;
  modalidade: string;
  uasg: string;
  orgao: string;
  objeto: string;
}

export interface ProposalData {
  licitacao: LicitacaoRef;
  empresa: CompanyData;
  items: ProposalItem[];
  valor_mensal?: number;
  valor_global: number;
  validade_dias: number;
  prazo_entrega: string;
  declarations: DeclarationType[];
  cidade: string;
  data: Date;
  observacoes?: string;
}

export type DeclarationType =
  | 'exequibilidade'
  | 'tributos_inclusos'
  | 'custos_trabalhistas'
  | 'conhecimento_edital'
  | 'me_epp'
  | 'sem_vinculo'
  | 'prazo_entrega'
  | 'validade_proposta';

export type TemplateType = 'bens' | 'servicos' | 'tic_saas';

export interface GenerateResult {
  buffer: Buffer;
  filename: string;
}
