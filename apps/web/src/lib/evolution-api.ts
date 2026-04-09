/**
 * WhatsApp client for Web App (Replacing old Evolution API with WAHA)
 */

function getConfig() {
  return {
    url: process.env.WAHA_URL || process.env.EVOLUTION_API_URL || 'http://85.31.60.53:3000',
    key: process.env.WAHA_API_KEY || process.env.EVOLUTION_API_KEY || 'licitagram_waha_k3y_2026',
    session: process.env.WAHA_SESSION || 'default',
  }
}

export async function sendVerificationCode(phone: string, code: string): Promise<boolean> {
  const { url, key, session } = getConfig()

  // WAHA requires @c.us for regular numbers
  // Just strip non digits, add @c.us
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('55')) digits = '55' + digits
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
    throw new Error(`WAHA API ${response.status}: ${error}`)
  }

  return true
}
