import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import OpenAI from 'openai'

export const maxDuration = 60

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: { 'HTTP-Referer': 'https://licitagram.com', 'X-Title': 'Licitagram' },
})

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
      .select('razao_social, cnpj, representante_nome, representante_cpf, representante_cargo, uf, municipio')
      .eq('id', user.companyId)
      .single()

    // Calculate deadline (3 business days before opening)
    const prazoLimite = tender?.data_abertura
      ? addBusinessDays(new Date(tender.data_abertura), 3)
      : new Date(Date.now() + 7 * 86400000)

    const editalText = (tender?.tender_documents || []).map((d: any) => d.texto_extraido || '').join('\n').substring(0, 10000)

    // Generate impugnation text via LLM
    const response = await openrouter.chat.completions.create({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um advogado especialista em direito administrativo e licitações públicas (Lei 14.133/2021).
Gere um texto de IMPUGNAÇÃO AO EDITAL formal, fundamentado juridicamente.

Estrutura:
1. DESTINATÁRIO: Pregoeiro/Comissão do órgão
2. IDENTIFICAÇÃO DO IMPUGNANTE: Dados da empresa
3. DO OBJETO: Número e objeto da licitação
4. DOS FATOS: Descrição objetiva do problema
5. DO DIREITO: Fundamentação legal — Lei 14.133/2021, artigos relevantes, jurisprudência TCU
6. DO PEDIDO: O que se solicita
7. FECHAMENTO: Termos em que pede deferimento

Use linguagem jurídica formal. Cite artigos específicos da Lei 14.133/2021.`
        },
        {
          role: 'user',
          content: `DADOS DA EMPRESA:
${company?.razao_social || 'N/A'}, CNPJ ${company?.cnpj || 'N/A'}
Representante: ${company?.representante_nome || 'N/A'} (${company?.representante_cargo || 'Representante Legal'})
${company?.municipio || ''} - ${company?.uf || ''}

DADOS DA LICITAÇÃO:
Objeto: ${tender?.objeto || 'N/A'}
Órgão: ${tender?.orgao_nome || 'N/A'}
Modalidade: ${tender?.modalidade_nome || 'N/A'}

MOTIVO DA IMPUGNAÇÃO:
${motivo}

TRECHO RELEVANTE DO EDITAL:
${editalText.substring(0, 5000) || 'Texto não disponível'}`
        }
      ],
      max_tokens: 4096,
      temperature: 0.3,
    })

    const textoCompleto = response.choices[0]?.message?.content || ''
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
