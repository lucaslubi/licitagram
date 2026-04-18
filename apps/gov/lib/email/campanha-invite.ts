import { Resend } from 'resend'

let client: Resend | null = null
function getResend(): Resend | null {
  if (client) return client
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  client = new Resend(apiKey)
  return client
}

interface InviteInput {
  to: string
  nomeResponsavel: string
  orgaoRazaoSocial: string
  setorNome: string
  tituloCampanha: string
  ano: number
  prazo: Date
  publicUrl: string
}

export async function sendCampanhaInvite(input: InviteInput): Promise<void> {
  const r = getResend()
  if (!r) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.warn('[email] RESEND_API_KEY missing — skipping campanha invite')
    }
    return
  }

  const from = process.env.EMAIL_FROM || 'LicitaGram Gov <noreply@licitagram.com>'
  const prazoLabel = input.prazo.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h1 style="font-size: 20px; margin: 0 0 8px 0;">Coleta de demanda PCA ${input.ano}</h1>
      <p style="color: #64748b; font-size: 14px; margin: 0 0 16px 0;">${escapeHtml(input.orgaoRazaoSocial)} · Setor: ${escapeHtml(input.setorNome)}</p>

      <p style="line-height: 1.6;">Olá ${escapeHtml(input.nomeResponsavel)},</p>
      <p style="line-height: 1.6; color: #334155;">
        Você foi indicado(a) para responder a coleta de demandas do
        <strong>${escapeHtml(input.tituloCampanha)}</strong>.
        O formulário é mobile-first e leva ~10 minutos. Leva em conta o histórico do órgão pra acelerar.
      </p>
      <div style="margin: 20px 0;">
        <a href="${input.publicUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Responder agora →
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
        <strong>Prazo:</strong> ${escapeHtml(prazoLabel)}<br/>
        Se o link acima não funcionar, copie e cole no navegador: <br/>
        <code style="word-break: break-all; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 11px;">${input.publicUrl}</code>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
        Este link é único, intransferível e expira no prazo acima. Não compartilhe — quem tem o link responde em nome do setor.
      </p>
    </div>
  `

  try {
    await r.emails.send({
      from,
      to: input.to,
      subject: `[PCA ${input.ano}] Responder demanda — ${input.setorNome}`,
      html,
      replyTo: 'contato@licitagram.com',
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[email] campanha invite failed (non-blocking):', e)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
