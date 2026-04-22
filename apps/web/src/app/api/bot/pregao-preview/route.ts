import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'
import { decryptCredential } from '@/lib/bot-crypto'

/**
 * GET /api/bot/pregao-preview?pregao_id=<ID>
 *
 * Dado um pregão do Compras.gov.br, retorna a lista de itens em disputa
 * (ou aguardando disputa) pra que a UI mostre antes do usuário agendar.
 *
 * Fluxo:
 *   1. Valida auth + subscription
 *   2. Carrega bot_tokens da empresa (access_token decifrado)
 *   3. Chama Compras.gov.br: /participacao (modo disputa) + /itens/em-disputa
 *   4. Retorna lista normalizada pra UI
 */

const COMPRAS_HOST = 'https://cnetmobile.estaleiro.serpro.gov.br'

interface PreviewItem {
  numero: number
  descricao: string
  valor_estimado: number | null
  quantidade: number | null
  unidade_medida: string | null
  tipo: 'item' | 'grupo'
  grupo_numero?: number
}

function byteaToBuffer(v: Buffer | Uint8Array | string | null): Buffer | null {
  if (!v) return null
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Uint8Array) return Buffer.from(v)
  if (typeof v === 'string') {
    if (v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex')
    if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) return Buffer.from(v, 'hex')
    return Buffer.from(v, 'base64')
  }
  return null
}

async function fetchItens(compraId: string, accessToken: string): Promise<PreviewItem[]> {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'x-device-platform': 'web',
    'x-version-number': '6.0.1',
  }

  // Pega itens em disputa + aguardando (endpoint retorna ambos por default)
  const urlDisputa = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/itens/em-disputa`
  const res = await fetch(urlDisputa, { headers, signal: AbortSignal.timeout(10000) })
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`HTTP ${res.status} do portal`)
  }

  const raw = await res.json() as unknown[] | { itens?: unknown[] } | null
  const arr: Record<string, unknown>[] = Array.isArray(raw)
    ? (raw as Record<string, unknown>[])
    : raw && Array.isArray((raw as { itens?: unknown[] }).itens)
      ? ((raw as { itens: unknown[] }).itens as Record<string, unknown>[])
      : []

  const items: PreviewItem[] = []

  for (const item of arr) {
    const tipo = item.tipo as string | undefined
    const numero = Number(item.numero)
    const isGroup = tipo === 'G' || numero < 0

    if (isGroup) {
      // Expande sub-itens do grupo
      const gUrl = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/itens/em-disputa/${numero}/itens-grupo`
      try {
        const gRes = await fetch(gUrl, { headers, signal: AbortSignal.timeout(8000) })
        if (gRes.ok) {
          const gArr = await gRes.json() as Record<string, unknown>[] | null
          if (Array.isArray(gArr)) {
            for (const sub of gArr) {
              items.push({
                numero: Number(sub.numero),
                descricao: String(sub.descricaoItem || sub.descricao || '(sem descrição)').slice(0, 200),
                valor_estimado: typeof sub.valorUnitarioEstimado === 'number'
                  ? sub.valorUnitarioEstimado
                  : typeof sub.valorEstimado === 'number' ? sub.valorEstimado : null,
                quantidade: typeof sub.quantidade === 'number' ? sub.quantidade : null,
                unidade_medida: typeof sub.unidadeMedida === 'string' ? sub.unidadeMedida : null,
                tipo: 'item',
                grupo_numero: numero,
              })
            }
          }
        }
      } catch {
        /* ignora erro de grupo, segue */
      }
      continue
    }

    items.push({
      numero,
      descricao: String(item.descricaoItem || item.descricao || '(sem descrição)').slice(0, 200),
      valor_estimado: typeof item.valorUnitarioEstimado === 'number'
        ? item.valorUnitarioEstimado
        : typeof item.valorEstimado === 'number' ? item.valorEstimado : null,
      quantidade: typeof item.quantidade === 'number' ? item.quantidade : null,
      unidade_medida: typeof item.unidadeMedida === 'string' ? item.unidadeMedida : null,
      tipo: 'item',
    })
  }

  // Ordena por número
  items.sort((a, b) => a.numero - b.numero)
  return items
}

function extractCompraId(urlOrId: string): string | null {
  if (!urlOrId) return null
  if (/^\d{10,25}$/.test(urlOrId)) return urlOrId
  try {
    const u = new URL(urlOrId)
    const p = u.searchParams.get('compra')
    if (p) return p
  } catch {
    /* não é URL */
  }
  const m =
    urlOrId.match(/compra=(\d+)/) ||
    urlOrId.match(/\/(\d{10,25})\b/) ||
    urlOrId.match(/(\d{10,25})/)
  return m ? m[1]! : null
}

export async function GET(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const url = new URL(req.url)
    const pregaoInput = url.searchParams.get('pregao_id')
    if (!pregaoInput) {
      return NextResponse.json({ error: 'Parametro pregao_id obrigatorio' }, { status: 400 })
    }

    const compraId = extractCompraId(pregaoInput)
    if (!compraId) {
      return NextResponse.json(
        { error: 'ID de pregao invalido. Use o numero (ex 98957106000712025) ou URL do Compras.gov.br' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', planUser.userId)
      .single()
    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    // Carrega bot_tokens
    const { data: tokRow } = await supabase
      .from('bot_tokens')
      .select('access_token_cipher, access_token_nonce')
      .eq('company_id', profile.company_id)
      .eq('portal', 'comprasgov')
      .eq('status', 'active')
      .maybeSingle()

    if (!tokRow) {
      return NextResponse.json(
        {
          error:
            'Nenhuma conta Compras.gov.br conectada. Abra /bot -> Conectar Conta Gov.br primeiro.',
          code: 'no_gov_connection',
        },
        { status: 400 },
      )
    }

    const cipherBuf = byteaToBuffer(
      tokRow.access_token_cipher as Buffer | Uint8Array | string | null,
    )
    const nonceBuf = byteaToBuffer(
      tokRow.access_token_nonce as Buffer | Uint8Array | string | null,
    )
    if (!cipherBuf || !nonceBuf) {
      return NextResponse.json({ error: 'Token corrompido. Reconecte a conta.' }, { status: 500 })
    }

    let accessToken: string
    try {
      accessToken = decryptCredential(cipherBuf, nonceBuf)
    } catch (err) {
      console.error('[pregao-preview] decrypt error', err)
      return NextResponse.json(
        { error: 'Falha ao decifrar token. Reconecte a conta.' },
        { status: 500 },
      )
    }

    // Chama Compras.gov.br
    let items: PreviewItem[]
    try {
      items = await fetchItens(compraId, accessToken)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[pregao-preview] fetch itens error', msg)
      return NextResponse.json({ error: `Erro ao buscar itens no portal: ${msg}` }, { status: 502 })
    }

    return NextResponse.json({
      compra_id: compraId,
      total_items: items.length,
      items,
    })
  } catch (err) {
    console.error('[pregao-preview] error', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
