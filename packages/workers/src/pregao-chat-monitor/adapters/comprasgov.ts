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
  const yamlPath = join(__dirname, 'selectors', 'comprasgov.yaml')
  const content = readFileSync(yamlPath, 'utf8')
  return parseYaml(content) as ComprasGovSelectors
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

    await rateLimitedGoto(page, selectors.login.url)

    // Check for captcha BEFORE attempting login
    const captcha = await findElement(page, selectors.login.captcha_indicator)
    if (captcha) {
      throw new CaptchaRequiredError()
    }

    // Check for MFA
    const mfa = await findElement(page, selectors.login.mfa_indicator)
    if (mfa) {
      throw new MfaRequiredError()
    }

    // Fill credentials
    const usernameInput = await findElement(
      page,
      selectors.login.username_input,
      selectors.login.username_input_fallback,
    )
    const passwordInput = await findElement(
      page,
      selectors.login.password_input,
      selectors.login.password_input_fallback,
    )

    if (!usernameInput || !passwordInput) {
      throw new InvalidCredentialsError('Login form not found — portal layout may have changed')
    }

    await usernameInput.fill(credentials.usuario)
    await passwordInput.fill(credentials.senha)

    // Submit
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

    // Wait for navigation
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 })
    lastNavigation = Date.now()

    // Check for error
    const errorEl = await findElement(page, selectors.login.error_message)
    if (errorEl) {
      const errorText = (await errorEl.textContent())?.trim() ?? 'Unknown login error'
      throw new InvalidCredentialsError(errorText)
    }

    // Check for captcha post-submit
    const postCaptcha = await findElement(page, selectors.login.captcha_indicator)
    if (postCaptcha) {
      throw new CaptchaRequiredError()
    }

    // Verify login success
    await page.waitForTimeout(2000) // Give portal time to render
    const isNowLoggedIn = await this.isLoggedIn(context)
    if (!isNowLoggedIn) {
      throw new InvalidCredentialsError('Login did not succeed — no success indicator found')
    }

    logger.info({ portal: this.slug }, 'Portal login successful')
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
