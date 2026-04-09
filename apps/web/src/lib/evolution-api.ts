/**
 * WhatsApp verification code sender via WAHA (WhatsApp HTTP API)
 *
 * Switched from Evolution API to WAHA — same engine the workers use.
 * Env vars needed on Vercel:
 *   WAHA_URL      = http://<VPS_IP>:3000
 *   WAHA_API_KEY  = <key>
 *   WAHA_SESSION  = default  (optional, defaults to "default")
 */

function getConfig() {
  return {
    url: process.env.WAHA_URL || process.env.EVOLUTION_API_URL || 'http://localhost:3000',
    key: process.env.WAHA_API_KEY || process.env.EVOLUTION_API_KEY || '',
    session: process.env.WAHA_SESSION || 'default',
  }
}

export async function sendVerificationCode(phone: string, code: string): Promise<boolean> {
  const { url, key, session } = getConfig()

  const digits = phone.replace(/\D/g, '')
  const chatId = `${digits}@c.us`

  const text = [
    '*Código de Verificação Licitagram*',
    '',
    `Seu código: *${code}*`,
    '',
    'Digite este código no dashboard para ativar alertas via WhatsApp.',
    'Expira em 10 minutos.',
  ].join('\n')

  const response = await fetch(`${url}/api/sendText`, {
    method: 'POST',
    headers: {
      'X-Api-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session, chatId, text, linkPreview: false }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`WAHA ${response.status}: ${error}`)
  }

  return true
}
