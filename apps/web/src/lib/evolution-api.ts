/**
 * Evolution API client for WhatsApp verification (server-side only)
 */

function getConfig() {
  return {
    url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
    key: process.env.EVOLUTION_API_KEY || '',
    instance: process.env.EVOLUTION_INSTANCE || 'licitagram',
  }
}

export async function sendVerificationCode(phone: string, code: string): Promise<boolean> {
  const { url, key, instance } = getConfig()

  const text = [
    '*Código de Verificação Licitagram*',
    '',
    `Seu código: *${code}*`,
    '',
    'Digite este código no dashboard para ativar alertas via WhatsApp.',
    'Expira em 10 minutos.',
  ].join('\n')

  const response = await fetch(`${url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number: phone, textMessage: { text } }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Evolution API ${response.status}: ${error}`)
  }

  return true
}
