import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function diagnose() {
  console.log('\n🔍 LICITAGRAM INTELLIGENCE DIAGNOSTICS\n' + '='.repeat(45))

  // 1. Fraud Detector: check pending tenders (resultado_importado=true but not analyzed)
  const { count: pendingFraud } = await supabase
    .from('tenders')
    .select('*', { count: 'exact', head: true })
    .eq('resultado_importado', true)
    .or('fraud_analyzed.is.null,fraud_analyzed.eq.false')

  const { count: analyzedFraud } = await supabase
    .from('tenders')
    .select('*', { count: 'exact', head: true })
    .eq('fraud_analyzed', true)

  const { count: totalAlerts } = await supabase
    .from('fraud_alerts')
    .select('*', { count: 'exact', head: true })

  const { data: lastAlert } = await supabase
    .from('fraud_alerts')
    .select('created_at, alert_type, severity')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  console.log('\n🚨 FRAUD DETECTOR')
  console.log(`  ├─ Tenders analisados:  ${analyzedFraud ?? 0}`)
  console.log(`  ├─ Pendentes de análise: ${pendingFraud ?? 0}`)
  console.log(`  ├─ Total de alertas:     ${totalAlerts ?? 0}`)
  console.log(`  └─ Último alerta:        ${lastAlert ? `${lastAlert.created_at?.slice(0,19)} | ${lastAlert.severity} | ${lastAlert.alert_type}` : 'nenhum'}`)

  // 2. Results scraping (competitor extraction): check competitors table
  const { count: totalCompetitors } = await supabase
    .from('competitors')
    .select('*', { count: 'exact', head: true })

  const { data: lastCompetitor } = await supabase
    .from('competitors')
    .select('created_at, nome')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Tenders with results imported
  const { count: withResults } = await supabase
    .from('tenders')
    .select('*', { count: 'exact', head: true })
    .eq('resultado_importado', true)

  // Tenders without results that were scraped from PNCP (eligible for result scraping)
  const { count: waitingResults } = await supabase
    .from('tenders')
    .select('*', { count: 'exact', head: true })
    .in('source', ['pncp', 'comprasgov'])
    .eq('status', 'analyzed')
    .not('pncp_id', 'is', null)

  console.log('\n🥊 COMPETITOR EXTRACTION (results-scraping)')
  console.log(`  ├─ Total de concorrentes extraídos: ${totalCompetitors ?? 0}`)
  console.log(`  ├─ Tenders com resultados:          ${withResults ?? 0}`)
  console.log(`  ├─ Tenders aguardando extração:     ${waitingResults ?? 0}`)
  console.log(`  └─ Último concorrente:              ${lastCompetitor ? `${lastCompetitor.created_at?.slice(0,19)} | ${lastCompetitor.nome}` : 'nenhum'}`)

  // 3. Tender items (itemization pipeline)
  const { count: totalItems } = await supabase
    .from('tender_items')
    .select('*', { count: 'exact', head: true })

  const { data: lastItem } = await supabase
    .from('tender_items')
    .select('created_at, descricao')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { count: totalPriceHistory } = await supabase
    .from('price_history')
    .select('*', { count: 'exact', head: true })

  console.log('\n📦 ITEMIZATION PIPELINE (tender_items)')
  console.log(`  ├─ Total de itens extraídos:   ${totalItems ?? 0}`)
  console.log(`  ├─ Total de preços históricos: ${totalPriceHistory ?? 0}`)
  console.log(`  └─ Último item:                ${lastItem ? `${lastItem.created_at?.slice(0,19)} | ${lastItem.descricao?.slice(0,50)}` : 'nenhum'}`)

  // 4. Summary / verdict
  console.log('\n📊 VEREDICTO')
  const fraudOk = (pendingFraud ?? 0) === 0 || (analyzedFraud ?? 0) > 0
  const competitorsOk = (totalCompetitors ?? 0) > 0
  const itemsOk = (totalItems ?? 0) > 0

  console.log(`  ├─ Fraud Detector:         ${fraudOk ? '✅ Ativo' : '⚠️  Pendente (' + pendingFraud + ' tenders sem análise)'}`)
  console.log(`  ├─ Extração Concorrentes:  ${competitorsOk ? '✅ Ativo (' + totalCompetitors + ' concorrentes)' : '❌ Sem dados'}`)
  console.log(`  └─ Itens/Preços:           ${itemsOk ? '✅ Ativo (' + totalItems + ' itens)' : '❌ Sem dados'}`)
  console.log('\n' + '='.repeat(45) + '\n')
}

diagnose().catch(e => { console.error(e); process.exit(1) })
