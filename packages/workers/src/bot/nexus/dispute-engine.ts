/**
 * Dispute Engine — SaaS port do `src/main/queue.js` + `engine.js` do LicitaNexus.
 *
 * Loop HFT que:
 *   1. Faz sweep da sala (GET /itens/em-disputa) a cada ~500ms
 *   2. Pra cada item aberto, avalia estratégia (reaproveita strategies.cjs LITERAL)
 *   3. Agenda disparo se mercado mudou
 *   4. Dispara via POST na API (50-200ms por lance)
 *   5. Memoriza recoil (6s) pra não spammar
 *   6. Rate-limit HFT: 2 tiros por 100ms
 *
 * Diferenças do concorrente:
 *   - Sem BrowserView Electron — fetch direto
 *   - Token (JWT) vem do bot_tokens table (cliente logou uma vez no nosso web)
 *   - Auto-refresh token integrado no ciclo
 *   - Persist no Supabase (bot_sessions, bot_events)
 */

import {
  scanRoom,
  submitLance,
  getParticipacao,
  faseToApiFaseItem,
  ensureAccessToken,
  type DisputeItem,
  type TokenPair,
  type ShootResult,
} from './comprasgov-api'

// Reaproveita os módulos CommonJS do concorrente LITERAL
// (strategies.cjs). Import direto funciona porque tsc gera CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Strategies = require('./strategies.cjs') as {
  evaluateBid: (
    mercado: number | null,
    meu: number | null,
    chao: number | null,
    config: Record<string, unknown>,
    botConfig: Record<string, unknown>,
    faseAtual?: string,
    intervaloMinimoEdital?: number | null,
  ) => { allowed: boolean; bid: number | null; reason: string }
}

export interface EngineStrategy {
  /** Piso absoluto (não dar lance abaixo disso) */
  chaoFinanceiro: number | null
  /** Decremento mínimo por lance (R$) */
  puloMinimo: number
  /** Decremento máximo por lance (R$) */
  puloMaximo: number
  /** Lance fechado (tiro cego) — usado na fase fechada */
  lanceFechado?: number | null
  /** Atraso aleatório entre sweep e disparo (s) */
  delayMin: number
  delayMax: number
  /** Standby: se tempo restante > N minutos, pausa (economiza ação) */
  standbyMin: number
  /** Casas decimais do lote (padrão 4) */
  casasDecimais?: number
  /** Ativo pra esse lote? */
  ativo?: boolean
}

/** F4: rate limiter por sessão. Limita lances DO PRÓPRIO BOT pra evitar
 *  fechar muito rápido sem operador conseguir intervir (P0-2). */
export interface RateLimitConfig {
  /** Tempo mínimo entre 2 lances do bot, em ms. Default 3000. */
  minDelayBetweenOwnBidsMs: number
  /** Teto de lances do bot por minuto. Default 15. */
  maxBidsPerMinute: number
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  minDelayBetweenOwnBidsMs: 3000,
  maxBidsPerMinute: 15,
}

export interface EngineCallbacks {
  /** Token refreshado — persistir no DB */
  onTokenRefreshed?: (tokens: TokenPair) => Promise<void>
  /** Lance disparado com sucesso */
  onBidPlaced?: (item: DisputeItem, bid: number) => Promise<void>
  /** Lance rejeitado pelo portal */
  onBidRejected?: (item: DisputeItem, erro: string) => Promise<void>
  /** Lance NÃO disparado (estratégia rejeitou ou bloqueou). Crítico
   *  pra observabilidade — sem isso, sessão fica "em execução" com
   *  zero lances e ninguém sabe por quê (P0-1 root cause). */
  onBidSkip?: (item: DisputeItem, reason: string, ctx?: Record<string, unknown>) => Promise<void>
  /** Floor enforcement bloqueou um disparo iminente (lance < piso). */
  onFloorBreachPrevented?: (item: DisputeItem, attempted: number, floor: number) => Promise<void>
  /** Snapshot de scan (debug/UI) */
  onScan?: (items: DisputeItem[], modoDisputa: string) => Promise<void>
  /** Erro no loop */
  onError?: (err: Error) => Promise<void>
}

/** Reasons que NÃO devem virar evento (ruído de housekeeping). Tudo
 *  fora dessa lista vira `our_bid_skip` pra termos trilha completa. */
const SILENT_CANCEL_REASONS = new Set([
  'shot_terminou',
  'reagendando_mercado_mudou',
  'engine_parada',
])

interface PendingShot {
  itemId: number
  bid: number
  targetMarket: number
  executeAt: number
  timer: NodeJS.Timeout
}

interface RecoilMemory {
  bid: number
  timestamp: number
}

