/**
 * Lead Opt-Out LGPD Endpoint (PUBLIC — no auth required)
 *
 * GET /api/leads/optout?cnpj=XXXXX&token=YYYYY&origem=campanha_1
 *
 * Processes opt-out requests from email unsubscribe links.
 * Token is HMAC-signed to prevent unauthorized opt-outs.
 * Returns HTML confirmation page.
 */

import { NextRequest, NextResponse } from 'next/server'

const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3997'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const cnpj = searchParams.get('cnpj')
  const token = searchParams.get('token')
  const origem = searchParams.get('origem') || 'link_email'

  if (!cnpj || !token) {
    return new NextResponse(
      '<html><body><h1>Parâmetros inválidos</h1><p>Link de cancelamento inválido.</p></body></html>',
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  try {
    const res = await fetch(
      `${DATA_API_URL}/api/leads/optout?cnpj=${encodeURIComponent(cnpj)}&token=${encodeURIComponent(token)}&origem=${encodeURIComponent(origem)}`,
      { cache: 'no-store' },
    )

    const html = await res.text()
    return new NextResponse(html, {
      status: res.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch {
    return new NextResponse(
      '<html><body><h1>Erro temporário</h1><p>Tente novamente em alguns minutos. Se o problema persistir, contate contato@licitagram.com.br</p></body></html>',
      { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}
