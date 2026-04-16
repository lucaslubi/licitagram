/**
 * Pregão Chat Poll Worker
 *
 * Polls a monitored pregão's chat room for new messages.
 * Self-scheduling: after each poll, enqueues the next one with delay.
 *
 * Flow:
 * 1. Load pregão + credential from DB
 * 2. Get/create browser context
 * 3. Ensure login
 * 4. Open pregão room
 * 5. Extract chat messages
 * 6. Deduplicate via SHA-256 hash
 * 7. Insert new messages
 * 8. Enqueue classification for each new message
 * 9. Broadcast via Supabase Realtime
 * 10. Update pregão status
 * 11. Reschedule next poll
 */

import { Worker, UnrecoverableError } from 'bullmq'
import { connection } from '../../queues/connection'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { getAdapter } from '../adapters'
import {
  InvalidCredentialsError,
  CaptchaRequiredError,
  MfaRequiredError,
} from '../adapters/types'
import { getOrCreateContext, getStorageState, closeContext } from '../lib/browser-manager'
import { decryptCredentials, decryptCredential, encryptCredential } from '../lib/crypto'
import { hashMessage } from '../lib/hash'
import { pregaoChatPollQueue } from '../queues/pregao-chat-poll.queue'
import { pregaoChatClassifyQueue } from '../queues/pregao-chat-classify.queue'
import type { PregaoChatPollJobData } from '../queues/pregao-chat-poll.queue'

const MAX_CONSECUTIVE_ERRORS = 5

