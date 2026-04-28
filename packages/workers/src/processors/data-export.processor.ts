/**
 * Data Export Processor (LGPD)
 *
 * Pega rows pending em data_export_jobs, gera ZIP com dados do user,
 * sobe pra Supabase Storage bucket 'exports', emite signed URL com TTL 7d
 * e atualiza a row pra completed.
 */
import { Worker } from 'bullmq'
import AdmZip from 'adm-zip'
import { connection } from '../queues/connection'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { emailQueue } from '../queues/notification-email.queue'

interface ExportJobData {
  jobId: string
}

const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600

const dataExportWorker = new Worker<ExportJobData>(
  'data-export',
  async (job) => {
    const { jobId } = job.data
    if (!jobId) throw new Error('jobId is required')

    const { data: jobRow, error: jobErr } = await supabase
      .from('data_export_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobErr || !jobRow) {
      logger.warn({ jobId, err: jobErr?.message }, 'data-export: job row not found')
      return { skipped: true }
    }
    if (jobRow.status !== 'pending') {
      logger.info({ jobId, status: jobRow.status }, 'data-export: job not pending, skipping')
      return { skipped: true, status: jobRow.status }
    }

    await supabase
      .from('data_export_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId)

    try {
      const userId: string = jobRow.user_id
      const companyId: string = jobRow.company_id

      const [profileRes, matchesRes, outcomesRes, notifsRes, sessionsRes, companyRes] =
        await Promise.all([
          supabase.from('users').select('*').eq('id', userId).single(),
          supabase.from('matches').select('*').eq('company_id', companyId).limit(50_000),
          supabase.from('bid_outcomes').select('*').eq('company_id', companyId).limit(50_000),
          supabase.from('notifications').select('*').eq('user_id', userId).limit(50_000),
          supabase.from('bot_sessions').select('*').eq('company_id', companyId).limit(10_000),
          supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
        ])

      const zip = new AdmZip()
      const json = (v: unknown) => Buffer.from(JSON.stringify(v ?? null, null, 2), 'utf8')

      zip.addFile('perfil.json', json(profileRes.data))
      zip.addFile('empresa.json', json(companyRes.data))
      zip.addFile('matches.json', json(matchesRes.data || []))
      zip.addFile('bid_outcomes.json', json(outcomesRes.data || []))
      zip.addFile('notifications.json', json(notifsRes.data || []))
      zip.addFile('bot_sessions.json', json(sessionsRes.data || []))
      zip.addFile(
        'README.txt',
        Buffer.from(
          [
            'Exportação LGPD — Licitagram',
            `Gerado em: ${new Date().toISOString()}`,
            `Usuário: ${userId}`,
            `Empresa: ${companyId}`,
            '',
            'Conteúdo:',
            ' - perfil.json: dados do seu usuário',
            ' - empresa.json: dados da empresa associada',
            ' - matches.json: oportunidades encontradas para sua empresa',
            ' - bid_outcomes.json: resultados de licitações registrados',
            ' - notifications.json: histórico de notificações enviadas a você',
            ' - bot_sessions.json: sessões do bot Licitagram Supreme',
            '',
            'Equipe Licitagram',
          ].join('\n'),
          'utf8',
        ),
      )

      const buf = zip.toBuffer()
      const path = `${userId}/${jobId}.zip`

      const { error: upErr } = await supabase.storage.from('exports').upload(path, buf, {
        contentType: 'application/zip',
        upsert: true,
      })
      if (upErr) throw new Error(`storage upload: ${upErr.message}`)

      const { data: signed, error: signErr } = await supabase.storage
        .from('exports')
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      if (signErr || !signed?.signedUrl) {
        throw new Error(`signed url: ${signErr?.message || 'no url'}`)
      }

      const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()

      await supabase
        .from('data_export_jobs')
        .update({
          status: 'completed',
          storage_path: path,
          signed_url_expires_at: expiresAt,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      // Best-effort email notification — usa worker existente.
      // O processor de email pode não conhecer o type 'data_export_ready' ainda;
      // se não conhecer, ele apenas ignora (worker fail-soft).
      try {
        const profile = profileRes.data as { email?: string } | null
        if (profile?.email) {
          await emailQueue.add(
            `data-export-${jobId}`,
            {
              userId,
              userEmail: profile.email,
              type: 'data_export_ready',
              jobId,
              signedUrl: signed.signedUrl,
              expiresAt,
            },
            { jobId: `data-export-email-${jobId}` },
          )
        }
      } catch (emailErr: any) {
        logger.warn({ jobId, err: emailErr?.message }, 'data-export: email enqueue failed (non-critical)')
      }

      logger.info({ jobId, userId, sizeBytes: buf.length }, 'data-export: completed')
      return { ok: true, path, sizeBytes: buf.length }
    } catch (err: any) {
      const msg = (err?.message || String(err)).slice(0, 500)
      logger.error({ jobId, err: msg }, 'data-export: failed')
      await supabase
        .from('data_export_jobs')
        .update({ status: 'failed', error: msg })
        .eq('id', jobId)
      throw err
    }
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

dataExportWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err?.message }, 'data-export job failed')
})

export { dataExportWorker }
