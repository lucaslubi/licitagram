import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasFeature, hasActiveSubscription } from '@/lib/auth-helpers'
import { enqueuePregaoPortalTest } from '@/lib/queues/pregao-chat-producer'

/**
 * GET /api/pregao-chat/credentials
 * List portal credentials for the authenticated user's company.
 * Never returns plaintext credentials — only metadata.
 */
export async function GET() {
  try {
    const user = await getUserWithPlan()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(user)) {
      return NextResponse.json({ error: 'Assinatura ativa necessária' }, { status: 403 })
    }
    if (!hasFeature(user, 'pregao_chat_monitor')) {
      return NextResponse.json({ error: 'Recurso disponível no plano Profissional+' }, { status: 403 })
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: credentials, error } = await supabase
      .from('pregao_portais_credenciais')
      .select('id, portal_slug, cnpj_licitante, metodo_login, status, ultimo_teste_em, ultimo_teste_erro, ultimo_login_sucesso_em, created_at')
      .eq('company_id', user.companyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API pregao-chat/credentials] GET error:', error)
      return NextResponse.json({ error: 'Erro ao listar credenciais' }, { status: 500 })
    }

    return NextResponse.json({ credentials: credentials ?? [] })
  } catch (err) {
    console.error('[API pregao-chat/credentials] GET error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * POST /api/pregao-chat/credentials
 * Store encrypted portal credentials and enqueue test-login job.
 *
 * Body: { portal_slug, cnpj_licitante, usuario, senha, metodo_login? }
 *
 * Credentials are encrypted server-side via sodium-native before storage.
 * The encryption happens in a worker-side API call (service role).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(user)) {
      return NextResponse.json({ error: 'Assinatura ativa necessária' }, { status: 403 })
    }
    if (!hasFeature(user, 'pregao_chat_monitor')) {
      return NextResponse.json({ error: 'Recurso disponível no plano Profissional+' }, { status: 403 })
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })
    }

    const body = await req.json()
    const { portal_slug, cnpj_licitante, usuario, senha, metodo_login } = body as {
      portal_slug: string
      cnpj_licitante: string
      usuario: string
      senha: string
      metodo_login?: string
    }

    if (!portal_slug || !cnpj_licitante || !usuario || !senha) {
      return NextResponse.json({ error: 'Campos obrigatórios: portal_slug, cnpj_licitante, usuario, senha' }, { status: 400 })
    }

    // Validate portal_slug
    const validPortals = ['comprasgov', 'bll', 'licitanet', 'pcp']
    if (!validPortals.includes(portal_slug)) {
      return NextResponse.json({ error: `Portal inválido. Válidos: ${validPortals.join(', ')}` }, { status: 400 })
    }

    // MVP: only comprasgov
    if (portal_slug !== 'comprasgov') {
      return NextResponse.json({ error: 'No MVP, apenas Compras.gov.br é suportado' }, { status: 400 })
    }

    // Encrypt credentials using Node.js built-in crypto (AES-256-GCM)
    // Workers use sodium-native for decryption — both are interoperable via shared key
    // The web app uses AES-256-GCM as it doesn't have sodium-native available
    const crypto = await import('node:crypto')
    const keyHex = process.env.PREGAO_CREDENTIALS_MASTER_KEY || ''
    const key = Buffer.from(keyHex, 'hex')
    if (key.length !== 32) {
      return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 })
    }

    const iv1 = crypto.randomBytes(12)
    const cipher1 = crypto.createCipheriv('aes-256-gcm', key, iv1)
    const loginUsuarioCipher = Buffer.concat([cipher1.update(usuario, 'utf8'), cipher1.final(), cipher1.getAuthTag()])

    const iv2 = crypto.randomBytes(12)
    const cipher2 = crypto.createCipheriv('aes-256-gcm', key, iv2)
    const loginSenhaCipher = Buffer.concat([cipher2.update(senha, 'utf8'), cipher2.final(), cipher2.getAuthTag()])

    const loginNonce = Buffer.concat([iv1, iv2])

    // Use service role to insert (RLS bypassed — we've already verified company ownership)
    const { createClient: createServiceClient } = await import('@supabase/supabase-js')
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: credential, error: insertError } = await serviceSupabase
      .from('pregao_portais_credenciais')
      .insert({
        company_id: user.companyId,
        portal_slug,
        cnpj_licitante,
        login_usuario_cipher: loginUsuarioCipher,
        login_senha_cipher: loginSenhaCipher,
        login_nonce: loginNonce,
        metodo_login: metodo_login || 'usuario_senha',
        status: 'nao_testado',
      })
      .select('id, portal_slug, cnpj_licitante, status, created_at')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Credencial já cadastrada para este portal e CNPJ' }, { status: 409 })
      }
      console.error('[API pregao-chat/credentials] POST error:', insertError)
      return NextResponse.json({ error: 'Erro ao salvar credencial' }, { status: 500 })
    }

    // Enqueue test-login job via Redis/BullMQ
    // The worker will pick this up, attempt login, and update status accordingly
    await serviceSupabase
      .from('pregao_portais_credenciais')
      .update({ status: 'testando' })
      .eq('id', credential.id)

    try {
      await enqueuePregaoPortalTest(credential.id)
    } catch (enqueueErr) {
      // If the queue is unreachable, revert status so the client can retry
      console.error('[API pregao-chat/credentials] enqueue error:', enqueueErr)
      await serviceSupabase
        .from('pregao_portais_credenciais')
        .update({
          status: 'nao_testado',
          ultimo_teste_erro: 'Fila de testes indisponível — tente novamente.',
        })
        .eq('id', credential.id)
      return NextResponse.json({ error: 'Fila de processamento indisponível' }, { status: 503 })
    }

    return NextResponse.json({ credential: { ...credential, status: 'testando' } }, { status: 201 })
  } catch (err) {
    console.error('[API pregao-chat/credentials] POST error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * DELETE /api/pregao-chat/credentials?id=<uuid>
 * Remove a credential (cascades to sessions).
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Empresa não configurada' }, { status: 400 })
    }

    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID da credencial é obrigatório' }, { status: 400 })
    }

    const supabase = await createClient()

    // RLS ensures only company's own credentials can be deleted
    const { error } = await supabase
      .from('pregao_portais_credenciais')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[API pregao-chat/credentials] DELETE error:', error)
      return NextResponse.json({ error: 'Erro ao remover credencial' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API pregao-chat/credentials] DELETE error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
