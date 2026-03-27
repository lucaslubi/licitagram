import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  ShadingType,
  BorderStyle,
  TableLayoutType,
  VerticalAlign,
} from 'docx';
import type { ProposalData } from '../types';
import { formatCurrencyBRL, formatCNPJ, formatCPF, formatDateExtensoBR } from '../price-calculator';
import { numberToWordsPtBr } from '../number-to-words-ptbr';
import { numberToWordsSimple } from './number-words-simple';

const THIN_BORDER = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: '999999',
};

const CELL_BORDERS = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};

const CELL_MARGINS = {
  top: 80,
  bottom: 80,
  left: 120,
  right: 120,
};

// Standard 6-col widths (no details column)
const COL_WIDTHS_6 = [600, 3671, 700, 900, 1600, 1600];
// 7-col widths (with Perfil/Tipo column)
const COL_WIDTHS_7 = [500, 2571, 1100, 600, 800, 1300, 1300]; // widths must sum to ~8171 (but we target 9071 total)
// Actually let me recalculate: 500 + 2671 + 1000 + 600 + 800 + 1300 + 1200 = 8071... let me use proper values
// 9071 total: 500 + 2371 + 1100 + 600 + 800 + 1500 + 1200 = 8071. Let me just be precise:
// 500 + 2571 + 1000 + 600 + 800 + 1400 + 1200 = 8071...
// Let's use: 500 + 2471 + 1100 + 600 + 800 + 1400 + 1200 = 8071
// We need 9071. So: 600 + 2571 + 1200 + 600 + 900 + 1600 + 1600 = 9071
const COL_WIDTHS_7_REAL = [500, 2271, 1200, 600, 900, 1600, 1600]; // = 8671... no
// Let me just compute: 500+2271+1200+600+900+1600+1600 = 8671. Need 9071. diff=400. Add to desc.
// 500 + 2671 + 1200 + 600 + 900 + 1600 + 1600 = 9071. Yes!

const COL_WIDTHS_WITH_DETAILS = [500, 2671, 1200, 600, 900, 1600, 1600];

const DECLARATION_TEXTS: Record<string, string> = {
  exequibilidade:
    'Declaramos que esta proposta é exequível e que possuímos plena capacidade de executar o contrato nos valores acima mencionados, ainda que os mesmos possam, eventualmente, apresentar-se abaixo dos limites mínimos estabelecidos pela Administração.',
  tributos_inclusos:
    'Nos preços ofertados estão incluídos todos os custos operacionais, encargos previdenciários, trabalhistas, tributários, comerciais e quaisquer outros que incidam direta ou indiretamente na prestação dos serviços/fornecimento dos bens, não cabendo à Contratante nenhum custo adicional.',
  conhecimento_edital:
    'Declaramos conhecer e aceitar integralmente as condições estabelecidas no Edital e seus Anexos, bem como que a proposta apresentada está em conformidade com as exigências do instrumento convocatório.',
  me_epp:
    'Declaramos, para fins do disposto no Edital, sob as sanções administrativas cabíveis e sob as penas da lei, que esta empresa, na presente data, é considerada Microempresa/Empresa de Pequeno Porte, nos termos da Lei Complementar nº 123, de 14 de dezembro de 2006.',
  sem_vinculo:
    'Declaramos que não possuímos, em nosso quadro de pessoal, empregados com menos de 18 anos em trabalho noturno, perigoso ou insalubre e de 16 anos em qualquer trabalho, salvo na condição de aprendiz, a partir dos 14 anos, nos termos do inciso XXXIII do art. 7º da Constituição Federal.',
};

function makeHeaderCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: 'D9E2F3', color: 'auto' },
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, font: 'Arial', size: 20 })],
      }),
    ],
  });
}

function makeCell(text: string, width: number, alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT, bold = false): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment,
        children: [new TextRun({ text, font: 'Arial', size: 20, bold })],
      }),
    ],
  });
}

function makeMergedCell(text: string, colSpan: number, width: number, alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT, bold = false): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: colSpan,
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment,
        children: [new TextRun({ text, font: 'Arial', size: 20, bold })],
      }),
    ],
  });
}

