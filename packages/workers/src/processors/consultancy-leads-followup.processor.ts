/**
 * consultancy-leads-followup.processor
 *
 * Roda a cada 5 min via worker-alerts. Pega leads em status='new' (vindos
 * da calculadora /calculadora-consultoria), envia email de boas-vindas via
 * Resend com a projeção do ROI e move pra status='contacted'.
 *
 * Limite: 10 leads por ciclo (12 ciclos/h × 10 = 120 leads/h teto). Sobra
 * pra qualquer pico realista; se overflow, próximo ciclo pega.
 */

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const EMAIL_FROM = process.env.EMAIL_FROM_PARTNERS || 'Licitagram Partners <partners@licitagram.com>'
const CONTACT_PHONE = process.env.PARTNERS_WHATSAPP || '+5511999999999'

type Projection = {
  horasLiberadas?: number
  novosClientes?: number
  totalClientes?: number
  adicionalAno?: number
  roi?: string | number
}

type Lead = {
  id: string
  email: string
  clientes_atuais: number | null
  ticket_medio: number | null
  horas_por_cliente: number | null
  automation_rate: number | null
  projection: Projection | null
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function projectionEmailHtml(lead: Lead): string {
  const p = lead.projection || {}
  const adicional = typeof p.adicionalAno === 'number' ? p.adicionalAno : 0
  const novos = typeof p.novosClientes === 'number' ? p.novosClientes : 0
  const horas = typeof p.horasLiberadas === 'number' ? p.horasLiberadas : 0
  const roi = p.roi ?? '—'
  const total = typeof p.totalClientes === 'number' ? p.totalClientes : (lead.clientes_atuais || 0)

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B1B1D;line-height:1.5">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,27,29,0.08)">
        <tr><td style="background:#1B1B1D;padding:32px 36px">
          <p style="margin:0;font-size:11px;color:#F57709;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">Licitagram Partners</p>
          <h1 style="margin:8px 0 0 0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px">Sua projeção está pronta</h1>
        </td></tr>

        <tr><td style="padding:36px">
          <p style="margin:0 0 20px 0;font-size:16px">Olá,</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#4a4a4d">
            Com base nos dados que você informou, esta é a projeção do impacto do Licitagram na sua consultoria:
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5eb;border:1px solid #fbcca0;border-radius:12px;padding:0">
            <tr><td style="padding:24px 24px 16px 24px;border-bottom:1px solid #fbcca0">
              <p style="margin:0 0 4px 0;font-size:11px;color:#F57709;text-transform:uppercase;letter-spacing:1px;font-weight:700">Faturamento adicional anual</p>
              <p style="margin:0;font-size:32px;font-weight:800;color:#F57709;letter-spacing:-0.5px">+R$ ${fmt(adicional)}</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:#4a4a4d">
                Receita extra com seu ticket médio atual de R$ ${fmt(lead.ticket_medio)}/cliente — sem upsell.
              </p>
            </td></tr>
            <tr><td style="padding:16px 24px;border-bottom:1px solid #fbcca0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;width:50%;vertical-align:top">
                    <p style="margin:0 0 2px 0;font-size:11px;color:#7a7a7d;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">Capacidade liberada</p>
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1B1B1D">${horas}h<span style="font-size:13px;color:#7a7a7d;font-weight:400">/sem</span></p>
                  </td>
                  <td style="padding-left:12px;width:50%;border-left:1px solid #fbcca0;vertical-align:top">
                    <p style="margin:0 0 2px 0;font-size:11px;color:#7a7a7d;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">Novos clientes</p>
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1B1B1D">+${novos}<span style="font-size:13px;color:#7a7a7d;font-weight:400"> sem contratar</span></p>
                  </td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:16px 24px 24px 24px">
              <p style="margin:0 0 4px 0;font-size:11px;color:#7a7a7d;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">Retorno sobre investimento</p>
              <p style="margin:0;font-size:18px;font-weight:800;color:#F57709">⚡ ${roi}x ao ano</p>
              <p style="margin:6px 0 0 0;font-size:12px;color:#4a4a4d">
                Total atendido: <strong>${total} clientes</strong> · Custo Licitagram Enterprise: R$ 17.964/ano · Cada novo cliente = 100% margem sobre custo fixo.
              </p>
            </td></tr>
          </table>

          <hr style="margin:32px 0;border:none;border-top:1px solid #ececec">

          <h2 style="margin:0 0 14px 0;font-size:18px;font-weight:800;color:#1B1B1D;letter-spacing:-0.3px">
            Próximo passo: programa Partners
          </h2>
          <p style="margin:0 0 16px 0;font-size:14px;color:#4a4a4d">
            Como Partner aprovado, você ganha:
          </p>
          <ul style="margin:0 0 24px 0;padding-left:20px;font-size:14px;color:#4a4a4d;line-height:1.7">
            <li><strong>Desconto progressivo</strong> conforme nº de clientes seus que assinam</li>
            <li>Acesso à <strong>base proprietária de 50.000 empresas qualificadas</strong></li>
            <li>White-label / co-branding em propostas pros seus clientes</li>
            <li>Slack dedicado pra suporte direto com nosso time</li>
          </ul>

          <div style="text-align:center;margin:28px 0">
            <a href="https://wa.me/${CONTACT_PHONE.replace(/\D/g, '')}?text=${encodeURIComponent('Vi a projeção da calculadora — quero entender o programa Partners.')}"
               style="display:inline-block;background:#F57709;color:#fff;padding:14px 32px;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px">
              Falar com o time pelo WhatsApp →
            </a>
          </div>

          <p style="margin:24px 0 0 0;font-size:13px;color:#7a7a7d;text-align:center">
            Ou responda este email — leio pessoalmente.<br>
            <strong style="color:#1B1B1D">Lucas De Lima</strong> — Founder, Licitagram
          </p>
        </td></tr>

        <tr><td style="background:#1B1B1D;padding:24px 36px;text-align:center">
          <p style="margin:0;font-size:12px;color:#a0a0a3">
            <strong style="color:#fff">Licitagram Partners</strong> · ZeepCode Group Technology LLC<br>
            <a href="https://licitagram.com" style="color:#F57709;text-decoration:none">licitagram.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

async function sendProjectionEmail(lead: Lead): Promise<string | null> {
  if (!RESEND_API_KEY) {
    logger.warn({ leadId: lead.id }, '[consultancy-followup] RESEND_API_KEY ausente, skip')
    return null
  }
  const subject = `Sua projeção Licitagram — +R$ ${fmt(lead.projection?.adicionalAno)}/ano`
    .replace(/[\r\n\t]+/g, ' ')
    .substring(0, 100)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [lead.email],
      subject,
      html: projectionEmailHtml(lead),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = (await res.json()) as { id?: string }
  return data.id || null
}

export async function processConsultancyLeadsFollowup(): Promise<void> {
  logger.info('[consultancy-followup] checking for new leads...')

  const { data: leads, error } = await supabase
    .from('consultancy_leads')
    .select(
      'id, email, clientes_atuais, ticket_medio, horas_por_cliente, automation_rate, projection',
    )
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    logger.error({ err: error.message }, '[consultancy-followup] fetch failed')
    return
  }
  if (!leads || leads.length === 0) {
    return
  }

  let sent = 0
  let failed = 0
  for (const lead of leads as Lead[]) {
    try {
      const resendId = await sendProjectionEmail(lead)
      await supabase
        .from('consultancy_leads')
        .update({
          status: 'contacted',
          notes: { resend_id: resendId, sent_at: new Date().toISOString() },
        })
        .eq('id', lead.id)
        .eq('status', 'new') // só atualiza se ainda for new (idempotente)
      sent++
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      logger.error({ leadId: lead.id, err: msg }, '[consultancy-followup] send failed')
      await supabase
        .from('consultancy_leads')
        .update({
          notes: { last_error: msg.slice(0, 500), last_error_at: new Date().toISOString() },
        })
        .eq('id', lead.id)
    }
  }

  logger.info(
    { processed: leads.length, sent, failed },
    '[consultancy-followup] cycle complete',
  )
}
