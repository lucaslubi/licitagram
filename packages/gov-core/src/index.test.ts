import { describe, it, expect } from 'vitest'
import { GOV_CORE_VERSION } from './index'
import { CLAUDE_MODELS } from './ai/claude'

describe('gov-core bootstrap', () => {
  it('exposes version constant', () => {
    expect(GOV_CORE_VERSION).toBe('0.0.1')
  })

  it('exposes Claude model IDs matching master plan D-5', () => {
    expect(CLAUDE_MODELS.opus).toBe('claude-opus-4-7')
    expect(CLAUDE_MODELS.haiku).toMatch(/^claude-haiku-4-5/)
  })
})