export function buildTicSaasSections(data: ProposalData): object[] {
  const { licitacao, empresa, items, valor_mensal, valor_global, validade_dias, cidade } = data;

  const hasDetails = items.some((item) => item.details);

  // --- Block 1: Header ---
  const headerBlock: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: 'PROPOSTA COMERCIAL', bold: true, font: 'Arial', size: 28 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: `À ${licitacao.orgao}`, font: 'Arial', size: 24 })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `Ref.: ${licitacao.modalidade} nº `, font: 'Arial', size: 24 }),
        new TextRun({ text: licitacao.numero, bold: true, font: 'Arial', size: 24 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: `UASG: ${licitacao.uasg}`, font: 'Arial', size: 24 })],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];

  // --- Block 2: Company ID ---
  const companyBlock: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: '1. IDENTIFICAÇÃO DO PROPONENTE', bold: true, font: 'Arial', size: 26 }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Razão Social: ${empresa.razao_social}`, font: 'Arial', size: 24 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `CNPJ: ${formatCNPJ(empresa.cnpj)}`, font: 'Arial', size: 24 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Endereço: ${empresa.endereco} — CEP: ${empresa.cep}`, font: 'Arial', size: 24 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Telefone: ${empresa.telefone}`, font: 'Arial', size: 24 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `E-mail: ${empresa.email}`, font: 'Arial', size: 24 })] }),
  ];

  // --- Block 3: Object (mentions subscriptions, licenses, SaaS, cloud) ---
  const objectBlock: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: '2. OBJETO', bold: true, font: 'Arial', size: 26 }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: licitacao.objeto, font: 'Arial', size: 24 })] }),
  ];

  // --- Block 4: Price Table ---
  let headerRow: TableRow;
  let itemRows: TableRow[];
  let colWidths: number[];
  let numCols: number;

  if (hasDetails) {
    colWidths = COL_WIDTHS_WITH_DETAILS;
    numCols = 7;
    headerRow = new TableRow({
      tableHeader: true,
      children: [
        makeHeaderCell('Item', colWidths[0]),
        makeHeaderCell('Descrição', colWidths[1]),
        makeHeaderCell('Perfil/Tipo', colWidths[2]),
        makeHeaderCell('Qtd', colWidths[3]),
        makeHeaderCell('Unid.', colWidths[4]),
        makeHeaderCell('Valor Unit. (R$)', colWidths[5]),
        makeHeaderCell('Valor Total (R$)', colWidths[6]),
      ],
    });

    itemRows = items.map(
      (item) =>
        new TableRow({
          children: [
            makeCell(String(item.item_number), colWidths[0], AlignmentType.CENTER),
            makeCell(item.description, colWidths[1]),
            makeCell(item.details || '', colWidths[2], AlignmentType.CENTER),
            makeCell(String(item.quantity), colWidths[3], AlignmentType.CENTER),
            makeCell(item.unit, colWidths[4], AlignmentType.CENTER),
            makeCell(formatCurrencyBRL(item.unit_price), colWidths[5], AlignmentType.RIGHT),
            makeCell(formatCurrencyBRL(item.total_price), colWidths[6], AlignmentType.RIGHT),
          ],
        }),
    );
  } else {
    colWidths = COL_WIDTHS_6;
    numCols = 6;
    headerRow = new TableRow({
      tableHeader: true,
      children: [
        makeHeaderCell('Item', colWidths[0]),
        makeHeaderCell('Descrição', colWidths[1]),
        makeHeaderCell('Qtd', colWidths[2]),
        makeHeaderCell('Unid.', colWidths[3]),
        makeHeaderCell('Valor Unit. (R$)', colWidths[4]),
        makeHeaderCell('Valor Total (R$)', colWidths[5]),
      ],
    });

    itemRows = items.map(
      (item) =>
        new TableRow({
          children: [
            makeCell(String(item.item_number), colWidths[0], AlignmentType.CENTER),
            makeCell(item.description, colWidths[1]),
            makeCell(String(item.quantity), colWidths[2], AlignmentType.CENTER),
            makeCell(item.unit, colWidths[3], AlignmentType.CENTER),
            makeCell(formatCurrencyBRL(item.unit_price), colWidths[4], AlignmentType.RIGHT),
            makeCell(formatCurrencyBRL(item.total_price), colWidths[5], AlignmentType.RIGHT),
          ],
        }),
    );
  }

  const totalMergedWidth = colWidths.slice(0, numCols - 1).reduce((a, b) => a + b, 0);
  const lastColWidth = colWidths[numCols - 1];

  const summaryRows: TableRow[] = [];

  if (valor_mensal !== undefined && valor_mensal > 0) {
    summaryRows.push(
      new TableRow({
        children: [
          makeMergedCell('VALOR MENSAL', numCols - 1, totalMergedWidth, AlignmentType.RIGHT, true),
          makeCell(formatCurrencyBRL(valor_mensal), lastColWidth, AlignmentType.RIGHT, true),
        ],
      }),
    );
  }

  summaryRows.push(
    new TableRow({
      children: [
        makeMergedCell('VALOR GLOBAL (12 meses)', numCols - 1, totalMergedWidth, AlignmentType.RIGHT, true),
        makeCell(formatCurrencyBRL(valor_global), lastColWidth, AlignmentType.RIGHT, true),
      ],
    }),
  );

  const priceTable = new Table({
    width: { size: 9071, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: colWidths,
    rows: [headerRow, ...itemRows, ...summaryRows],
  });

  const valorExtenso = numberToWordsPtBr(valor_global);

  const priceBlock = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: '3. PROPOSTA DE PREÇOS', bold: true, font: 'Arial', size: 26 }),
      ],
    }),
    priceTable,
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({ text: `Valor Global: R$ ${formatCurrencyBRL(valor_global)} (${valorExtenso})`, font: 'Arial', size: 24 }),
      ],
    }),
  ];

  // --- Block 5: Declarations ---
  const validadeDiasExtenso = numberToWordsSimple(validade_dias);
  const validadeText = `A validade desta proposta é de ${validade_dias} (${validadeDiasExtenso}) dias corridos, contados da data de abertura da sessão pública do pregão.`;

  const allDeclarations: Record<string, string> = {
    ...DECLARATION_TEXTS,
    validade_proposta: validadeText,
  };

  const declarationParagraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: '4. DECLARAÇÕES', bold: true, font: 'Arial', size: 26 }),
      ],
    }),
    ...data.declarations.map(
      (decl) =>
        new Paragraph({
          spacing: { after: 120 },
          numbering: { reference: 'declarations-numbering', level: 0 },
          children: [new TextRun({ text: allDeclarations[decl] || '', font: 'Arial', size: 24 })],
        }),
    ),
  ];

  // --- Block 6: Bank Details ---
  const bankBlock: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: '5. DADOS BANCÁRIOS', bold: true, font: 'Arial', size: 26 }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Banco: ${empresa.banco}`, font: 'Arial', size: 24 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Agência: ${empresa.agencia}`, font: 'Arial', size: 24 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Conta Corrente: ${empresa.conta}`, font: 'Arial', size: 24 })] }),
  ];

  // --- Block 7: Signature ---
  const dataExtenso = formatDateExtensoBR(data.data);
  const signatureBlock: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: '6. ASSINATURA', bold: true, font: 'Arial', size: 26 }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `${cidade}, ${dataExtenso}.`, font: 'Arial', size: 24 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: '________________________________________', font: 'Arial', size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: empresa.representante_nome, bold: true, font: 'Arial', size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: empresa.representante_cargo, font: 'Arial', size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: `CPF: ${formatCPF(empresa.representante_cpf)}`, font: 'Arial', size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: empresa.razao_social, font: 'Arial', size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: `CNPJ: ${formatCNPJ(empresa.cnpj)}`, font: 'Arial', size: 24 })],
    }),
  ];

  return [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1418, right: 1134, bottom: 1134, left: 1701 },
        },
      },
      children: [
        ...headerBlock,
        ...companyBlock,
        ...objectBlock,
        ...priceBlock,
        ...declarationParagraphs,
        ...bankBlock,
        ...signatureBlock,
      ],
    },
  ];
}
