import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import pdf from 'pdf-parse'

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
  timeout: 30_000,
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await req.json()
    const { storagePath, companyId } = body as { storagePath: string; companyId: string }

    if (!storagePath || !companyId) {
      return NextResponse.json({ error: 'storagePath e companyId são obrigatórios' }, { status: 400 })
    }

    // Verify user belongs to the company
    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profile?.company_id !== companyId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Download PDF from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('drive')
      .download(storagePath)

    if (downloadError || !fileData) {
      console.error('[Extract] Download error:', downloadError?.message)
      return NextResponse.json({ error: 'Erro ao baixar o arquivo' }, { status: 500 })
    }

    // Extract text from PDF
    let pdfText = ''
    try {
      const buffer = Buffer.from(await fileData.arrayBuffer())
      const parsed = await pdf(buffer)
      pdfText = parsed.text
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    } catch (pdfErr) {
      console.error('[Extract] PDF parse error:', pdfErr)
      // Return null fields so user can fill manually
      return NextResponse.json({
        extracted: {
          tipo: null,
          status: null,
          validade: null,
          numero: null,
          orgao_emissor: null,
          resumo: null,
        },
        warning: 'Não foi possível extrair texto do PDF. Preencha os dados manualmente.',
      })
    }

    if (!pdfText || pdfText.length < 20) {
      return NextResponse.json({
        extracted: {
          tipo: null,
          status: null,
          validade: null,
          numero: null,
          orgao_emissor: null,
          resumo: null,
        },
        warning: 'PDF sem texto legível. O documento pode ser uma imagem escaneada.',
      })
    }

    // Truncate to first 3000 chars for LLM (certidões are usually short)
    const textForLLM = pdfText.substring(0, 3000)

    // Send to LLM for extraction
    let extracted = {
      tipo: null as string | null,
      status: null as string | null,
      validade: null as string | null,
      numero: null as string | null,
      orgao_emissor: null as string | null,
      resumo: null as string | null,
    }

    if (!process.env.GROQ_API_KEY) {
      console.warn('[Extract] GROQ_API_KEY not configured, skipping LLM extraction')
      return NextResponse.json({
        extracted,
        warning: 'LLM não configurado. Preencha os dados manualmente.',
      })
    }

    try {
      const completion = await groqClient.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 512,
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em análise de certidões e documentos de habilitação para licitações públicas no Brasil.',
          },
          {
            role: 'user',
            content: `Analise este documento de certidão e extraia:
- tipo: o tipo da certidão (use um destes valores quando possível: cnd_federal, cnd_estadual, cnd_municipal, fgts, trabalhista, tcu, sicaf, atestado_capacidade, balanco, contrato_social, iso_9001, alvara, crea_cau, outro)
- status: "regular" ou "irregular" ou "positiva_com_efeito_negativa"
- validade: data de validade no formato YYYY-MM-DD (se houver)
- numero: número do documento (se houver)
- orgao_emissor: órgão que emitiu (ex: Receita Federal, TST, CEF)
- resumo: resumo em 1 linha do que o documento atesta

Responda APENAS em JSON válido, sem markdown.

Texto do documento:
${textForLLM}`,
          },
        ],
      })

      const content = completion.choices[0]?.message?.content?.trim()
      if (content) {
        // Try to parse JSON, handling potential markdown wrapping
        let jsonStr = content
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          jsonStr = jsonMatch[0]
        }

        const parsed = JSON.parse(jsonStr)
        extracted = {
          tipo: parsed.tipo || null,
          status: parsed.status || null,
          validade: parsed.validade || null,
          numero: parsed.numero || null,
          orgao_emissor: parsed.orgao_emissor || null,
          resumo: parsed.resumo || null,
        }
      }
    } catch (llmErr) {
      console.error('[Extract] LLM extraction error:', llmErr)
      // Return null fields - user can fill manually
      return NextResponse.json({
        extracted,
        warning: 'Erro na extração automática. Preencha os dados manualmente.',
      })
    }

    console.log(`[Extract] Successfully extracted from "${storagePath}": tipo=${extracted.tipo}, status=${extracted.status}`)

    return NextResponse.json({ extracted })
  } catch (err) {
    console.error('[Extract] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Erro interno ao processar o documento' },
      { status: 500 },
    )
  }
}
