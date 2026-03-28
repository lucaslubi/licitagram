import { describe, it, expect } from 'vitest'
import { buildSearchClause, buildFilterClauses, buildFullQuery, generateCacheKey } from '../src/search-engine'
import type { PriceSearchQuery } from '../src/types'

describe('search-engine', () => {
  describe('buildSearchClause', () => {
    it('uses plainto_tsquery, NOT LIKE', () => {
      const result = buildSearchClause('Figma Enterprise')

      expect(result.sql).toContain('plainto_tsquery')
      expect(result.sql).not.toContain('LIKE')
      expect(result.sql).toContain('to_tsvector')
      expect(result.params).toEqual(['Figma Enterprise'])
    })
  })

  describe('buildFilterClauses', () => {
    it('includes CATMAT filter for catmat_catser = "27502"', () => {
      const result = buildFilterClauses({ query: 'test', catmat_catser: '27502' })

      expect(result.sql).toContain('t.objeto')
      expect(result.params).toContain('27502')
    })

    it('includes AND for UF = "SP"', () => {
      const result = buildFilterClauses({ query: 'test', uf: 'SP' })

      expect(result.sql).toContain('t.uf')
      expect(result.params).toContain('SP')
    })

    it('includes date filter for date_from', () => {
      const dateFrom = new Date('2025-01-01')
      const result = buildFilterClauses({ query: 'test', date_from: dateFrom })

      expect(result.sql).toContain('t.data_encerramento')
      expect(result.params).toContain(dateFrom)
    })

    it('returns empty sql when no filters', () => {
      const result = buildFilterClauses({ query: 'test' })
      expect(result.sql).toBe('')
      expect(result.params).toHaveLength(0)
    })
  })

  describe('buildFullQuery', () => {
    it('generates count, data, and stats queries', () => {
      const query: PriceSearchQuery = {
        query: 'papel A4',
        uf: 'SP',
        page: 1,
        page_size: 20,
      }

      const result = buildFullQuery(query)

      expect(result.countSql).toContain('COUNT')
      expect(result.dataSql).toContain('tenders t')
      expect(result.dataSql).toContain('LEFT JOIN competitors c')
      expect(result.statsSql).toContain('AVG')
      expect(result.statsSql).toContain('PERCENTILE_CONT')
      expect(result.params.length).toBeGreaterThan(0)
    })
  })

  describe('generateCacheKey', () => {
    it('is deterministic: same query = same key', () => {
      const q1: PriceSearchQuery = { query: 'papel A4', uf: 'SP' }
      const q2: PriceSearchQuery = { query: 'papel A4', uf: 'SP' }

      expect(generateCacheKey(q1)).toBe(generateCacheKey(q2))
    })

    it('ignores page and page_size: different pages = same stats key', () => {
      const q1: PriceSearchQuery = { query: 'papel A4', page: 1, page_size: 20 }
      const q2: PriceSearchQuery = { query: 'papel A4', page: 3, page_size: 50 }

      expect(generateCacheKey(q1)).toBe(generateCacheKey(q2))
    })

    it('different queries produce different keys', () => {
      const q1: PriceSearchQuery = { query: 'papel A4' }
      const q2: PriceSearchQuery = { query: 'licenca Microsoft' }

      expect(generateCacheKey(q1)).not.toBe(generateCacheKey(q2))
    })
  })
})
