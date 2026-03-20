import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { renderToStream } from '@react-pdf/renderer'
import React from 'react'
import { LicitagramReport, type ReportSection, type ReportMetadata } from '@/lib/pdf/templates'

export async function POST(request: NextRequest) {
  // Auth + plan check (enterprise plan only — check for proposal_generator as enterprise feature)
  const userCtx = await getUserWithPlan()
  if (!userCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Gate PDF export to plans with proposal_generator (enterprise-tier feature)
  if (!hasFeature(userCtx, 'proposal_generator')) {
    return NextResponse.json(
      { error: 'Exportação PDF disponível apenas para planos Enterprise. Faça upgrade do seu plano.' },
      { status: 403 },
    )
  }

  const body = await request.json()
  const {
    type,
    title,
    subtitle,
    sections,
    metadata,
  } = body as {
    type: 'tender_analysis' | 'competitor_ranking' | 'custom'
    title: string
    subtitle?: string
    sections: ReportSection[]
    metadata?: ReportMetadata
  }

  if (!title || !sections || !Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json(
      { error: 'Título e seções são obrigatórios.' },
      { status: 400 },
    )
  }

  // Validate sections
  for (const section of sections) {
    if (!section.heading || !section.type) {
      return NextResponse.json(
        { error: 'Cada seção precisa de heading e type.' },
        { status: 400 },
      )
    }
  }

  try {
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
