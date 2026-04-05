import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { buildImpugnationSystemPrompt, buildImpugnationUserPrompt } from '@/lib/impugnation-prompt'
import { callAIWithFallback } from '@/lib/ai-client'

export const maxDuration = 60

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() - 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

/**
 * POST /api/impugnation
 * Generates a formal impugnation template for a tender.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasFeature(user, 'chat_ia') && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Recurso disponível no plano Profissional ou Enterprise' }, { status: 403 })
    }
    if (!user.companyId) return NextResponse.json({ error: 'Empresa não vinculada' }, { status: 400 })

    const { matchId, motivo } = await request.json()
    if (!matchId || !motivo) return NextResponse.json({ error: 'matchId e motivo obrigatórios' }, { status: 400 })

    const supabase = await createClient()
    const serviceSupabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Fetch data
    const { data: match } = await supabase
      .from('matches')
      .select('tender_id, tenders(id, objeto, orgao_nome, data_abertura, modalidade_nome, tender_documents(texto_extraido))')
      .eq('id', matchId)
      .single()

    if (!match) return NextResponse.json({ error: 'Match não encontrado' }, { status: 404 })

    const tender = match.tenders as any
    const { data: company } = await supabase
      .from('companies')
      .select('razao_social, cnpj, uf, municipio')
      .eq('id', user.companyId)
      .single()

    // Fetch user profile for representative info
    const { data: userProfile } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', user.userId)
      .single()

    // Calculate deadline (3 business days before opening)
    const prazoLimite = tender?.data_abertura
      ? addBusinessDays(new Date(tender.data_abertura), 3)
      : new Date(Date.now() + 7 * 86400000)

    const editalText = (tender?.tender_documents || []).map((d: any) => d.texto_extraido || '').join('\n').substring(0, 30000)

    // Merge company + user profile for prompt
    const companyForPrompt = {
      razao_social: company?.razao_social || null,
      cnpj: company?.cnpj || null,
      representante_nome: userProfile?.full_name || null,
      representante_cpf: null,
      representante_cargo: null,
      uf: company?.uf || null,
      municipio: company?.municipio || null,
    }

    // Generate impugnation text via LLM (specialist prompt)
    const response = await callAIWithFallback({
      messages: [
        { role: 'system', content: buildImpugnationSystemPrompt() },
        {
          role: 'user',
          content: buildImpugnationUserPrompt(
            companyForPrompt,
            { objeto: tender?.objeto, orgao_nome: tender?.orgao_nome, modalidade_nome: tender?.modalidade_nome, data_abertura: tender?.data_abertura },
            motivo,
            editalText,
          ),
        },
      ],
      max_tokens: 8192,
      temperature: 0.2,
    })

    // Strip markdown artifacts (**, ##, *, etc.) — document must look human-written
    const rawText = response.choices[0]?.message?.content || ''
    const textoCompleto = rawText
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bold
      .replace(/##\s*/g, '')               // ## headings → plain
      .replace(/#{1,3}\s*/g, '')           // # / ### headings
      .replace(/\*([^*]+)\*/g, '$1')       // *italic* → italic
      .replace(/`([^`]+)`/g, '$1')         // `code` → code
      .replace(/^-{3,}$/gm, '')           // --- horizontal rules
    const fundamentacao = textoCompleto.split('DO DIREITO')[1]?.split('DO PEDIDO')[0] || textoCompleto.substring(0, 500)

    // Save to database
    const { data: impugnation, error: insertErr } = await serviceSupabase
      .from('impugnations')
      .insert({
        company_id: user.companyId,
        tender_id: tender?.id || match.tender_id,
        match_id: matchId,
        motivo,
        fundamentacao: fundamentacao.trim(),
        texto_completo: textoCompleto,
        prazo_limite: prazoLimite.toISOString(),
        status: 'draft',
      })
      .select('id')
      .single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    return NextResponse.json({
      id: impugnation?.id,
      texto_completo: textoCompleto,
      prazo_limite: prazoLimite.toISOString(),
      fundamentacao: fundamentacao.trim(),
    })
  } catch (err) {
    console.error('[impugnation]', err)
    return NextResponse.json({ error: 'Erro ao gerar impugnação' }, { status: 500 })
  }
}
