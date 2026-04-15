/**
 * Portal adapter interface for pregão chat monitoring.
 *
 * Each portal (Compras.gov.br, BLL, Licitanet, PCP) implements this interface.
 * MVP: only ComprasGov adapter is implemented. Others throw NotImplementedError.
 */

import type { BrowserContext, Page } from 'playwright'

// ─── Credential Types ───────────────────────────────────────────────────────

export interface PortalCredentials {
  usuario: string
  senha: string
  cnpjLicitante: string
  certificadoA1Pfx?: Buffer
  certificadoA1Senha?: string
}

// ─── Message Types ──────────────────────────────────────────────────────────

export type RemetenteType = 'pregoeiro' | 'sistema' | 'licitante_proprio' | 'outro_licitante'

export interface RawMessage {
  remetente: RemetenteType
  remetenteIdentificacao: string | null
  conteudo: string
  dataHoraPortal: Date
}

// ─── Pregão Phase ───────────────────────────────────────────────────────────

export type PregaoPhase =
  | 'desconhecida'
  | 'agendado'
  | 'proposta'
  | 'disputa'
  | 'negociacao'
  | 'aceitacao'
  | 'habilitacao'
  | 'recurso'
  | 'suspenso'
  | 'homologado'
  | 'encerrado'

// ─── Pregão Info ────────────────────────────────────────────────────────────

export interface PregaoInfo {
  orgaoNome: string
  orgaoUasg: string | null
  numeroPregao: string
  objetoResumido: string | null
  dataAbertura: Date | null
  faseAtual: PregaoPhase
}

// ─── Portal Adapter Interface ───────────────────────────────────────────────

export interface PortalAdapter {
  readonly slug: string
  readonly name: string

  /** Checks if the browser context session is still authenticated. */
  isLoggedIn(context: BrowserContext): Promise<boolean>

  /** Performs login. Throws specific errors if captcha or MFA is required. */
  login(context: BrowserContext, credentials: PortalCredentials): Promise<void>

  /** Opens the pregão chat room page. Returns the Page for subsequent use. */
  openPregaoRoom(
    context: BrowserContext,
    portalPregaoId: string,
    portalPregaoUrl: string,
  ): Promise<Page>

  /** Extracts pregão metadata (agency, number, current phase, etc). */
  extractPregaoInfo(page: Page): Promise<PregaoInfo>

  /** Extracts all currently visible chat messages. */
  extractChatMessages(page: Page): Promise<RawMessage[]>

  /** Detects current pregão phase from the open page. */
  detectPhase(page: Page): Promise<PregaoPhase>
}

// ─── Error Classes ──────────────────────────────────────────────────────────

export class LoginRequiredError extends Error {
  constructor() {
    super('Login required')
    this.name = 'LoginRequiredError'
  }
}

export class InvalidCredentialsError extends Error {
  constructor(detail?: string) {
    super(detail ?? 'Invalid credentials')
    this.name = 'InvalidCredentialsError'
  }
}

export class CaptchaRequiredError extends Error {
  constructor() {
    super('Captcha required - manual intervention needed')
    this.name = 'CaptchaRequiredError'
  }
}

export class MfaRequiredError extends Error {
  constructor() {
    super('MFA required - manual intervention needed')
    this.name = 'MfaRequiredError'
  }
}

export class PregaoNotFoundError extends Error {
  constructor(portalPregaoId: string) {
    super(`Pregão not found in portal: ${portalPregaoId}`)
    this.name = 'PregaoNotFoundError'
  }
}

export class NotImplementedError extends Error {
  constructor(portal: string) {
    super(`Adapter for portal "${portal}" is not implemented yet`)
    this.name = 'NotImplementedError'
  }
}
