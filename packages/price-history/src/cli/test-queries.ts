import { computeStatistics } from '../price-aggregator'
import { analyzeTrend } from '../trend-analyzer'
import { formatAsSummaryText, formatAsCSV } from '../export-formatter'
import type { PriceRecord, PriceSearchResult } from '../types'
import { writeFileSync } from 'fs'

// ─── Mock data generators ─────────────────────────────────────

const UFS = ['SP', 'RJ', 'MG', 'PR', 'RS', 'SC', 'BA', 'PE', 'CE', 'GO', 'DF', 'PA', 'AM', 'MT', 'ES']
const MODALIDADES = ['Pregao Eletronico', 'Concorrencia', 'Dispensa', 'Tomada de Precos']
const PORTES: PriceRecord['supplier_porte'][] = ['ME', 'EPP', 'MEDIO', 'GRANDE']

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateRecords(
  description: string,
  count: number,
  minPrice: number,
  maxPrice: number,
): PriceRecord[] {
  const records: PriceRecord[] = []
  for (let i = 0; i < count; i++) {
    const monthOffset = Math.floor(i / (count / 12))
    const month = monthOffset % 12
    const date = new Date(2025, month, Math.floor(randomBetween(1, 28)))
    const price = randomBetween(minPrice, maxPrice)
    const uf = randomElement(UFS)

    records.push({
      id: `rec-${description.slice(0, 3)}-${i}`,
      licitacao_id: `lic-${i}`,
      licitacao_numero: `${String(i + 1).padStart(3, '0')}/2025`,
      licitacao_modalidade: randomElement(MODALIDADES),
      orgao_nome: `Orgao ${uf} ${i}`,
      orgao_uf: uf,
      orgao_municipio: `Municipio ${i}`,
      fonte: 'pncp',
      item_description: description,
      item_unit: 'UN',
      item_quantity: Math.ceil(randomBetween(1, 100)),
      unit_price: Math.round(price * 100) / 100,
      total_price: Math.round(price * Math.ceil(randomBetween(1, 100)) * 100) / 100,
      supplier_name: `Fornecedor ${i}`,
      supplier_cnpj: `${String(i).padStart(14, '0')}`,
      supplier_uf: uf,
      supplier_porte: randomElement(PORTES),
      date_homologation: date,
      date_opening: new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000),
      is_valid: true,
      confidence_score: randomBetween(0.7, 1.0),
    })
  }
  return records
}

// ─── Main ─────────────────────────────────────────────────────

function runAnalysis(name: string, records: PriceRecord[]): void {
  console.log(`\n${'#'.repeat(70)}`)
  console.log(`# ${name} (${records.length} registros)`)
  console.log(`${'#'.repeat(70)}`)

  const stats = computeStatistics(records)
  const trend = analyzeTrend(records)

  const result: PriceSearchResult = {
    records,
    statistics: stats,
    trend,
    total_count: records.length,
    page: 1,
    page_size: records.length,
    query: { query: name },
  }

  // Print summary
  const summary = formatAsSummaryText(result)
  console.log(summary)

  // Save CSV
  const csv = formatAsCSV(result)
  const filename = `/tmp/price-history-${name.replace(/\s+/g, '-').toLowerCase()}.csv`
  writeFileSync(filename, csv, 'utf-8')
  console.log(`CSV salvo em: ${filename}`)
}

console.log('=== PRICE HISTORY CLI — Test Queries ===')
console.log(`Data: ${new Date().toISOString()}`)

const papelRecords = generateRecords('resma papel A4 75g', 500, 18, 32)
const microsoftRecords = generateRecords('licenca Microsoft 365', 300, 40, 90)
const limpezaRecords = generateRecords('servico de limpeza', 200, 2500, 5000)

runAnalysis('Resma Papel A4 75g', papelRecords)
runAnalysis('Licenca Microsoft 365', microsoftRecords)
runAnalysis('Servico de Limpeza', limpezaRecords)

console.log('\n=== DONE ===')
