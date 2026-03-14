/**
 * Evolution API client for WhatsApp verification (server-side only)
 */

const EVO_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVO_KEY = process.env.EVOLUTION_API_KEY || ''
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'licitagram'

export async function sendVerificationCode(phone: string, code: string): Promise<boolean> {
  const text = [
    '*Codigo de Verificacao Licitagram*',
    '',
    `Seu codigo: *${code}*`,
    '',
    'Digite este codigo no dashboard para ativar alertas via WhatsApp.',
    'Expira em 10 minutos.',
  ].join('\n')

  const response = await fetch(`${EVO_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVO_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number: phone, text }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Evolution API ${response.status}: ${error}`)
  }

  return true
}
