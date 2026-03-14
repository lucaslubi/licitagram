import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const API_KEY = process.env.OPENROUTER_API_KEY
const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'
const COMPANY_ID = '24cdf940-734b-41ef-b068-3de0107122f4'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Get company profile
const { data: company } = await sb.from('companies').select('*').eq('id', COMPANY_ID).single()

const companyProfile = {
  razao_social: company.razao_social,
  cnae_principal: company.cnae_principal,
  cnaes_secundarios: company.cnaes_secundarios,
  capacidades: company.capacidades,
  palavras_chave: company.palavras_chave,
  descricao_servicos: (company.descricao_servicos || '').slice(0, 1500),
  uf: company.uf,
}

console.log('Company:', company.razao_social)
console.log('CNAEs:', [company.cnae_principal, ...(company.cnaes_secundarios || [])].join(', '))

// Find IT-related tenders
const itKeywords = ['software', 'sistema de informação', 'tecnologia da informação', 'informática', 'digital', 'consultoria', 'desenvolvimento', 'plataforma', 'automação', 'dados', 'cloud', 'computação', 'suporte técnico', 'licenciamento', 'inteligência artificial']

let itTenders = []
for (const keyword of itKeywords) {
  const { data } = await sb.from('tenders')
    .select('id, objeto, modalidade_nome, uf, valor_estimado, resumo, requisitos')
    .ilike('objeto', `%${keyword}%`)
    .limit(30)

  if (data) {
    for (const t of data) {
      if (!itTenders.find(x => x.id === t.id)) {
        itTenders.push(t)
      }
    }
  }
}

console.log(`\nFound ${itTenders.length} IT-related tenders to match directly\n`)

const SYSTEM = `Voce e um consultor especialista em licitacoes publicas brasileiras. Avalie se esta empresa pode PARTICIPAR desta licitacao.

REGRAS:
- Score 0-30: totalmente incompativel
- Score 31-50: relacao tangencial
- Score 51-70: possivel participar com esforco
- Score 71-85: boa compatibilidade
- Score 86-100: excelente match direto
- NAO penalize campos vazios (pontuacao 70 na categoria)
- Considere atividades CORRELATAS e ADJACENTES ao ramo

Retorne APENAS JSON valido sem markdown.`

let matched = 0
let highScore = 0

for (let i = 0; i < itTenders.length; i++) {
  const tender = itTenders[i]

  const prompt = `EMPRESA: ${JSON.stringify(companyProfile, null, 2)}

LICITACAO:
Objeto: ${tender.objeto}
Modalidade: ${tender.modalidade_nome}
Valor: ${tender.valor_estimado || 'N/I'}
UF: ${tender.uf}
${tender.resumo ? `Resumo: ${tender.resumo}` : ''}

Retorne JSON: {"score":0-100,"breakdown":[{"category":"compatibilidade_cnae","score":0-100,"reason":"..."},{"category":"qualificacao_tecnica","score":0-100,"reason":"..."},{"category":"capacidade_economica","score":0-100,"reason":"..."},{"category":"documentacao","score":0-100,"reason":"..."},{"category":"localizacao","score":0-100,"reason":"..."}],"justificativa":"2-3 frases","recomendacao":"participar|avaliar_melhor|nao_recomendado","riscos":["..."],"acoes_necessarias":["..."]}`

  try {
    await sleep(5000) // Respect rate limits

    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!resp.ok) {
      const status = resp.status
      if (status === 429) {
        console.log(`  [${i+1}/${itTenders.length}] Rate limited, waiting 15s...`)
        await sleep(15000)
        i-- // Retry
        continue
      }
      console.log(`  [${i+1}] Error: ${status}`)
      continue
    }

    const json = await resp.json()
    const text = json.choices?.[0]?.message?.content || ''

    if (!text) {
      console.log(`  [${i+1}] Empty response, skipping`)
      continue
    }

    // Parse JSON from response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : text
    const cleaned = jsonStr.replace(/^[^{]*/, '').replace(/[^}]*$/, '')
    const result = JSON.parse(cleaned)

    const score = Math.round(result.score)
    if (score > highScore) highScore = score

    // Upsert to matches table
    const { error } = await sb.from('matches').upsert(
      {
        company_id: COMPANY_ID,
        tender_id: tender.id,
        score,
        breakdown: result.breakdown || [],
        ai_justificativa: result.justificativa,
        status: 'new',
      },
      { onConflict: 'company_id,tender_id' },
    )

    if (error) {
      console.log(`  [${i+1}] DB error: ${error.message}`)
    } else {
      matched++
      const icon = score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴'
      console.log(`  [${i+1}/${itTenders.length}] ${icon} Score ${score}: ${tender.objeto.slice(0, 80)}`)
    }

    // Also mark tender as analyzed
    await sb.from('tenders').update({ status: 'analyzed' }).eq('id', tender.id)

  } catch (err) {
    console.log(`  [${i+1}] Error: ${err.message?.slice(0, 80)}`)
  }
}

console.log(`\nDone! ${matched} tenders matched. Highest score: ${highScore}`)

// Final stats
const { count: totalMatches } = await sb.from('matches').select('id', { count: 'exact', head: true })
const { count: goodMatches } = await sb.from('matches').select('id', { count: 'exact', head: true }).gte('score', 50)
const { count: greatMatches } = await sb.from('matches').select('id', { count: 'exact', head: true }).gte('score', 70)
console.log(`Total matches: ${totalMatches}, Score >= 50: ${goodMatches}, Score >= 70: ${greatMatches}`)

process.exit(0)
