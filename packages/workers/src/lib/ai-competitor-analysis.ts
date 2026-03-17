import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from './logger'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

interface CompetitorProfile {
  nome: string
  winRate: number
  totalParticipations: number
  topUfs: Array<{ uf: string; count: number; winRate: number }>
  avgDiscount: number
  porte: string
  topModalidades: string[]
}

interface CompanyProfile {
  nome: string
  cnaes: string[]
  uf: string
}

export async function generateCompetitiveInsight(
  company: CompanyProfile,
  competitor: CompetitorProfile,
): Promise<string | null> {
  try {
    const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `Você é um consultor estratégico de licitações públicas no Brasil.

Analise o perfil deste concorrente comparado à empresa do cliente e gere uma análise estratégica concisa (máx 200 palavras).

**Empresa do cliente:** ${company.nome}
- CNAEs: ${company.cnaes.join(', ')}
- UF: ${company.uf}

**Concorrente:** ${competitor.nome}
- Win rate: ${competitor.winRate}%
- Participações: ${competitor.totalParticipations}
- Porte: ${competitor.porte}
- Desconto médio: ${(competitor.avgDiscount * 100).toFixed(1)}%
- Principais UFs: ${competitor.topUfs.map(u => `${u.uf} (${u.count} participações, ${u.winRate}% win rate)`).join(', ')}
- Modalidades: ${competitor.topModalidades.join(', ')}

Responda em JSON:
{
  "pontos_fortes": ["lista de até 3 pontos fortes do concorrente"],
  "pontos_fracos": ["lista de até 3 pontos fracos/oportunidades"],
  "estrategia": "recomendação de 1-2 frases de como competir contra este concorrente"
}`

    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch (err) {
    logger.warn({ err, competitor: competitor.nome }, 'Failed to generate AI competitive insight')
    return null
  }
}
