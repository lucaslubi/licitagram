import { redirect } from 'next/navigation'

/**
 * Legacy wizard for CPF+senha+captcha guided login.
 *
 * Retired: the monitor de pregão works in PUBLIC MODE (no credentials)
 * for Compras.gov.br. Users now go directly to /pregoes/adicionar and
 * paste the pregão URL.
 *
 * Any deep-link from old emails/docs lands here → instant redirect.
 */
export default function ConectarRedirect() {
  redirect('/pregoes/adicionar')
}
