/**
 * Bot bidding strategy engine — pure function, no I/O.
 *
 * A strategy takes a BotState + StrategyConfig and produces a Decision:
 *
 *   { kind: 'bid',   valor: number, reason: string }    // submit this value
 *   { kind: 'wait',  reason: string }                   // do nothing this tick
 *   { kind: 'stop',  reason: string }                   // stop the session
 *
 * Testable without any browser. Runner converts the decision into an
 * actual UI click, respecting the portal's rate limit and recording the
 * outcome as a bot_event.
 *
 * Three strategies ship in Phase 1:
 *
 *   - MinimalDecrease:
 *       Bid `step` below the current best, where step = max(minDecValue,
 *       melhor_lance * minDecPercent). Stops at the floor. Mirrors the
 *       portal's native robô público behavior but parameterized by us.
 *
 *   - Timed (default in most of the market):
 *       Only bid during configured time windows near the clock. For
 *       disputa aberta the seconds_restantes is authoritative from the
 *       portal; bid only when inside one of the `bid_times` buckets.
 *       Aggressive-final: last bucket uses step*2 to force overtaking.
 *
 *   - Sniper:
 *       Bid as late as safely possible — max(snipe_safety_margin_ms,
 *       0) before closing. Uses step as the decrement. One shot.
 *
 * Future strategies (Phase 2): Predictive (ML floor recommender) and
 * Shadow (never bids, only logs what the active strategy WOULD have done).
 */

export type StrategyKind = 'minimal_decrease' | 'timed' | 'sniper' | 'shadow'

export interface StrategyConfig {
  kind: StrategyKind
  /** Hard floor — NEVER bid below this value. */
  minPrice: number | null
  /** Max total bids per session. Runner enforces; strategy only reads. */
  maxBids: number | null
  /** Current session bids placed so far (for maxBids enforcement). */
  bidsPlacedSoFar: number

  /** Minimum decrement in BRL (e.g. 0.01). Required. */
  minDecValue: number
  /** Extra decrement as a percentage of the current best lance, 0-100. */
  minDecPercent: number

  /** Seconds-before-end windows for Timed strategy, e.g. [60, 30, 10, 3]. */
  bidTimes?: number[]

  /** Sniper safety margin — don't bid within this ms of closing. */
  snipeSafetyMarginMs?: number
}

export interface StrategyInput {
  fase: string
  ativo: boolean
  encerrado: boolean
  melhor_lance: number | null
  nosso_lance: number | null
  nossa_posicao: number | null
  segundos_restantes?: number | null
}

export type Decision =
  | { kind: 'bid'; valor: number; reason: string }
  | { kind: 'wait'; reason: string }
  | { kind: 'stop'; reason: string }

/** Round to 2 decimals in a way that survives IEEE 754 quirks. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function computeStep(config: StrategyConfig, melhor: number): number {
  const pct = (config.minDecPercent / 100) * melhor
  return Math.max(config.minDecValue, pct)
}

function proposedBidWithFloor(
  melhor: number,
  step: number,
  floor: number,
): number {
  const raw = melhor - step
  return round2(Math.max(raw, floor))
}

function commonPreconditions(
  input: StrategyInput,
  config: StrategyConfig,
): Decision | null {
  if (input.encerrado) return { kind: 'stop', reason: 'dispute_ended' }
  if (!input.ativo) return { kind: 'wait', reason: 'dispute_not_active' }
  if (config.maxBids !== null && config.bidsPlacedSoFar >= config.maxBids) {
    return { kind: 'wait', reason: 'max_bids_reached' }
  }
  if (input.nossa_posicao === 1) {
    return { kind: 'wait', reason: 'we_are_winning' }
  }
  if (input.melhor_lance === null) {
    return { kind: 'wait', reason: 'no_best_bid_visible' }
  }
  if (config.minPrice === null) {
    return { kind: 'wait', reason: 'no_floor_configured' }
  }
  if (config.minPrice >= input.melhor_lance) {
    return { kind: 'wait', reason: 'floor_above_current_best' }
  }
  return null
}

/** Minimal Decrease — bid one step below current best, clamped to floor. */
export function decideMinimalDecrease(
  input: StrategyInput,
  config: StrategyConfig,
): Decision {
  const gate = commonPreconditions(input, config)
  if (gate) return gate

  // gate ensures non-null melhor_lance + minPrice
  const melhor = input.melhor_lance as number
  const floor = config.minPrice as number
  const step = computeStep(config, melhor)
  const valor = proposedBidWithFloor(melhor, step, floor)
  if (valor >= melhor) return { kind: 'wait', reason: 'step_too_small' }

  return { kind: 'bid', valor, reason: `minimal_decrease step=${step.toFixed(4)}` }
}

