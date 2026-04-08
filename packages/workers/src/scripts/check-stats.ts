import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { count: statsCount, error } = await sb.from('competitor_stats').select('*', { count: 'exact', head: true })
  const { data: sample } = await sb.from('competitor_stats')
    .select('cnpj, razao_social, total_participacoes, win_rate, porte, uf')
    .order('total_participacoes', { ascending: false })
    .limit(3)

  console.log('\n📊 COMPETITOR_STATS (view que alimenta /admin/prospects)')
  console.log(`   Registros na view: ${statsCount ?? 0}`)
  if (error) console.log(`   Erro: ${error.message}`)
  console.log('\n   Top 3 por participações:')
  for (const c of sample || []) {
    console.log(`   - ${c.razao_social || c.cnpj} | ${c.uf} | ${c.porte} | ${c.total_participacoes} partic | win: ${(Number(c.win_rate)*100).toFixed(1)}%`)
  }
  if (!statsCount || statsCount === 0) {
    console.log('\n   ⚠️  View vazia — competition-analysis precisa rodar para materializar.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
