import { logger } from './logger'

const CAPSOLVER_KEY = process.env.CAPSOLVER_API_KEY || ''
const CAPSOLVER_BASE = 'https://api.capsolver.com'
const POLL_INTERVAL = 3000
const TIMEOUT = 120000

const log = logger.child({ module: 'captcha-solver' })

interface CreateTaskResponse {
  errorId: number
  errorCode?: string
  errorDescription?: string
  taskId?: string
  // Some tasks return solution inline (instant)
  solution?: { text?: string; gRecaptchaResponse?: string }
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

  log.info({ sitekey, pageUrl }, 'Submitting hCaptcha to CapSolver')

  const data = await createTask({
    type: 'HCaptchaTaskProxyLess',
    websiteURL: pageUrl,
    websiteKey: sitekey,
  })

  if (data.errorId !== 0) {
    log.warn({ errorCode: data.errorCode, errorDescription: data.errorDescription }, 'CapSolver hCaptcha submit failed')
    return null
  }

  if (!data.taskId) {
    log.warn('CapSolver did not return a taskId for hCaptcha')
    return null
  }

  const taskId = data.taskId
  log.info({ taskId }, 'hCaptcha submitted, polling...')

  const result = await pollResult(taskId)
  if (!result) {
    log.warn({ taskId }, 'Failed to solve hCaptcha')
    return null
  }

  log.info({ taskId }, 'hCaptcha solved')
  return result
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
