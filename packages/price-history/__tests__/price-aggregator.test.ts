import { describe, it, expect } from 'vitest'
import { computeStatistics, assessConfidence, calculatePercentile, aggregateByDimension } from '../src/price-aggregator'
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

describe('price-aggregator', () => {
  describe('assessConfidence', () => {
    it('returns alta when count >= 10 AND cv < 25', () => {
      expect(assessConfidence(10, 20)).toBe('alta')
      expect(assessConfidence(15, 10)).toBe('alta')
    })

    it('returns media when count >= 5 AND count < 10 (cv ok)', () => {
      expect(assessConfidence(7, 30)).toBe('media')
    })

    it('returns media when cv >= 25 AND cv < 50 (count >= 10)', () => {
      expect(assessConfidence(12, 30)).toBe('media')
    })

    it('returns baixa when count < 5', () => {
      expect(assessConfidence(3, 10)).toBe('baixa')
    })

    it('returns baixa when cv >= 50', () => {
      expect(assessConfidence(10, 60)).toBe('baixa')
    })
  })

  describe('calculatePercentile', () => {
    it('computes percentile 25 of [10,20,30,40,50] = 20', () => {
      expect(calculatePercentile([10, 20, 30, 40, 50], 25)).toBe(20)
    })

    it('computes percentile 75 of [10,20,30,40,50] = 40', () => {
      expect(calculatePercentile([10, 20, 30, 40, 50], 75)).toBe(40)
    })

    it('returns 0 for empty array', () => {
      expect(calculatePercentile([], 50)).toBe(0)
    })

    it('handles single element', () => {
      expect(calculatePercentile([42], 50)).toBe(42)
    })
  })

  describe('aggregateByDimension', () => {
    it('aggregates by UF with 3 UFs', () => {
      const records = [
        makePriceRecord({ orgao_uf: 'SP', unit_price: 10 }),
        makePriceRecord({ orgao_uf: 'SP', unit_price: 20 }),
        makePriceRecord({ orgao_uf: 'RJ', unit_price: 30 }),
        makePriceRecord({ orgao_uf: 'RJ', unit_price: 40 }),
        makePriceRecord({ orgao_uf: 'MG', unit_price: 50 }),
      ]

      const result = aggregateByDimension(records, (r) => r.orgao_uf)

      expect(result).toHaveLength(3)

      const sp = result.find((r) => r.key === 'SP')!
      expect(sp.count).toBe(2)
      expect(sp.median).toBe(15) // median of [10, 20]

      const rj = result.find((r) => r.key === 'RJ')!
      expect(rj.count).toBe(2)
      expect(rj.median).toBe(35) // median of [30, 40]

      const mg = result.find((r) => r.key === 'MG')!
      expect(mg.count).toBe(1)
      expect(mg.median).toBe(50)
    })
  })

  describe('computeStatistics', () => {
    it('returns confidence alta for 10 normal prices with CV < 25%', () => {
      // Prices clustered around 25 with low variance
      const records = [22, 23, 24, 25, 25, 26, 26, 27, 24, 23].map((p) =>
        makePriceRecord({ unit_price: p }),
      )
      const stats = computeStatistics(records)

      expect(stats.count).toBe(10)
      expect(stats.confidence).toBe('alta')
      expect(stats.cv_percent).toBeLessThan(25)
      expect(stats.mean).toBeGreaterThan(0)
      expect(stats.median).toBeGreaterThan(0)
    })

    it('returns confidence media for 7 prices with CV ~30%', () => {
      // Prices with moderate spread: mean ~25, stddev ~7.5 => CV ~30%
      const records = [15, 18, 22, 25, 28, 32, 35].map((p) =>
        makePriceRecord({ unit_price: p }),
      )
      const stats = computeStatistics(records)

      expect(stats.count).toBe(7)
      expect(stats.confidence).toBe('media')
    })

    it('returns confidence baixa for 3 prices with CV ~60%', () => {
      // Few records with high variance
      const records = [10, 30, 60].map((p) => makePriceRecord({ unit_price: p }))
      const stats = computeStatistics(records)

      expect(stats.count).toBe(3)
      expect(stats.confidence).toBe('baixa')
    })

    it('handles empty array: count=0, confidence=baixa, all values=0', () => {
      const stats = computeStatistics([])

      expect(stats.count).toBe(0)
      expect(stats.confidence).toBe('baixa')
      expect(stats.mean).toBe(0)
      expect(stats.median).toBe(0)
      expect(stats.min).toBe(0)
      expect(stats.max).toBe(0)
      expect(stats.std_deviation).toBe(0)
      expect(stats.cv_percent).toBe(0)
      expect(stats.percentile_25).toBe(0)
      expect(stats.percentile_75).toBe(0)
    })
  })
})
