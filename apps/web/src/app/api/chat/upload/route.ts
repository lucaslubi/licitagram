import { NextRequest, NextResponse } from 'next/server'
import pdf from 'pdf-parse'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * POST /api/chat/upload
 *
 * Accepts a PDF file via FormData, extracts text using pdf-parse,
 * and returns the extracted text. This allows the user to manually
 * upload edital PDFs when automatic server-side fetching fails
 * (government sites often block server requests).
 */
export async function POST(request: NextRequest) {
  // Auth + plan check
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasFeature(userCtx, 'chat_ia')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas para planos com Chat IA.' },
      { status: 403 },
    )
  }

  // Rate limiting: 10 uploads per minute per user
  const rateCheck = await checkRateLimit(`chat-upload:${userCtx.userId}`, 10, 60)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Limite de uploads atingido. Tente em ${rateCheck.retryAfter}s.` },
      { status: 429 },
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    }

    // Validate file type
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      return NextResponse.json(
        { error: 'Apenas arquivos PDF são aceitos.' },
        { status: 400 },
      )
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo: 50MB.' },
        { status: 400 },
      )
    }

    if (file.size < 100) {
      return NextResponse.json(
        { error: 'Arquivo PDF vazio ou corrompido.' },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const data = await pdf(buffer)
    const text = data.text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!text || text.length < 50) {
      return NextResponse.json(
        {
          error:
            'Não foi possível extrair texto deste PDF. O arquivo pode ser uma imagem escaneada sem OCR.',
        },
        { status: 422 },
      )
    }

    console.log(
      `[Chat Upload] Extracted ${text.length} chars, ${data.numpages} pages from "${file.name}"`,
    )

    return NextResponse.json({
      success: true,
      fileName: file.name,
      pages: data.numpages,
      chars: text.length,
      text,
    })
  } catch (err) {
    console.error('[Chat Upload] PDF extraction error:', err)
    return NextResponse.json(
      { error: 'Falha ao processar o PDF. Verifique se o arquivo não está corrompido.' },
      { status: 500 },
    )
  }
}
