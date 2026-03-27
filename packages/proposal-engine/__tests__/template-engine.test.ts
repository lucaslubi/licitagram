import { describe, it, expect } from 'vitest';
import { generateProposalDocx } from '../src/templates/template-engine';
import type { ProposalData, TemplateType } from '../src/types';

function makeProposalData(overrides: Partial<ProposalData> = {}): ProposalData {
  return {
    licitacao: {
      numero: '33/2026',
      modalidade: 'Pregão Eletrônico',
      uasg: '170531',
      orgao: 'Ministério da Economia',
      objeto: 'Aquisição de material de escritório',
    },
    empresa: {
      razao_social: 'Tech Solutions Ltda',
      cnpj: '12345678000199',
      endereco: 'Rua das Palmeiras, 1200',
      cep: '70390-010',
      telefone: '(61) 3333-4455',
      email: 'contato@techsolutions.com.br',
      banco: 'Banco do Brasil',
      agencia: '1234-5',
      conta: '56789-0',
      representante_nome: 'Carlos Eduardo Mendes',
      representante_cpf: '12345678901',
      representante_cargo: 'Diretor Comercial',
    },
    items: [
      {
        item_number: 1,
        description: 'Resma de papel A4',
        quantity: 100,
        unit: 'Resma',
        unit_price: 28.9,
        total_price: 2890.0,
      },
    ],
    valor_global: 2890.0,
    validade_dias: 60,
    prazo_entrega: '30 dias corridos',
    declarations: ['exequibilidade', 'tributos_inclusos', 'validade_proposta'],
    cidade: 'Brasília/DF',
    data: new Date(2026, 2, 27),
    ...overrides,
  };
}

describe('generateProposalDocx', () => {
  it('returns a non-empty Buffer', async () => {
    const data = makeProposalData();
    const result = await generateProposalDocx(data, 'bens');
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('returns correct filename', async () => {
    const data = makeProposalData();
    const result = await generateProposalDocx(data, 'bens');
    expect(result.filename).toBe('proposta-PE-33-2026-v1.docx');
  });

  it('Buffer starts with ZIP magic bytes (PK\\x03\\x04)', async () => {
    const data = makeProposalData();
    const result = await generateProposalDocx(data, 'bens');
    expect(result.buffer[0]).toBe(0x50); // P
    expect(result.buffer[1]).toBe(0x4b); // K
    expect(result.buffer[2]).toBe(0x03);
    expect(result.buffer[3]).toBe(0x04);
  });

  it.each<TemplateType>(['bens', 'servicos', 'tic_saas'])(
    'works for template type "%s"',
    async (template) => {
      const data = makeProposalData(
        template === 'servicos' || template === 'tic_saas'
          ? { valor_mensal: 240.83 }
          : {},
      );
      if (template === 'tic_saas') {
        data.items[0].details = 'Full Seat';
      }
      const result = await generateProposalDocx(data, template);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.buffer[0]).toBe(0x50);
      expect(result.buffer[1]).toBe(0x4b);
    },
  );

  it('throws error if items is empty', async () => {
    const data = makeProposalData({ items: [] });
    await expect(generateProposalDocx(data, 'bens')).rejects.toThrow(
      'A proposta deve conter ao menos um item.',
    );
  });

  it('throws error if valor_global is 0', async () => {
    const data = makeProposalData({ valor_global: 0 });
    await expect(generateProposalDocx(data, 'bens')).rejects.toThrow(
      'O valor global deve ser maior que zero.',
    );
  });

  it('throws error if valor_global is negative', async () => {
    const data = makeProposalData({ valor_global: -100 });
    await expect(generateProposalDocx(data, 'bens')).rejects.toThrow(
      'O valor global deve ser maior que zero.',
    );
  });
});
