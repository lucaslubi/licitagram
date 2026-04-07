/**
 * WhatsApp notification client via WAHA (WhatsApp HTTP API)
 *
 * O Licitagram tem 1 único número de WhatsApp.
 * Os clientes cadastram seus números no dashboard.
 * O sistema envia alertas para o número de cada cliente.
 *
 * NINGUÉM escaneia QR Code além do admin na página /admin/whatsapp.
 *
 * Engine: WAHA (devlikeapro/waha) - https://waha.devlike.pro
 */

import { logger } from '../lib/logger'

const WAHA_URL = process.env.WAHA_URL || process.env.EVOLUTION_API_URL || 'http://127.0.0.1:3000'
const WAHA_KEY = process.env.WAHA_API_KEY || ''
const WAHA_SESSION = process.env.WAHA_SESSION || 'default'

/** Converte número BR (5541991016001) em chatId WAHA (5541991016001@c.us) */
function toChatId(number: string): string {
  const digits = number.replace(/\D/g, '')
  if (digits.includes('@')) return digits
  return `${digits}@c.us`
}

async function wahaFetch(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<unknown> {
  const response = await fetch(`${WAHA_URL}${path}`, {
    method,
    headers: {
      'X-Api-Key': WAHA_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`WAHA ${response.status}: ${error}`)
  }

  return response.json().catch(() => ({}))
}

/** Envia mensagem de texto via WAHA */
export async function sendWhatsAppText(number: string, text: string) {
  return wahaFetch(`/api/sendText`, {
    session: WAHA_SESSION,
    chatId: toChatId(number),
    text,
    linkPreview: false,
  })
}

/** Envia documento (PDF do edital) via WAHA */
export async function sendWhatsAppDocument(
  number: string,
  documentUrl: string,
  fileName: string,
  caption: string,
) {
  return wahaFetch(`/api/sendFile`, {
    session: WAHA_SESSION,
    chatId: toChatId(number),
    file: { url: documentUrl, filename: fileName },
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

/** Verifica se a sessão WAHA está conectada (status WORKING) */
export async function isConnected(): Promise<boolean> {
  try {
    const data = await wahaFetch(`/api/sessions/${WAHA_SESSION}`, undefined, 'GET') as {
      status?: string
    }
    return data?.status === 'WORKING'
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

  const isHot = match.score >= 80
  const header = isHot
    ? `🔥 *SUPER QUENTE* | Score: *${match.score}/100*`
    : `${emoji} *NOVA OPORTUNIDADE* | Score: *${match.score}/100*`

  const text = [
    header,
    `📌 ${rec}`,
    '',
    `📋 *Objeto:* ${tender.objeto.slice(0, 300)}`,
    '',
    `🏛 *Orgao:* ${tender.orgao_nome}`,
    `📍 *UF:* ${tender.uf}`,
    `💰 *Valor:* ${valor}`,
    tender.modalidade_nome ? `📑 *Modalidade:* ${tender.modalidade_nome}` : '',
    tender.data_abertura ? `⏰ *Abertura:* ${new Date(tender.data_abertura).toLocaleDateString('pt-BR')} ${prazoText}` : '',
    '',
    match.justificativa ? `💬 *Parecer IA:* ${match.justificativa.slice(0, 250)}` : '',
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

/** Envia prompt de resultado da licitação */
export async function sendOutcomePrompt(
  number: string,
  tender: { objeto: string; orgao_nome: string },
  matchId: string,
  daysSinceClose: number,
): Promise<void> {
  const objeto = tender.objeto?.substring(0, 100) || 'Sem descrição'
  const text = [
    '📊 *Resultado da Licitação*',
    '',
    `A licitação encerrou há ${daysSinceClose} dia(s):`,
    `📋 ${objeto}`,
    `🏛️ ${tender.orgao_nome}`,
    '',
    'Como foi o resultado?',
    '',
    '1️⃣ Ganhamos! 🎉',
    '2️⃣ Perdemos 😔',
    '3️⃣ Não participamos',
    '',
    `_Responda com o número (1, 2 ou 3)_`,
    `_[ref:${matchId}]_`,
  ].join('\n')

  await sendWhatsAppText(number, text)
  logger.info({ matchId, number: number.slice(-4) }, 'WhatsApp outcome prompt sent')
}
