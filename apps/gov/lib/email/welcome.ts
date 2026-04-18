import { Resend } from 'resend'

let client: Resend | null = null

function getResend(): Resend | null {
  if (client) return client
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  client = new Resend(apiKey)
  return client
}

interface WelcomeEmailInput {
  to: string
  nomeCompleto: string
  orgaoRazaoSocial: string
  objetivo: 'pca_2027' | 'criar_etp' | 'importar_processo' | 'explorar'
  appUrl: string
}

const OBJETIVO_CTA: Record<WelcomeEmailInput['objetivo'], { label: string; path: string }> = {
  pca_2027: { label: 'Iniciar PCA 2027', path: '/pca/novo' },
  criar_etp: { label: 'Criar primeiro processo', path: '/processos/novo' },
  importar_processo: { label: 'Importar do Compras.gov.br', path: '/processos/novo?import=1' },
  explorar: { label: 'Explorar dashboard', path: '/dashboard' },
}

/**
 * Sends a welcome email after onboarding completes. Fails open: missing
 * RESEND_API_KEY or send error never breaks the onboarding flow — logs and
 * returns. The email is a "nice to have", not a blocker.
 */
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const r = getResend()
  if (!r) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.warn('[email] RESEND_API_KEY missing — skipping welcome email')
    }
    return
  }
  const cta = OBJETIVO_CTA[input.objetivo]
  const ctaUrl = `${input.appUrl}${cta.path}`
  const from = process.env.EMAIL_FROM || 'LicitaGram Gov <noreply@licitagram.com>'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h1 style="font-size: 22px; margin: 0 0 12px 0;">Bem-vindo ao LicitaGram Gov, ${escapeHtml(input.nomeCompleto)}.</h1>
      <p style="line-height: 1.6; color: #475569;">
        Seu órgão <strong>${escapeHtml(input.orgaoRazaoSocial)}</strong> já está configurado.
        Você pode começar agora — todos os artefatos da fase interna (PCA, DFD, ETP, TR, Edital)
        são gerados pela IA com citações jurídicas rastreáveis (Lei 14.133/2021 + jurisprudência TCU).
      </p>
      <div style="margin: 24px 0;">
        <a href="${ctaUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          ${escapeHtml(cta.label)} →
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
        Dúvidas? Responda este email — a Equipe Licitagram lê todas as mensagens.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px;">
        Este email foi enviado para ${escapeHtml(input.to)} porque você criou uma conta no LicitaGram Gov.
      </p>
    </div>
  `

  try {
    await r.emails.send({
      from,
      to: input.to,
      subject: 'Bem-vindo ao LicitaGram Gov',
      html,
      replyTo: 'contato@licitagram.com',
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[email] welcome email failed (non-blocking):', e)
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
