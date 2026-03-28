import { describe, it, expect } from 'vitest'
import { analyzeTrend, groupByMonth, analyzeTrendDirection, projectNextMonth } from '../src/trend-analyzer'
import type { PriceRecord } from '../src/types'

function makePriceRecord(overrides: Partial<PriceRecord> = {}): PriceRecord {
  return {
    id: '1',
    licitacao_id: 'lic-1',
    licitacao_numero: '001/2025',
    licitacao_modalidade: 'Pregao Eletronico',
    orgao_nome: 'Prefeitura Municipal',
    orgao_uf: 'SP',
    orgao_municipio: 'Sao Paulo',
    fonte: 'pncp',
    item_description: 'Resma papel A4',
    item_unit: 'UN',
    item_quantity: 100,
    unit_price: 25.0,
    total_price: 2500.0,
    supplier_name: 'Fornecedor X',
    supplier_cnpj: '12345678000100',
    supplier_uf: 'SP',
    supplier_porte: 'ME',
    date_homologation: new Date('2025-06-15'),
    date_opening: new Date('2025-06-01'),
    is_valid: true,
    confidence_score: 0.95,
    ...overrides,
  }
}

function makeRecordsForMonths(
  monthPrices: { month: string; prices: number[] }[],
): PriceRecord[] {
  const records: PriceRecord[] = []
  for (const mp of monthPrices) {
    for (const price of mp.prices) {
      records.push(
        makePriceRecord({
          unit_price: price,
          date_homologation: new Date(`${mp.month}-15`),
        }),
      )
    }
  }
  return records
}

describe('trend-analyzer', () => {
  describe('groupByMonth', () => {
    it('groups records into correct months sorted chronologically', () => {
      const records = [
        makePriceRecord({ date_homologation: new Date('2025-03-10'), unit_price: 10 }),
        makePriceRecord({ date_homologation: new Date('2025-01-05'), unit_price: 20 }),
        makePriceRecord({ date_homologation: new Date('2025-01-20'), unit_price: 30 }),
        makePriceRecord({ date_homologation: new Date('2025-03-25'), unit_price: 40 }),
      ]

      const points = groupByMonth(records)

      expect(points).toHaveLength(2)
      expect(points[0].month).toBe('2025-01')
      expect(points[0].count).toBe(2)
      expect(points[1].month).toBe('2025-03')
      expect(points[1].count).toBe(2)
    })
  })

  describe('analyzeTrendDirection', () => {
    it('detects rising prices (10%/month for 6 months) as subindo', () => {
      // Each month price increases by ~10%
      const records = makeRecordsForMonths([
        { month: '2025-01', prices: [100, 100, 100] },
        { month: '2025-02', prices: [110, 110, 110] },
        { month: '2025-03', prices: [121, 121, 121] },
        { month: '2025-04', prices: [133, 133, 133] },
        { month: '2025-05', prices: [146, 146, 146] },
        { month: '2025-06', prices: [161, 161, 161] },
      ])

      const trend = analyzeTrend(records)
      expect(trend.direction).toBe('subindo')
    })

    it('detects stable prices (+-1%) as estavel', () => {
      const records = makeRecordsForMonths([
        { month: '2025-01', prices: [100, 100, 100] },
        { month: '2025-02', prices: [100, 101, 99] },
        { month: '2025-03', prices: [100, 100, 100] },
        { month: '2025-04', prices: [101, 99, 100] },
        { month: '2025-05', prices: [100, 100, 100] },
        { month: '2025-06', prices: [100, 101, 99] },
      ])

      const trend = analyzeTrend(records)
      expect(trend.direction).toBe('estavel')
    })

    it('detects falling prices (5%/month for 6 months) as descendo', () => {
      const records = makeRecordsForMonths([
        { month: '2025-01', prices: [100, 100, 100] },
        { month: '2025-02', prices: [95, 95, 95] },
        { month: '2025-03', prices: [90, 90, 90] },
        { month: '2025-04', prices: [86, 86, 86] },
        { month: '2025-05', prices: [81, 81, 81] },
        { month: '2025-06', prices: [77, 77, 77] },
      ])

      const trend = analyzeTrend(records)
      expect(trend.direction).toBe('descendo')
    })
  })

  describe('projectNextMonth', () => {
    it('returns undefined when less than 3 months of data', () => {
      const points = [
        { month: '2025-01', count: 3, median: 100, min: 90, max: 110 },
        { month: '2025-02', count: 3, median: 110, min: 100, max: 120 },
      ]

      expect(projectNextMonth(points)).toBeUndefined()
    })

    it('projects correct extrapolation for 6 months of linear data', () => {
      // Linear: 100, 110, 120, 130, 140, 150 => next should be ~160
      const points = [
        { month: '2025-01', count: 3, median: 100, min: 90, max: 110 },
        { month: '2025-02', count: 3, median: 110, min: 100, max: 120 },
        { month: '2025-03', count: 3, median: 120, min: 110, max: 130 },
        { month: '2025-04', count: 3, median: 130, min: 120, max: 140 },
        { month: '2025-05', count: 3, median: 140, min: 130, max: 150 },
        { month: '2025-06', count: 3, median: 150, min: 140, max: 160 },
      ]

      const projected = projectNextMonth(points)
      expect(projected).toBeDefined()
      expect(projected).toBeCloseTo(160, 0)
    })
  })

  describe('analyzeTrend full', () => {
    it('computes variation_12m_percent correctly for 12 months', () => {
      // Start at 100, end at 120 => 20% increase
      const monthPrices = Array.from({ length: 12 }, (_, i) => ({
        month: `2025-${String(i + 1).padStart(2, '0')}`,
        prices: [100 + (i * 20) / 11],
      }))

      const records = makeRecordsForMonths(monthPrices)
      const trend = analyzeTrend(records)

      expect(trend.variation_12m_percent).toBeDefined()
      // First point ~100, last point ~120 => ~20%
      expect(trend.variation_12m_percent).toBeCloseTo(20, 0)
    })
  })
})
