import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Search for IT-related tenders
const itKeywords = ['software', 'sistema', 'tecnologia', 'informática', 'TI', 'digital', 'consultoria', 'desenvolvimento', 'plataforma', 'automação', 'dados', 'cloud', 'computação', 'rede', 'servidor', 'suporte técnico']

let itTenders = []
for (const keyword of itKeywords) {
  const { data } = await sb.from('tenders')
    .select('id, objeto, status, modalidade_nome')
    .ilike('objeto', `%${keyword}%`)
    .limit(10)

  if (data && data.length > 0) {
    for (const t of data) {
      if (!itTenders.find(x => x.id === t.id)) {
        itTenders.push(t)
      }
    }
  }
}

console.log(`Found ${itTenders.length} IT-related tenders:\n`)

// Sort by relevance (most keywords matched)
for (const t of itTenders.slice(0, 20)) {
  console.log(`[${t.status}] ${t.modalidade_nome}: ${(t.objeto || '').slice(0, 150)}`)
}

// Count by status
const newCount = itTenders.filter(t => t.status === 'new').length
const analyzedCount = itTenders.filter(t => t.status === 'analyzed').length
console.log(`\nIT tenders: ${newCount} new, ${analyzedCount} analyzed, ${itTenders.length} total`)

process.exit(0)
