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

/**
 * POST /api/habilitacao-checklist
 * Extracts habilitação requirements from tender and cross-checks with company documents.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasFeature(user, 'compliance_checker') && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Recurso disponível no plano Profissional ou Enterprise' }, { status: 403 })
    }
    if (!user.companyId) return NextResponse.json({ error: 'Empresa não vinculada' }, { status: 400 })

    const { matchId } = await request.json()
    if (!matchId) return NextResponse.json({ error: 'matchId obrigatório' }, { status: 400 })

    const supabase = await createClient()
    const serviceSupabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Fetch tender data
    const { data: match } = await supabase
      .from('matches')
      .select('tender_id, tenders(id, objeto, orgao_nome, modalidade_nome, tender_documents(texto_extraido, titulo))')
      .eq('id', matchId)
      .single()

    if (!match) return NextResponse.json({ error: 'Match não encontrado' }, { status: 404 })

    const tender = match.tenders as any
    const docs = tender?.tender_documents || []
    const editalText = docs.map((d: any) => d.texto_extraido || '').join('\n').substring(0, 15000)

    // Fetch company documents
    const { data: companyDocs } = await supabase
      .from('company_documents')
      .select('id, tipo, descricao, validade, status')
      .eq('company_id', user.companyId)

    // Call LLM to extract requirements
    const response = await openrouter.chat.completions.create({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Analise o edital abaixo e extraia TODOS os documentos exigidos para habilitação.
Para cada documento, retorne um objeto com:
- tipo: string (ex: 'CND Federal', 'CRF FGTS', 'Atestado Técnico', 'Balanço Patrimonial')
- categoria: 'juridica' | 'tecnica' | 'economica' | 'fiscal' | 'trabalhista' | 'declaracao'
- descricao: string (exigência específica do edital)
- clausula: string (referência à cláusula do edital)
- obrigatorio: boolean

IMPORTANTE: Retorne APENAS um JSON puro com a chave "items" contendo o array. Exemplo: {"items": [{"tipo": "CND Federal", "categoria": "fiscal", "descricao": "...", "clausula": "5.1", "obrigatorio": true}]}
NÃO use markdown, NÃO adicione texto antes ou depois do JSON.
Se o texto do edital não estiver disponível, gere a lista padrão de documentos exigidos pela Lei 14.133/2021 para a modalidade informada.`
        },
        { role: 'user', content: `Objeto: ${tender?.objeto || 'N/A'}\nÓrgão: ${tender?.orgao_nome || 'N/A'}\nModalidade: ${tender?.modalidade_nome || 'N/A'}\n\nTexto do edital:\n${editalText || 'Texto não disponível — gere uma lista padrão de habilitação baseada na Lei 14.133/2021 para esta modalidade.'}` }
      ],
      max_tokens: 4096,
      temperature: 0.1,
    })

    console.log('[habilitacao-checklist] LLM finish_reason:', response.choices[0]?.finish_reason)

    let items: any[] = []
    try {
      let content = response.choices[0]?.message?.content || '[]'
      // Strip markdown code blocks if present (```json ... ```)
      content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
      console.log('[habilitacao-checklist] LLM response length:', content.length, 'first 200 chars:', content.substring(0, 200))
      const parsed = JSON.parse(content)
      items = Array.isArray(parsed) ? parsed : parsed.items || parsed.documentos || parsed.documents || parsed.requisitos || []
    } catch (parseErr) {
      console.error('[habilitacao-checklist] JSON parse error:', parseErr, 'raw:', response.choices[0]?.message?.content?.substring(0, 500))
      items = []
    }

    // Cross-check with company documents
    const companyDocMap = new Map<string, any>()
    for (const d of companyDocs || []) {
      companyDocMap.set(d.tipo?.toLowerCase() || '', d)
    }

    const checklist = items.map((item: any) => {
      const tipoLower = (item.tipo || '').toLowerCase()
      // Try to find matching company document
      let companyDoc = null
      for (const [key, doc] of companyDocMap) {
        if (tipoLower.includes(key) || key.includes(tipoLower.split(' ')[0])) {
          companyDoc = doc
          break
        }
      }

      let status = 'missing'
      if (companyDoc) {
        if (companyDoc.status === 'vencido') status = 'expired'
        else if (companyDoc.validade) {
          const daysLeft = Math.ceil((new Date(companyDoc.validade).getTime() - Date.now()) / 86400000)
          status = daysLeft <= 15 ? 'expiring' : 'ok'
        } else {
          status = 'ok'
        }
      }

      return {
        ...item,
        status,
        documentoEmpresa: companyDoc ? { id: companyDoc.id, tipo: companyDoc.tipo, validade: companyDoc.validade } : null,
      }
    })

    const resumo = {
      total: checklist.length,
      ok: checklist.filter((i: any) => i.status === 'ok').length,
      expiring: checklist.filter((i: any) => i.status === 'expiring').length,
      expired: checklist.filter((i: any) => i.status === 'expired').length,
      missing: checklist.filter((i: any) => i.status === 'missing').length,
    }

    const obrigatorios = checklist.filter((i: any) => i.obrigatorio)
    const aprovado = obrigatorios.length > 0 && obrigatorios.every((i: any) => i.status === 'ok')

    return NextResponse.json({
      items: checklist,
      resumo,
      aprovado,
    })
  } catch (err) {
    console.error('[habilitacao-checklist]', err)
    return NextResponse.json({ error: 'Erro ao analisar habilitação' }, { status: 500 })
  }
}
