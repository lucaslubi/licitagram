import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'
import React from 'react'
import type { ReportSection, ReportMetadata } from '@/lib/pdf/templates'

export async function POST(request: NextRequest) {
  // Auth check — PDF export available to all authenticated users
  const userCtx = await getUserWithPlan()
  if (!userCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    title,
    subtitle,
    metadata,
  } = body as {
    type?: string
    title: string
    subtitle?: string
    sections?: Array<{ heading: string; content?: string; type?: string; rows?: Array<Record<string, string>>; columns?: Array<{ key: string; label: string; width?: string }>; score?: number; scoreLabel?: string; items?: string[] }>
    metadata?: ReportMetadata
  }

  // Accept sections from body, normalizing type to default 'text' if missing
  const rawSections = body.sections as Array<Record<string, unknown>> | undefined

  if (!title || !rawSections || !Array.isArray(rawSections) || rawSections.length === 0) {
    return NextResponse.json(
      { error: 'Título e seções são obrigatórios.' },
      { status: 400 },
    )
  }

  // Normalize sections — default type to 'text', ensure heading exists
  const sections: ReportSection[] = rawSections.map((s) => ({
    heading: String(s.heading || 'Sem título'),
    content: String(s.content || ''),
    type: (['text', 'table', 'score', 'bullet'].includes(String(s.type)) ? String(s.type) : 'text') as ReportSection['type'],
    rows: s.rows as ReportSection['rows'],
    columns: s.columns as ReportSection['columns'],
    score: s.score as number | undefined,
    scoreLabel: s.scoreLabel as string | undefined,
    items: s.items as string[] | undefined,
  }))

  try {
    // Lazy-load heavy PDF packages only when this handler is called
    const [{ renderToStream }, { LicitagramReport }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/lib/pdf/templates'),
    ])

    // Render PDF
    const pdfStream = await renderToStream(
      React.createElement(LicitagramReport, {
        title,
        subtitle,
        sections,
        metadata: {
          ...metadata,
          company: metadata?.company || userCtx.fullName || undefined,
          date: metadata?.date || new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }),
        },
      }),
    )

    // Convert Node.js ReadableStream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        pdfStream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        pdfStream.on('end', () => {
          controller.close()
        })
        pdfStream.on('error', (err: Error) => {
          controller.error(err)
        })
      },
    })

    // Generate filename
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50)
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `licitagram-${sanitizedTitle}-${dateStr}.pdf`

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[Consultant PDF] Render error:', msg)
    return NextResponse.json(
      { error: `Falha ao gerar PDF: ${msg.slice(0, 200)}` },
      { status: 500 },
    )
  }
}
