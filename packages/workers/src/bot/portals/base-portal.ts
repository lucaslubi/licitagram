/**
 * Base portal adapter contract — Playwright edition (replaces puppeteer).
 *
 * The bot ecosystem originally used puppeteer. It now standardizes on
 * Playwright, which is what `pregao-chat-monitor` already uses, and which
 * has better BrowserContext lifecycle control for session persistence.
 *
 * The Playwright types are *structurally* imported so this file has no
 * runtime dependency — it's pure contract. Concrete adapters import
 * `playwright-extra` (via bot/lib/browser-manager.ts) and receive the
 * BrowserContext they should drive.
 */

import type { BrowserContext, Page } from 'playwright'

// ─── Portal state snapshot ──────────────────────────────────────────────────

export interface BotState {
  fase: string
  ativo: boolean
  encerrado: boolean
  melhor_lance: number | null
  nosso_lance: number | null
  /** 1 = winning, 2+ = behind, null = unknown. */
  nossa_posicao: number | null
  /** Seconds remaining in the current phase, or null if not applicable. */
  segundos_restantes?: number | null
  /** Any extra context a specific portal wants to surface. */
  extra?: Record<string, unknown>
}

// ─── Supervisor-mode floor set ──────────────────────────────────────────────

export interface FloorParameters {
  valorFinalMinimo: number
  intervaloMinimoSegundos: number
  /** Item ID inside the pregão (portals support multi-item auctions). */
  itemId?: string
}

// ─── Adapter contract ───────────────────────────────────────────────────────

export interface PortalCredentials {
  usuario: string
  senha: string
  cnpjLicitante?: string
}

export abstract class BasePortal {
  protected context: BrowserContext | null = null
  protected page: Page | null = null

  constructor(
    public readonly meta: {
      portal: string
      /** Opaque bot_config id — lets the adapter scope storage state. */
      configId: string
    },
  ) {}

  /** Bind this adapter to a Playwright context. Called by the runner. */
  attach(context: BrowserContext): void {
    this.context = context
  }

  /** Is there a live authenticated session? */
  abstract isLoggedIn(): Promise<boolean>

  /** Perform a fresh login. Only called when isLoggedIn() returns false. */
  abstract login(credentials: PortalCredentials): Promise<void>

  /** Open the dispute room. Must make page available via getPage(). */
  abstract openPregaoRoom(pregaoId: string, portalPregaoUrl?: string): Promise<Page>

  /** Read the current observable state of the dispute. */
  abstract getState(): Promise<BotState>

  /**
   * Supervisor mode — set the floor / intervalo parameters in the portal's
   * native auto-bidder. Throws UnsupportedOperationError if the portal
   * has no native auto-bidder (most non-Compras.gov.br portals).
   */
  abstract setFloor(params: FloorParameters): Promise<void>

  /**
   * Auto-bid mode — submit a lance directly. Returns true only when the
   * portal acknowledged receipt. NEVER return true without verification.
   */
  abstract submitLance(valor: number, itemId?: string): Promise<boolean>

  /** Tear down any open pages — the BrowserContext itself is pooled. */
  async close(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close()
      } catch {
        /* ignore */
      }
      this.page = null
    }
  }

  protected requirePage(): Page {
    if (!this.page) {
      throw new Error('Portal page not initialized — call openPregaoRoom first')
    }
    return this.page
  }
}

/** Portal declines to do something it hasn't implemented. */
export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedOperationError'
  }
}

/** Portal rejected the login (bad password, locked account, etc.). */
export class InvalidCredentialsError extends Error {
  constructor(message = 'Invalid portal credentials') {
    super(message)
    this.name = 'InvalidCredentialsError'
  }
}

/** Portal needs a manual captcha solve (and auto-solve failed). */
export class CaptchaRequiredError extends Error {
  constructor(message = 'Portal captcha could not be solved automatically') {
    super(message)
    this.name = 'CaptchaRequiredError'
  }
}

/** Portal needs a manual MFA code. */
export class MfaRequiredError extends Error {
  constructor(message = 'Portal MFA prompt — manual intervention required') {
    super(message)
    this.name = 'MfaRequiredError'
  }
}

/** The pregão room does not exist or is not accessible to this user. */
export class PregaoNotFoundError extends Error {
  constructor(message = 'Pregão not found at this portal') {
    super(message)
    this.name = 'PregaoNotFoundError'
  }
}
