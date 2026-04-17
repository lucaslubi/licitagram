import { describe, it, expect } from 'vitest'
import { GOV_QUEUE_PREFIX } from './connection'

describe('gov-workers prefix (RI-6)', () => {
  it('uses the licitagov prefix', () => {
    expect(GOV_QUEUE_PREFIX).toBe('licitagov')
  })
})
