import { logger } from './logger'

const CAPSOLVER_KEY = process.env.CAPSOLVER_API_KEY || ''
const CAPSOLVER_BASE = 'https://api.capsolver.com'
const TWOCAPTCHA_KEY = process.env.TWOCAPTCHA_API_KEY || ''
const TWOCAPTCHA_BASE = 'https://api.2captcha.com'
const ANTICAPTCHA_KEY = process.env.ANTICAPTCHA_API_KEY || ''
const ANTICAPTCHA_BASE = 'https://api.anti-captcha.com'
const POLL_INTERVAL = 3000
const TIMEOUT = 120000

const log = logger.child({ module: 'captcha-solver' })

interface CreateTaskResponse {
  errorId: number
  errorCode?: string
  errorDescription?: string
  taskId?: string
  // Some tasks return solution inline (instant)
  solution?: { text?: string; gRecaptchaResponse?: string; token?: string }
  status?: string
}

interface GetTaskResultResponse {
  errorId: number
  errorCode?: string
  errorDescription?: string
  status: 'idle' | 'processing' | 'ready' | 'failed'
  solution?: {
    text?: string
    gRecaptchaResponse?: string
    token?: string
  }
}

async function createTask(task: Record<string, unknown>): Promise<CreateTaskResponse> {
  const res = await fetch(`${CAPSOLVER_BASE}/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey: CAPSOLVER_KEY, task }),
  })
  return (await res.json()) as CreateTaskResponse
}

async function pollResult(taskId: string): Promise<string | null> {
  const start = Date.now()

  while (Date.now() - start < TIMEOUT) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))

    const res = await fetch(`${CAPSOLVER_BASE}/getTaskResult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: CAPSOLVER_KEY, taskId }),
    })
    const data = (await res.json()) as GetTaskResultResponse

    if (data.errorId !== 0) {
      log.error({ taskId, errorCode: data.errorCode, errorDescription: data.errorDescription }, 'CapSolver error')
      return null
    }

    if (data.status === 'ready') {
      return data.solution?.text || data.solution?.gRecaptchaResponse || data.solution?.token || null
    }

    if (data.status === 'failed') {
      log.warn({ taskId }, 'CapSolver task failed')
      return null
    }

    // status is 'idle' or 'processing' — keep polling
  }

  log.error({ taskId }, 'Captcha solve timed out')
  return null
}

export async function solveImageCaptcha(base64Image: string): Promise<string> {
  if (!CAPSOLVER_KEY) {
    throw new Error('CAPSOLVER_API_KEY not set')
  }

  log.info('Submitting image captcha to CapSolver')

  const data = await createTask({
    type: 'ImageToTextTask',
    module: 'common',
    body: base64Image,
  })

  if (data.errorId !== 0) {
    throw new Error(`CapSolver submit failed: ${data.errorCode} — ${data.errorDescription}`)
  }

  // CapSolver may return instant solution for image captchas
  if (data.status === 'ready' && data.solution?.text) {
    log.info('Image captcha solved instantly')
    return data.solution.text
  }

  if (!data.taskId) {
    throw new Error('CapSolver did not return a taskId')
  }

  const taskId = data.taskId
  log.info({ taskId }, 'Image captcha submitted, polling...')

  const result = await pollResult(taskId)
  if (!result) {
    throw new Error('Failed to solve image captcha')
  }

  log.info({ taskId }, 'Image captcha solved')
  return result
}

export async function solveHCaptcha(
  sitekey: string,
  pageUrl: string,
): Promise<string | null> {
  if (!CAPSOLVER_KEY) {
    throw new Error('CAPSOLVER_API_KEY not set')
  }

  // Try Enterprise first (gov.br uses hCaptcha Enterprise), then standard
  const taskTypes = [
    'HCaptchaEnterpriseTaskProxyLess',
    'HCaptchaTaskProxyLess',
  ]

  for (const taskType of taskTypes) {
    log.info({ sitekey, pageUrl, taskType }, 'Submitting hCaptcha to CapSolver')

    const data = await createTask({
      type: taskType,
      websiteURL: pageUrl,
      websiteKey: sitekey,
      isInvisible: true,
      enterprisePayload: taskType.includes('Enterprise') ? { rqdata: '' } : undefined,
    })

    if (data.errorId !== 0) {
      log.warn({ errorCode: data.errorCode, errorDescription: data.errorDescription, taskType }, 'CapSolver hCaptcha submit failed, trying next type')
      continue
    }

    // Check for instant solution
    if (data.status === 'ready' && (data.solution?.gRecaptchaResponse || data.solution?.token)) {
      log.info({ taskType }, 'hCaptcha solved instantly')
      return data.solution.gRecaptchaResponse || data.solution.token || null
    }

    if (!data.taskId) {
      log.warn({ taskType }, 'CapSolver did not return a taskId for hCaptcha')
      continue
    }

    const taskId = data.taskId
    log.info({ taskId, taskType }, 'hCaptcha submitted, polling...')

    const result = await pollResult(taskId)
    if (result) {
      log.info({ taskId, taskType }, 'hCaptcha solved')
      return result
    }

    log.warn({ taskId, taskType }, 'Failed to solve hCaptcha with this type')
  }

  log.warn({ sitekey }, 'All CapSolver hCaptcha task types failed, trying fallbacks')

  // Fallback 1: Anti-Captcha (supports hCaptcha including gov.br)
  if (ANTICAPTCHA_KEY) {
    const result = await solveHCaptchaViaAntiCaptcha(sitekey, pageUrl)
    if (result) return result
  }

  // Fallback 2: 2Captcha
  if (TWOCAPTCHA_KEY) {
    const result = await solveHCaptchaVia2Captcha(sitekey, pageUrl)
    if (result) return result
  }

  log.error({ sitekey }, 'All captcha providers failed')
  return null
}

