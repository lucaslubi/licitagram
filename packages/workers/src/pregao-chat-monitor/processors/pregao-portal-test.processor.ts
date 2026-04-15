/**
 * Portal Test Login Worker
 *
 * Validates credentials by attempting a real login.
 * Called from the wizard UI when user registers new credentials.
 * Broadcasts result via Supabase Realtime for UI to update.
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
import { getOrCreateContext, closeContext, getStorageState } from '../lib/browser-manager'
import { decryptCredentials, encryptCredential } from '../lib/crypto'
import type { PregaoPortalTestJobData } from '../queues/pregao-portal-test.queue'

export const pregaoPortalTestWorker = new Worker<PregaoPortalTestJobData>(
  'pregao-portal-test-login',
  async (job) => {
    const { credencialId } = job.data
    const log = logger.child({ jobId: job.id, credencialId })

    // Mark as testing
    await supabase
      .from('pregao_portais_credenciais')
      .update({
        status: 'testando',
        ultimo_teste_em: new Date().toISOString(),
        ultimo_teste_erro: null,
      })
      .eq('id', credencialId)

    // Load credential
    const { data: cred, error: credError } = await supabase
      .from('pregao_portais_credenciais')
      .select('*')
      .eq('id', credencialId)
      .single()

    if (credError || !cred) {
      throw new UnrecoverableError('Credential not found')
    }

    const adapter = getAdapter(cred.portal_slug)

    let status: 'ativo' | 'invalido' | 'bloqueado' = 'invalido'
    let errorMessage: string | null = null

    try {
      // Decrypt credentials
      const { usuario, senha } = decryptCredentials(
        Buffer.from(cred.login_usuario_cipher),
        Buffer.from(cred.login_senha_cipher),
        Buffer.from(cred.login_nonce),
      )

      // Create fresh context for test
      const context = await getOrCreateContext(`test-${credencialId}`)

      try {
        await adapter.login(context, {
          usuario,
          senha,
          cnpjLicitante: cred.cnpj_licitante,
        })

        status = 'ativo'
        log.info({ portal: cred.portal_slug }, 'Test login successful')

        // Save the successful session for future use
        const stateJson = await getStorageState(context)
        const encrypted = encryptCredential(stateJson)

        await supabase
          .from('pregao_sessoes_portal')
          .upsert({
            credencial_id: credencialId,
            storage_state_cipher: encrypted.cipher,
            storage_state_nonce: encrypted.nonce,
            expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            worker_id: `${process.env.HOSTNAME || 'local'}-${process.pid}`,
            locked_at: new Date().toISOString(),
          }, { onConflict: 'credencial_id' })

      } finally {
        await closeContext(`test-${credencialId}`)
      }

    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        status = 'invalido'
        errorMessage = err.message
      } else if (err instanceof CaptchaRequiredError) {
        status = 'bloqueado'
        errorMessage = 'Portal requer CAPTCHA — tente novamente mais tarde ou use certificado A1'
      } else if (err instanceof MfaRequiredError) {
        status = 'bloqueado'
        errorMessage = 'Portal requer autenticação de dois fatores (MFA) — desative o MFA na sua conta gov.br ou use certificado A1'
      } else {
        errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
      }
      log.error({ portal: cred.portal_slug, error: errorMessage }, 'Test login failed')
    }

    // Update credential status
    await supabase
      .from('pregao_portais_credenciais')
      .update({
        status,
        ultimo_teste_em: new Date().toISOString(),
        ultimo_teste_erro: errorMessage,
        ...(status === 'ativo' ? { ultimo_login_sucesso_em: new Date().toISOString() } : {}),
      })
      .eq('id', credencialId)

    // Broadcast result via Realtime for wizard UI
    await supabase.channel(`credential-test-${credencialId}`).send({
      type: 'broadcast',
      event: 'test_result',
      payload: { credencialId, status, error: errorMessage },
    })
  },
  {
    connection,
    concurrency: 3,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
    lockDuration: 120_000,
    stalledInterval: 120_000,
  },
)

pregaoPortalTestWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      credencialId: job?.data?.credencialId,
      attempt: job?.attemptsMade,
      error: err.message,
    },
    'Portal test login job failed',
  )
})
