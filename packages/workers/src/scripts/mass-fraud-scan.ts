/**
 * Mass Fraud Scan — uses HTTP Data API (no local PG needed)
 *
 * Run on VPS1 (187.77.241.93):
 *   cd /opt/licitagram && pnpm run build
 *   node --max-old-space-size=512 packages/workers/dist/scripts/mass-fraud-scan.js
 *
 * Requires: Data API on VPS2 (ENRICHMENT_API_URL env var)
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import http from 'node:http'
import https from 'node:https'

// ─── Config ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATA_API = process.env.ENRICHMENT_API_URL || 'http://85.31.60.53:3998'

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

const savedPairs = new Set<string>()

// ─── HTTP Helpers ───────────────────────────────────────────────────────────
function httpPost(url: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const parsed = new URL(url)
    const client = parsed.protocol === 'https:' ? https : http
    const req = client.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 30000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.write(data)
    req.end()
  })
}

function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const client = parsed.protocol === 'https:' ? https : http
    client.get({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, timeout: 15000 }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
        catch { resolve(null) }
      })
    }).on('error', reject)
  })
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt14(cnpj: string): string {
  return cnpj.replace(/\D/g, '').padStart(14, '0')
}

function pairKey(c1: string, c2: string): string {
  return [c1, c2].sort().join('|')
}

function elapsed(): string {
  const s = Math.floor((Date.now() - stats.startTime) / 1000)
  return `${Math.floor(s / 60)}m${s % 60}s`
}

async function saveAlert(row: {
  tender_id: string; alert_type: string; severity: string
  cnpj_1: string; cnpj_2: string | null
  empresa_1: string; empresa_2: string | null
  detail: string; metadata: Record<string, unknown>
}) {
  if (row.cnpj_1 && row.cnpj_2 && fmt14(row.cnpj_1) === fmt14(row.cnpj_2)) {
    stats.alertsSkippedSelf++
    return false
  }

  const dk = `${row.alert_type}|${pairKey(row.cnpj_1, row.cnpj_2 || '')}`
  if (savedPairs.has(dk)) { stats.alertsSkippedDuplicate++; return false }

  const { error } = await supabase.from('fraud_alerts').insert({
    tender_id: row.tender_id,
    alert_type: row.alert_type.toUpperCase(),
    severity: row.severity.toUpperCase(),
    cnpj_1: row.cnpj_1, cnpj_2: row.cnpj_2,
    empresa_1: row.empresa_1, empresa_2: row.empresa_2,
    detail: row.detail, metadata: row.metadata,
  })

  if (error) {
    if (error.code === '23505') { stats.alertsSkippedDuplicate++; savedPairs.add(dk); return false }
    stats.errors++
    return false
  }

  savedPairs.add(dk)
  stats.alertsSaved++
  stats.byType[row.alert_type] = (stats.byType[row.alert_type] || 0) + 1
  return true
}

// ─── Detection 1: Socio em Comum (via batch API) ────────────────────────────
async function detectSocioEmComum(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string }>,
) {
  const cnpjs = [...new Set(competitors.map(c => fmt14(c.cnpj)))]
  if (cnpjs.length < 2) return

  let socioData: Record<string, Array<{ nome_socio: string; cnpj_cpf_socio: string }>>
  try {
    const resp = await httpPost(`${DATA_API}/api/batch/socios`, { cnpjs })
    socioData = resp?.results || {}
  } catch { return }

  // Group socios by identifier to find shared ones
  const socioMap = new Map<string, { cnpjs: Set<string>; nome: string }>()
  for (const [cnpj, socios] of Object.entries(socioData)) {
    for (const s of socios) {
      const key = s.cnpj_cpf_socio || s.nome_socio
      if (!key) continue
      if (!socioMap.has(key)) socioMap.set(key, { cnpjs: new Set(), nome: s.nome_socio })
      socioMap.get(key)!.cnpjs.add(cnpj)
    }
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
    const n1 = competitors.find(c => fmt14(c.cnpj) === c1)?.razao_social || c1
    const n2 = competitors.find(c => fmt14(c.cnpj) === c2)?.razao_social || c2
    await saveAlert({
      tender_id: tenderId, alert_type: 'SOCIO_EM_COMUM', severity: 'HIGH',
      cnpj_1: c1, cnpj_2: c2, empresa_1: n1, empresa_2: n2,
      detail: `${n1} e ${n2} compartilham socio ${socios[0]}. ${socios.length} socio(s) em comum.`,
      metadata: { socios },
    })
  }
}

// ─── Detection 2: Mesmo Endereco (via batch API) ────────────────────────────
async function detectMesmoEndereco(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string }>,
) {
  const cnpjs = [...new Set(competitors.map(c => fmt14(c.cnpj)))]
  if (cnpjs.length < 2) return

  let empresaData: Record<string, any>
  try {
    const resp = await httpPost(`${DATA_API}/api/batch/empresas`, { cnpjs })
    empresaData = resp?.results || {}
  } catch { return }

  const addrMap = new Map<string, { cnpjs: string[]; endereco: string }>()
  for (const [cnpj, emp] of Object.entries(empresaData) as Array<[string, any]>) {
    if (!emp.logradouro || !emp.municipio) continue
    const key = `${(emp.logradouro || '').trim().toUpperCase()}|${(emp.numero || '').trim()}|${(emp.municipio || '').trim().toUpperCase()}`
    if (!addrMap.has(key)) {
      addrMap.set(key, { cnpjs: [], endereco: `${emp.logradouro}${emp.numero ? ', ' + emp.numero : ''} - ${emp.municipio}/${emp.uf}` })
    }
    addrMap.get(key)!.cnpjs.push(cnpj)
  }

  for (const [, { cnpjs: ac, endereco }] of addrMap) {
    if (ac.length < 2) continue
    for (let i = 0; i < ac.length; i++) {
      for (let j = i + 1; j < ac.length; j++) {
        if (ac[i] === ac[j]) continue
        const n1 = competitors.find(c => fmt14(c.cnpj) === ac[i])?.razao_social || ac[i]
        const n2 = competitors.find(c => fmt14(c.cnpj) === ac[j])?.razao_social || ac[j]
        await saveAlert({
          tender_id: tenderId, alert_type: 'MESMO_ENDERECO', severity: 'HIGH',
          cnpj_1: ac[i], cnpj_2: ac[j], empresa_1: n1, empresa_2: n2,
          detail: `${n1} e ${n2} concorrem na mesma licitacao e estao no mesmo endereco: ${endereco}.`,
          metadata: { endereco },
        })
      }
    }
  }
}

// ─── Detection 3: Empresa Recente ───────────────────────────────────────────
async function detectEmpresaRecente(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string; is_winner?: boolean }>,
  tenderDate: string | null,
) {
  if (!tenderDate) return
  const winners = competitors.filter(c => c.is_winner)
  if (winners.length === 0) return

  const tD = new Date(tenderDate)
  const sixBefore = new Date(tD); sixBefore.setMonth(sixBefore.getMonth() - 6)

  const cnpjs = winners.map(w => fmt14(w.cnpj))
  let empresaData: Record<string, any>
  try {
    const resp = await httpPost(`${DATA_API}/api/batch/empresas`, { cnpjs })
    empresaData = resp?.results || {}
  } catch { return }

  for (const w of winners) {
    const cnpj = fmt14(w.cnpj)
    const emp = empresaData[cnpj]
    if (!emp?.data_inicio_atividade) continue
    const abDate = new Date(emp.data_inicio_atividade)
    if (abDate > sixBefore) {
      const dias = Math.floor((tD.getTime() - abDate.getTime()) / 86400000)
      await saveAlert({
        tender_id: tenderId, alert_type: 'EMPRESA_RECENTE', severity: 'MEDIUM',
        cnpj_1: cnpj, cnpj_2: null,
        empresa_1: w.razao_social || cnpj, empresa_2: null,
        detail: `Empresa vencedora "${w.razao_social || cnpj}" foi aberta em ${emp.data_inicio_atividade}, apenas ${dias} dias antes da licitacao.`,
        metadata: { data_abertura_empresa: emp.data_inicio_atividade, data_licitacao: tenderDate, dias_antes: dias },
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

  const cnpjs = winners.map(w => fmt14(w.cnpj))
  let empresaData: Record<string, any>
  try {
    const resp = await httpPost(`${DATA_API}/api/batch/empresas`, { cnpjs })
    empresaData = resp?.results || {}
  } catch { return }

  const threshold = valorContrato * 0.01
  for (const w of winners) {
    const cnpj = fmt14(w.cnpj)
    const emp = empresaData[cnpj]
    if (!emp?.capital_social) continue
    const cap = Number(String(emp.capital_social).replace(',', '.'))
    if (!cap || cap <= 0 || cap >= threshold) continue
    await saveAlert({
      tender_id: tenderId, alert_type: 'CAPITAL_INCOMPATIVEL', severity: 'MEDIUM',
      cnpj_1: cnpj, cnpj_2: null,
      empresa_1: w.razao_social || cnpj, empresa_2: null,
      detail: `Empresa vencedora "${w.razao_social || cnpj}" tem capital social de R$ ${cap.toLocaleString('pt-BR')} para contrato de R$ ${valorContrato.toLocaleString('pt-BR')} (${((cap / valorContrato) * 100).toFixed(2)}%).`,
      metadata: { capital_social: cap, valor_contrato: valorContrato, percentual: ((cap / valorContrato) * 100).toFixed(4) },
    })
  }
}

// ─── Detection 5: Empresa Sancionada ────────────────────────────────────────
async function detectSancionada(
  tenderId: string,
  competitors: Array<{ cnpj: string; razao_social: string }>,
) {
  const cnpjs = competitors.map(c => fmt14(c.cnpj))
  let sancoesData: Record<string, any[]>
  try {
    const resp = await httpPost(`${DATA_API}/api/batch/sancoes`, { cnpjs })
    sancoesData = resp?.results || {}
  } catch { return }

  for (const [cnpj, sancoes] of Object.entries(sancoesData)) {
    if (!sancoes || sancoes.length === 0) continue
    const comp = competitors.find(c => fmt14(c.cnpj) === cnpj)
    await saveAlert({
      tender_id: tenderId, alert_type: 'EMPRESA_SANCIONADA', severity: 'CRITICAL',
      cnpj_1: cnpj, cnpj_2: null,
      empresa_1: comp?.razao_social || cnpj, empresa_2: null,
      detail: `Empresa "${comp?.razao_social || cnpj}" possui ${sancoes.length} sancao(oes) registrada(s) no CEIS/CNEP.`,
      metadata: { sancoes: sancoes.map((s: any) => ({ tipo: s.tipo_sancao, orgao: s.orgao_sancionador, inicio: s.data_inicio, fim: s.data_fim })) },
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
  const before = stats.alertsSaved

  await Promise.all([
    detectSocioEmComum(tender.id, competitors).catch(() => { stats.errors++ }),
    detectMesmoEndereco(tender.id, competitors).catch(() => { stats.errors++ }),
    detectEmpresaRecente(tender.id, competitors, tenderDate).catch(() => { stats.errors++ }),
    detectCapitalIncompativel(tender.id, competitors, valor).catch(() => { stats.errors++ }),
    detectSancionada(tender.id, competitors).catch(() => { stats.errors++ }),
  ])

  if (stats.alertsSaved > before) stats.tendersWithAlerts++
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== MASS FRAUD SCAN (HTTP mode) ===')
  console.log(`Data API: ${DATA_API}`)

  // Test data API
  try {
    const health = await httpGet(`${DATA_API}/health`)
    console.log('Data API:', health?.status || 'unknown')
  } catch (err: any) {
    console.error('FATAL: Cannot connect to Data API:', err.message)
    process.exit(1)
  }

  // Step 1: Fetch all competitors from Supabase
  console.log('Fetching competitors from Supabase...')
  const tenderCompMap = new Map<string, Array<{ cnpj: string; razao_social: string; is_winner?: boolean }>>()

  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('competitors')
      .select('tender_id, cnpj, razao_social, is_winner')
      .order('tender_id')
      .range(offset, offset + 4999)

    if (error) { console.error('Error:', error.message); break }
    if (!data || data.length === 0) break

    for (const row of data) {
      if (!row.tender_id || !row.cnpj) continue
      if (!tenderCompMap.has(row.tender_id)) tenderCompMap.set(row.tender_id, [])
      tenderCompMap.get(row.tender_id)!.push({
        cnpj: row.cnpj, razao_social: row.razao_social || '', is_winner: row.is_winner,
      })
    }

    offset += 5000
    process.stdout.write(`\r  ${offset} rows loaded (${tenderCompMap.size} tenders)`)
    if (data.length < 5000) break
  }
  console.log(`\nTotal tenders: ${tenderCompMap.size}`)

  // Step 2: Filter 2+ distinct CNPJs
  const eligible: Array<{ id: string; comps: Array<{ cnpj: string; razao_social: string; is_winner?: boolean }> }> = []
  for (const [id, comps] of tenderCompMap) {
    const uniq = new Set(comps.map(c => fmt14(c.cnpj)))
    if (uniq.size >= 2) eligible.push({ id, comps })
  }
  console.log(`Eligible (2+ CNPJs): ${eligible.length}`)

  // Step 3: Fetch tender metadata
  console.log('Fetching tender metadata...')
  const tenderMeta = new Map<string, any>()
  const ids = eligible.map(t => t.id)
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500)
    const { data } = await supabase
      .from('tenders')
      .select('id, data_abertura, data_publicacao, valor_estimado, valor_total')
      .in('id', batch)
    if (data) data.forEach((t: any) => tenderMeta.set(t.id, t))
    process.stdout.write(`\r  ${Math.min(i + 500, ids.length)}/${ids.length}`)
  }
  console.log('')

  // Step 4: Process
  const total = eligible.length
  console.log(`\nProcessing ${total} tenders...\n`)

  for (let i = 0; i < total; i++) {
    const { id, comps } = eligible[i]
    const meta = tenderMeta.get(id) || {}

    try {
      await processTender({ id, ...meta }, comps)
    } catch { stats.errors++ }

    stats.tendersProcessed++

    if ((i + 1) % 50 === 0 || i === total - 1) {
      console.log(
        `[${elapsed()}] ${i + 1}/${total} | Alertas: ${stats.alertsSaved} | Self-skip: ${stats.alertsSkippedSelf} | Dupes: ${stats.alertsSkippedDuplicate} | Erros: ${stats.errors}`,
      )
    }
  }

  // Final report
  console.log('\n' + '='.repeat(60))
  console.log('SCAN COMPLETO')
  console.log('='.repeat(60))
  console.log(`Tempo: ${elapsed()}`)
  console.log(`Tenders processados: ${stats.tendersProcessed}`)
  console.log(`Tenders com alertas: ${stats.tendersWithAlerts}`)
  console.log(`Alertas salvos: ${stats.alertsSaved}`)
  console.log(`Auto-comparacoes bloqueadas: ${stats.alertsSkippedSelf}`)
  console.log(`Duplicatas ignoradas: ${stats.alertsSkippedDuplicate}`)
  console.log(`Erros: ${stats.errors}`)
  console.log('\nAlertas por tipo:')
  for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`)
  }

  // DB verification
  const { data: dbCounts } = await supabase.from('fraud_alerts').select('alert_type')
  if (dbCounts) {
    const c: Record<string, number> = {}
    dbCounts.forEach((r: any) => { c[r.alert_type] = (c[r.alert_type] || 0) + 1 })
    console.log('\nNo banco:')
    for (const [t, n] of Object.entries(c).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`)
    console.log(`  TOTAL: ${dbCounts.length}`)
  }

  process.exit(0)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