export const pregaoChatPollWorker = new Worker<PregaoChatPollJobData>(
  'pregao-chat-poll',
  async (job) => {
    const { pregaoMonitoradoId } = job.data
    const log = logger.child({ jobId: job.id, pregaoId: pregaoMonitoradoId })

    // 1. Load pregão + credential
    const { data: pregao, error: pregaoError } = await supabase
      .from('pregoes_monitorados')
      .select('*, credencial:pregao_portais_credenciais(*)')
      .eq('id', pregaoMonitoradoId)
      .single()

    if (pregaoError || !pregao) {
      throw new UnrecoverableError(`Pregão not found: ${pregaoMonitoradoId}`)
    }

    if (pregao.status_monitoramento !== 'ativo') {
      log.info({ status: pregao.status_monitoramento }, 'Pregão not active, skipping')
      return
    }

    // 2. Get adapter
    const adapter = getAdapter(pregao.portal_slug)

    // Public monitoring mode: no credencial_id means read-only public scrape.
    // Used for portals like Compras.gov.br where the pregoeiro chat is
    // publicly readable without fornecedor login.
    const isPublicMode = !pregao.credencial_id

    // 3. Load session state if exists (only in authenticated mode)
    let storageStateJson: string | undefined
    if (!isPublicMode) {
      const { data: sessao } = await supabase
        .from('pregao_sessoes_portal')
        .select('*')
        .eq('credencial_id', pregao.credencial_id)
        .maybeSingle()

      if (sessao?.storage_state_cipher && sessao?.storage_state_nonce) {
        try {
          storageStateJson = decryptCredential(
            Buffer.from(sessao.storage_state_cipher),
            Buffer.from(sessao.storage_state_nonce),
          )
        } catch (err) {
          log.warn({ err }, 'Failed to decrypt session state, starting fresh')
        }
      }
    }

    // 4. Get browser context — keyed by credencial_id (or a public pool id)
    const contextKey = pregao.credencial_id ?? `public:${pregao.portal_slug}`
    const context = await getOrCreateContext(contextKey, storageStateJson)

    try {
      // 5. Ensure login — skipped entirely in public mode
      if (!isPublicMode && !(await adapter.isLoggedIn(context))) {
        const cred = pregao.credencial
        if (!cred) {
          throw new UnrecoverableError('Credential record missing')
        }

        const { usuario, senha } = decryptCredentials(
          Buffer.from(cred.login_usuario_cipher),
          Buffer.from(cred.login_senha_cipher),
          Buffer.from(cred.login_nonce),
        )

        await adapter.login(context, {
          usuario,
          senha,
          cnpjLicitante: cred.cnpj_licitante,
        })

        // Persist session for next poll
        await saveSession(pregao.credencial_id, context)

        // Update last login success
        await supabase
          .from('pregao_portais_credenciais')
          .update({
            status: 'ativo',
            ultimo_login_sucesso_em: new Date().toISOString(),
          })
          .eq('id', pregao.credencial_id)
      }

      // 6. Open pregão room
      const page = await adapter.openPregaoRoom(
        context,
        pregao.portal_pregao_id,
        pregao.portal_pregao_url,
      )

      // 7. Extract messages
      const rawMessages = await adapter.extractChatMessages(page)

      // 8. Detect phase
      const faseAtual = await adapter.detectPhase(page)

      // 9. Deduplicate + insert new messages
      const novasMensagens: Array<{ id: string }> = []
      for (const msg of rawMessages) {
        const hash = hashMessage(pregao.id, msg)

        const { data: inserted, error: insertError } = await supabase
          .from('pregao_mensagens')
          .insert({
            pregao_id: pregao.id,
            company_id: pregao.company_id,
            hash_mensagem: hash,
            remetente: msg.remetente,
            remetente_identificacao: msg.remetenteIdentificacao,
            conteudo: msg.conteudo,
            data_hora_portal: msg.dataHoraPortal.toISOString(),
          })
          .select('id')
          .single()

        if (!insertError && inserted) {
          novasMensagens.push(inserted)
        }
        // UNIQUE violation = already exists, ignore
      }

      // 10. Enqueue classification for new messages
      for (const msg of novasMensagens) {
        await pregaoChatClassifyQueue.add(
          'classify',
          { mensagemId: msg.id },
          { jobId: `classify-${msg.id}` },
        )
      }

      // 11. Broadcast via Supabase Realtime
      if (novasMensagens.length > 0) {
        await supabase.channel(`pregao-${pregao.id}`).send({
          type: 'broadcast',
          event: 'new_messages',
          payload: { count: novasMensagens.length },
        })
      }

      log.info(
        { rawCount: rawMessages.length, newCount: novasMensagens.length, fase: faseAtual },
        'Poll cycle complete',
      )

      // 12. Update pregão status
      const isTerminal = faseAtual === 'encerrado' || faseAtual === 'homologado'
      const proximoPoll = new Date(Date.now() + pregao.polling_interval_ms)

      await supabase
        .from('pregoes_monitorados')
        .update({
          fase_atual: faseAtual,
          ultimo_poll_em: new Date().toISOString(),
          ultimo_poll_sucesso_em: new Date().toISOString(),
          proximo_poll_em: isTerminal ? null : proximoPoll.toISOString(),
          erros_consecutivos: 0,
          ultimo_erro: null,
          status_monitoramento: isTerminal ? 'encerrado' : 'ativo',
        })
        .eq('id', pregao.id)

      // 13. Reschedule next poll if still active
      if (!isTerminal) {
        await pregaoChatPollQueue.add(
          'poll',
          { pregaoMonitoradoId: pregao.id },
          {
            delay: pregao.polling_interval_ms,
            jobId: `poll-${pregao.id}-${Date.now()}`,
          },
        )
      } else {
        log.info({ fase: faseAtual }, 'Pregão terminal phase reached, stopping monitoring')
      }

      // 14. Update portal health
      await supabase
        .from('pregao_portais_health')
        .update({
          ultimo_poll_sucesso_em: new Date().toISOString(),
          falhas_consecutivas: 0,
          status: 'ok',
          updated_at: new Date().toISOString(),
        })
        .eq('portal_slug', pregao.portal_slug)

    } catch (error) {
      await handlePollError(pregao, error as Error, log)
      throw error // Let BullMQ manage retry
    }
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
    lockDuration: 120_000, // 2 min lock — polls can be slow
    stalledInterval: 120_000,
  },
)

