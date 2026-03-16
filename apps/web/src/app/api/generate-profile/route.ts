import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com',
})

const CNAE_GROUPS: Record<string, string> = {
  '62': 'Tecnologia da Informacao - desenvolvimento de software, consultoria em TI, suporte tecnico',
  '63': 'Servicos de informacao - portais, provedores de conteudo, processamento de dados',
  '70': 'Consultoria em gestao empresarial, assessoria, planejamento estrategico',
  '72': 'Pesquisa e desenvolvimento',
  '82': 'Servicos administrativos, de escritorio e apoio empresarial',
  '85': 'Educacao, treinamento, capacitacao',
  '46': 'Comercio atacadista de equipamentos, maquinas, materiais',
  '47': 'Comercio varejista',
  '77': 'Aluguel de maquinas e equipamentos',
  '33': 'Manutencao e reparacao de maquinas e equipamentos',
  '43': 'Servicos especializados para construcao',
  '41': 'Construcao de edificios',
  '42': 'Obras de infraestrutura',
  '71': 'Servicos de engenharia, arquitetura, testes e analises tecnicas',
  '73': 'Publicidade, pesquisa de mercado, design',
  '80': 'Vigilancia e seguranca',
  '81': 'Limpeza, conservacao, manutencao predial, facilities',
  '95': 'Reparacao e manutencao de equipamentos de informatica',
  '26': 'Fabricacao de equipamentos de informatica e eletronicos',
  '61': 'Telecomunicacoes, telefonia, internet',
  '10': 'Alimentacao - fabricacao de produtos alimenticios',
  '56': 'Alimentacao - servicos de alimentacao, restaurantes, catering',
  '86': 'Saude - atividades de atencao a saude humana',
  '32': 'Fabricacao de produtos diversos, instrumentos medicos',
  '35': 'Eletricidade, gas e outras utilidades',
  '49': 'Transporte terrestre, logistica',
  '52': 'Armazenamento e atividades auxiliares de transporte',
  '68': 'Atividades imobiliarias',
  '69': 'Atividades juridicas, contabilidade, auditoria',
}

function buildCnaeDescriptions(cnaes: string[]): string[] {
  const descriptions: string[] = []
  for (const cnae of cnaes) {
    const group = cnae.substring(0, 2)
    if (CNAE_GROUPS[group]) {
      descriptions.push(`${cnae}: ${CNAE_GROUPS[group]}`)
    }
  }
  return descriptions
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { type, razao_social, cnae_principal, cnaes_secundarios, descricao_servicos, capacidades, palavras_chave } = body

  const allCnaes: string[] = []
  if (cnae_principal) allCnaes.push(String(cnae_principal))
  if (Array.isArray(cnaes_secundarios)) allCnaes.push(...cnaes_secundarios)

  if (allCnaes.length === 0) {
    return NextResponse.json({ error: 'Preencha pelo menos o CNAE principal' }, { status: 400 })
  }

  const cnaeDescriptions = buildCnaeDescriptions(allCnaes)

  // If no CNAE matched our lookup table, still include raw codes
  if (cnaeDescriptions.length === 0) {
    for (const cnae of allCnaes) {
      cnaeDescriptions.push(`CNAE ${cnae}`)
    }
  }

  if (type === 'description') {
    const prompt = `Com base nos CNAEs abaixo, gere uma descricao COMPLETA e DETALHADA (5-8 frases) dos servicos que esta empresa oferece. Seja especifico sobre o que a empresa FAZ, incluindo tipos de projetos, metodologias e areas de atuacao. Esta descricao sera usada para encontrar licitacoes compativeis, entao inclua o maximo de termos tecnicos relevantes do setor.

Empresa: ${razao_social || 'N/A'}
CNAEs:
${cnaeDescriptions.join('\n')}
${Array.isArray(capacidades) && capacidades.length > 0 ? `Capacidades: ${capacidades.join(', ')}` : ''}

Retorne APENAS a descricao, sem formatacao, sem markdown, sem aspas.`

    try {
      console.log('[GENERATE] Description request for:', razao_social, '| CNAEs:', cnaeDescriptions.length)
      const response = await deepseekClient.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.4,
      })

      const description = response.choices[0]?.message?.content?.trim()
      console.log('[GENERATE] Description result length:', description?.length || 0)
      if (!description || description.length < 20) {
        return NextResponse.json({ error: 'IA nao conseguiu gerar descricao' }, { status: 500 })
      }

      return NextResponse.json({ description })
    } catch (err) {
      console.error('[GENERATE] Description error:', err)
      return NextResponse.json({ error: 'Erro ao gerar descricao: ' + (err instanceof Error ? err.message : 'desconhecido') }, { status: 500 })
    }
  }

  if (type === 'keywords') {
    const existingTerms = [
      ...((palavras_chave as string[]) || []),
      ...((capacidades as string[]) || []),
    ]

    const prompt = `Voce e um especialista em licitacoes publicas brasileiras. Com base no perfil abaixo, gere uma lista de 30 termos de busca que esta empresa deveria monitorar em editais de licitacao.

PERFIL DA EMPRESA:
${razao_social ? `Razao Social: ${razao_social}` : ''}
CNAEs:
${cnaeDescriptions.join('\n')}
${descricao_servicos ? `Descricao: ${String(descricao_servicos).slice(0, 800)}` : ''}
${existingTerms.length > 0 ? `Termos ja cadastrados (NAO repita): ${existingTerms.join(', ')}` : ''}

INSTRUCOES:
1. Gere EXATAMENTE 30 termos/frases que tipicamente aparecem em OBJETOS de licitacoes que esta empresa poderia participar
2. Inclua variacoes e sinonimos (ex: "software" + "sistema" + "solucao tecnologica" + "plataforma digital")
3. Inclua termos tecnicos do setor
4. Inclua servicos correlatos que a empresa pode oferecer
5. NAO inclua termos genericos como "servico", "fornecimento", "contratacao", "empresa"
6. NAO inclua termos de setores que a empresa NAO atua
7. Cada termo deve ter 1-4 palavras
8. NAO repita termos ja cadastrados

Retorne APENAS os termos, um por linha, sem numeracao, sem explicacao, sem marcadores.`

    try {
      const response = await deepseekClient.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.4,
      })

      const content = response.choices[0]?.message?.content?.trim()
      if (!content) {
        return NextResponse.json({ error: 'IA não conseguiu gerar termos' }, { status: 500 })
      }

      const keywords = content
        .split('\n')
        .map(t => t.replace(/^[-•*\d.)\s]+/, '').trim())
        .filter(t => t.length >= 3 && t.length <= 60)
        .filter(t => !t.includes(':') && !t.includes('('))

      // Deduplicate against existing terms
      const existingLower = new Set(existingTerms.map(t => t.toLowerCase().trim()))
      const uniqueKeywords = keywords.filter(t => !existingLower.has(t.toLowerCase().trim()))

      return NextResponse.json({ keywords: uniqueKeywords.slice(0, 30) })
    } catch (err) {
      console.error('[GENERATE] Keywords error:', err)
      return NextResponse.json({ error: 'Erro ao gerar palavras-chave: ' + (err instanceof Error ? err.message : 'desconhecido') }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
}
