/**
 * WhatsApp verification code sender via WAHA (WhatsApp HTTP API)
 *
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

/**
 * Resolve o chatId real do número BR via WAHA check-exists.
 * Números brasileiros migrados para 9 dígitos às vezes têm chatId
 * sem o 9 extra (ex: 5541991016001 → 554191016001@c.us).
 * Sem essa resolução, mensagens ficam PENDING para sempre.
 */
async function toChatId(digits: string): Promise<string> {
  const { url, key, session } = getConfig()
  try {
    const res = await fetch(
      `${url}/api/contacts/check-exists?phone=${digits}&session=${session}`,
      { headers: { 'X-Api-Key': key }, signal: AbortSignal.timeout(10_000) },
    )
    if (res.ok) {
      const data = await res.json() as { numberExists?: boolean; chatId?: string }
      if (data.numberExists && data.chatId) return data.chatId
    }
  } catch {
    // fallback abaixo
  }
  return `${digits}@c.us`
}

export async function sendVerificationCode(phone: string, code: string): Promise<boolean> {
  const { url, key, session } = getConfig()

  const digits = phone.replace(/\D/g, '')
  const chatId = await toChatId(digits)

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
