import { formatCurrencyBRL } from '@licitagram/proposal-engine'
import type { PriceSearchResult } from './types'

// ─── CSV Export ───────────────────────────────────────────────

function escapeCSV(value: string | number): string {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Format search results as a CSV string with headers.
 */
export function formatAsCSV(result: PriceSearchResult): string {
  const headers = [
    'Licitacao',
    'Orgao',
    'UF',
    'Municipio',
    'Modalidade',
    'Item',
    'Unidade',
    'Quantidade',
    'Preco Unitario',
    'Preco Total',
    'Fornecedor',
    'CNPJ',
    'Porte',
    'Data Homologacao',
  ]

  const rows = result.records.map((r) =>
    [
      r.licitacao_numero,
      r.orgao_nome,
      r.orgao_uf,
      r.orgao_municipio,
      r.licitacao_modalidade,
      r.item_description,
      r.item_unit,
      r.item_quantity,
      r.unit_price,
      r.total_price,
      r.supplier_name,
      r.supplier_cnpj,
      r.supplier_porte,
      r.date_homologation instanceof Date
        ? r.date_homologation.toISOString().split('T')[0]
        : String(r.date_homologation),
    ]
      .map(escapeCSV)
      .join(','),
  )

  return [headers.join(','), ...rows].join('\n')
}

// ─── Spreadsheet Data ─────────────────────────────────────────

/**
 * Format as structured spreadsheet data (headers + rows).
 */
export function formatAsSpreadsheetData(result: PriceSearchResult): {
  headers: string[]
  rows: (string | number)[][]
} {
  const headers = [
    'Licitacao',
    'Orgao',
    'UF',
    'Municipio',
    'Modalidade',
    'Item',
    'Unidade',
    'Quantidade',
    'Preco Unitario',
    'Preco Total',
    'Fornecedor',
    'CNPJ',
    'Porte',
    'Data Homologacao',
  ]

  const rows = result.records.map((r) => [
    r.licitacao_numero,
    r.orgao_nome,
    r.orgao_uf,
    r.orgao_municipio,
    r.licitacao_modalidade,
    r.item_description,
    r.item_unit,
    r.item_quantity,
    r.unit_price,
    r.total_price,
    r.supplier_name,
    r.supplier_cnpj,
    r.supplier_porte,
    r.date_homologation instanceof Date
      ? r.date_homologation.toISOString().split('T')[0]
      : String(r.date_homologation),
  ])

  return { headers, rows }
}

// ─── Summary Text (Termo de Referencia) ───────────────────────

/**
 * Format a formal summary text suitable for a Termo de Referencia.
 */
export function formatAsSummaryText(result: PriceSearchResult): string {
  const { statistics: s, query: q, total_count } = result

  const lines: string[] = []

  lines.push(`PESQUISA DE PRECOS - ${q.query.toUpperCase()}`)
  lines.push(`${'='.repeat(60)}`)
  lines.push('')
  lines.push(`Consulta: "${q.query}"`)
  lines.push(`Total de registros encontrados: ${total_count}`)
  lines.push(`Registros analisados: ${s.count}`)
  lines.push('')
  lines.push(`ESTATISTICAS DE PRECOS`)
  lines.push(`${'-'.repeat(40)}`)
  lines.push(`Preco Medio:    R$ ${formatCurrencyBRL(s.mean)}`)
  lines.push(`Preco Mediano:  R$ ${formatCurrencyBRL(s.median)}`)
  lines.push(`Preco Minimo:   R$ ${formatCurrencyBRL(s.min)}`)
  lines.push(`Preco Maximo:   R$ ${formatCurrencyBRL(s.max)}`)
  lines.push(`Desvio Padrao:  R$ ${formatCurrencyBRL(s.std_deviation)}`)
  lines.push(`Coef. Variacao: ${s.cv_percent.toFixed(2)}%`)
  lines.push(`Percentil 25:   R$ ${formatCurrencyBRL(s.percentile_25)}`)
  lines.push(`Percentil 75:   R$ ${formatCurrencyBRL(s.percentile_75)}`)
  lines.push(`Confianca:      ${s.confidence.toUpperCase()}`)
  lines.push('')

  if (result.trend.direction) {
    lines.push(`TENDENCIA`)
    lines.push(`${'-'.repeat(40)}`)
    lines.push(`Direcao: ${result.trend.direction}`)
    if (result.trend.variation_12m_percent !== undefined) {
      lines.push(`Variacao 12 meses: ${result.trend.variation_12m_percent.toFixed(2)}%`)
    }
    if (result.trend.projected_price_next_month !== undefined) {
      lines.push(`Preco projetado proximo mes: R$ ${formatCurrencyBRL(result.trend.projected_price_next_month)}`)
    }
    lines.push('')
  }

  if (s.by_uf.length > 0) {
    lines.push(`POR UF`)
    lines.push(`${'-'.repeat(40)}`)
    for (const entry of s.by_uf.sort((a, b) => b.count - a.count)) {
      lines.push(`  ${entry.key}: ${entry.count} registros, mediana R$ ${formatCurrencyBRL(entry.median)}`)
    }
    lines.push('')
  }

  if (s.by_modalidade.length > 0) {
    lines.push(`POR MODALIDADE`)
    lines.push(`${'-'.repeat(40)}`)
    for (const entry of s.by_modalidade.sort((a, b) => b.count - a.count)) {
      lines.push(`  ${entry.key}: ${entry.count} registros, mediana R$ ${formatCurrencyBRL(entry.median)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
