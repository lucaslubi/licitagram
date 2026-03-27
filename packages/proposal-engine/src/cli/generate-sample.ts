import { writeFileSync } from 'node:fs';
import { generateProposalDocx } from '../templates/template-engine';
import type { ProposalData, TemplateType } from '../types';

const empresa = {
  razao_social: 'Tech Solutions Comércio e Serviços Ltda',
  cnpj: '12345678000199',
  endereco: 'Rua das Palmeiras, 1200, Sala 301, Asa Sul',
  cep: '70390-010',
  telefone: '(61) 3333-4455',
  email: 'licitacoes@techsolutions.com.br',
  banco: 'Banco do Brasil',
  agencia: '1234-5',
  conta: '56789-0',
  representante_nome: 'Carlos Eduardo Mendes',
  representante_cpf: '12345678901',
  representante_cargo: 'Diretor Comercial',
};

const declarations = [
  'exequibilidade',
  'tributos_inclusos',
  'conhecimento_edital',
  'me_epp',
  'sem_vinculo',
  'validade_proposta',
] as const;

// ─── Sample 1: Bens ───────────────────────────────
const bensData: ProposalData = {
  licitacao: {
    numero: '33/2026',
    modalidade: 'Pregão Eletrônico',
    uasg: '170531',
    orgao: 'Ministério da Economia — Secretaria de Gestão Corporativa',
    objeto: 'Aquisição de material de escritório para atender às necessidades da Secretaria de Gestão Corporativa do Ministério da Economia, conforme especificações e quantitativos estabelecidos no Termo de Referência.',
  },
  empresa,
  items: [
    { item_number: 1, description: 'Resma de papel A4, 75g/m², 500 folhas', quantity: 500, unit: 'Resma', unit_price: 28.9, total_price: 14450.0 },
    { item_number: 2, description: 'Caneta esferográfica azul, ponta média 1.0mm', quantity: 1000, unit: 'Unid.', unit_price: 1.85, total_price: 1850.0 },
    { item_number: 3, description: 'Grampeador de mesa para 25 folhas', quantity: 50, unit: 'Unid.', unit_price: 32.5, total_price: 1625.0 },
    { item_number: 4, description: 'Pasta classificadora com elástico, ofício', quantity: 200, unit: 'Unid.', unit_price: 4.75, total_price: 950.0 },
    { item_number: 5, description: 'Fita adesiva transparente 45mm x 100m', quantity: 100, unit: 'Rolo', unit_price: 7.2, total_price: 720.0 },
  ],
  valor_global: 19595.0,
  validade_dias: 60,
  prazo_entrega: '30 dias corridos',
  declarations: [...declarations],
  cidade: 'Brasília/DF',
  data: new Date(2026, 2, 27), // 27 de março de 2026
};

// ─── Sample 2: Serviços ───────────────────────────
const servicosData: ProposalData = {
  licitacao: {
    numero: '33/2026',
    modalidade: 'Pregão Eletrônico',
    uasg: '170531',
    orgao: 'Ministério da Economia — Secretaria de Gestão Corporativa',
    objeto: 'Contratação de empresa especializada na prestação de serviço de limpeza, asseio e conservação predial, com fornecimento de mão de obra, materiais e equipamentos, nas dependências do Ministério da Economia em Brasília/DF.',
  },
  empresa,
  items: [
    { item_number: 1, description: 'Servente de limpeza — Área interna', quantity: 20, unit: 'Posto', unit_price: 4850.0, total_price: 97000.0 },
    { item_number: 2, description: 'Servente de limpeza — Área externa', quantity: 5, unit: 'Posto', unit_price: 4650.0, total_price: 23250.0 },
    { item_number: 3, description: 'Encarregado de limpeza', quantity: 2, unit: 'Posto', unit_price: 6300.0, total_price: 12600.0 },
  ],
  valor_mensal: 132850.0,
  valor_global: 1594200.0,
  validade_dias: 60,
  prazo_entrega: 'Início em até 10 dias após assinatura do contrato',
  declarations: [...declarations],
  cidade: 'Brasília/DF',
  data: new Date(2026, 2, 27),
};

// ─── Sample 3: TIC/SaaS ──────────────────────────
const ticSaasData: ProposalData = {
  licitacao: {
    numero: '33/2026',
    modalidade: 'Pregão Eletrônico',
    uasg: '170531',
    orgao: 'Ministério da Economia — Secretaria de Gestão Corporativa',
    objeto: 'Aquisição de subscrições de licenças de software Figma Enterprise, na modalidade SaaS (Software as a Service), em ambiente de nuvem (cloud), incluindo suporte técnico e atualizações, pelo período de 12 meses, conforme especificações do Termo de Referência.',
  },
  empresa,
  items: [
    { item_number: 1, description: 'Figma Enterprise — Subscrição anual', quantity: 3, unit: 'Licença', unit_price: 5670.0, total_price: 17010.0, details: 'Full Seat' },
    { item_number: 2, description: 'Figma Enterprise — Subscrição anual', quantity: 25, unit: 'Licença', unit_price: 2205.0, total_price: 55125.0, details: 'Dev Seat' },
  ],
  valor_mensal: 6011.25,
  valor_global: 72135.0,
  validade_dias: 90,
  prazo_entrega: 'Ativação em até 5 dias úteis após emissão da Ordem de Serviço',
  declarations: [...declarations],
  cidade: 'Brasília/DF',
  data: new Date(2026, 2, 27),
};

async function main() {
  const samples: { data: ProposalData; template: TemplateType; suffix: string }[] = [
    { data: bensData, template: 'bens', suffix: 'bens' },
    { data: servicosData, template: 'servicos', suffix: 'servicos' },
    { data: ticSaasData, template: 'tic_saas', suffix: 'tic-saas' },
  ];

  for (const { data, template, suffix } of samples) {
    const result = await generateProposalDocx(data, template);
    const path = `/tmp/proposta-PE-33-2026-${suffix}-v1.docx`;
    writeFileSync(path, result.buffer);
    console.log(`Generated: ${path} (${result.buffer.length} bytes)`);
  }

  console.log('Done! All 3 sample DOCX files generated.');
}

main().catch((err) => {
  console.error('Error generating samples:', err);
  process.exit(1);
});
