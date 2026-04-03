import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel } from 'docx'

export const maxDuration = 30

function formatBRL(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * POST /api/price-history/report-pdf
 * Generates a DOCX price research report conforming to IN SEGES/ME 65/2021.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasFeature(user, 'proposal_generator') && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Recurso disponível no plano Profissional ou Enterprise' }, { status: 403 })
    }

    const { query, filters, statistics, records } = await request.json()
    if (!query) return NextResponse.json({ error: 'query obrigatório' }, { status: 400 })

    const now = new Date()
    const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

    const children: any[] = []

    // Title
    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
        new TextRun({ text: 'RELATÓRIO DE PESQUISA DE PREÇOS', bold: true, size: 28 }),
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
        new TextRun({ text: 'Instrução Normativa SEGES/ME nº 65, de 7 de julho de 2021', italics: true, size: 20 }),
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
        new TextRun({ text: `Data de geração: ${dateStr}`, size: 18, color: '666666' }),
      ]}),
    )

    // Section 1 — Objeto
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 100 }, children: [
        new TextRun({ text: '1. OBJETO DA PESQUISA', bold: true }),
      ]}),
      new Paragraph({ spacing: { after: 100 }, children: [
        new TextRun({ text: 'Descrição: ', bold: true }), new TextRun({ text: query }),
      ]}),
    )
    if (filters?.uf) children.push(new Paragraph({ children: [new TextRun({ text: `UF: ${filters.uf}` })] }))
    if (filters?.modalidade) children.push(new Paragraph({ children: [new TextRun({ text: `Modalidade: ${filters.modalidade}` })] }))

    // Section 2 — Fontes
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 100 }, children: [
        new TextRun({ text: '2. FONTES DE PESQUISA', bold: true }),
      ]}),
      new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Portal Nacional de Contratações Públicas (PNCP)' })] }),
      new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Contratações similares de entes públicos' })] }),
      new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Sistema Licitagram (licitagram.com)' })] }),
    )

    // Section 3 — Resultados (tabela)
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 100 }, children: [
        new TextRun({ text: '3. RESULTADOS', bold: true }),
      ]}),
    )

    if (records && records.length > 0) {
      const headerRow = new TableRow({ children: [
        ...['Nº', 'Órgão', 'UF', 'Valor Unitário', 'Data', 'Fonte'].map(h =>
          new TableCell({ width: { size: h === 'Órgão' ? 3000 : 1200, type: WidthType.DXA }, children: [
            new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] }),
          ]})
        ),
      ]})

      const dataRows = records.slice(0, 20).map((r: any, i: number) => {
        const valor = r.unit_price ? formatBRL(Number(r.unit_price)) : 'N/I'
        return new TableRow({ children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(i + 1), size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (r.orgao_nome || 'N/I').substring(0, 40), size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.orgao_uf || 'N/I', size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: valor, size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (r.date_homologation || '').substring(0, 10) || 'N/I', size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'PNCP', size: 18 })] })] }),
        ]})
      })

      children.push(new Table({ rows: [headerRow, ...dataRows] }))
    }

    // Section 4 — Análise Estatística
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 100 }, children: [
        new TextRun({ text: '4. ANÁLISE ESTATÍSTICA', bold: true }),
      ]}),
    )

    if (statistics) {
      const stats = [
        ['Mediana', formatBRL(statistics.median)],
        ['Média', formatBRL(statistics.mean)],
        ['Menor preço', formatBRL(statistics.min || 0)],
        ['Maior preço', formatBRL(statistics.max || 0)],
        ['Desvio padrão', formatBRL(statistics.std_deviation || 0)],
        ['Coeficiente de variação', `${(statistics.cv_percent || 0).toFixed(1)}%`],
        ['Quantidade de amostras', String(statistics.count || 0)],
      ]

      const statRows = stats.map(([label, value]) => new TableRow({ children: [
        new TableCell({ width: { size: 4000, type: WidthType.DXA }, children: [
          new Paragraph({ children: [new TextRun({ text: label, bold: label === 'Mediana', size: 20 })] }),
        ]}),
        new TableCell({ children: [
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [
            new TextRun({ text: value, bold: label === 'Mediana', size: 20 }),
          ]}),
        ]}),
      ]}))

      children.push(new Table({ rows: statRows }))

      if ((statistics.cv_percent || 0) > 25) {
        children.push(new Paragraph({ spacing: { before: 200 }, children: [
          new TextRun({ text: 'NOTA: ', bold: true, color: 'CC0000' }),
          new TextRun({ text: 'Coeficiente de variação superior a 25% indica alta dispersão. Recomenda-se análise crítica dos outliers.', italics: true }),
        ]}))
      }
    }

    // Section 5 — Metodologia
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 100 }, children: [
        new TextRun({ text: '5. METODOLOGIA', bold: true }),
      ]}),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: 'A pesquisa de preços foi realizada conforme art. 5º da IN SEGES/ME nº 65/2021, utilizando como parâmetro contratações similares de entes públicos registradas no Portal Nacional de Contratações Públicas (PNCP) e sistemas integrados.' }),
      ]}),
    )

    // Footer
    children.push(
      new Paragraph({ spacing: { before: 400 }, children: [
        new TextRun({ text: `Relatório gerado por Licitagram (licitagram.com) em ${dateStr}`, size: 16, color: '999999', italics: true }),
      ]}),
      new Paragraph({ children: [
        new TextRun({ text: 'Este documento não substitui a análise do agente de contratação.', size: 16, color: '999999', italics: true }),
      ]}),
    )

    const doc = new Document({
      sections: [{ children }],
    })

    const buffer = await Packer.toBuffer(doc)
    const filename = `relatorio_in65_${query.replace(/\s+/g, '_').substring(0, 30)}_${now.toISOString().split('T')[0]}.docx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[report-pdf]', err)
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 })
  }
}