// ─── Anti-Captcha Provider ──────────────────────────────────────────────────

async function solveHCaptchaViaAntiCaptcha(
  sitekey: string,
  pageUrl: string,
): Promise<string | null> {
  log.info({ sitekey, pageUrl }, 'Submitting hCaptcha to Anti-Captcha')

  // Step 1: Create task
  const submitRes = await fetch(`${ANTICAPTCHA_BASE}/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: ANTICAPTCHA_KEY,
      task: {
        type: 'HCaptchaTaskProxyless',
        websiteURL: pageUrl,
        websiteKey: sitekey,
      },
    }),
  })

  const submitData = (await submitRes.json()) as {
    errorId: number
    errorCode?: string
    errorDescription?: string
    taskId?: number
  }

  if (submitData.errorId !== 0) {
    log.error(
      { errorCode: submitData.errorCode, errorDescription: submitData.errorDescription },
      'Anti-Captcha hCaptcha submit failed',
    )
    return null
  }

  if (!submitData.taskId) {
    log.error('Anti-Captcha did not return taskId')
    return null
  }

  const taskId = submitData.taskId
  log.info({ taskId }, 'Anti-Captcha hCaptcha submitted, polling...')

  // Step 2: Poll for result
  const start = Date.now()
  while (Date.now() - start < TIMEOUT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL))

    const resultRes = await fetch(`${ANTICAPTCHA_BASE}/getTaskResult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: ANTICAPTCHA_KEY,
        taskId,
      }),
    })

    const resultData = (await resultRes.json()) as {
      errorId: number
      errorCode?: string
      status: string
      solution?: { gRecaptchaResponse?: string; token?: string }
    }

    if (resultData.errorId !== 0) {
      log.error({ taskId, errorCode: resultData.errorCode }, 'Anti-Captcha poll error')
      return null
    }

    if (resultData.status === 'ready') {
      const token = resultData.solution?.gRecaptchaResponse || resultData.solution?.token
      if (token) {
        log.info({ taskId }, 'Anti-Captcha hCaptcha solved')
        return token
      }
    }

    // status === 'processing' — keep polling
  }

  log.error({ taskId }, 'Anti-Captcha solve timed out')
  return null
}

// ─── 2Captcha Provider ──────────────────────────────────────────────────────

async function solveHCaptchaVia2Captcha(
  sitekey: string,
  pageUrl: string,
): Promise<string | null> {
  log.info({ sitekey, pageUrl }, 'Submitting hCaptcha to 2Captcha')

  // Step 1: Submit task via createTask API (v2)
  const submitRes = await fetch(`${TWOCAPTCHA_BASE}/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: TWOCAPTCHA_KEY,
      task: {
        type: 'HCaptchaTaskProxyless',
        websiteURL: pageUrl,
        websiteKey: sitekey,
      },
    }),
  })

  const submitData = (await submitRes.json()) as { errorId: number; errorCode?: string; errorDescription?: string; taskId?: number }

  if (submitData.errorId !== 0) {
    log.error({ errorCode: submitData.errorCode, errorDescription: submitData.errorDescription }, '2Captcha hCaptcha submit failed')
    return null
  }

  if (!submitData.taskId) {
    log.error('2Captcha did not return taskId')
    return null
  }

  const taskId = submitData.taskId
  log.info({ taskId }, '2Captcha hCaptcha submitted, polling...')

  // Step 2: Poll for result
  const start = Date.now()
  while (Date.now() - start < TIMEOUT) {
    await new Promise(r => setTimeout(r, 5000))

    const resultRes = await fetch(`${TWOCAPTCHA_BASE}/getTaskResult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: TWOCAPTCHA_KEY,
        taskId,
      }),
    })

    const resultData = (await resultRes.json()) as {
      errorId: number
      errorCode?: string
      status: string
      solution?: { token?: string; gRecaptchaResponse?: string }
    }

    if (resultData.errorId !== 0) {
      log.error({ taskId, errorCode: resultData.errorCode }, '2Captcha poll error')
      return null
    }

    if (resultData.status === 'ready') {
      const token = resultData.solution?.token || resultData.solution?.gRecaptchaResponse
      if (token) {
        log.info({ taskId }, '2Captcha hCaptcha solved')
        return token
      }
    }

    // status === 'processing' — keep polling
  }

  log.error({ taskId }, '2Captcha solve timed out')
  return null
}

export async function solveReCaptchaV2(
  sitekey: string,
  pageUrl: string,
): Promise<string | null> {
  if (!CAPSOLVER_KEY) {
    throw new Error('CAPSOLVER_API_KEY not set')
  }

  log.info({ sitekey, pageUrl }, 'Submitting ReCaptcha v2 to CapSolver')

  const data = await createTask({
    type: 'ReCaptchaV2TaskProxyLess',
    websiteURL: pageUrl,
    websiteKey: sitekey,
  })

  if (data.errorId !== 0) {
    log.warn({ errorCode: data.errorCode, errorDescription: data.errorDescription }, 'CapSolver ReCaptcha v2 submit failed')
    return null
  }

  if (!data.taskId) {
    log.warn('CapSolver did not return a taskId for ReCaptcha v2')
    return null
  }

  const taskId = data.taskId
  log.info({ taskId }, 'ReCaptcha v2 submitted, polling...')

  const result = await pollResult(taskId)
  if (!result) {
    log.warn({ taskId }, 'Failed to solve ReCaptcha v2')
    return null
  }

  log.info({ taskId }, 'ReCaptcha v2 solved')
  return result
}
