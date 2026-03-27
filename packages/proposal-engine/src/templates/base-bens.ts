import {
  Document,
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
  LevelFormat,
  TableLayoutType,
  VerticalAlign,
  convertInchesToTwip,
} from 'docx';
import type { ProposalData } from '../types';
import { formatCurrencyBRL, formatCNPJ, formatCPF, formatDateExtensoBR } from '../price-calculator';
import { numberToWordsPtBr } from '../number-to-words-ptbr';
import { DECLARATION_TEXTS } from './declarations';
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

const COL_WIDTHS = [600, 3671, 700, 900, 1600, 1600];


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

export function buildBensSections(data: ProposalData): object[] {
  const { licitacao, empresa, items, valor_global, validade_dias, cidade } = data;

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

  // --- Block 3: Object ---
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
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      makeHeaderCell('Item', COL_WIDTHS[0]),
      makeHeaderCell('Descrição', COL_WIDTHS[1]),
      makeHeaderCell('Qtd', COL_WIDTHS[2]),
      makeHeaderCell('Unid.', COL_WIDTHS[3]),
      makeHeaderCell('Valor Unit. (R$)', COL_WIDTHS[4]),
      makeHeaderCell('Valor Total (R$)', COL_WIDTHS[5]),
    ],
  });

  const itemRows = items.map(
    (item) =>
      new TableRow({
        children: [
          makeCell(String(item.item_number), COL_WIDTHS[0], AlignmentType.CENTER),
          makeCell(item.description, COL_WIDTHS[1]),
          makeCell(String(item.quantity), COL_WIDTHS[2], AlignmentType.CENTER),
          makeCell(item.unit, COL_WIDTHS[3], AlignmentType.CENTER),
          makeCell(formatCurrencyBRL(item.unit_price), COL_WIDTHS[4], AlignmentType.RIGHT),
          makeCell(formatCurrencyBRL(item.total_price), COL_WIDTHS[5], AlignmentType.RIGHT),
        ],
      }),
  );

  const totalMergedWidth = COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3] + COL_WIDTHS[4];
  const totalRow = new TableRow({
    children: [
      makeMergedCell('VALOR GLOBAL', 5, totalMergedWidth, AlignmentType.RIGHT, true),
      makeCell(formatCurrencyBRL(valor_global), COL_WIDTHS[5], AlignmentType.RIGHT, true),
    ],
  });

  const priceTable = new Table({
    width: { size: 9071, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: COL_WIDTHS,
    rows: [headerRow, ...itemRows, totalRow],
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
      (decl, idx) =>
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