/** Timed — only bid near configured time windows. */
export function decideTimed(input: StrategyInput, config: StrategyConfig): Decision {
  const gate = commonPreconditions(input, config)
  if (gate) return gate

  const windows = config.bidTimes ?? [60, 30, 10, 3]
  const remaining = input.segundos_restantes ?? null

  if (remaining === null) {
    // No countdown info — fall back to minimal decrease to stay competitive.
    return decideMinimalDecrease(input, config)
  }

  // Find the smallest window >= remaining. We fire when we're INSIDE a
  // window (remaining <= window) and still above the previous window.
  const sorted = [...windows].sort((a, b) => a - b) // ascending
  const inWindow = sorted.find((w) => remaining <= w)
  if (!inWindow) return { kind: 'wait', reason: 'outside_timed_windows' }

  const melhor = input.melhor_lance as number
  const floor = config.minPrice as number
  const baseStep = computeStep(config, melhor)

  // Aggressive final: the smallest configured window doubles the step so we
  // don't lose by R$0,01 in the last second.
  const isFinalWindow = inWindow === sorted[0]
  const step = isFinalWindow ? baseStep * 2 : baseStep

  const valor = proposedBidWithFloor(melhor, step, floor)
  if (valor >= melhor) return { kind: 'wait', reason: 'step_too_small' }
  return {
    kind: 'bid',
    valor,
    reason: `timed window=${inWindow}s step=${step.toFixed(4)}${isFinalWindow ? ' aggressive' : ''}`,
  }
}

/** Sniper — one shot as late as safely possible. */
export function decideSniper(input: StrategyInput, config: StrategyConfig): Decision {
  const gate = commonPreconditions(input, config)
  if (gate) return gate

  const safetyMs = config.snipeSafetyMarginMs ?? 1500
  const remainingMs = (input.segundos_restantes ?? 0) * 1000
  if (remainingMs === 0) return { kind: 'wait', reason: 'sniper_no_countdown' }
  if (remainingMs > safetyMs * 3) return { kind: 'wait', reason: 'sniper_too_early' }
  if (remainingMs < safetyMs) return { kind: 'wait', reason: 'sniper_too_late' }

  const melhor = input.melhor_lance as number
  const floor = config.minPrice as number
  const step = computeStep(config, melhor) * 2 // sniper uses double step
  const valor = proposedBidWithFloor(melhor, step, floor)
  if (valor >= melhor) return { kind: 'wait', reason: 'step_too_small' }
  return { kind: 'bid', valor, reason: `sniper remainingMs=${remainingMs}` }
}

/** Shadow — never bids, records what we WOULD have done. Runner logs only. */
export function decideShadow(input: StrategyInput, config: StrategyConfig): Decision {
  // Reuse minimal_decrease as the "would-have" reference strategy.
  const ghost = decideMinimalDecrease(input, { ...config, kind: 'minimal_decrease' })
  if (ghost.kind === 'bid') {
    // Downgrade to wait — the runner emits `shadow_observation` on a bid
    // decision to bot_events. See bot-session-runner.ts.
    return { kind: 'wait', reason: `shadow_would_bid valor=${ghost.valor}` }
  }
  return ghost
}

export function decide(input: StrategyInput, config: StrategyConfig): Decision {
  switch (config.kind) {
    case 'minimal_decrease':
      return decideMinimalDecrease(input, config)
    case 'timed':
      return decideTimed(input, config)
    case 'sniper':
      return decideSniper(input, config)
    case 'shadow':
      return decideShadow(input, config)
    default:
      return { kind: 'wait', reason: `unknown_strategy:${String(config.kind)}` }
  }
}
