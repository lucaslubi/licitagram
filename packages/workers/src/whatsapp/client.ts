/**
 * WhatsApp notification client via Evolution API
 *
 * O Licitagram tem 1 único número de WhatsApp.
 * Os clientes cadastram seus números no dashboard.
 * O sistema envia alertas para o número de cada cliente.
 *
 * NINGUÉM escaneia QR Code além do admin na configuração inicial.
 */

import { logger } from '../lib/logger'

const EVO_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVO_KEY = process.env.EVOLUTION_API_KEY || ''
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'licitagram'

async function evoFetch(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${EVO_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'apikey': EVO_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Evolution API ${response.status}: ${error}`)
  }

  return response.json()
}

/** Envia mensagem de texto */
export async function sendWhatsAppText(number: string, text: string) {
  return evoFetch(`/message/sendText/${INSTANCE}`, { number, text })
}

/** Envia documento (PDF do edital) */
export async function sendWhatsAppDocument(
  number: string,
  documentUrl: string,
  fileName: string,
  caption: string,
) {
  return evoFetch(`/message/sendMedia/${INSTANCE}`, {
    number,
    mediatype: 'document',
    media: documentUrl,
    fileName,
    caption,
  })
}

/** Envia código de verificação */
export async function sendVerificationCode(number: string, code: string) {
  return sendWhatsAppText(
    number,
    [
      '*Codigo de Verificacao Licitagram*',
      '',
      `Seu codigo: *${code}*`,
      '',
      'Digite este codigo no dashboard para ativar alertas via WhatsApp.',
      '',
      'Expira em 10 minutos.',
    ].join('\n'),
  )
}

/** Verifica se a instância está conectada */
export async function isConnected(): Promise<boolean> {
  try {
    const data = await evoFetch(`/instance/connectionState/${INSTANCE}`) as {
      instance?: { state?: string }
    }
    return data?.instance?.state === 'open'
  } catch {
    return false
  }
}

/** Formata e envia alerta de licitação */
export async function sendMatchAlert(
  number: string,
  match: {
    score: number
    justificativa: string
    recomendacao?: string
  },
  tender: {
    objeto: string
    orgao_nome: string
    uf: string
    valor_estimado: number | null
    data_abertura: string | null
    modalidade_nome: string | null
  },
  matchId: string,
) {
  const emoji = match.score >= 70 ? '🟢' : match.score >= 50 ? '🟡' : '🔴'
  const rec = match.recomendacao === 'participar' ? '✅ PARTICIPAR'
    : match.recomendacao === 'nao_recomendado' ? '⛔ NAO RECOMENDADO'
    : '🔎 AVALIAR'

  const valor = tender.valor_estimado
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tender.valor_estimado)
    : 'Nao informado'

  let prazoText = ''
  if (tender.data_abertura) {
    const dias = Math.ceil(
      (new Date(tender.data_abertura).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    )
    prazoText = dias > 0 ? `(${dias} dias restantes)` : dias === 0 ? '(HOJE)' : ''
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  const text = [
    `${emoji} *NOVA OPORTUNIDADE* | Score: *${match.score}/100*`,
    `📌 ${rec}`,
    '',
    `📋 ${tender.objeto.slice(0, 200)}`,
    `🏛 ${tender.orgao_nome}`,
    `📍 ${tender.uf} | ${tender.modalidade_nome || 'N/I'}`,
    `💰 ${valor}`,
    tender.data_abertura ? `⏰ Abertura: ${new Date(tender.data_abertura).toLocaleDateString('pt-BR')} ${prazoText}` : '',
    '',
    `💬 ${match.justificativa?.slice(0, 200) || ''}`,
    '',
    `🔗 Ver detalhes: ${appUrl}/opportunities/${matchId}`,
  ].filter(Boolean).join('\n')

  try {
    await sendWhatsAppText(number, text)
    logger.info({ matchId, number: number.slice(-4) }, 'WhatsApp alert sent')
  } catch (err) {
    logger.warn({ matchId, error: (err as Error).message }, 'WhatsApp alert failed')
    throw err
  }
}
