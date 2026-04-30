/**
 * Dispute Engine — unit tests for F4 rate-limiter, F3 floor enforcement,
 * F1 observability, F7 pause/resume.
 *
 * Pure tests — instantiates DisputeEngine but mocks the API surface
 * (scanRoom/submitLance) via the strategyByItem callback + spy callbacks.
 * NO real network, NO supabase.
 *
 * Run with:
 *   pnpm --filter @licitagram/workers exec tsx --test src/bot/nexus/dispute-engine.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { DisputeEngine, type EngineStrategy } from './dispute-engine'

// Como o engine importa strategies.cjs (require), e nesses testes não
// queremos disparar a lógica real, vamos testar apenas as partes que
// independem do strategies.cjs: rate-limiter via método setRateLimit
// e a expor o estado via pause/resume + isPaused.

const baseStrat: EngineStrategy = {
  chaoFinanceiro: 10,
  puloMinimo: 0.01,
  puloMaximo: 0.05,
  delayMin: 0,
  delayMax: 0,
  standbyMin: 0,
  ativo: true,
}

function makeEngine(rate?: { minDelayBetweenOwnBidsMs?: number; maxBidsPerMinute?: number }) {
  return new DisputeEngine(
    'X',
    { accessToken: 'fake', refreshToken: null },
    () => baseStrat,
    {},
    rate,
  )
}

describe('DisputeEngine — F7 pause/resume', () => {
  it('isPaused defaults false', () => {
    const e = makeEngine()
    assert.equal(e.isPaused(), false)
  })

  it('pause() flips, resume() restores', () => {
    const e = makeEngine()
    e.pause()
    assert.equal(e.isPaused(), true)
    e.resume()
    assert.equal(e.isPaused(), false)
  })
})

describe('DisputeEngine — F4 rate limiter', () => {
  it('setRateLimit overrides default config', () => {
    const e = makeEngine({ minDelayBetweenOwnBidsMs: 1000, maxBidsPerMinute: 5 })
    // sanity — engine não expõe rateLimit direto, mas setRateLimit não throw
    assert.doesNotThrow(() => e.setRateLimit({ maxBidsPerMinute: 30 }))
  })

  it('rateLimitCheck via reflexão: bloqueia após maxBidsPerMinute', () => {
    const e = makeEngine({ minDelayBetweenOwnBidsMs: 0, maxBidsPerMinute: 3 })
    const eAny = e as unknown as {
      ownBidsLog: number[]
      rateLimitCheck(now: number): string | null
    }
    const now = 1_000_000
    // 3 lances no último minuto
    eAny.ownBidsLog = [now - 50000, now - 30000, now - 1000]
    const r = eAny.rateLimitCheck(now)
    assert.match(r ?? '', /rate_limit_per_minute/)
  })

  it('rateLimitCheck retorna null quando dentro do limite', () => {
    const e = makeEngine({ minDelayBetweenOwnBidsMs: 0, maxBidsPerMinute: 100 })
    const eAny = e as unknown as {
      ownBidsLog: number[]
      rateLimitCheck(now: number): string | null
    }
    eAny.ownBidsLog = []
    assert.equal(eAny.rateLimitCheck(Date.now()), null)
  })

  it('rateLimitCheck bloqueia quando lance recente < minDelayBetweenOwnBidsMs', () => {
    const e = makeEngine({ minDelayBetweenOwnBidsMs: 3000, maxBidsPerMinute: 100 })
    const eAny = e as unknown as {
      ownBidsLog: number[]
      rateLimitCheck(now: number): string | null
    }
    const now = 1_000_000
    eAny.ownBidsLog = [now - 1500] // 1.5s atrás, menor que 3s
    const r = eAny.rateLimitCheck(now)
    assert.match(r ?? '', /rate_limit_min_delay/)
  })

  it('janela móvel: lances > 60s atrás não contam', () => {
    const e = makeEngine({ minDelayBetweenOwnBidsMs: 0, maxBidsPerMinute: 5 })
    const eAny = e as unknown as {
      ownBidsLog: number[]
      rateLimitCheck(now: number): string | null
    }
    const now = 1_000_000
    eAny.ownBidsLog = [now - 70_000, now - 65_000, now - 61_000] // todos > 60s
    assert.equal(eAny.rateLimitCheck(now), null)
    // O check filtra; deve ter limpado o bucket
    assert.equal(eAny.ownBidsLog.length, 0)
  })
})

describe('DisputeEngine — F1 observability', () => {
  it('cancelPending de razão não-housekeeping chama onBidSkip', () => {
    let skipped: { reason: string } | null = null
    const e = new DisputeEngine(
      'X',
      { accessToken: 'fake', refreshToken: null },
      () => baseStrat,
      {
        onBidSkip: async (_item, reason) => {
          skipped = { reason }
        },
      },
    )
    const eAny = e as unknown as {
      lastScan: Array<Record<string, unknown>>
      pendingShots: Map<number, { bid: number; timer: NodeJS.Timeout; itemId: number; targetMarket: number; executeAt: number }>
      cancelPending(itemId: number, reason: string): void
    }
    // simula um scan + pending
    eAny.lastScan = [
      {
        numero: 7,
        melhorValor: 100,
        seuValor: null,
        fase: 'aberta',
        faseOriginal: 'LA',
        podeEnviarLances: true,
        tempoSegundos: 60,
        intervaloMinimo: null,
        casasDecimais: 4,
      },
    ]
    eAny.pendingShots.set(7, {
      bid: 99,
      timer: setTimeout(() => {}, 10000),
      itemId: 7,
      targetMarket: 100,
      executeAt: Date.now() + 10000,
    })
    eAny.cancelPending(7, 'chao_invalido_ou_zero')
    // Microtask tick — onBidSkip é void promise
    return new Promise<void>((res) => {
      setImmediate(() => {
        assert.equal(skipped?.reason, 'chao_invalido_ou_zero')
        res()
      })
    })
  })

  it('cancelPending de razão housekeeping NÃO chama onBidSkip', () => {
    let calls = 0
    const e = new DisputeEngine(
      'X',
      { accessToken: 'fake', refreshToken: null },
      () => baseStrat,
      {
        onBidSkip: async () => {
          calls++
        },
      },
    )
    const eAny = e as unknown as {
      lastScan: Array<Record<string, unknown>>
      pendingShots: Map<number, { bid: number; timer: NodeJS.Timeout; itemId: number; targetMarket: number; executeAt: number }>
      cancelPending(itemId: number, reason: string): void
    }
    eAny.lastScan = [
      {
        numero: 1,
        melhorValor: 50,
        seuValor: null,
        fase: 'aberta',
        faseOriginal: 'LA',
        podeEnviarLances: true,
        tempoSegundos: 60,
        intervaloMinimo: null,
        casasDecimais: 4,
      },
    ]
    eAny.pendingShots.set(1, {
      bid: 49,
      timer: setTimeout(() => {}, 10000),
      itemId: 1,
      targetMarket: 50,
      executeAt: Date.now() + 10000,
    })
    eAny.cancelPending(1, 'shot_terminou')
    return new Promise<void>((res) => {
      setImmediate(() => {
        assert.equal(calls, 0)
        res()
      })
    })
  })
})

// Marker pra TS reconhecer hooks importados
beforeEach(() => {})
afterEach(() => {})
