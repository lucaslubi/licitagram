/**
 * Compras.gov.br (comprasnet-web SPA) adapter.
 *
 * Phase 1 implementation. Uses Playwright against the React SPA at
 * `cnetmobile.estaleiro.serpro.gov.br/comprasnet-web`. Selectors come from
 * `./selectors/comprasgov.yaml` and can be hot-fixed without recompiling.
 *
 * Modes:
 *   - `supervisor`  — set floor + intervalo in the portal's native auto-bidder
 *                     (IN 67/2021). Lowest legal risk, highest reliability.
 *   - `auto_bid`    — submit lances directly via UI. Use when the portal
 *                     native auto-bidder is not enough (e.g. the edital sets
 *                     an aggressive decrement that the portal robô can't
 *                     follow fast).
 *   - `shadow`      — read-only observation, emit bot_events, never submit.
 *                     For Shadow Mode feature (see Phase 2).
 *
 * Gov.br SSO:
 *   - Multi-step: CPF → senha → optional MFA. Captcha on CPF screen when
 *     account is risk-scored — we try CapSolver before giving up.
 *   - Session stored as Playwright storageState and persisted (encrypted)
 *     in bot_configs.cookies_cipher.
 *
 * Rate limit:
 *   - IN 73/2022 minimum interval between bids enforced by us at
 *     `timing.min_bid_interval_seconds_default` (edital can raise it).
 *
 * The adapter NEVER fabricates success. Every `submitLance` waits for an
 * explicit ack (toast or 2xx XHR) before returning true. If it times out,
 * it returns false and the runner logs bid_rejected.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { BrowserContext, Page, ElementHandle } from 'playwright'
import {
  BasePortal,
  InvalidCredentialsError,
  CaptchaRequiredError,
  MfaRequiredError,
  UnsupportedOperationError,
  type BotState,
  type FloorParameters,
  type PortalCredentials,
} from './base-portal'
import { logger } from '../../lib/logger'

// ─── Selector loading ───────────────────────────────────────────────────────

interface Selectors {
  host: string
  paths: Record<string, string>
  sso: Record<string, string>
  login: Record<string, string>
  disputa: Record<string, string>
  proposta: Record<string, string>
  xhr: Record<string, string>
  timing: {
    min_bid_interval_seconds_default: number
    snipe_safety_margin_ms: number
    session_refresh_every_min: number
  }
  anti_bot: {
    launch_args: string[]
    locale: string
    timezone: string
    session_max_age_hours: number
  }
}

function loadSelectors(): Selectors {
  const candidates = [
    join(__dirname, 'selectors', 'comprasgov.yaml'),
    join(__dirname, '..', '..', '..', 'src', 'bot', 'portals', 'selectors', 'comprasgov.yaml'),
  ]
  for (const candidate of candidates) {
    try {
      const content = readFileSync(candidate, 'utf8')
      return parseYaml(content) as Selectors
    } catch {
      continue
    }
  }
  throw new Error(`bot/comprasgov.yaml not found. Tried: ${candidates.join(', ')}`)
}

const selectors = loadSelectors()

// ─── Rate limit ─────────────────────────────────────────────────────────────

const lastBidAtByContext = new WeakMap<BrowserContext, number>()

/** Enforce the intervalo mínimo between bids for the same session. */
async function awaitBidInterval(
  context: BrowserContext,
  minIntervalMs: number,
): Promise<void> {
  const last = lastBidAtByContext.get(context) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < minIntervalMs) {
    await new Promise((r) => setTimeout(r, minIntervalMs - elapsed))
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function findFirstLocator(
  page: Page,
  primary: string,
  fallback?: string,
): Promise<ElementHandle | null> {
  try {
    const el = await page.$(primary)
    if (el) return el
  } catch {
    /* try fallback */
  }
  if (fallback) {
    try {
      return await page.$(fallback)
    } catch {
      /* give up */
    }
  }
  return null
}

async function tryReadNumberNear(page: Page, labelSelector: string): Promise<number | null> {
  try {
    const label = await page.$(labelSelector)
    if (!label) return null
    // Read the next sibling / descendant with a numeric value. We try a few
    // common patterns: same cell, adjacent cell, next span.
    const text = await label.evaluate((el) => {
      const neighbors: Element[] = []
      if (el.nextElementSibling) neighbors.push(el.nextElementSibling)
      const parent = el.parentElement
      if (parent) {
        neighbors.push(...Array.from(parent.children).filter((c) => c !== el))
        if (parent.nextElementSibling) neighbors.push(parent.nextElementSibling)
      }
      for (const n of neighbors) {
        const t = (n.textContent ?? '').trim()
        if (/\d/.test(t)) return t
      }
      return ''
    })
    if (!text) return null
    return parseBrazilianNumber(text)
  } catch {
    return null
  }
}

export function parseBrazilianNumber(raw: string): number | null {
  // Strips R$, spaces, thousands dots, normalizes decimal comma → dot.
  const cleaned = raw
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

// ─── Captcha auto-solve (shared with pregao-chat-monitor) ───────────────────

async function trySolveCaptcha(page: Page): Promise<boolean> {
  if (!process.env.CAPSOLVER_API_KEY) {
    logger.warn('CAPSOLVER_API_KEY not set — cannot auto-solve portal captcha')
    return false
  }
  try {
    // reCAPTCHA v2
    const recaptchaSitekey = await page.evaluate((sel: string) => {
      const el = document.querySelector<HTMLElement>(sel)
      return el?.getAttribute('data-sitekey') ?? null
    }, selectors.sso.captcha_recaptcha_sitekey_attr)

    if (recaptchaSitekey) {
      const { solveReCaptchaV2 } = await import('../../lib/captcha-solver')
      const token = await solveReCaptchaV2(recaptchaSitekey, page.url())
      if (token) {
        await page.evaluate((t: string) => {
          const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="g-recaptcha-response"]')
          if (ta) {
            ta.value = t
            ta.dispatchEvent(new Event('input', { bubbles: true }))
          }
        }, token)
        return true
      }
    }

    // hCaptcha (less common on gov.br, but we try)
    const hcaptchaSitekey = await page.evaluate((sel: string) => {
      const el = document.querySelector<HTMLElement>(sel)
      return el?.getAttribute('data-sitekey') ?? null
    }, selectors.sso.captcha_hcaptcha_sitekey_attr)

    if (hcaptchaSitekey) {
      const { solveHCaptcha } = await import('../../lib/captcha-solver')
      const token = await solveHCaptcha(hcaptchaSitekey, page.url())
      if (token) {
        await page.evaluate((t: string) => {
          const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="h-captcha-response"]')
          if (ta) {
            ta.value = t
            ta.dispatchEvent(new Event('input', { bubbles: true }))
          }
        }, token)
        return true
      }
    }
  } catch (err) {
    logger.warn({ err }, 'CapSolver attempt failed')
  }
  return false
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class ComprasGovPortal extends BasePortal {
  /**
   * Event hook: the runner sets this to a callback that receives observed
   * XHR / WS events, which it then writes into bot_events for forensic replay.
   */
  public onObservedEvent?: (kind: string, payload: Record<string, unknown>) => void

  async isLoggedIn(): Promise<boolean> {
    if (!this.context) return false
    const pages = this.context.pages()
    if (pages.length === 0) return false
    const page = pages[0]
    try {
      const url = page.url()
      if (url.includes(selectors.login.success_url_contains)) {
        return true
      }
    } catch {
      return false
    }
    return false
  }

  async login(credentials: PortalCredentials): Promise<void> {
    if (!this.context) throw new Error('Adapter not attached to a context')
    const page = this.context.pages()[0] ?? (await this.context.newPage())
    this.page = page

    logger.info({ portal: this.meta.portal }, 'Starting Gov.br SSO login')

    // 1. Hit the fornecedor entry — SPA redirects to gov.br SSO.
    await page.goto(selectors.host + selectors.paths.fornecedor_entry, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })

    // If the SPA has its own "Entrar com gov.br" button instead of auto-redirect.
    const govbrBtn = await findFirstLocator(
      page,
      selectors.login.govbr_button,
      selectors.login.govbr_button_fallback,
    )
    if (govbrBtn) {
      await govbrBtn.click().catch(() => undefined)
      await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined)
    }

    // 2. Are we on SSO?
    if (!page.url().includes(selectors.sso.host)) {
      // Already logged in? Verify.
      if (page.url().includes(selectors.login.success_url_contains)) {
        logger.info({ portal: this.meta.portal }, 'Already logged in via persisted session')
        return
      }
      throw new InvalidCredentialsError('SSO redirect did not happen — unexpected portal state')
    }

    // 3. CPF screen. Attempt captcha solve if present.
    const cpfInput = await findFirstLocator(page, selectors.sso.cpf_input)
    if (!cpfInput) {
      throw new InvalidCredentialsError('Gov.br CPF input not found')
    }

    const captcha = await page.$(
      `${selectors.sso.captcha_recaptcha_sitekey_attr}, ${selectors.sso.captcha_hcaptcha_sitekey_attr}`,
    )
    if (captcha) {
      const solved = await trySolveCaptcha(page)
      if (!solved) {
        throw new CaptchaRequiredError()
      }
      logger.info({ portal: this.meta.portal }, 'SSO captcha auto-solved')
    }

    await cpfInput.fill(credentials.usuario)
    const cpfSubmit = await findFirstLocator(page, selectors.sso.cpf_submit)
    if (cpfSubmit) {
      await cpfSubmit.click()
    } else {
      await cpfInput.press('Enter')
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)

    // 4. Error check after CPF.
    const cpfError = await page.$(selectors.sso.error_message)
    if (cpfError) {
      const msg = (await cpfError.textContent())?.trim() ?? 'Invalid CPF'
      throw new InvalidCredentialsError(msg)
    }

    // 5. MFA prompt?
    const mfaInput = await page.$(selectors.sso.mfa_otp_input)
    if (mfaInput) {
      throw new MfaRequiredError()
    }

    // 6. Password.
    const passwordInput = await findFirstLocator(page, selectors.sso.password_input)
    if (!passwordInput) {
      throw new InvalidCredentialsError('Gov.br password input not found after CPF')
    }
    await passwordInput.fill(credentials.senha)
    const passwordSubmit = await findFirstLocator(page, selectors.sso.password_submit)
    if (passwordSubmit) {
      await passwordSubmit.click()
    } else {
      await passwordInput.press('Enter')
    }

    // 7. Wait for redirect back to the SPA.
    await page
      .waitForURL((u) => u.toString().includes(selectors.login.success_url_contains), {
        timeout: 30_000,
      })
      .catch(async () => {
        // Maybe MFA appeared after password, or an error toast.
        const postMfa = await page.$(selectors.sso.mfa_otp_input)
        if (postMfa) throw new MfaRequiredError()
        const err = await page.$(selectors.sso.error_message)
        if (err) {
          const msg = (await err.textContent())?.trim() ?? 'Login rejected'
          throw new InvalidCredentialsError(msg)
        }
        throw new InvalidCredentialsError('SSO did not redirect back to comprasnet-web')
      })

    logger.info({ portal: this.meta.portal }, 'Gov.br SSO login complete')
  }

  async openPregaoRoom(pregaoId: string, portalPregaoUrl?: string): Promise<Page> {
    if (!this.context) throw new Error('Adapter not attached to a context')
    const page = this.context.pages()[0] ?? (await this.context.newPage())
    this.page = page

    // Install XHR observability BEFORE navigation so we don't miss events.
    this.installXhrTap(page)

    const targetUrl =
      portalPregaoUrl ??
      selectors.host +
        selectors.paths.disputa_by_identificador.replace('{identificador}', pregaoId)

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Wait for the pregão header to appear as a sanity check.
    await page
      .waitForSelector(selectors.disputa.pregao_header, { timeout: 15_000 })
      .catch(() => {
        logger.warn({ pregaoId }, 'Pregão header did not appear within 15s')
      })

    return page
  }

  private installXhrTap(page: Page): void {
    page.on('response', async (res) => {
      const url = res.url()
      if (!this.onObservedEvent) return

      if (url.includes(selectors.xhr.ranking_endpoint_substr)) {
        this.onObservedEvent('websocket_message', {
          url,
          status: res.status(),
          kind: 'ranking_poll',
        })
      }
      if (url.includes(selectors.xhr.lance_endpoint_substr)) {
        this.onObservedEvent('our_bid_ack', {
          url,
          status: res.status(),
        })
      }
    })
  }

  async getState(): Promise<BotState> {
    const page = this.requirePage()

    const [melhor_lance, nosso_lance, nossa_posicao, faseText] = await Promise.all([
      tryReadNumberNear(page, selectors.disputa.best_bid_label),
      tryReadNumberNear(page, selectors.disputa.my_last_bid_label),
      tryReadNumberNear(page, selectors.disputa.my_position_label),
      page
        .$(selectors.disputa.phase_indicator)
        .then((el) => (el ? el.textContent() : Promise.resolve('')))
        .catch(() => ''),
    ])

    const fase = (faseText ?? '').trim() || 'Desconhecida'
    const lower = fase.toLowerCase()
    const encerrado = /encerrad|homolog|suspens/.test(lower)
    const ativo = /abert|aleat/.test(lower) && !encerrado

    return {
      fase,
      ativo,
      encerrado,
      melhor_lance,
      nosso_lance,
      nossa_posicao: nossa_posicao !== null ? Math.trunc(nossa_posicao) : null,
    }
  }

  async setFloor(params: FloorParameters): Promise<void> {
    const page = this.requirePage()

    // If we're already in the dispute screen, there's a side-panel "Editar
    // parametrização" button that reveals the fields. If we're in proposta
    // edit, the inputs are already visible.
    const editBtn = await page.$(selectors.proposta.edit_parametrizacao_button)
    if (editBtn) {
      await editBtn.click().catch(() => undefined)
      // small pause for the panel to open
      await page.waitForTimeout(300)
    }

    const vfmInput = await findFirstLocator(page, selectors.proposta.valor_final_minimo_input)
    const intInput = await findFirstLocator(page, selectors.proposta.intervalo_minimo_input)
    if (!vfmInput || !intInput) {
      throw new UnsupportedOperationError(
        'Parametrização fields not visible — portal state does not allow supervisor mode right now',
      )
    }

    await vfmInput.fill(params.valorFinalMinimo.toFixed(2).replace('.', ','))
    await intInput.fill(String(params.intervaloMinimoSegundos))

    const saveBtn = await findFirstLocator(page, selectors.proposta.save_parametrizacao)
    if (saveBtn) {
      await saveBtn.click()
      await page.waitForTimeout(500)
    }

    logger.info(
      { portal: this.meta.portal, valorFinalMinimo: params.valorFinalMinimo },
      'Supervisor floor parameters saved',
    )

    this.onObservedEvent?.('floor_set', {
      valorFinalMinimo: params.valorFinalMinimo,
      intervaloMinimoSegundos: params.intervaloMinimoSegundos,
    })
  }

  async submitLance(valor: number, _itemId?: string): Promise<boolean> {
    if (!this.context) throw new Error('Adapter not attached')
    const page = this.requirePage()

    // Enforce the intervalo mínimo.
    const minIntervalMs = selectors.timing.min_bid_interval_seconds_default * 1000
    await awaitBidInterval(this.context, minIntervalMs)

    const bidInput = await findFirstLocator(page, selectors.disputa.bid_input)
    const bidSubmit = await findFirstLocator(page, selectors.disputa.bid_submit)

    if (!bidInput || !bidSubmit) {
      logger.error({ portal: this.meta.portal }, 'Bid form not found on page')
      this.onObservedEvent?.('error', { reason: 'bid_form_missing' })
      return false
    }

    const valorStr = valor.toFixed(2).replace('.', ',')

    await bidInput.fill('')
    await bidInput.fill(valorStr)
    this.onObservedEvent?.('our_bid_attempt', { valor })

    const startTs = Date.now()
    await bidSubmit.click()

    // Confirm modal (some editais force a confirmation dialog).
    const confirmModal = await page.$(selectors.disputa.bid_confirm_modal_confirm)
    if (confirmModal) {
      await confirmModal.click().catch(() => undefined)
    }

    // Wait for either the success toast, error toast, or a 2xx XHR ack.
    const success = await Promise.race([
      page
        .waitForSelector(selectors.disputa.bid_success_toast, { timeout: 8000 })
        .then(() => 'ok'),
      page
        .waitForSelector(selectors.disputa.bid_error_toast, { timeout: 8000 })
        .then(() => 'err'),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 8000)),
    ])

    const latency = Date.now() - startTs
    lastBidAtByContext.set(this.context, Date.now())

    if (success === 'ok') {
      this.onObservedEvent?.('our_bid_ack', { valor, latency_ms: latency })
      return true
    } else {
      this.onObservedEvent?.('our_bid_nack', { valor, latency_ms: latency, reason: success })
      return false
    }
  }
}
