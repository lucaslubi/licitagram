/**
 * WhatsApp notification handler for urgent pregão chat messages.
 *
 * Reuses the existing Evolution API wrapper from packages/workers/src/whatsapp/client.ts
 * Sends formatted alerts for messages with urgência 'critica' or 'alta'.
 */

import { sendWhatsAppText } from '../../whatsapp/client'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'

export async function dispararNotificacaoWhatsApp(mensagemId: string): Promise<void> {
  const log = logger.child({ mensagemId })

  // Load message + pregão + company users
  const { data: msg, error: msgError } = await supabase
    .from('pregao_mensagens')
    .select('*, pregao:pregoes_monitorados(*)')
    .eq('id', mensagemId)
    .single()

  if (msgError || !msg) {
    log.warn({ error: msgError?.message }, 'Message not found for notification')
    return
  }

  if (msg.notificacao_whatsapp_enviada_em) {
    log.info('WhatsApp already sent for this message, skipping')
    return
  }

  // Find users with whatsapp enabled for this company
  const { data: users } = await supabase
    .from('users')
    .select('id, whatsapp_number, notification_preferences')
    .eq('company_id', msg.company_id)
    .not('whatsapp_number', 'is', null)

  if (!users || users.length === 0) {
    log.info('No users with WhatsApp number for this company')
    return
  }

  const pregao = msg.pregao
  const emoji = msg.classificacao_urgencia === 'critica' ? '\u{1F534}' : '\u{1F7E0}'

  const prazo = msg.prazo_detectado_ate
    ? `\n\u23F0 Prazo: ${new Date(msg.prazo_detectado_ate).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
    : ''

  const acao = msg.resumo_acao
    ? `\n\u2705 Ação: ${msg.resumo_acao}`
    : ''

  const deepLink = `https://app.licitagram.com.br/dashboard/pregoes/${msg.pregao_id}`

  // Sign as "Equipe Licitagram" per memory: feedback_no_personal_name.md
  const texto = [
    `${emoji} ALERTA PREGÃO`,
    '',
    `Órgão: ${pregao.orgao_nome}`,
    `Pregão: ${pregao.numero_pregao}`,
    `Fase: ${pregao.fase_atual}`,
    '',
    `Mensagem do pregoeiro:`,
    `"${msg.conteudo.slice(0, 500)}"`,
    prazo,
    acao,
    '',
    `Acessar: ${deepLink}`,
    '',
    '— Equipe Licitagram',
  ].filter(Boolean).join('\n')

  // Send to each eligible user
  for (const user of users) {
    const prefs = (user.notification_preferences as Record<string, boolean>) ?? {}
    if (prefs.whatsapp === false) continue
    if (!user.whatsapp_number) continue

    // Create notification record
    const { data: notif } = await supabase
      .from('pregao_notificacoes')
      .insert({
        mensagem_id: mensagemId,
        company_id: msg.company_id,
        canal: 'whatsapp',
        destinatario: user.whatsapp_number,
        status: 'pendente',
      })
      .select('id')
      .single()

    try {
      await sendWhatsAppText(user.whatsapp_number, texto)

      if (notif) {
        await supabase
          .from('pregao_notificacoes')
          .update({
            status: 'enviado',
            enviado_em: new Date().toISOString(),
            tentativas: 1,
          })
          .eq('id', notif.id)
      }

      log.info(
        { destinatario: user.whatsapp_number.slice(-4) },
        'WhatsApp alert sent',
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'

      if (notif) {
        await supabase
          .from('pregao_notificacoes')
          .update({
            status: 'falhou',
            erro: errorMessage,
            tentativas: 1,
          })
          .eq('id', notif.id)
      }

      log.error(
        { error: errorMessage, destinatario: user.whatsapp_number.slice(-4) },
        'Failed to send WhatsApp alert',
      )
    }
  }

  // Mark message as notified (even if some individual sends failed)
  await supabase
    .from('pregao_mensagens')
    .update({ notificacao_whatsapp_enviada_em: new Date().toISOString() })
    .eq('id', mensagemId)
}
