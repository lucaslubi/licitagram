/**
 * ComprasGov (Compras.gov.br) adapter for pregão chat monitoring.
 *
 * Implements PortalAdapter interface. Selectors loaded from YAML
 * for hot-fix without recompile.
 *
 * NOTE: Selectors are INITIAL GUESSES. They WILL be refined during
 * CHECKPOINT 3 testing with real portal access. All extraction functions
 * are small and isolated to make selector adjustment easy.
 *
 * Rate limit: minimum 4s between navigations.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { BrowserContext, Page, ElementHandle } from 'playwright'
import type {
  PortalAdapter,
  PortalCredentials,
  RawMessage,
  PregaoPhase,
  PregaoInfo,
} from './types'
import {
  InvalidCredentialsError,
  CaptchaRequiredError,
  MfaRequiredError,
  PregaoNotFoundError,
} from './types'
import { logger } from '../../lib/logger'

// ─── Selector Loading ───────────────────────────────────────────────────────

interface ComprasGovSelectors {
  login: Record<string, string>
  pregao_room: Record<string, string>
  phase_detection: {
    status_element: string
    status_element_fallback: string
    phase_map: Record<string, string[]>
  }
  pregao_info: Record<string, string>
}

function loadSelectors(): ComprasGovSelectors {
  // Try dist/ path first, then src/ path (dev mode)
  const candidates = [
    join(__dirname, 'selectors', 'comprasgov.yaml'),
    join(__dirname, '..', '..', '..', 'src', 'pregao-chat-monitor', 'adapters', 'selectors', 'comprasgov.yaml'),
  ]
  for (const candidate of candidates) {
    try {
      const content = readFileSync(candidate, 'utf8')
      return parseYaml(content) as ComprasGovSelectors
    } catch {
      continue
    }
  }
  throw new Error(`comprasgov.yaml not found. Tried: ${candidates.join(', ')}`)
}

// Load once at boot — restart worker to reload
const selectors = loadSelectors()

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const MIN_INTERVAL_MS = 4000
let lastNavigation = 0

async function rateLimitedGoto(page: Page, url: string): Promise<void> {
  const elapsed = Date.now() - lastNavigation
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed))
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  lastNavigation = Date.now()
}

// ─── Helper: try selector with fallback ─────────────────────────────────────

async function findElement(page: Page, primary: string, fallback?: string): Promise<ElementHandle | null> {
  const el = await page.$(primary)
  if (el) return el
  if (fallback) return page.$(fallback)
  return null
}

async function getTextContent(page: Page, primary: string, fallback?: string): Promise<string | null> {
  const el = await findElement(page, primary, fallback)
  if (!el) return null
  return (await el.textContent())?.trim() ?? null
}

// ─── Parse Brazilian datetime ───────────────────────────────────────────────

function parseBrazilianDatetime(text: string): Date | null {
  // Formats: "DD/MM/YYYY HH:mm:ss" or "DD/MM/YYYY HH:mm"
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return null

  const [, day, month, year, hour, minute, second] = match
  // Build in BRT (UTC-3)
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second || '00'}-03:00`
  const date = new Date(iso)
  return isNaN(date.getTime()) ? null : date
}

// ─── Sender Classification ──────────────────────────────────────────────────

function classifySender(senderText: string): RawMessage['remetente'] {
  const lower = senderText.toLowerCase()

  if (lower.includes('pregoeiro') || lower.includes('pregoeira')) {
    return 'pregoeiro'
  }
  if (lower.includes('sistema') || lower.includes('comprasnet') || lower.includes('automátic')) {
    return 'sistema'
  }

  // TODO(post-mvp): Match against client's own CNPJ/company name to detect 'licitante_proprio'
  // For now, all non-pregoeiro, non-system senders are classified as 'outro_licitante'
  return 'outro_licitante'
}

// ─── CapSolver Integration ──────────────────────────────────────────────────

/**
 * Best-effort captcha solver for the comprasgov login flow.
 * Tries (in order): image captcha, reCAPTCHA v2, hCaptcha.
 * Returns true if any was solved + injected. Returns false when CAPSOLVER is
 * unavailable or the captcha is of an unsupported kind.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function trySolveCaptcha(page: Page): Promise<boolean> {
  if (!process.env.CAPSOLVER_API_KEY) {
    logger.warn('CAPSOLVER_API_KEY not set — cannot auto-solve portal captcha')
    return false
  }

  try {
    // 1) Image captcha (legacy Comprasnet)
    const imgEl = await page.$('#divCaptcha img, img[id*="captcha"], img[id*="Captcha"], img.captcha')
    const inputEl = await page.$('input[id*="captcha"], input[id*="Captcha"], input[name*="captcha"]')
    if (imgEl && inputEl) {
      const src = await imgEl.getAttribute('src')
      let base64: string | null = null
      if (src?.startsWith('data:image')) {
        base64 = src.split(',')[1] ?? null
      } else {
        // Fetch image through the page context and convert to base64
        base64 = await page.evaluate(async (imgSrc: string | null) => {
          if (!imgSrc) return null
          try {
            const res = await fetch(imgSrc, { credentials: 'include' })
            const buf = await res.arrayBuffer()
            let binary = ''
            const bytes = new Uint8Array(buf)
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
            return btoa(binary)
          } catch {
            return null
          }
        }, src)
      }

      if (base64) {
        const { solveImageCaptcha } = await import('../../lib/captcha-solver')
        const answer = await solveImageCaptcha(base64)
        if (answer) {
          await inputEl.fill(answer)
          return true
        }
      }
    }

    // 2) reCAPTCHA v2
    const recaptchaSitekey = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.g-recaptcha[data-sitekey]')
      return el?.getAttribute('data-sitekey') ?? null
    })
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

    // 3) hCaptcha
    const hcaptchaSitekey = await page.evaluate(() => {
      const hc = document.querySelector<HTMLElement>('.h-captcha[data-sitekey]')
      if (hc) return hc.getAttribute('data-sitekey')
      const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="hcaptcha"]')
      if (iframe) {
        const match = iframe.src.match(/sitekey=([^&]+)/)
        if (match) return match[1]
      }
      return null
    })
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
    logger.warn({ err }, 'Captcha auto-solve failed')
  }
  return false
}

// ─── DOM text extractor for message items ───────────────────────────────────

async function extractFieldText(
  item: ElementHandle,
  primary: string,
  fallback: string,
): Promise<string> {
  const primaryEl = await item.$(primary)
  if (primaryEl) {
    const text = await primaryEl.textContent()
    if (text?.trim()) return text.trim()
  }
  const fallbackEl = await item.$(fallback)
  if (fallbackEl) {
    const text = await fallbackEl.textContent()
    if (text?.trim()) return text.trim()
  }
  return ''
}

// ─── Adapter Implementation ─────────────────────────────────────────────────

export class ComprasGovAdapter implements PortalAdapter {
  readonly slug = 'comprasgov' as const
  readonly name = 'Compras.gov.br'

  async isLoggedIn(context: BrowserContext): Promise<boolean> {
    const pages = context.pages()
    if (pages.length === 0) return false

    const page = pages[0]
    try {
      const indicator = await page.$(selectors.login.success_indicator)
      if (indicator) return true

      const url = page.url()
      if (url.includes(selectors.login.success_url_contains)) {
        const fallbackEl = await page.$(selectors.login.success_indicator_fallback)
        return !!fallbackEl
      }

      return false
    } catch {
      return false
    }
  }

  async login(context: BrowserContext, credentials: PortalCredentials): Promise<void> {
    const page = context.pages()[0] ?? await context.newPage()

    logger.info({ portal: this.slug }, 'Attempting portal login')

    // Step 1: Navigate to comprasnet login page
    await rateLimitedGoto(page, selectors.login.url)

    // Step 2: Click "Entrar com Gov.br" button
    const govbrBtn = await findElement(
      page,
      selectors.login.govbr_button,
      selectors.login.govbr_button_fallback,
    )

    if (!govbrBtn) {
      throw new InvalidCredentialsError('Botão "Entrar com Gov.br" não encontrado — layout do portal pode ter mudado')
    }

    await govbrBtn.click()

    // Step 3: Wait for SSO gov.br page to load
    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
    lastNavigation = Date.now()

    // Check for captcha on SSO page — try to auto-solve via CapSolver
    const captcha = await findElement(page, selectors.login.captcha_indicator)
    if (captcha) {
      const solved = await trySolveCaptcha(page)
      if (!solved) {
        throw new CaptchaRequiredError()
      }
      logger.info({ portal: this.slug }, 'SSO captcha solved via CapSolver')
    }

    // Step 4: Fill CPF (gov.br asks CPF first, then password on next screen)
    const cpfInput = await findElement(
      page,
      selectors.login.cpf_input,
      selectors.login.username_input_fallback,
    )

    if (!cpfInput) {
      throw new InvalidCredentialsError('Campo de CPF não encontrado na página do gov.br')
    }

    // Use the usuario field as CPF (user enters CPF in the wizard)
    await cpfInput.fill(credentials.usuario)

    // Click continue/submit to go to password step
    const cpfSubmit = await findElement(
      page,
      selectors.login.cpf_submit,
      selectors.login.submit_button_fallback,
    )
    if (cpfSubmit) {
      await cpfSubmit.click()
    } else {
      await cpfInput.press('Enter')
    }

    // Wait for password page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 })
    lastNavigation = Date.now()

    // Check for MFA requirement
    const mfa = await findElement(page, selectors.login.mfa_indicator)
    if (mfa) {
      throw new MfaRequiredError()
    }

    // Step 5: Fill password
    const passwordInput = await findElement(
      page,
      selectors.login.password_input,
      selectors.login.password_input_fallback,
    )

    if (!passwordInput) {
      // Maybe CPF was invalid and error is shown
      const errorEl = await findElement(page, selectors.login.error_message)
      if (errorEl) {
        const errorText = (await errorEl.textContent())?.trim() ?? 'Erro no login'
        throw new InvalidCredentialsError(errorText)
      }
      throw new InvalidCredentialsError('Campo de senha não encontrado — verifique o CPF informado')
    }

    await passwordInput.fill(credentials.senha)

    // Submit password
    const submitBtn = await findElement(
      page,
      selectors.login.submit_button,
      selectors.login.submit_button_fallback,
    )
    if (submitBtn) {
      await submitBtn.click()
    } else {
      await passwordInput.press('Enter')
    }

    // Step 6: Wait for redirect back to comprasnet
    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
    lastNavigation = Date.now()

    // Check for error after password submit
    const errorEl = await findElement(page, selectors.login.error_message)
    if (errorEl) {
      const errorText = (await errorEl.textContent())?.trim() ?? 'Credenciais inválidas'
      throw new InvalidCredentialsError(errorText)
    }

    // Check for MFA after password
    const postMfa = await findElement(page, selectors.login.mfa_indicator)
    if (postMfa) {
      throw new MfaRequiredError()
    }

    // Check for captcha post-login — attempt auto-solve before bailing
    const postCaptcha = await findElement(page, selectors.login.captcha_indicator)
    if (postCaptcha) {
      const solved = await trySolveCaptcha(page)
      if (!solved) {
        throw new CaptchaRequiredError()
      }
      logger.info({ portal: this.slug }, 'Post-login captcha solved via CapSolver, resubmitting')
      const resubmit = await findElement(
        page,
        selectors.login.submit_button,
        selectors.login.submit_button_fallback,
      )
      if (resubmit) {
        await resubmit.click()
        await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)
        lastNavigation = Date.now()
      }
    }

    // Step 7: Verify login success (may need another redirect wait)
    await page.waitForTimeout(3000) // Give gov.br SSO time to redirect back
    const isNowLoggedIn = await this.isLoggedIn(context)
    if (!isNowLoggedIn) {
      // Try waiting a bit more — SSO redirects can be slow
      await page.waitForTimeout(3000)
      const retryLogin = await this.isLoggedIn(context)
      if (!retryLogin) {
        throw new InvalidCredentialsError('Login não completou — redirecionamento do gov.br pode ter falhado')
      }
    }

    logger.info({ portal: this.slug }, 'Portal login successful via gov.br SSO')
  }

  async openPregaoRoom(
    context: BrowserContext,
    portalPregaoId: string,
    portalPregaoUrl: string,
  ): Promise<Page> {
    const page = context.pages()[0] ?? await context.newPage()

    logger.info({ portal: this.slug, portalPregaoId }, 'Opening pregão room')

    await rateLimitedGoto(page, portalPregaoUrl)

    // Wait for chat container to appear
    try {
      await page.waitForSelector(
        selectors.pregao_room.chat_container,
        { timeout: 15_000, state: 'visible' },
      )
    } catch {
      // Try fallback selector
      try {
        await page.waitForSelector(
          selectors.pregao_room.chat_container_fallback,
          { timeout: 10_000, state: 'visible' },
        )
      } catch {
        throw new PregaoNotFoundError(portalPregaoId)
      }
    }

    logger.info({ portal: this.slug, portalPregaoId }, 'Pregão room opened')
    return page
  }

  async extractPregaoInfo(page: Page): Promise<PregaoInfo> {
    const s = selectors.pregao_info

    const orgaoNome = await getTextContent(page, s.orgao_nome) ?? 'Órgão não identificado'
    const orgaoUasg = await getTextContent(page, s.orgao_uasg)
    const numeroPregao = await getTextContent(page, s.numero_pregao) ?? 'N/A'
    const objetoResumido = await getTextContent(page, s.objeto_resumido)
    const dataAberturaText = await getTextContent(page, s.data_abertura)
    const dataAbertura = dataAberturaText ? parseBrazilianDatetime(dataAberturaText) : null
    const faseAtual = await this.detectPhase(page)

    return {
      orgaoNome,
      orgaoUasg,
      numeroPregao,
      objetoResumido,
      dataAbertura,
      faseAtual,
    }
  }

  async extractChatMessages(page: Page): Promise<RawMessage[]> {
    const s = selectors.pregao_room
    const messages: RawMessage[] = []

    // Find all message items
    let items = await page.$$(s.message_item)
    if (items.length === 0) {
      items = await page.$$(s.message_item_fallback)
    }

    for (const item of items) {
      try {
        const senderText = await extractFieldText(item, s.message_sender, s.message_sender_fallback)
        const content = await extractFieldText(item, s.message_content, s.message_content_fallback)

        if (!content) continue // skip empty messages

        const timestampText = await extractFieldText(item, s.message_timestamp, s.message_timestamp_fallback)
        const dataHoraPortal = timestampText ? parseBrazilianDatetime(timestampText) : null

        if (!dataHoraPortal) continue // skip messages without valid timestamp

        messages.push({
          remetente: classifySender(senderText),
          remetenteIdentificacao: senderText || null,
          conteudo: content,
          dataHoraPortal,
        })
      } catch (err) {
        logger.warn({ err }, 'Failed to extract individual message, skipping')
      }
    }

    return messages
  }

  async detectPhase(page: Page): Promise<PregaoPhase> {
    const s = selectors.phase_detection

    const statusText = await getTextContent(page, s.status_element, s.status_element_fallback)
    if (!statusText) return 'desconhecida'

    const normalized = statusText.toLowerCase()

    for (const [phase, keywords] of Object.entries(s.phase_map)) {
      for (const keyword of keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          return phase as PregaoPhase
        }
      }
    }

    return 'desconhecida'
  }
}
