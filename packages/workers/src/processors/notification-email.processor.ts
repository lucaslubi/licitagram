/**
 * Email notification processor — sends alerts via Resend API.
 *
 * Requires RESEND_API_KEY env var.
 * If not configured, logs warning and skips (non-blocking).
 */

import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import type { EmailNotificationJobData } from '../queues/notification-email.queue'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { validateNotification } from '../lib/notification-guard'

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const EMAIL_FROM = process.env.EMAIL_FROM || 'Licitagram <alertas@licitagram.com>'

async function sendEmail(to: string, subject: string, html: string): Promise<string | null> {
  if (!RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY not configured, skipping email')
    return null
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Resend API error ${res.status}: ${err}`)
    }

    const data = await res.json()
    return data.id || null
  } catch (err: any) {
    logger.error({ err: err.message, to, subject }, 'Failed to send email')
    throw err
  }
}

function matchAlertHtml(data: { objeto: string; orgao: string; uf: string; valor: string; score: number; matchId: string }): string {
  const scoreColor = data.score >= 70 ? '#10B981' : data.score >= 50 ? '#F59E0B' : '#EF4444'
  return `
<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
  <div style="background:#111214;border-radius:8px;padding:24px;color:#fff">
    <div style="text-align:center;margin-bottom:16px">
      <span style="font-size:24px;font-weight:bold;color:#10B981">Licitagram</span>
    </div>
    <div style="background:#1a1c1f;border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="display:inline-block;background:${scoreColor};color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:bold;margin-bottom:8px">
        Score: ${data.score}/100
      </div>
      <h2 style="color:#fff;font-size:16px;margin:8px 0">${data.objeto}</h2>
      <p style="color:#9CA3AF;font-size:13px;margin:4px 0">🏛 ${data.orgao}</p>
      <p style="color:#9CA3AF;font-size:13px;margin:4px 0">📍 ${data.uf} | 💰 ${data.valor}</p>
    </div>
    <div style="text-align:center">
      <a href="https://licitagram.com/opportunities/${data.matchId}" style="display:inline-block;background:#10B981;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
        Ver no Licitagram →
      </a>
    </div>
  </div>
  <p style="text-align:center;color:#6B7280;font-size:11px;margin-top:16px">
    Licitagram — A inteligência do gasto público<br>
    <a href="https://licitagram.com/settings" style="color:#6B7280">Gerenciar notificações</a>
  </p>
</div>`
}

const emailWorker = new Worker<EmailNotificationJobData>(
  'notification-email',
  async (job) => {
    const data = job.data

    if ('matchId' in data && data.matchId) {
      // Validate notification
      const guard = await validateNotification(data.matchId)
      if (!guard.allowed) {
        logger.info({ matchId: data.matchId, reason: guard.reason }, 'Email notification skipped')
        return
      }

      // Fetch match + tender data
      const { data: match } = await supabase
        .from('matches')
        .select('id, score, tenders(objeto, orgao_nome, uf, valor_estimado)')
        .eq('id', data.matchId)
        .single()

      if (!match) return

      const tender = match.tenders as any
      const valor = tender?.valor_estimado
        ? `R$ ${Number(tender.valor_estimado).toLocaleString('pt-BR')}`
        : 'Não informado'

      const subject = `Nova oportunidade (Score ${match.score}) — ${(tender?.objeto || '').substring(0, 60)}`
      const html = matchAlertHtml({
        objeto: (tender?.objeto || '').substring(0, 200),
        orgao: tender?.orgao_nome || 'N/I',
        uf: tender?.uf || 'N/I',
        valor,
        score: match.score,
        matchId: match.id,
      })

      const resendId = await sendEmail(data.userEmail, subject, html)

      // Log delivery
      await supabase
        .from('email_notification_logs')
        .insert({
          user_id: data.userId,
          match_id: data.matchId,
          template: (data as any).type || 'new_match',
          subject,
          status: resendId ? 'sent' : 'failed',
          resend_id: resendId,
        })

      // Mark match as email-notified
      if (resendId) {
        await supabase
          .from('matches')
          .update({ email_notified_at: new Date().toISOString() })
          .eq('id', data.matchId)
      }
    } else if ('type' in data) {
      // Handle non-match emails (trial expiry, etc.)
      const type = (data as any).type as string

      if (type === 'trial_expiring_soon') {
        const subject = '⏰ Seu trial do Licitagram expira em breve!'
        const html = `
<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
  <div style="background:#111214;border-radius:8px;padding:24px;color:#fff">
    <div style="text-align:center;margin-bottom:16px">
      <span style="font-size:24px;font-weight:bold;color:#10B981">Licitagram</span>
    </div>
    <div style="background:#1a1c1f;border-radius:8px;padding:16px;margin-bottom:16px">
      <h2 style="color:#fff;font-size:18px;margin:0 0 8px">⏰ Seu período de teste está acabando!</h2>
      <p style="color:#9CA3AF;font-size:14px;margin:4px 0">
        Seu trial do Licitagram expira em <strong style="color:#F59E0B">2 dias</strong>.
      </p>
      <p style="color:#9CA3AF;font-size:14px;margin:8px 0">
        Para continuar recebendo alertas de licitações, análises com IA e todas as funcionalidades,
        escolha um plano que se adeque à sua empresa.
      </p>
    </div>
    <div style="text-align:center">
      <a href="https://licitagram.com/billing" style="display:inline-block;background:#10B981;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
        Escolher um Plano →
      </a>
    </div>
  </div>
  <p style="text-align:center;color:#6B7280;font-size:11px;margin-top:16px">
    Licitagram — A inteligência do gasto público<br>
    <a href="https://licitagram.com/settings" style="color:#6B7280">Gerenciar notificações</a>
  </p>
</div>`

        await sendEmail(data.userEmail, subject, html)
        logger.info({ userId: data.userId, type }, 'Trial expiring soon email sent')
      } else if (type === 'trial_expired') {
        const subject = '❌ Seu trial do Licitagram expirou'
        const html = `
<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
  <div style="background:#111214;border-radius:8px;padding:24px;color:#fff">
    <div style="text-align:center;margin-bottom:16px">
      <span style="font-size:24px;font-weight:bold;color:#10B981">Licitagram</span>
    </div>
    <div style="background:#1a1c1f;border-radius:8px;padding:16px;margin-bottom:16px">
      <h2 style="color:#fff;font-size:18px;margin:0 0 8px">Seu período de teste encerrou</h2>
      <p style="color:#9CA3AF;font-size:14px;margin:4px 0">
        Seu trial gratuito do Licitagram chegou ao fim. Você não receberá mais alertas
        de novas licitações até ativar um plano.
      </p>
      <p style="color:#9CA3AF;font-size:14px;margin:8px 0">
        <strong style="color:#fff">Não perca oportunidades!</strong> Enquanto você não está monitorando,
        seus concorrentes estão. Ative um plano agora para voltar a receber as melhores oportunidades.
      </p>
    </div>
    <div style="text-align:center">
      <a href="https://licitagram.com/billing" style="display:inline-block;background:#10B981;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
        Ativar Plano →
      </a>
    </div>
    <p style="color:#6B7280;font-size:12px;text-align:center;margin-top:12px">
      Planos a partir de R$ 99,90/mês — cancele quando quiser.
    </p>
  </div>
  <p style="text-align:center;color:#6B7280;font-size:11px;margin-top:16px">
    Licitagram — A inteligência do gasto público<br>
    <a href="https://licitagram.com/settings" style="color:#6B7280">Gerenciar notificações</a>
  </p>
</div>`

        await sendEmail(data.userEmail, subject, html)
        logger.info({ userId: data.userId, type }, 'Trial expired email sent')
      }
    }
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 3, duration: 1000 }, // 3 emails/sec — Resend free plan limit is 5/s
  },
)

emailWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Email notification job failed')
})

export { emailWorker }
