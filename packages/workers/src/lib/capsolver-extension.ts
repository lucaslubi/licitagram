import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { logger } from './logger'

const log = logger.child({ module: 'capsolver-extension' })

const EXTENSION_DIR = '/opt/licitagram/capsolver-extension'
const CONFIG_FILE = path.join(EXTENSION_DIR, 'assets', 'config.js')
const MARKER_FILE = path.join(EXTENSION_DIR, '.installed')

const RELEASE_URL =
  'https://github.com/capsolver/capsolver-browser-extension/releases/download/v.1.17.0/CapSolver.Browser.Extension-chrome-v1.17.0.zip'

const FALLBACK_URL =
  'https://github.com/capsolver/capsolver-browser-extension/releases/latest/download/CapSolver.Browser.Extension-chrome.zip'

/**
 * Ensures the CapSolver Chrome extension is downloaded, extracted, and
 * configured with the current CAPSOLVER_API_KEY.
 * Returns the absolute path to the unpacked extension directory.
 */
export async function getCapSolverExtensionPath(): Promise<string> {
  const apiKey = process.env.CAPSOLVER_API_KEY || ''
  if (!apiKey) {
    throw new Error('CAPSOLVER_API_KEY environment variable is not set')
  }

  // 1. Download & extract if not already present
  if (!existsSync(MARKER_FILE)) {
    log.info('CapSolver extension not found, downloading...')

    mkdirSync(EXTENSION_DIR, { recursive: true })

    const zipPath = path.join(EXTENSION_DIR, 'capsolver.zip')

    try {
      execFileSync('curl', ['-fsSL', '-o', zipPath, RELEASE_URL], {
        timeout: 60_000,
      })
    } catch {
      // Fallback: try the official capsolver.com download
      log.warn('GitHub download failed, trying capsolver.com CDN...')
      execFileSync('curl', ['-fsSL', '-o', zipPath, FALLBACK_URL], {
        timeout: 60_000,
      })
    }

    execFileSync('unzip', ['-o', '-q', zipPath, '-d', EXTENSION_DIR], {
      timeout: 30_000,
    })
    execFileSync('rm', ['-f', zipPath])

    // Some zips nest inside a subdirectory; flatten if needed
    const manifestDirect = path.join(EXTENSION_DIR, 'manifest.json')
    if (!existsSync(manifestDirect)) {
      // Look for manifest.json in immediate subdirectories
      const entries = readdirSync(EXTENSION_DIR, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const nestedManifest = path.join(EXTENSION_DIR, entry.name, 'manifest.json')
          if (existsSync(nestedManifest)) {
            const nestedDir = path.join(EXTENSION_DIR, entry.name)
            const nestedEntries = readdirSync(nestedDir)
            for (const ne of nestedEntries) {
              execFileSync('mv', [path.join(nestedDir, ne), EXTENSION_DIR])
            }
            execFileSync('rmdir', [nestedDir])
            break
          }
        }
      }
    }

    writeFileSync(MARKER_FILE, new Date().toISOString())
    log.info('CapSolver extension downloaded and extracted')
  }

  // 2. Write / update the config with the current API key
  const configContent = `var defined = {
  clientKey: "${apiKey}",
  hCaptchaMode: "click",
  reCaptchaMode: "click",
  enabledForHCaptcha: true,
  enabledForRecaptcha: true,
  enabledForImageToText: true,
  enabledForTurnstile: true,
  proxyType: "none",
  solvedCallback: "captchaCallback",
  textCaptchaMode: "auto"
};
`

  // Ensure assets directory exists
  const assetsDir = path.join(EXTENSION_DIR, 'assets')
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true })
  }

  // Write config -- always overwrite so API key stays fresh
  const existingConfig = existsSync(CONFIG_FILE)
    ? readFileSync(CONFIG_FILE, 'utf8')
    : ''

  if (!existingConfig.includes(apiKey)) {
    writeFileSync(CONFIG_FILE, configContent, 'utf8')
    log.info('CapSolver config.js written with current API key')
  }

  return EXTENSION_DIR
}
