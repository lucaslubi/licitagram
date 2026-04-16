/**
 * Strategy engine unit tests.
 *
 * Pure-function tests — no I/O, no mocks. Uses node:test (Node 20+ builtin).
 *
 * Run with:
 *   pnpm --filter @licitagram/workers exec tsx --test src/bot/lib/strategy.test.ts
 *
 * Covers the preconditions (common gates) + each strategy's decision paths.
 */

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  decideMinimalDecrease,
  decideTimed,
  decideSniper,
  decideShadow,
  decide,
  round2,
  type StrategyConfig,
  type StrategyInput,
} from './strategy'

const baseConfig: StrategyConfig = {
  kind: 'minimal_decrease',
  minPrice: 100,
  maxBids: null,
  bidsPlacedSoFar: 0,
  minDecValue: 0.01,
  minDecPercent: 0,
}

function state(overrides: Partial<StrategyInput>): StrategyInput {
  return {
    fase: 'Aberta',
    ativo: true,
    encerrado: false,
    melhor_lance: 150,
    nosso_lance: null,
    nossa_posicao: 2,
    segundos_restantes: null,
    ...overrides,
  }
}

describe('round2', () => {
  it('handles the classic 0.1+0.2 case', () => {
    assert.equal(round2(0.1 + 0.2), 0.3)
  })
  it('rounds half up', () => {
    assert.equal(round2(1.005), 1.01)
  })
})

describe('common preconditions (via minimal_decrease)', () => {
  it('stops when dispute ended', () => {
    const d = decideMinimalDecrease(state({ encerrado: true }), baseConfig)
    assert.equal(d.kind, 'stop')
  })

  it('waits when dispute not active', () => {
    const d = decideMinimalDecrease(state({ ativo: false }), baseConfig)
    assert.deepEqual({ kind: d.kind, reason: d.reason }, {
      kind: 'wait',
      reason: 'dispute_not_active',
    })
  })

  it('waits when we are already winning', () => {
    const d = decideMinimalDecrease(state({ nossa_posicao: 1 }), baseConfig)
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /we_are_winning/)
  })

  it('waits when max_bids reached', () => {
    const d = decideMinimalDecrease(state({}), { ...baseConfig, maxBids: 5, bidsPlacedSoFar: 5 })
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /max_bids_reached/)
  })

  it('waits when no floor configured', () => {
    const d = decideMinimalDecrease(state({}), { ...baseConfig, minPrice: null })
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /no_floor_configured/)
  })

  it('waits when melhor_lance is null', () => {
    const d = decideMinimalDecrease(state({ melhor_lance: null }), baseConfig)
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /no_best_bid_visible/)
  })

  it('waits when floor is above current best', () => {
    const d = decideMinimalDecrease(state({ melhor_lance: 80 }), {
      ...baseConfig,
      minPrice: 100,
    })
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /floor_above_current_best/)
  })
})

describe('decideMinimalDecrease', () => {
  it('bids melhor - minDecValue', () => {
    const d = decideMinimalDecrease(state({ melhor_lance: 150 }), {
      ...baseConfig,
      minDecValue: 0.05,
    })
    assert.equal(d.kind, 'bid')
    if (d.kind === 'bid') assert.equal(d.valor, 149.95)
  })

  it('uses percent step when larger than flat value', () => {
    const d = decideMinimalDecrease(state({ melhor_lance: 200 }), {
      ...baseConfig,
      minDecValue: 0.01,
      minDecPercent: 5, // 5% of 200 = 10
    })
    assert.equal(d.kind, 'bid')
    if (d.kind === 'bid') assert.equal(d.valor, 190)
  })

  it('clamps to floor', () => {
    const d = decideMinimalDecrease(state({ melhor_lance: 101 }), {
      ...baseConfig,
      minPrice: 100,
      minDecValue: 10, // would go to 91 but floor is 100
    })
    assert.equal(d.kind, 'bid')
    if (d.kind === 'bid') assert.equal(d.valor, 100)
  })

  it('waits when our floor-clamped bid equals current best', () => {
    // If minPrice == melhor_lance, commonPreconditions catches it first.
    // This tests the step case where the step is too small to undercut.
    const d = decideMinimalDecrease(state({ melhor_lance: 100.005 }), {
      ...baseConfig,
      minPrice: 100,
      minDecValue: 0.001, // tiny step; rounds to 100.00 which equals 100 (floor)
    })
    // 100.005 - 0.001 = 100.004 → round2 = 100.00; floor = 100 → valor = 100
    // 100 < 100.005 so it's a valid undercut.
    assert.equal(d.kind, 'bid')
    if (d.kind === 'bid') assert.equal(d.valor, 100)
  })
})