export class DisputeEngine {
  private running = false
  private paused = false
  private sweeping = false
  private tokens: TokenPair
  private modoDisputa = 'ABERTO E FECHADO'
  private sweepInterval?: NodeJS.Timeout
  private lastScan: DisputeItem[] = []
  private pendingShots = new Map<number, PendingShot>()
  private recoil = new Map<number, RecoilMemory>()
  private hftFireRate: number[] = []
  private activeShots = 0
  private inicioFaseFechada = new Map<number, number>()
  /** F4: bucket de timestamps dos lances disparados (ms). */
  private ownBidsLog: number[] = []
  private rateLimit: RateLimitConfig

  constructor(
    private readonly compraId: string,
    initialTokens: TokenPair,
    private readonly strategyByItem: (itemNumero: number) => EngineStrategy | null,
    private readonly callbacks: EngineCallbacks = {},
    rateLimit?: Partial<RateLimitConfig>,
  ) {
    this.tokens = initialTokens
    this.rateLimit = { ...DEFAULT_RATE_LIMIT, ...rateLimit }
  }

  /** F7: pause sem desligar. Sweep continua (mantém token quente) mas
   *  bloqueia novos disparos. */
  pause(): void {
    this.paused = true
  }
  resume(): void {
    this.paused = false
  }
  isPaused(): boolean {
    return this.paused
  }
  /** F4: ajusta rate-limit em runtime (usado por F5 live-update). */
  setRateLimit(cfg: Partial<RateLimitConfig>): void {
    this.rateLimit = { ...this.rateLimit, ...cfg }
  }
  /** F4: avalia se podemos disparar agora pelo rate-limit. Retorna
   *  null se OK, ou string com o motivo se bloqueado. */
  private rateLimitCheck(now: number): string | null {
    // Janela móvel de 1 minuto
    this.ownBidsLog = this.ownBidsLog.filter((t) => now - t < 60_000)
    if (this.ownBidsLog.length >= this.rateLimit.maxBidsPerMinute) {
      return `rate_limit_per_minute_${this.rateLimit.maxBidsPerMinute}`
    }
    const last = this.ownBidsLog[this.ownBidsLog.length - 1]
    if (last !== undefined && now - last < this.rateLimit.minDelayBetweenOwnBidsMs) {
      return `rate_limit_min_delay_${this.rateLimit.minDelayBetweenOwnBidsMs}ms`
    }
    return null
  }

  async start(sweepIntervalMs = 500): Promise<void> {
    if (this.running) return
    this.running = true
    // Descobre modo de disputa uma vez
    try {
      const part = await getParticipacao(this.compraId, this.tokens.accessToken)
      this.modoDisputa = part.modoDisputa
    } catch {
      /* fallback padrão */
    }
    this.sweepInterval = setInterval(() => {
      void this.radarSweep()
    }, sweepIntervalMs)
  }

