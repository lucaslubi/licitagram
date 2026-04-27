/**
 * Account Deletion Processor (LGPD)
 *
 * Cron diário 03:00 UTC. Idempotente — rodar 2x não duplica delete.
 *
 * Lógica:
 *   1. Pega rows de public.users com deletion_scheduled_at < NOW() AND
 *      deletion_cancelled_at IS NULL e que ainda não foram executadas
 *      (LEFT JOIN account_deletion_log + filtro executed_at IS NULL).
 *   2. Para cada user:
 *      - Marca account_deletion_log com executed_at = NOW() (audit)
 *      - Se único user da empresa em user_companies: delete company (cascade
 *        cuida de matches/bot_sessions/etc). Senão: só remove de user_companies.
 *      - Apaga auth.users via supabase.auth.admin.deleteUser(userId)
 *   3. Best-effort: erros não bloqueiam outras rows.
 */
import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const accountDeletionWorker = new Worker(
  'account-deletion',
  async () => {
    const now = new Date().toISOString()
    logger.info('Running account deletion sweep...')

    // Pega candidatos: deletion_scheduled_at no passado, não cancelado.
    // Tabela `users` (public) tem as colunas deletion_*.
    const { data: candidates, error: candErr } = await supabase
      .from('users')
      .select('id, company_id, email, deletion_scheduled_at, deletion_reason')
      .lte('deletion_scheduled_at', now)
      .is('deletion_cancelled_at', null)
      .not('deletion_scheduled_at', 'is', null)
      .limit(500)

    if (candErr) {
      logger.error({ err: candErr.message }, 'account-deletion: failed to fetch candidates')
      return { error: candErr.message }
    }

    if (!candidates || candidates.length === 0) {
      logger.info('account-deletion: no candidates to process')
      return { processed: 0 }
    }

    let processed = 0
    let skipped = 0
    let failed = 0

    for (const user of candidates) {
      const userId: string = user.id
      try {
        // Idempotência: se já existe um row no log com executed_at, skip.
        const { data: existingLog } = await supabase
          .from('account_deletion_log')
          .select('id, executed_at')
          .eq('user_id', userId)
          .not('executed_at', 'is', null)
          .limit(1)
          .maybeSingle()

        if (existingLog) {
          skipped++
          continue
        }

        // Insere row de execução PRIMEIRO (audit). Worker é idempotente:
        // se algo abaixo falhar, o log fica como "tentado" mas o data
        // ainda existe; próxima execução tenta de novo (skipped acima é
        // baseado em executed_at NOT NULL — só marcamos NOT NULL no fim).
        const { data: logRow, error: logErr } = await supabase
          .from('account_deletion_log')
          .insert({
            user_id: userId,
            company_id: user.company_id,
            scheduled_at: user.deletion_scheduled_at,
            reason: user.deletion_reason,
            metadata: { sweep_at: now },
          })
          .select('id')
          .single()

        if (logErr) {
          logger.warn({ userId, err: logErr.message }, 'account-deletion: log insert failed')
          // Continua mesmo assim — não queremos deixar dado órfão
        }

        // Verifica se o user é o único da empresa
        const companyId: string | null = user.company_id || null
        let companyDeleted = false

        if (companyId) {
          const { data: links } = await supabase
            .from('user_companies')
            .select('user_id')
            .eq('company_id', companyId)
            .limit(5)

          const otherUsers = (links || []).filter((l: any) => l.user_id !== userId)

          if (otherUsers.length === 0) {
            // Único — deleta empresa (cascade limpa matches/sessions/etc)
            const { error: delCompErr } = await supabase
              .from('companies')
              .delete()
              .eq('id', companyId)
            if (delCompErr) {
              logger.warn(
                { userId, companyId, err: delCompErr.message },
                'account-deletion: company delete failed (continuing with auth delete)',
              )
            } else {
              companyDeleted = true
            }
          } else {
            // Compartilhada — só remove o user dessa empresa
            await supabase
              .from('user_companies')
              .delete()
              .eq('user_id', userId)
              .eq('company_id', companyId)
          }
        }

        // Apaga row em public.users (vai cascatar pra outras tabelas que
        // ainda tenham FK; ON DELETE CASCADE em users → notifications, etc).
        // Best-effort: se falhar, prossegue.
        const { error: pubDelErr } = await supabase
          .from('users')
          .delete()
          .eq('id', userId)
        if (pubDelErr) {
          logger.warn({ userId, err: pubDelErr.message }, 'account-deletion: public.users delete failed')
        }

        // Apaga em auth (Supabase Admin API)
        try {
          const { error: authDelErr } = await supabase.auth.admin.deleteUser(userId)
          if (authDelErr) {
            // Se já foi deletado em uma tentativa anterior (404), considera ok
            if (authDelErr.message?.toLowerCase().includes('not found')) {
              logger.info({ userId }, 'account-deletion: auth user already gone')
            } else {
              throw authDelErr
            }
          }
        } catch (authErr: any) {
          logger.error({ userId, err: authErr?.message }, 'account-deletion: auth.admin.deleteUser failed')
          // Não marca executed_at se falhou — próximo sweep tenta de novo
          if (logRow) {
            await supabase
              .from('account_deletion_log')
              .update({ metadata: { sweep_at: now, error: authErr?.message?.slice(0, 500) } })
              .eq('id', logRow.id)
          }
          failed++
          continue
        }

        // Sucesso → marca executed_at no log row
        if (logRow) {
          await supabase
            .from('account_deletion_log')
            .update({
              executed_at: new Date().toISOString(),
              metadata: { sweep_at: now, company_deleted: companyDeleted },
            })
            .eq('id', logRow.id)
        }

        processed++
        logger.info({ userId, companyId, companyDeleted }, 'account-deletion: user deleted')
      } catch (err: any) {
        failed++
        logger.error({ userId, err: err?.message }, 'account-deletion: user processing failed')
      }
    }

    logger.info({ processed, skipped, failed, total: candidates.length }, 'account-deletion sweep complete')
    return { processed, skipped, failed }
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

accountDeletionWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err?.message }, 'account-deletion job failed')
})

export { accountDeletionWorker }