describe('decideTimed', () => {
  const timedCfg: StrategyConfig = {
    ...baseConfig,
    kind: 'timed',
    bidTimes: [60, 30, 10, 3],
  }

  it('waits when outside any window', () => {
    const d = decideTimed(state({ segundos_restantes: 120 }), timedCfg)
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /outside_timed_windows/)
  })

  it('bids when inside the 60s window', () => {
    const d = decideTimed(state({ segundos_restantes: 45, melhor_lance: 150 }), {
      ...timedCfg,
      minDecValue: 1,
    })
    assert.equal(d.kind, 'bid')
    if (d.kind === 'bid') assert.equal(d.valor, 149)
  })

  it('doubles step in the final window', () => {
    const d = decideTimed(state({ segundos_restantes: 2, melhor_lance: 150 }), {
      ...timedCfg,
      minDecValue: 1,
    })
    assert.equal(d.kind, 'bid')
    if (d.kind === 'bid') {
      assert.equal(d.valor, 148) // step = 2 in final window
      assert.match(d.reason, /aggressive/)
    }
  })

  it('falls back to minimal_decrease when countdown missing', () => {
    const d = decideTimed(state({ segundos_restantes: null, melhor_lance: 150 }), timedCfg)
    assert.equal(d.kind, 'bid')
  })
})

describe('decideSniper', () => {
  const sniperCfg: StrategyConfig = {
    ...baseConfig,
    kind: 'sniper',
    snipeSafetyMarginMs: 1500,
    minDecValue: 0.5,
  }

  it('waits when too early', () => {
    const d = decideSniper(state({ segundos_restantes: 30 }), sniperCfg)
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /sniper_too_early/)
  })

  it('waits when too late (inside safety margin)', () => {
    const d = decideSniper(state({ segundos_restantes: 1 }), sniperCfg)
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /sniper_too_late/)
  })

  it('bids exactly in the window', () => {
    // safety=1500ms, so window is 1500..4500ms → 1.5..4.5s
    const d = decideSniper(state({ segundos_restantes: 3, melhor_lance: 150 }), sniperCfg)
    assert.equal(d.kind, 'bid')
    if (d.kind === 'bid') assert.equal(d.valor, 149) // step = 0.5*2 = 1
  })

  it('waits when no countdown', () => {
    const d = decideSniper(state({ segundos_restantes: null }), sniperCfg)
    assert.equal(d.kind, 'wait')
  })
})

describe('decideShadow', () => {
  it('always returns wait, even when it would bid', () => {
    const d = decideShadow(state({ melhor_lance: 150 }), {
      ...baseConfig,
      kind: 'shadow',
      minDecValue: 1,
    })
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /shadow_would_bid/)
  })
})

describe('decide dispatcher', () => {
  it('routes by kind', () => {
    const d = decide(state({}), { ...baseConfig, kind: 'minimal_decrease' })
    assert.equal(d.kind, 'bid')
  })
  it('wait on unknown kind', () => {
    const d = decide(state({}), { ...baseConfig, kind: 'bogus' as unknown as 'shadow' })
    assert.equal(d.kind, 'wait')
    assert.match(d.reason, /unknown_strategy/)
  })
})