// ─── Error Handling ─────────────────────────────────────────────────────────

async function handlePollError(
  pregao: Record<string, unknown>,
  error: Error,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: any,
): Promise<void> {
  const pregaoId = pregao.id as string
  const credencialId = pregao.credencial_id as string
  const portalSlug = pregao.portal_slug as string
  const errosConsecutivos = (pregao.erros_consecutivos as number) + 1

  if (error instanceof InvalidCredentialsError) {
    // Mark credential as invalid, stop monitoring
    log.error({ error: error.message }, 'Invalid credentials — stopping monitoring')
    await supabase
      .from('pregao_portais_credenciais')
      .update({
        status: 'invalido',
        ultimo_teste_em: new Date().toISOString(),
        ultimo_teste_erro: error.message,
      })
      .eq('id', credencialId)

    await supabase
      .from('pregoes_monitorados')
      .update({
        status_monitoramento: 'erro',
        ultimo_erro: 'Credenciais inválidas',
        erros_consecutivos: errosConsecutivos,
      })
      .eq('id', pregaoId)

    await closeContext(credencialId)
    throw new UnrecoverableError(error.message)
  }

  if (error instanceof CaptchaRequiredError || error instanceof MfaRequiredError) {
    // Pause monitoring, needs manual intervention
    log.error({ error: error.message }, 'Manual intervention required — pausing')
    await supabase
      .from('pregoes_monitorados')
      .update({
        status_monitoramento: 'pausado',
        ultimo_erro: error.message,
        erros_consecutivos: errosConsecutivos,
      })
      .eq('id', pregaoId)

    await closeContext(credencialId)
    throw new UnrecoverableError(error.message)
  }

  // Generic error — increment counter
  log.error(
    { error: error.message, errosConsecutivos },
    'Poll error',
  )

  const shouldPause = errosConsecutivos >= MAX_CONSECUTIVE_ERRORS

  await supabase
    .from('pregoes_monitorados')
    .update({
      ultimo_poll_em: new Date().toISOString(),
      ultimo_erro: error.message,
      erros_consecutivos: errosConsecutivos,
      status_monitoramento: shouldPause ? 'erro' : 'ativo',
    })
    .eq('id', pregaoId)

  // Update portal health
  await supabase
    .from('pregao_portais_health')
    .update({
      falhas_consecutivas: errosConsecutivos,
      status: errosConsecutivos >= 3 ? 'degradado' : 'ok',
      updated_at: new Date().toISOString(),
    })
    .eq('portal_slug', portalSlug)

  if (shouldPause) {
    log.error({ errosConsecutivos }, 'Too many consecutive errors — pausing monitoring')
    await closeContext(credencialId)
  }
}

// ─── Session Persistence ────────────────────────────────────────────────────

async function saveSession(
  credencialId: string,
  context: Awaited<ReturnType<typeof getOrCreateContext>>,
): Promise<void> {
  const stateJson = await getStorageState(context)
  const encrypted = encryptCredential(stateJson)

  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

  await supabase
    .from('pregao_sessoes_portal')
    .upsert({
      credencial_id: credencialId,
      storage_state_cipher: encrypted.cipher,
      storage_state_nonce: encrypted.nonce,
      expira_em: expiraEm.toISOString(),
      worker_id: `${process.env.HOSTNAME || 'local'}-${process.pid}`,
      locked_at: new Date().toISOString(),
    }, { onConflict: 'credencial_id' })
}

// ─── Worker Events ──────────────────────────────────────────────────────────

pregaoChatPollWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      pregaoId: job?.data?.pregaoMonitoradoId,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      error: err.message,
    },
    'Pregão chat poll job failed',
  )
})
