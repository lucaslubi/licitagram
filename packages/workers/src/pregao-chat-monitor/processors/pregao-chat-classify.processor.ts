/**
 * Pregão Chat Classify Worker
 *
 * Processes messages pending AI classification.
 * Uses the existing callLLM() cascade (Groq → Gemini → OpenRouter)
 * with jsonMode for structured output, validated with Zod.
 *
 * Decoupled from the poll worker to not block scraping.
 */

import { Worker } from 'bullmq'
import { z } from 'zod'
import { connection } from '../../queues/connection'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { callLLM } from '../../ai/llm-client'
import { dispararNotificacaoWhatsApp } from '../lib/notify'
import type { PregaoChatClassifyJobData } from '../queues/pregao-chat-classify.queue'

// ─── Classification Schema ──────────────────────────────────────────────────

const ChatMensagemClassificacaoSchema = z.object({
  tipo: z.enum([
    'convocacao', 'diligencia', 'suspensao', 'retomada',
    'aceitacao', 'desclassificacao', 'habilitacao', 'recurso',
    'esclarecimento', 'geral',
  ]),

  urgencia: z.enum(['critica', 'alta', 'normal', 'baixa']),

  requer_acao_licitante: z.boolean(),

  prazo_detectado_ate: z.string().nullable(),

  resumo_acao: z.string().nullable(),
})

type ChatMensagemClassificacao = z.infer<typeof ChatMensagemClassificacaoSchema>

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é especialista em pregão eletrônico brasileiro sob a Lei 14.133/2021 e a Lei 10.520/2002.
Sua tarefa é classificar mensagens do chat do pregoeiro para alertar licitantes sobre ações necessárias.

Regras de classificação de urgência:
- critica: Convocação com prazo menor que 4 horas, ou risco iminente de desclassificação/inabilitação
- alta: Diligência ou convocação com prazo entre 4 e 24 horas. Desclassificação ou inabilitação comunicada.
- normal: Suspensão, retomada, mudança de fase, esclarecimentos com prazo > 24h
- baixa: Mensagens informativas gerais sem ação necessária do licitante

Responda EXCLUSIVAMENTE em JSON válido, sem markdown, sem backticks, sem texto antes ou depois.
O JSON deve ter exatamente estes campos:
{
  "tipo": "convocacao|diligencia|suspensao|retomada|aceitacao|desclassificacao|habilitacao|recurso|esclarecimento|geral",
  "urgencia": "critica|alta|normal|baixa",
  "requer_acao_licitante": true|false,
  "prazo_detectado_ate": "ISO 8601 datetime ou null",
  "resumo_acao": "frase curta max 120 chars ou null"
}

Para prazo_detectado_ate: calcule a data-hora ISO 8601 somando horas/minutos mencionados na mensagem ao horário atual que será fornecido. Se não houver prazo explícito, retorne null.
Para resumo_acao: descreva em uma frase curta (max 120 chars) a ação que o licitante precisa tomar. Se não houver ação, retorne null.`

// ─── Worker ─────────────────────────────────────────────────────────────────

export const pregaoChatClassifyWorker = new Worker<PregaoChatClassifyJobData>(
  'pregao-chat-classify',
  async (job) => {
    const { mensagemId } = job.data
    const log = logger.child({ jobId: job.id, mensagemId })

    // Load message + pregão
    const { data: msg, error: msgError } = await supabase
      .from('pregao_mensagens')
      .select('*, pregao:pregoes_monitorados(fase_atual, orgao_nome, numero_pregao)')
      .eq('id', mensagemId)
      .single()

    if (msgError || !msg) {
      log.warn('Message not found, skipping classification')
      return
    }

    if (msg.classificacao_em) {
      log.info('Already classified, skipping')
      return
    }

    const now = new Date()
    const pregao = msg.pregao

    // Build prompt
    const prompt = [
      `Horário atual: ${now.toISOString()}`,
      `Fuso: America/Sao_Paulo`,
      `Fase atual do pregão: ${pregao?.fase_atual ?? 'desconhecida'}`,
      `Órgão: ${pregao?.orgao_nome ?? 'N/A'}`,
      `Pregão: ${pregao?.numero_pregao ?? 'N/A'}`,
      '',
      `Mensagem do chat:`,
      `"""`,
      msg.conteudo,
      `"""`,
    ].join('\n')

    // Call LLM with jsonMode
    let classificacao: ChatMensagemClassificacao

    try {
      const raw = await callLLM({
        task: 'classification',
        system: SYSTEM_PROMPT,
        prompt,
        jsonMode: true,
        maxRetries: 2,
      })

      // Parse and validate with Zod
      const parsed = JSON.parse(raw)
      classificacao = ChatMensagemClassificacaoSchema.parse(parsed)
    } catch (err) {
      log.error({ error: err instanceof Error ? err.message : String(err) }, 'LLM classification failed')
      throw err // Let BullMQ retry
    }

    // Update message with classification
    await supabase
      .from('pregao_mensagens')
      .update({
        classificacao_tipo: classificacao.tipo,
        classificacao_urgencia: classificacao.urgencia,
        classificacao_em: new Date().toISOString(),
        requer_acao_licitante: classificacao.requer_acao_licitante,
        prazo_detectado_ate: classificacao.prazo_detectado_ate,
        resumo_acao: classificacao.resumo_acao,
      })
      .eq('id', mensagemId)

    log.info(
      { tipo: classificacao.tipo, urgencia: classificacao.urgencia, requerAcao: classificacao.requer_acao_licitante },
      'Message classified',
    )

    // Broadcast classification update via Realtime
    await supabase.channel(`pregao-${msg.pregao_id}`).send({
      type: 'broadcast',
      event: 'message_classified',
      payload: {
        mensagem_id: mensagemId,
        urgencia: classificacao.urgencia,
        tipo: classificacao.tipo,
      },
    })

    // Send WhatsApp notification for high/critical urgency
    if (classificacao.urgencia === 'critica' || classificacao.urgencia === 'alta') {
      try {
        await dispararNotificacaoWhatsApp(mensagemId)
      } catch (err) {
        // Don't fail the job if notification fails — message is already classified
        log.error(
          { error: err instanceof Error ? err.message : String(err) },
          'WhatsApp notification failed (non-fatal)',
        )
      }
    }
  },
  {
    connection,
    concurrency: 20,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
)

// ─── Worker Events ──────────────────────────────────────────────────────────

pregaoChatClassifyWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      mensagemId: job?.data?.mensagemId,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      error: err.message,
    },
    'Pregão chat classify job failed',
  )
})