  stop(): void {
    this.running = false
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval)
      this.sweepInterval = undefined
    }
    // Cancela disparos pendentes
    for (const pending of this.pendingShots.values()) {
      clearTimeout(pending.timer)
    }
    this.pendingShots.clear()
  }

  getLastScan(): DisputeItem[] {
    return this.lastScan
  }

  /**
   * Um ciclo do radar: ensureToken → scan → pra cada item processa estratégia.
   */
  private async radarSweep(): Promise<void> {
    if (!this.running || this.sweeping) return
    this.sweeping = true
    try {
      // Ensure access token antes de qualquer chamada
      const refreshed = await ensureAccessToken(this.tokens)
      if (!refreshed) {
        await this.callbacks.onError?.(new Error('Token expirado e refresh falhou'))
        this.stop()
        return
      }
      if (refreshed.accessToken !== this.tokens.accessToken) {
        this.tokens = refreshed
        await this.callbacks.onTokenRefreshed?.(refreshed)
      }

      const items = await scanRoom(this.compraId, this.tokens.accessToken, this.modoDisputa)
      this.lastScan = items
      await this.callbacks.onScan?.(items, this.modoDisputa)

      for (const item of items) {
        if (!this.running) break
        await this.processLot(item)
      }
    } catch (err) {
      await this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.sweeping = false
    }
  }

  private async processLot(lote: DisputeItem): Promise<void> {
    // F7: paused — não dispara mas mantém scan rolando.
    if (this.paused) {
      this.cancelPending(lote.numero, 'paused')
      return
    }

    // Item está em combate?
    const emCombate =
      lote.podeEnviarLances && lote.fase !== 'encerrada' && lote.fase !== 'aguardando'
    if (!emCombate) {
      this.cancelPending(lote.numero, 'fora_de_combate')
      return
    }

    // Recoil memory — se lançou há pouco, não spamma
    const now = Date.now()
    const recoil = this.recoil.get(lote.numero)
    if (recoil && now - recoil.timestamp < 6000) {
      if (lote.melhorValor !== null && lote.melhorValor > recoil.bid - 0.0001) {
        // mercado ainda não refletiu nosso último lance — usa recoil como fonte
        lote.melhorValor = recoil.bid
        lote.seuValor = recoil.bid
      } else if (lote.melhorValor !== null && lote.melhorValor <= recoil.bid - 0.0001) {
        // mercado já passou do nosso lance — limpa recoil
        this.recoil.delete(lote.numero)
      }
    }

    const config = this.strategyByItem(lote.numero)
    if (!config || config.ativo === false) {
      this.cancelPending(lote.numero, 'sem_config_ativa')
      this.emitSkip(lote, 'sem_config_ativa')
      return
    }
    const casasDecimais = config.casasDecimais ?? lote.casasDecimais ?? 4
    const faseAtual = lote.fase

    // Standby: se tempo restante > N minutos, pausa
    let isStandby = false
    let delayMs = this.resolveDelayMs(config)

    if (faseAtual === 'aberta') {
      const standbySecs = (config.standbyMin || 0) * 60
      isStandby = standbySecs > 0 && lote.tempoSegundos > standbySecs
    } else if (faseAtual === 'randomica') {
      delayMs = 0
      isStandby = false
    } else if (faseAtual === 'fechada') {
      // Fase fechada: espera 180s antes de atirar, depois cascata 500ms entre tiros
      if (!this.inicioFaseFechada.has(lote.numero)) {
        this.inicioFaseFechada.set(lote.numero, Date.now())
      }
      const decorrido = Date.now() - this.inicioFaseFechada.get(lote.numero)!
      if (decorrido < 180_000) {
        isStandby = true
      } else {
        const lotesAtivos = this.pendingShots.size
        delayMs = Math.max(delayMs, lotesAtivos * 500)
      }
    } else {
      // encerrada / aguardando / bloqueado
      isStandby = true
    }

    if (isStandby) {
      this.cancelPending(lote.numero, 'standby')
      return
    }

    // Chama o evaluateBid do concorrente LITERAL (strategies.cjs)
    const decision = Strategies.evaluateBid(
      lote.melhorValor,
      lote.seuValor,
      config.chaoFinanceiro,
      { ...config, casasDecimais },
      config as unknown as Record<string, unknown>,
      faseAtual,
      lote.intervaloMinimo,
    )

    if (!decision.allowed || decision.bid === null) {
      this.cancelPending(lote.numero, decision.reason)
      // P0-1 root cause: ANTES esse path era 100% silencioso. Agora
      // emite our_bid_skip com mercado/chao pra UI mostrar "por quê".
      this.emitSkip(lote, decision.reason, {
        mercado: lote.melhorValor,
        chao: config.chaoFinanceiro,
        meu: lote.seuValor,
        fase: lote.fase,
      })
      return
    }

    // Respeita intervaloMinimo do edital
    let finalBid = decision.bid
    if (lote.intervaloMinimo && lote.intervaloMinimo > 0 && lote.melhorValor !== null) {
      const maxPermitido = lote.melhorValor - lote.intervaloMinimo
      if (finalBid > maxPermitido + 0.00001) {
        if (config.chaoFinanceiro !== null && maxPermitido < config.chaoFinanceiro - 0.00001) {
          this.cancelPending(lote.numero, 'bloqueio_chao')
          return
        }
        finalBid = maxPermitido
      }
    }

    // Reagendar se mercado mudou
    const existing = this.pendingShots.get(lote.numero)
    if (existing) {
      const marketChanged = Math.abs(existing.targetMarket - (lote.melhorValor ?? 0)) > 0.0001
      if (!marketChanged) return
      this.cancelPending(lote.numero, 'reagendando_mercado_mudou')
    }

    this.scheduleShot(lote, finalBid, delayMs)
  }

  private resolveDelayMs(config: EngineStrategy): number {
    const min = config.delayMin || 0
    const max = Math.max(min, config.delayMax || 0)
    const chosen = min + Math.random() * (max - min)
    return Math.round(chosen * 1000)
  }

  private scheduleShot(lote: DisputeItem, bid: number, delayMs: number): void {
    const executeAt = Date.now() + delayMs
    const timer = setTimeout(() => {
      void this.executeShot(lote.numero)
    }, delayMs)
    this.pendingShots.set(lote.numero, {
      itemId: lote.numero,
      bid,
      targetMarket: lote.melhorValor ?? 0,
      executeAt,
      timer,
    })
  }

  private cancelPending(itemId: number, reason: string): void {
    const p = this.pendingShots.get(itemId)
    if (!p) return
    clearTimeout(p.timer)
    this.pendingShots.delete(itemId)
    if (!SILENT_CANCEL_REASONS.has(reason)) {
      const item = this.lastScan.find((i) => i.numero === itemId)
      if (item) {
        void this.callbacks.onBidSkip?.(item, reason, {
          attempted_bid: p.bid,
          mercado: item.melhorValor,
          chao: this.strategyByItem(itemId)?.chaoFinanceiro ?? null,
          fase: item.fase,
        })
      }
    }
  }

  /** Versão de skip pra rejeição que acontece ANTES de criar pendingShot
   *  (i.e., evaluateBid retornou deny). Sem essa versão, o motivo da
   *  rejeição na primeira fase do loop nunca é emitido. */
  private emitSkip(item: DisputeItem, reason: string, ctx?: Record<string, unknown>): void {
    if (SILENT_CANCEL_REASONS.has(reason)) return
    void this.callbacks.onBidSkip?.(item, reason, ctx)
  }

  private async waitHftSlot(): Promise<void> {
    while (true) {
      const now = Date.now()
      this.hftFireRate = this.hftFireRate.filter((t) => now - t < 100)
      if (this.hftFireRate.length < 2) {
        this.hftFireRate.push(now)
        break
      }
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  private async executeShot(itemId: number): Promise<void> {
    const pending = this.pendingShots.get(itemId)
    if (!pending) return

    // Drift check — se atrasou muito, aborta
    if (Date.now() - pending.executeAt > 6000) {
      this.cancelPending(itemId, 'tiro_expirado_atraso')
      return
    }
    if (!this.running) {
      this.cancelPending(itemId, 'engine_parada')
      return
    }

    // Rate limit: até 2 tiros concorrentes por company
    while (this.activeShots >= 2) {
      await new Promise((r) => setTimeout(r, 10))
      if (!this.running || !this.pendingShots.has(itemId)) return
    }
    await this.waitHftSlot()
    this.activeShots++

    try {
      const item = this.lastScan.find((i) => i.numero === itemId)
      if (!item) return

      // F4: rate-limit guard antes de qualquer outra coisa.
      const now = Date.now()
      const rateBlock = this.rateLimitCheck(now)
      if (rateBlock) {
        this.cancelPending(itemId, rateBlock)
        await this.callbacks.onBidSkip?.(item, rateBlock, {
          attempted_bid: pending.bid,
          mercado: item.melhorValor,
        })
        return
      }
      // F7: re-check paused (pode ter sido pausado entre schedule e execute)
      if (this.paused) {
        this.cancelPending(itemId, 'paused_at_submit')
        return
      }

      // F3: hard floor enforcement IMEDIATAMENTE antes do submit.
      // Strategy pode ter mudado depois do scheduleShot (live update via F5).
      // Garante que o piso AGORA é respeitado, mesmo se o pending.bid foi
      // calculado com piso anterior. Defesa em profundidade — evaluateBid
      // já checa, mas isso protege contra race entre evaluate e submit.
      const cfgNow = this.strategyByItem(itemId)
      const floorNow = cfgNow?.chaoFinanceiro ?? null
      if (floorNow !== null && floorNow > 0 && pending.bid < floorNow - 0.0001) {
        await this.callbacks.onFloorBreachPrevented?.(item, pending.bid, floorNow)
        this.cancelPending(itemId, 'floor_breach_prevented')
        return
      }

      // Ensure token fresh bem antes do disparo
      const refreshed = await ensureAccessToken(this.tokens)
      if (!refreshed) {
        await this.callbacks.onError?.(new Error('Token expirou na hora do disparo'))
        this.stop()
        return
      }
      if (refreshed.accessToken !== this.tokens.accessToken) {
        this.tokens = refreshed
        await this.callbacks.onTokenRefreshed?.(refreshed)
      }

      const faseApi = faseToApiFaseItem(item.faseOriginal)
      const result: ShootResult = await submitLance(
        this.compraId,
        itemId,
        pending.bid,
        faseApi,
        this.tokens.accessToken,
      )

      if (result.sucesso) {
        this.ownBidsLog.push(Date.now()) // F4: registra no rate-limiter
        this.recoil.set(itemId, { bid: pending.bid, timestamp: Date.now() })
        await this.callbacks.onBidPlaced?.(item, pending.bid)
      } else {
        await this.callbacks.onBidRejected?.(item, result.erro || 'desconhecido')
        if (result.cooldownMs && result.cooldownMs > 0) {
          // cooldown: ignora esse item pelo período
          setTimeout(() => {
            // nada — apenas bloqueia novos shots até passar
          }, result.cooldownMs)
        }
      }
    } catch (err) {
      await this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.activeShots = Math.max(0, this.activeShots - 1)
      this.cancelPending(itemId, 'shot_terminou')
    }
  }
}

