import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { DocumentExpiryJobData } from '../queues/document-expiry.queue'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { bot } from '../telegram/bot'

async function processDocumentExpiry(job: Job<DocumentExpiryJobData>) {
  logger.info('Checking document expiry...')

  // Find documents expiring within 30 days
  const today = new Date()
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  const { data: expiringDocs, error: expErr1 } = await supabase
    .from('company_documents')
    .select('id, company_id, tipo, descricao, validade')
    .not('validade', 'is', null)
    .lte('validade', thirtyDaysFromNow.toISOString().split('T')[0])
    .gte('validade', today.toISOString().split('T')[0])

  if (expErr1) {
    logger.error({ error: expErr1 }, 'Failed to query expiring documents')
    return
  }

  // Find expired documents
  const { data: expiredDocs, error: expErr2 } = await supabase
    .from('company_documents')
    .select('id, company_id, tipo, descricao, validade')
    .not('validade', 'is', null)
    .lt('validade', today.toISOString().split('T')[0])

  if (expErr2) {
    logger.error({ error: expErr2 }, 'Failed to query expired documents')
  }

  if ((!expiringDocs || expiringDocs.length === 0) && (!expiredDocs || expiredDocs.length === 0)) {
    logger.info('No documents expiring or expired')
    return
  }

  const DOCUMENT_TYPES: Record<string, string> = {
    cnd_federal: 'CND Federal (Receita/PGFN)',
    cnd_estadual: 'CND Estadual',
    cnd_municipal: 'CND Municipal',
    fgts: 'Certidão FGTS',
    trabalhista: 'CNDT (Trabalhista)',
    sicaf: 'SICAF',
    atestado_capacidade: 'Atestado de Capacidade Técnica',
    balanco: 'Balanço Patrimonial',
    contrato_social: 'Contrato Social',
    iso_9001: 'ISO 9001',
    alvara: 'Alvará de Funcionamento',
    crea_cau: 'CREA / CAU',
  }

  // Group by company_id
  const byCompany = new Map<string, Array<{ tipo: string; validade: string; expired: boolean; daysLeft: number }>>()

  for (const doc of [...(expiringDocs || []), ...(expiredDocs || [])]) {
    const items = byCompany.get(doc.company_id) || []
    const valDate = new Date(doc.validade)
    const daysLeft = Math.ceil((valDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    items.push({
      tipo: doc.tipo,
      validade: doc.validade,
      expired: daysLeft < 0,
      daysLeft,
    })
    byCompany.set(doc.company_id, items)
  }

  let notificationsSent = 0

  for (const [companyId, docs] of byCompany.entries()) {
    // Find users with Telegram linked for this company
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, telegram_chat_id, notification_preferences')
      .eq('company_id', companyId)
      .not('telegram_chat_id', 'is', null)

    if (usersErr) {
      logger.error({ companyId, error: usersErr }, 'Failed to fetch users for document expiry')
      continue
    }

    if (!users || users.length === 0) continue

    // Build alert message
    let msg = '📋 *Alerta de Documentos*\n\n'

    const expired = docs.filter((d) => d.expired)
    const expiring = docs.filter((d) => !d.expired)

    if (expired.length > 0) {
      msg += '🔴 *Vencidos:*\n'
      for (const doc of expired) {
        const label = DOCUMENT_TYPES[doc.tipo] || doc.tipo
        msg += `• ${label} — venceu há ${Math.abs(doc.daysLeft)} dias\n`
      }
      msg += '\n'
    }

    if (expiring.length > 0) {
      msg += '🟡 *Vencendo em breve:*\n'
      for (const doc of expiring) {
        const label = DOCUMENT_TYPES[doc.tipo] || doc.tipo
        msg += `• ${label} — ${doc.daysLeft} dias restantes\n`
      }
      msg += '\n'
    }

    msg += '💡 Renove seus documentos para não perder oportunidades!'

    for (const user of users) {
      const prefs = (user.notification_preferences as Record<string, unknown>) || {}
      if (prefs.telegram === false) continue

      try {
        if (bot) {
          await bot.api.sendMessage(user.telegram_chat_id, msg, {
            parse_mode: 'Markdown',
          })
          notificationsSent++
        }
      } catch (err) {
        logger.error({ userId: user.id, err }, 'Failed to send document expiry alert')
      }
    }
  }

  logger.info(
    { expiringCount: expiringDocs?.length || 0, expiredCount: expiredDocs?.length || 0, notificationsSent },
    'Document expiry check completed',
  )
}

export const documentExpiryWorker = new Worker<DocumentExpiryJobData>(
  'document-expiry',
  processDocumentExpiry,
  { connection, concurrency: 1 },
)

documentExpiryWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Document expiry check completed')
})

documentExpiryWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Document expiry check failed')
})
