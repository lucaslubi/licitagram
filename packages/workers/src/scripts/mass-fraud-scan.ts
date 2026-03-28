/**
 * Mass Fraud Scan - Runs on VPS where local PostgreSQL (67M socios) is available
 *
 * Usage (on VPS):
 *   cd /opt/licitagram && pnpm run build
 *   node --max-old-space-size=512 packages/workers/dist/scripts/mass-fraud-scan.js
 *
 * What it does:
 *   1. Fetches ALL tenders that have 2+ distinct competitor CNPJs from Supabase
 *   2. For each tender, queries local PG for shared socios, same address, etc.
 *   3. Saves real alerts to Supabase fraud_alerts (correct schema)
 *   4. Skips self-comparisons, deduplicates by pair
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// ─── Config ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const pgPool = new pg.Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'licitagram_data',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

// Track global stats
const stats = {
  tendersProcessed: 0,
  tendersWithAlerts: 0,
  alertsSaved: 0,
  alertsSkippedSelf: 0,
  alertsSkippedDuplicate: 0,
  errors: 0,
  byType: {} as Record<string, number>,
  startTime: Date.now(),
}

// Track already-saved pairs to avoid DB round-trips for dupes
const savedPairs = new Set<string>()

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt14(cnpj: string): string {
  return cnpj.replace(/\D/g, '').padStart(14, '0')
}

function pairKey(c1: string, c2: string): string {
  return [c1, c2].sort().join('|')
}

function elapsed(): string {
  const s = Math.floor((Date.now() - stats.startTime) / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m${sec}s`
}

async function saveAlert(row: {
  tender_id: string
  alert_type: string
  severity: string
  cnpj_1: string
  cnpj_2: string | null
  empresa_1: string
  empresa_2: string | null
  detail: string
  metadata: Record<string, unknown>
}) {
  // CRITICAL: never save self-comparison
  if (row.cnpj_1 && row.cnpj_2 && fmt14(row.cnpj_1) === fmt14(row.cnpj_2)) {
    stats.alertsSkippedSelf++
    return false
  }

  // Dedup: skip if we already saved this pair for this alert type
  const dk = `${row.alert_type}|${pairKey(row.cnpj_1, row.cnpj_2 || '')}`
  if (savedPairs.has(dk)) {
    stats.alertsSkippedDuplicate++
    return false
  }

  const { error } = await supabase.from('fraud_alerts').insert({
    tender_id: row.tender_id,
    alert_type: row.alert_type.toUpperCase(),
    severity: row.severity.toUpperCase(),
    cnpj_1: row.cnpj_1,
    cnpj_2: row.cnpj_2,
    empresa_1: row.empresa_1,
    empresa_2: row.empresa_2,
    detail: row.detail,
    metadata: row.metadata,
  })

  if (error) {
    if (error.code === '23505') {
      stats.alertsSkippedDuplicate++
      savedPairs.add(dk)
      return false
    }
    stats.errors++
    return false
  }

  savedPairs.add(dk)
  stats.alertsSaved++
  stats.byType[row.alert_type] = (stats.byType[row.alert_type] || 0) + 1
  return true
}

// ─── Detection 1: Socio em Comum ────────────────────────────────────────────
async function detectSocioEmComum(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string }>,
) {
  const cnpjs = [...new Set(competitors.map(c => fmt14(c.cnpj)))]
  if (cnpjs.length < 2) return

  const result = await pgPool.query(
    `SELECT cnpj, nome_socio, cnpj_cpf_socio
     FROM socios WHERE cnpj = ANY($1)
     ORDER BY cnpj`,
    [cnpjs],
  )

  // Group socios by identifier
  const socioMap = new Map<string, { cnpjs: Set<string>; nome: string }>()
  for (const row of result.rows) {
    const key = row.cnpj_cpf_socio || row.nome_socio
    if (!key) continue
    if (!socioMap.has(key)) socioMap.set(key, { cnpjs: new Set(), nome: row.nome_socio })
    socioMap.get(key)!.cnpjs.add(row.cnpj)
  }

  // Consolidate by pair
  const pairAlerts = new Map<string, { c1: string; c2: string; socios: string[] }>()

  for (const [, { cnpjs: sCnpjs, nome }] of socioMap) {
    if (sCnpjs.size < 2) continue
    const arr = Array.from(sCnpjs)
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i] === arr[j]) continue
        const pk = pairKey(arr[i], arr[j])
        if (!pairAlerts.has(pk)) pairAlerts.set(pk, { c1: arr[i], c2: arr[j], socios: [] })
        const entry = pairAlerts.get(pk)!
        if (!entry.socios.includes(nome)) entry.socios.push(nome)
      }
    }
  }

  for (const [, { c1, c2, socios }] of pairAlerts) {
    const comp1 = competitors.find(c => fmt14(c.cnpj) === c1)
    const comp2 = competitors.find(c => fmt14(c.cnpj) === c2)
    const n1 = comp1?.razao_social || c1
    const n2 = comp2?.razao_social || c2

    await saveAlert({
      tender_id: tenderId,
      alert_type: 'SOCIO_EM_COMUM',
      severity: 'HIGH',
      cnpj_1: c1,
      cnpj_2: c2,
      empresa_1: n1,
      empresa_2: n2,
      detail: `${n1} e ${n2} compartilham socio ${socios[0]}. ${socios.length} socio(s) em comum.`,
      metadata: { socios },
    })
  }
}

// ─── Detection 2: Mesmo Endereco ────────────────────────────────────────────
async function detectMesmoEndereco(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string }>,
) {
  const cnpjs = [...new Set(competitors.map(c => fmt14(c.cnpj)))]
  if (cnpjs.length < 2) return

  const result = await pgPool.query(
    `SELECT cnpj, logradouro, municipio, uf, numero
     FROM empresas
     WHERE cnpj = ANY($1) AND logradouro IS NOT NULL AND municipio IS NOT NULL`,
    [cnpjs],
  )

  if (result.rows.length < 2) return

  const addrMap = new Map<string, { cnpjs: string[]; endereco: string }>()
  for (const row of result.rows) {
    const key = `${(row.logradouro || '').trim().toUpperCase()}|${(row.numero || '').trim()}|${(row.municipio || '').trim().toUpperCase()}`
    if (!addrMap.has(key)) {
      addrMap.set(key, {
        cnpjs: [],
        endereco: `${row.logradouro}${row.numero ? ', ' + row.numero : ''} - ${row.municipio}/${row.uf}`,
      })
    }
    addrMap.get(key)!.cnpjs.push(row.cnpj)
  }

  for (const [, { cnpjs: ac, endereco }] of addrMap) {
    if (ac.length < 2) continue
    for (let i = 0; i < ac.length; i++) {
      for (let j = i + 1; j < ac.length; j++) {
        if (ac[i] === ac[j]) continue
        const comp1 = competitors.find(c => fmt14(c.cnpj) === ac[i])
        const comp2 = competitors.find(c => fmt14(c.cnpj) === ac[j])
        await saveAlert({
          tender_id: tenderId,
          alert_type: 'MESMO_ENDERECO',
          severity: 'HIGH',
          cnpj_1: ac[i],
          cnpj_2: ac[j],
          empresa_1: comp1?.razao_social || ac[i],
          empresa_2: comp2?.razao_social || ac[j],
          detail: `${comp1?.razao_social || ac[i]} e ${comp2?.razao_social || ac[j]} concorrem na mesma licitacao e estao no mesmo endereco: ${endereco}.`,
          metadata: { endereco },
        })
      }
    }
  }
}

// ─── Detection 3: Empresa Recente (vencedora aberta < 6 meses) ──────────────
async function detectEmpresaRecente(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string; is_winner?: boolean }>,
  tenderDate: string | null,
) {
  if (!tenderDate) return
  const winners = competitors.filter(c => c.is_winner)
  if (winners.length === 0) return

  const tD = new Date(tenderDate)
  const sixBefore = new Date(tD)
  sixBefore.setMonth(sixBefore.getMonth() - 6)

  for (const w of winners) {
    const cnpj = fmt14(w.cnpj)
    const result = await pgPool.query(
      `SELECT data_inicio_atividade FROM empresas WHERE cnpj = $1 LIMIT 1`,
      [cnpj],
    )
    if (result.rows.length === 0) continue
    const abertura = result.rows[0].data_inicio_atividade
    if (!abertura) continue
    const abDate = new Date(abertura)
    if (abDate > sixBefore) {
      const dias = Math.floor((tD.getTime() - abDate.getTime()) / 86400000)
      await saveAlert({
        tender_id: tenderId,
        alert_type: 'EMPRESA_RECENTE',
        severity: 'MEDIUM',
        cnpj_1: cnpj,
        cnpj_2: null,
        empresa_1: w.razao_social || cnpj,
        empresa_2: null,
        detail: `Empresa vencedora "${w.razao_social || cnpj}" foi aberta em ${abertura}, apenas ${dias} dias antes da licitacao.`,
        metadata: { data_abertura_empresa: abertura, data_licitacao: tenderDate, dias_antes: dias },
      })
    }
  }
}

// ─── Detection 4: Capital Incompativel ──────────────────────────────────────
async function detectCapitalIncompativel(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string; is_winner?: boolean }>,
  valorContrato: number | null,
) {
  if (!valorContrato || valorContrato <= 0) return
  const winners = competitors.filter(c => c.is_winner)
  if (winners.length === 0) return

  const threshold = valorContrato * 0.01

  for (const w of winners) {
    const cnpj = fmt14(w.cnpj)
    const result = await pgPool.query(
      `SELECT capital_social FROM empresas WHERE cnpj = $1 LIMIT 1`,
      [cnpj],
    )
    if (result.rows.length === 0) continue
    const cap = Number(result.rows[0].capital_social)
    if (!cap || cap <= 0) continue
    if (cap < threshold) {
      await saveAlert({
        tender_id: tenderId,
        alert_type: 'CAPITAL_INCOMPATIVEL',
        severity: 'MEDIUM',
        cnpj_1: cnpj,
        cnpj_2: null,
        empresa_1: w.razao_social || cnpj,
        empresa_2: null,
        detail: `Empresa vencedora "${w.razao_social || cnpj}" tem capital social de R$ ${cap.toLocaleString('pt-BR')} para contrato de R$ ${valorContrato.toLocaleString('pt-BR')} (${((cap / valorContrato) * 100).toFixed(2)}%).`,
        metadata: { capital_social: cap, valor_contrato: valorContrato, percentual: ((cap / valorContrato) * 100).toFixed(4) },
      })
    }
  }
}

// ─── Detection 5: Empresa Sancionada ────────────────────────────────────────
async function detectSancionada(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string }>,
) {
  const cnpjs = competitors.map(c => fmt14(c.cnpj))

  const result = await pgPool.query(
    `SELECT DISTINCT cnpj, tipo_sancao, orgao_sancionador, data_inicio, data_fim
     FROM sancoes WHERE cnpj = ANY($1)`,
    [cnpjs],
  )

  if (result.rows.length === 0) return

  const sancoesMap = new Map<string, any[]>()
  for (const row of result.rows) {
    if (!sancoesMap.has(row.cnpj)) sancoesMap.set(row.cnpj, [])
    sancoesMap.get(row.cnpj)!.push(row)
  }

  for (const [cnpj, sancoes] of sancoesMap) {
    const comp = competitors.find(c => fmt14(c.cnpj) === cnpj)
    await saveAlert({
      tender_id: tenderId,
      alert_type: 'EMPRESA_SANCIONADA',
      severity: 'CRITICAL',
      cnpj_1: cnpj,
      cnpj_2: null,
      empresa_1: comp?.razao_social || cnpj,
      empresa_2: null,
      detail: `Empresa "${comp?.razao_social || cnpj}" possui ${sancoes.length} sancao(oes) registrada(s) no CEIS/CNEP.`,
      metadata: {
        sancoes: sancoes.map((s: any) => ({
          tipo: s.tipo_sancao,
          orgao: s.orgao_sancionador,
          inicio: s.data_inicio,
          fim: s.data_fim,
        })),
      },
    })
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────────────
async function processTender(
  tender: { id: string; data_abertura?: string; data_publicacao?: string; valor_estimado?: number; valor_total?: number },
  competitors: Array<{ cnpj: string; razao_social: string; is_winner?: boolean }>,
) {
  const tenderDate = tender.data_abertura || tender.data_publicacao || null
  const valor = tender.valor_total || tender.valor_estimado || null

  const beforeAlerts = stats.alertsSaved

  await Promise.all([
    detectSocioEmComum(tender.id, competitors).catch(e => { stats.errors++; }),
    detectMesmoEndereco(tender.id, competitors).catch(e => { stats.errors++; }),
    detectEmpresaRecente(tender.id, competitors, tenderDate).catch(e => { stats.errors++; }),
    detectCapitalIncompativel(tender.id, competitors, valor).catch(e => { stats.errors++; }),
    detectSancionada(tender.id, competitors).catch(e => { stats.errors++; }),
  ])

  if (stats.alertsSaved > beforeAlerts) stats.tendersWithAlerts++
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== MASS FRAUD SCAN ===')
  console.log('Connecting to PostgreSQL...')

  try {
    const pgTest = await pgPool.query('SELECT count(*) as cnt FROM socios')
    console.log(`PostgreSQL OK - ${Number(pgTest.rows[0].cnt).toLocaleString()} socios records`)
  } catch (err: any) {
    console.error('FATAL: Cannot connect to PostgreSQL:', err.message)
    process.exit(1)
  }

  // Step 1: Get ALL distinct tender_ids from competitors table
  console.log('Fetching all tenders with competitors...')
  const tenderCompMap = new Map<string, Array<{ cnpj: string; razao_social: string; is_winner?: boolean }>>()

  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('competitors')
      .select('tender_id, cnpj, razao_social, is_winner')
      .order('tender_id')
      .range(offset, offset + 4999)

    if (error) {
      console.error('Error fetching competitors:', error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      if (!row.tender_id || !row.cnpj) continue
      if (!tenderCompMap.has(row.tender_id)) tenderCompMap.set(row.tender_id, [])
      tenderCompMap.get(row.tender_id)!.push({
        cnpj: row.cnpj,
        razao_social: row.razao_social || '',
        is_winner: row.is_winner,
      })
    }

    offset += 5000
    process.stdout.write(`\r  Loaded ${offset} competitor rows... (${tenderCompMap.size} tenders)`)
    if (data.length < 5000) break
  }

  console.log(`\nTotal tenders with competitors: ${tenderCompMap.size}`)

  // Step 2: Filter to tenders with 2+ DISTINCT CNPJs
  const eligibleTenders: Array<{
    id: string
    competitors: Array<{ cnpj: string; razao_social: string; is_winner?: boolean }>
  }> = []

  for (const [tenderId, comps] of tenderCompMap) {
    const uniqueCnpjs = new Set(comps.map(c => fmt14(c.cnpj)))
    if (uniqueCnpjs.size >= 2) {
      eligibleTenders.push({ id: tenderId, competitors: comps })
    }
  }

  console.log(`Tenders with 2+ distinct CNPJs: ${eligibleTenders.length}`)

  // Step 3: Fetch tender metadata (dates, values) in batches
  console.log('Fetching tender metadata...')
  const tenderMeta = new Map<string, { data_abertura?: string; data_publicacao?: string; valor_estimado?: number; valor_total?: number }>()

  const tenderIds = eligibleTenders.map(t => t.id)
  for (let i = 0; i < tenderIds.length; i += 500) {
    const batch = tenderIds.slice(i, i + 500)
    const { data } = await supabase
      .from('tenders')
      .select('id, data_abertura, data_publicacao, valor_estimado, valor_total')
      .in('id', batch)

    if (data) {
      for (const t of data) {
        tenderMeta.set(t.id, {
          data_abertura: t.data_abertura,
          data_publicacao: t.data_publicacao,
          valor_estimado: t.valor_estimado,
          valor_total: t.valor_total,
        })
      }
    }
    process.stdout.write(`\r  Fetched metadata for ${Math.min(i + 500, tenderIds.length)}/${tenderIds.length} tenders`)
  }

  console.log('')

  // Step 4: Process each tender
  const total = eligibleTenders.length
  console.log(`\nStarting fraud analysis of ${total} tenders...\n`)

  for (let i = 0; i < total; i++) {
    const { id, competitors } = eligibleTenders[i]
    const meta = tenderMeta.get(id) || {}

    try {
      await processTender(
        { id, ...meta },
        competitors,
      )
    } catch (err: any) {
      stats.errors++
    }

    stats.tendersProcessed++

    // Progress log every 100 tenders
    if ((i + 1) % 100 === 0 || i === total - 1) {
      console.log(
        `[${elapsed()}] Tender ${i + 1}/${total} | ` +
        `Alertas: ${stats.alertsSaved} | ` +
        `Self-skip: ${stats.alertsSkippedSelf} | ` +
        `Dupes: ${stats.alertsSkippedDuplicate} | ` +
        `Erros: ${stats.errors}`,
      )
    }
  }

  // Step 5: Final report
  console.log('\n' + '='.repeat(60))
  console.log('SCAN COMPLETO')
  console.log('='.repeat(60))
  console.log(`Tempo total: ${elapsed()}`)
  console.log(`Tenders processados: ${stats.tendersProcessed}`)
  console.log(`Tenders com alertas: ${stats.tendersWithAlerts}`)
  console.log(`Total alertas salvos: ${stats.alertsSaved}`)
  console.log(`Auto-comparacoes bloqueadas: ${stats.alertsSkippedSelf}`)
  console.log(`Duplicatas ignoradas: ${stats.alertsSkippedDuplicate}`)
  console.log(`Erros: ${stats.errors}`)
  console.log('')
  console.log('Alertas por tipo:')
  for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`)
  }

  // Verify from DB
  console.log('')
  console.log('Verificacao do banco:')
  const { data: dbCounts } = await supabase
    .from('fraud_alerts')
    .select('alert_type')

  if (dbCounts) {
    const counts: Record<string, number> = {}
    dbCounts.forEach((r: any) => { counts[r.alert_type] = (counts[r.alert_type] || 0) + 1 })
    for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`)
    }
    console.log(`  TOTAL: ${dbCounts.length}`)
  }

  await pgPool.end()
  process.exit(0)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
