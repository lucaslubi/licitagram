import { Document, Packer, LevelFormat } from 'docx';
import type { ProposalData, TemplateType, GenerateResult } from '../types';
import { buildBensSections } from './base-bens';
import { buildServicosSections } from './base-servicos';
import { buildTicSaasSections } from './base-tic-saas';

const TEMPLATE_BUILDERS: Record<TemplateType, (data: ProposalData) => object[]> = {
  bens: buildBensSections,
  servicos: buildServicosSections,
  tic_saas: buildTicSaasSections,
};

export async function generateProposalDocx(
  data: ProposalData,
  template: TemplateType,
): Promise<GenerateResult> {
  // Validation
  if (!data.items || data.items.length === 0) {
    throw new Error('A proposta deve conter ao menos um item.');
  }
  if (data.valor_global <= 0) {
    throw new Error('O valor global deve ser maior que zero.');
  }

  const builder = TEMPLATE_BUILDERS[template];
  if (!builder) {
    throw new Error(`Template desconhecido: ${template}`);
  }

  const sections = builder(data) as any[];

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            size: 24, // 12pt in half-points
          },
          paragraph: {
            spacing: { after: 120 },
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            font: 'Arial',
            size: 28, // 14pt
            bold: true,
          },
          paragraph: {
            spacing: { after: 120 },
            outlineLevel: 0,
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            font: 'Arial',
            size: 26, // 13pt
            bold: true,
          },
          paragraph: {
            spacing: { after: 120 },
            outlineLevel: 1,
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'declarations-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: 'start' as any,
              style: {
                run: {
                  font: 'Arial',
                  size: 24,
                },
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections,
  });

  const buffer = await Packer.toBuffer(doc);

  const numero = data.licitacao.numero.replace(/[/\\]/g, '-');
  const filename = `proposta-PE-${numero}-v1.docx`;

  return {
    buffer: Buffer.from(buffer),
    filename,
  };
}
