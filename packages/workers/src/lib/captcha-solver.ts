import { logger } from './logger'

const TWO_CAPTCHA_KEY = process.env.TWO_CAPTCHA_API_KEY || ''
const POLL_INTERVAL = 5000
const TIMEOUT = 120000

const log = logger.child({ module: 'captcha-solver' })

async function pollResult(captchaId: string): Promise<string | null> {
  const start = Date.now()

  while (Date.now() - start < TIMEOUT) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))

    const url = `https://2captcha.com/res.php?key=${TWO_CAPTCHA_KEY}&action=get&id=${captchaId}&json=1`
    const res = await fetch(url)
    const data = (await res.json()) as { status: number; request: string }

    if (data.status === 1) {
      return data.request
    }

    if (data.request === 'CAPCHA_NOT_READY') {
      continue
    }

    if (data.request === 'ERROR_CAPTCHA_UNSOLVABLE') {
      log.warn({ captchaId }, 'Captcha marked as unsolvable')
      return null
    }

    if (data.request === 'ERROR_METHOD_CALL') {
      log.warn({ captchaId }, 'Method not supported')
      return null
    }

    log.error({ captchaId, response: data.request }, '2Captcha error')
    return null
  }

  log.error({ captchaId }, 'Captcha solve timed out')
  return null
}

export async function solveImageCaptcha(base64Image: string): Promise<string> {
  if (!TWO_CAPTCHA_KEY) {
    throw new Error('TWO_CAPTCHA_API_KEY not set')
  }

  log.info('Submitting image captcha to 2Captcha')

  const res = await fetch('https://2captcha.com/in.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      key: TWO_CAPTCHA_KEY,
      method: 'base64',
      body: base64Image,
      json: '1',
    }),
  })

  const data = (await res.json()) as { status: number; request: string }

  if (data.status !== 1) {
    throw new Error(`2Captcha submit failed: ${data.request}`)
  }

  const captchaId = data.request
  log.info({ captchaId, cost: '~$0.003' }, 'Image captcha submitted, polling...')

  const result = await pollResult(captchaId)
  if (!result) {
    throw new Error('Failed to solve image captcha')
  }

  log.info({ captchaId }, 'Image captcha solved')
  return result
}

export async function solveHCaptcha(
  sitekey: string,
  pageUrl: string,
): Promise<string | null> {
  if (!TWO_CAPTCHA_KEY) {
    throw new Error('TWO_CAPTCHA_API_KEY not set')
  }

  log.info({ sitekey, pageUrl }, 'Submitting hCaptcha to 2Captcha')

  const res = await fetch('https://2captcha.com/in.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      key: TWO_CAPTCHA_KEY,
      method: 'hcaptcha',
      sitekey,
      pageurl: pageUrl,
      json: '1',
    }),
  })

  const data = (await res.json()) as { status: number; request: string }

  if (data.status !== 1) {
    if (data.request === 'ERROR_METHOD_CALL') {
      log.warn('hCaptcha method not supported by account')
      return null
    }
    throw new Error(`2Captcha submit failed: ${data.request}`)
  }

  const captchaId = data.request
  log.info({ captchaId, cost: '~$0.003' }, 'hCaptcha submitted, polling...')

  const result = await pollResult(captchaId)
  if (!result) {
    log.warn({ captchaId }, 'Failed to solve hCaptcha')
    return null
  }

  log.info({ captchaId }, 'hCaptcha solved')
  return result
}
