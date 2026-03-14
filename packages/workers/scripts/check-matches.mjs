import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Check matches with tender details
const { data: matches } = await sb.from('matches')
  .select('score, tender_id, ai_justificativa, breakdown')
  .order('score', { ascending: false })
  .limit(10)

console.log(`Total matches found: ${matches?.length ?? 0}\n`)

for (const m of matches || []) {
  const { data: t } = await sb.from('tenders').select('objeto, modalidade_nome, requisitos, resumo').eq('id', m.tender_id).single()
  console.log(`Score: ${m.score}`)
  console.log(`Objeto: ${(t?.objeto || '').slice(0, 120)}`)
  console.log(`Modalidade: ${t?.modalidade_nome || 'N/A'}`)
  console.log(`Has requisitos: ${!!t?.requisitos}`)
  console.log(`Justificativa: ${(m.ai_justificativa || '').slice(0, 250)}`)
  console.log('---')
}

// Count by status
for (const status of ['new', 'analyzed', 'error']) {
  const { count } = await sb.from('tenders').select('id', { count: 'exact', head: true }).eq('status', status)
  console.log(`Tenders ${status}: ${count}`)
}

process.exit(0)
