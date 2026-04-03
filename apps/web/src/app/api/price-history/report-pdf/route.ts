import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

export const maxDuration = 30

/**
 * POST /api/price-history/report-pdf
 * Generates a price research report conforming to IN SEGES/ME 65/2021.
 * Returns the report as a text/markdown download (PDF generation requires pdfkit).
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

    // Build markdown report conforming to IN 65/2021
    let report = ''
    report += `# RELATÓRIO DE PESQUISA DE PREÇOS\n`
    report += `## Instrução Normativa SEGES/ME nº 65, de 7 de julho de 2021\n\n`
    report += `**Data de geração:** ${dateStr}\n\n`
    report += `---\n\n`

    // Section 1
    report += `## 1. OBJETO DA PESQUISA\n\n`
    report += `**Descrição:** ${query}\n`
    if (filters?.uf) report += `**UF:** ${filters.uf}\n`
    if (filters?.modalidade) report += `**Modalidade:** ${filters.modalidade}\n`
    if (filters?.dateRange) report += `**Período:** ${filters.dateRange.from || 'N/A'} a ${filters.dateRange.to || 'N/A'}\n`
    report += `\n`

    // Section 2
    report += `## 2. FONTES DE PESQUISA\n\n`
    report += `- Portal Nacional de Contratações Públicas (PNCP)\n`
    report += `- Contratações similares de entes públicos\n`
    report += `- Sistema Licitagram (licitagram.com)\n\n`

    // Section 3
    report += `## 3. RESULTADOS\n\n`
    if (records && records.length > 0) {
      report += `| Nº | Órgão | UF | Valor Unitário | Data | Fonte |\n`
      report += `|----|-------|----|----------------|------|-------|\n`
      records.slice(0, 20).forEach((r: any, i: number) => {
        const valor = r.unit_price ? `R$ ${Number(r.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/I'
        report += `| ${i + 1} | ${(r.orgao_nome || 'N/I').substring(0, 40)} | ${r.orgao_uf || 'N/I'} | ${valor} | ${r.date_homologation?.substring(0, 10) || 'N/I'} | PNCP |\n`
      })
      report += `\n`
    } else {
      report += `*Nenhum registro encontrado com os filtros aplicados.*\n\n`
    }

    // Section 4
    report += `## 4. ANÁLISE ESTATÍSTICA\n\n`
    if (statistics) {
      const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      report += `| Indicador | Valor |\n`
      report += `|-----------|-------|\n`
      report += `| **Mediana** | **${fmt(statistics.median)}** |\n`
      report += `| Média | ${fmt(statistics.mean)} |\n`
      report += `| Menor preço | ${fmt(statistics.min || 0)} |\n`
      report += `| Maior preço | ${fmt(statistics.max || 0)} |\n`
      report += `| Desvio padrão | ${fmt(statistics.std_deviation || 0)} |\n`
      report += `| Coeficiente de variação | ${(statistics.cv_percent || 0).toFixed(1)}% |\n`
      report += `| Quantidade de amostras | ${statistics.count || 0} |\n\n`

      if ((statistics.cv_percent || 0) > 25) {
        report += `> **NOTA:** Coeficiente de variação superior a 25% indica alta dispersão nos preços. Recomenda-se análise crítica dos valores extremos.\n\n`
      }
    }

    // Section 5
    report += `## 5. METODOLOGIA\n\n`
    report += `A pesquisa de preços foi realizada conforme art. 5º da IN SEGES/ME nº 65/2021, `
    report += `utilizando como parâmetro contratações similares de entes públicos registradas no `
    report += `Portal Nacional de Contratações Públicas (PNCP) e sistemas integrados.\n\n`

    // Footer
    report += `---\n\n`
    report += `*Relatório gerado por Licitagram (licitagram.com) em ${dateStr}*\n`
    report += `*Este documento não substitui a análise do agente de contratação.*\n`

    // Return as downloadable markdown
    return new NextResponse(report, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="pesquisa_precos_${query.replace(/\s+/g, '_').substring(0, 30)}_${now.toISOString().split('T')[0]}.md"`,
      },
    })
  } catch (err) {
    console.error('[report-pdf]', err)
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 })
  }
}
