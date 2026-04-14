import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import pino from 'pino'

// ─── Config ─────────────────────────────────────────────────────────────────
const logger = pino({ name: 'fraud-detector-worker', level: process.env.LOG_LEVEL || 'info' })

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
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

const BATCH_SIZE = 20
const RUN_INTERVAL_MS = 2 * 60 * 60 * 1000 // 2 hours

// ─── Types ──────────────────────────────────────────────────────────────────
interface FraudAlertRow {
  tender_id: string
  alert_type: string
  severity: string
  cnpj_1: string
  cnpj_2: string | null
  empresa_1: string
  empresa_2: string | null
  detail: string
  metadata: Record<string, unknown>
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatCnpj14(cnpj: string): string {
  return cnpj.replace(/\D/g, '').padStart(14, '0')
}

/** Extract 8-digit root (cnpj_basico) from 14-digit CNPJ */
function cnpjBasico(cnpj: string): string {
  return formatCnpj14(cnpj).slice(0, 8)
}

function pairKey(cnpj1: string, cnpj2: string): string {
  return [cnpj1, cnpj2].sort().join('|')
}

async function saveAlert(alert: FraudAlertRow): Promise<boolean> {
  if (alert.cnpj_1 && alert.cnpj_2 && formatCnpj14(alert.cnpj_1) === formatCnpj14(alert.cnpj_2)) {
    return false
  }

  const { error } = await supabase
    .from('fraud_alerts')
    .insert({
      tender_id: alert.tender_id,
      alert_type: alert.alert_type.toUpperCase(),
      severity: alert.severity.toUpperCase(),
      cnpj_1: alert.cnpj_1,
      cnpj_2: alert.cnpj_2,
      empresa_1: alert.empresa_1,
      empresa_2: alert.empresa_2,
      detail: alert.detail,
      metadata: alert.metadata,
    })

  if (error) {
    if (error.code === '23505') return false // duplicate
    logger.error({ error, alert_type: alert.alert_type, tender_id: alert.tender_id }, 'Failed to save fraud alert')
    return false
  }
  return true
}

// ─── Strategy 1: SANCIONADAS → find all tenders they participate in ────────
async function scanSancionadas(): Promise<number> {
  logger.info('Strategy 1: Scanning sanctioned companies in tenders...')

  // Get ALL sanctioned CNPJs from local PG (cpf_cnpj is 14-digit)
  const { rows: sanctioned } = await pgPool.query(
    `SELECT DISTINCT cpf_cnpj, nome, tipo_pessoa, categoria, orgao_sancionador, data_inicio, data_fim FROM sancoes WHERE LENGTH(cpf_cnpj) >= 14`
  )

  const sanctionedMap = new Map<string, typeof sanctioned>()
  for (const row of sanctioned) {
    const cnpj = formatCnpj14(row.cpf_cnpj)
    if (!sanctionedMap.has(cnpj)) sanctionedMap.set(cnpj, [])
    sanctionedMap.get(cnpj)!.push(row)
  }

  logger.info({ sanctionedCompanies: sanctionedMap.size }, 'Loaded sanctioned companies')

  // Find these CNPJs in competitors table (batch by 50)
  const sanctionedCnpjs = Array.from(sanctionedMap.keys())
  let alerts = 0

  for (let i = 0; i < sanctionedCnpjs.length; i += 50) {
    const batch = sanctionedCnpjs.slice(i, i + 50)

    const { data: competitors } = await supabase
      .from('competitors')
      .select('tender_id, cnpj, razao_social, is_winner')
      .in('cnpj', batch)

    if (!competitors || competitors.length === 0) continue

    for (const comp of competitors) {
      const cnpj14 = formatCnpj14(comp.cnpj)
      const sancoes = sanctionedMap.get(cnpj14)
      if (!sancoes) continue

      const saved = await saveAlert({
        tender_id: comp.tender_id,
        alert_type: 'EMPRESA_SANCIONADA',
        severity: 'CRITICAL',
        cnpj_1: cnpj14,
        cnpj_2: null,
        empresa_1: comp.razao_social || cnpj14,
        empresa_2: null,
        detail: `"${comp.razao_social || cnpj14}" possui ${sancoes.length} sancao(oes) no CEIS/CNEP${comp.is_winner ? ' e VENCEU esta licitacao' : ''}.`,
        metadata: {
          is_winner: comp.is_winner,
          sancoes: sancoes.map(s => ({
            tipo: s.categoria,
            orgao: s.orgao_sancionador,
            inicio: s.data_inicio,
            fim: s.data_fim,
          })),
        },
      })
      if (saved) alerts++
    }

    if (i % 500 === 0 && i > 0) {
      logger.info({ progress: i, total: sanctionedCnpjs.length, alerts }, 'Sancionadas scan progress')
    }
  }

  logger.info({ alerts }, 'Strategy 1 complete: Sancionadas')
  return alerts
}

// ─── Strategy 2: SOCIOS EM COMUM between competitors in same tender ────────
async function scanSociosEmComum(): Promise<number> {
  logger.info('Strategy 2: Scanning shared partners between competitors...')

  // Get all distinct tender_ids with 2+ competitors
  const { data: tenderGroups } = await supabase
    .from('competitors')
    .select('tender_id')

  if (!tenderGroups) return 0

  // Count competitors per tender
  const tenderCounts = new Map<string, number>()
  for (const row of tenderGroups) {
    tenderCounts.set(row.tender_id, (tenderCounts.get(row.tender_id) || 0) + 1)
  }

  // Only process tenders with 2+ competitors
  const multiCompTenders = Array.from(tenderCounts.entries())
    .filter(([_, count]) => count >= 2)
    .map(([id]) => id)

  logger.info({ tendersToCheck: multiCompTenders.length }, 'Tenders with 2+ competitors')

  let alerts = 0

  for (let i = 0; i < multiCompTenders.length; i += BATCH_SIZE) {
    const batch = multiCompTenders.slice(i, i + BATCH_SIZE)

    for (const tenderId of batch) {
      const { data: competitors } = await supabase
        .from('competitors')
        .select('cnpj, razao_social')
        .eq('tender_id', tenderId)

      if (!competitors || competitors.length < 2) continue

      const basicos = [...new Set(competitors.map(c => cnpjBasico(c.cnpj)))]
      if (basicos.length < 2) continue

      // Map basico → full cnpj for alerts
      const basicoToFull = new Map<string, string>()
      for (const c of competitors) basicoToFull.set(cnpjBasico(c.cnpj), formatCnpj14(c.cnpj))

      try {
        const { rows } = await pgPool.query(
          `SELECT cnpj_basico, nome_socio, cpf_cnpj_socio FROM socios WHERE cnpj_basico = ANY($1)`,
          [basicos],
        )

        // Group by socio identifier
        const socioMap = new Map<string, { cnpjs: Set<string>; nome: string }>()
        for (const row of rows) {
          const key = row.cpf_cnpj_socio || row.nome_socio
          if (!key) continue
          if (!socioMap.has(key)) socioMap.set(key, { cnpjs: new Set(), nome: row.nome_socio })
          socioMap.get(key)!.cnpjs.add(row.cnpj_basico)
        }

        // Find shared socios
        const pairAlerts = new Map<string, { cnpj1: string; cnpj2: string; socios: string[] }>()
        for (const [_, { cnpjs: socioCnpjs, nome }] of socioMap) {
          if (socioCnpjs.size < 2) continue
          const arr = Array.from(socioCnpjs)
          for (let a = 0; a < arr.length; a++) {
            for (let b = a + 1; b < arr.length; b++) {
              if (arr[a] === arr[b]) continue
              const pk = pairKey(arr[a], arr[b])
              if (!pairAlerts.has(pk)) pairAlerts.set(pk, { cnpj1: arr[a], cnpj2: arr[b], socios: [] })
              const entry = pairAlerts.get(pk)!
              if (!entry.socios.includes(nome)) entry.socios.push(nome)
            }
          }
        }

        for (const [_, { cnpj1, cnpj2, socios }] of pairAlerts) {
          // cnpj1/cnpj2 are basico (8 dig) — resolve to full 14-digit
          const full1 = basicoToFull.get(cnpj1) || cnpj1
          const full2 = basicoToFull.get(cnpj2) || cnpj2
          const c1 = competitors.find(c => cnpjBasico(c.cnpj) === cnpj1)
          const c2 = competitors.find(c => cnpjBasico(c.cnpj) === cnpj2)
          const saved = await saveAlert({
            tender_id: tenderId,
            alert_type: 'SOCIO_EM_COMUM',
            severity: 'HIGH',
            cnpj_1: full1,
            cnpj_2: full2,
            empresa_1: c1?.razao_social || full1,
            empresa_2: c2?.razao_social || full2,
            detail: `${c1?.razao_social || full1} e ${c2?.razao_social || full2} compartilham ${socios.length} socio(s): ${socios.slice(0, 3).join(', ')}${socios.length > 3 ? '...' : ''}.`,
            metadata: { socios },
          })
          if (saved) alerts++
        }
      } catch (err) {
        logger.error({ err, tenderId }, 'Error checking socios for tender')
      }
    }

    if (i % 100 === 0 && i > 0) {
      logger.info({ progress: i, total: multiCompTenders.length, alerts }, 'Socios scan progress')
    }
  }

  logger.info({ alerts }, 'Strategy 2 complete: Socios em Comum')
  return alerts
}

// ─── Strategy 3: CAPITAL INCOMPATIVEL for winners ──────────────────────────
async function scanCapitalIncompativel(): Promise<number> {
  logger.info('Strategy 3: Scanning winners with incompatible capital...')

  // Get all winners with tender value
  const { data: winners } = await supabase
    .from('competitors')
    .select('tender_id, cnpj, razao_social, valor_proposta, tenders!inner(valor_estimado, data_abertura)')
    .eq('is_winner', true)
    .not('tenders.valor_estimado', 'is', null)
    .gt('tenders.valor_estimado', 0)

  if (!winners || winners.length === 0) return 0
  logger.info({ winnersToCheck: winners.length }, 'Winners with value to check')

  let alerts = 0

  for (const winner of winners) {
    const cnpj14 = formatCnpj14(winner.cnpj)
    const basico = cnpjBasico(winner.cnpj)
    const valor = (winner.tenders as any)?.valor_estimado

    if (!valor || valor <= 0) continue
    const threshold = valor * 0.01

    try {
      const { rows } = await pgPool.query(
        `SELECT capital_social FROM empresas WHERE cnpj_basico = $1 LIMIT 1`,
        [basico],
      )

      if (rows.length === 0) continue
      const capital = Number(rows[0].capital_social)
      if (!capital || capital <= 0) continue

      if (capital < threshold) {
        const saved = await saveAlert({
          tender_id: winner.tender_id,
          alert_type: 'CAPITAL_INCOMPATIVEL',
          severity: 'MEDIUM',
          cnpj_1: cnpj14,
          cnpj_2: null,
          empresa_1: winner.razao_social || cnpj14,
          empresa_2: null,
          detail: `Vencedora "${winner.razao_social || cnpj14}" tem capital de R$ ${capital.toLocaleString('pt-BR')} para contrato de R$ ${valor.toLocaleString('pt-BR')} (${((capital / valor) * 100).toFixed(2)}%).`,
          metadata: { capital_social: capital, valor_contrato: valor },
        })
        if (saved) alerts++
      }
    } catch (err) {
      logger.error({ err, cnpj: winner.cnpj }, 'Error checking capital')
    }
  }

  logger.info({ alerts }, 'Strategy 3 complete: Capital Incompativel')
  return alerts
}

// ─── Strategy 4: EMPRESA RECENTE (winner opened < 6 months before) ─────────
async function scanEmpresaRecente(): Promise<number> {
  logger.info('Strategy 4: Scanning recently created winners...')

  const { data: winners } = await supabase
    .from('competitors')
    .select('tender_id, cnpj, razao_social, tenders!inner(data_abertura)')
    .eq('is_winner', true)
    .not('tenders.data_abertura', 'is', null)

  if (!winners || winners.length === 0) return 0

  let alerts = 0

  for (const winner of winners) {
    const cnpj14 = formatCnpj14(winner.cnpj)
    const basico = cnpjBasico(winner.cnpj)
    const tenderDate = (winner.tenders as any)?.data_abertura
    if (!tenderDate) continue

    const tenderDateObj = new Date(tenderDate)
    const sixMonthsBefore = new Date(tenderDateObj)
    sixMonthsBefore.setMonth(sixMonthsBefore.getMonth() - 6)

    try {
      const { rows } = await pgPool.query(
        `SELECT data_inicio_atividade FROM empresas WHERE cnpj_basico = $1 LIMIT 1`,
        [basico],
      )

      if (rows.length === 0 || !rows[0].data_inicio_atividade) continue

      const abertura = new Date(rows[0].data_inicio_atividade)
      if (abertura > sixMonthsBefore) {
        const dias = Math.floor((tenderDateObj.getTime() - abertura.getTime()) / 86400000)
        const saved = await saveAlert({
          tender_id: winner.tender_id,
          alert_type: 'EMPRESA_RECENTE',
          severity: 'MEDIUM',
          cnpj_1: cnpj14,
          cnpj_2: null,
          empresa_1: winner.razao_social || cnpj14,
          empresa_2: null,
          detail: `Vencedora "${winner.razao_social || cnpj14}" aberta apenas ${dias} dias antes da licitacao.`,
          metadata: { data_abertura_empresa: rows[0].data_inicio_atividade, dias_antes: dias },
        })
        if (saved) alerts++
      }
    } catch (err) {
      logger.error({ err, cnpj: winner.cnpj }, 'Error checking empresa recente')
    }
  }

  logger.info({ alerts }, 'Strategy 4 complete: Empresa Recente')
  return alerts
}

// ─── Strategy 5: MESMO ENDERECO between competitors ────────────────────────
async function scanMesmoEndereco(): Promise<number> {
  logger.info('Strategy 5: Scanning shared addresses between competitors...')

  // Get tenders with 2+ competitors (reuse tender list)
  const { data: allComps } = await supabase
    .from('competitors')
    .select('tender_id, cnpj, razao_social')

  if (!allComps) return 0

  // Group by tender
  const byTender = new Map<string, Array<{ cnpj: string; razao_social: string }>>()
  for (const c of allComps) {
    if (!byTender.has(c.tender_id)) byTender.set(c.tender_id, [])
    byTender.get(c.tender_id)!.push({ cnpj: c.cnpj, razao_social: c.razao_social })
  }

  let alerts = 0

  for (const [tenderId, comps] of byTender) {
    if (comps.length < 2) continue

    const cnpjs = [...new Set(comps.map(c => formatCnpj14(c.cnpj)))]
    if (cnpjs.length < 2) continue

    try {
      const { rows } = await pgPool.query(
        `SELECT cnpj_basico, logradouro, municipio, uf, numero
         FROM estabelecimentos WHERE cnpj_basico = ANY($1) AND logradouro IS NOT NULL AND municipio IS NOT NULL`,
        [cnpjs.map(c => cnpjBasico(c))],
      )

      if (rows.length < 2) continue

      const addrMap = new Map<string, { cnpjs: string[]; endereco: string }>()
      for (const row of rows) {
        const key = `${(row.logradouro || '').trim().toUpperCase()}|${(row.numero || '').trim().toUpperCase()}|${(row.municipio || '').trim().toUpperCase()}`
        if (!addrMap.has(key)) addrMap.set(key, { cnpjs: [], endereco: `${row.logradouro}${row.numero ? ', ' + row.numero : ''} - ${row.municipio}/${row.uf}` })
        addrMap.get(key)!.cnpjs.push(row.cnpj_basico)
      }

      for (const [_, { cnpjs: addrCnpjs, endereco }] of addrMap) {
        if (addrCnpjs.length < 2) continue
        for (let a = 0; a < addrCnpjs.length; a++) {
          for (let b = a + 1; b < addrCnpjs.length; b++) {
            if (addrCnpjs[a] === addrCnpjs[b]) continue
            const c1 = comps.find(c => cnpjBasico(c.cnpj) === addrCnpjs[a])
            const c2 = comps.find(c => cnpjBasico(c.cnpj) === addrCnpjs[b])
            const saved = await saveAlert({
              tender_id: tenderId,
              alert_type: 'MESMO_ENDERECO',
              severity: 'HIGH',
              cnpj_1: addrCnpjs[a],
              cnpj_2: addrCnpjs[b],
              empresa_1: c1?.razao_social || addrCnpjs[a],
              empresa_2: c2?.razao_social || addrCnpjs[b],
              detail: `${c1?.razao_social || addrCnpjs[a]} e ${c2?.razao_social || addrCnpjs[b]} no mesmo endereco: ${endereco}.`,
              metadata: { endereco },
            })
            if (saved) alerts++
          }
        }
      }
    } catch (err) {
      logger.error({ err, tenderId }, 'Error checking endereco')
    }
  }

  logger.info({ alerts }, 'Strategy 5 complete: Mesmo Endereco')
  return alerts
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────
async function run() {
  logger.info('=== Starting fraud detection cycle (top-down) ===')

  const results = {
    sancionadas: 0,
    sociosEmComum: 0,
    capitalIncompativel: 0,
    empresaRecente: 0,
    mesmoEndereco: 0,
  }

  // Run strategies in priority order (highest impact first)
  results.sancionadas = await scanSancionadas()
  results.sociosEmComum = await scanSociosEmComum()
  results.capitalIncompativel = await scanCapitalIncompativel()
  results.empresaRecente = await scanEmpresaRecente()
  // Strategy 5 disabled: requires estabelecimentos table (address data not yet imported)
  // results.mesmoEndereco = await scanMesmoEndereco()

  const totalNew = Object.values(results).reduce((a, b) => a + b, 0)

  // Mark ALL tenders with competitors as fraud_analyzed
  const { data: compTenders } = await supabase
    .from('competitors')
    .select('tender_id')

  if (compTenders) {
    const uniqueIds = [...new Set(compTenders.map(c => c.tender_id))]
    for (let i = 0; i < uniqueIds.length; i += 50) {
      const batch = uniqueIds.slice(i, i + 50)
      await supabase
        .from('tenders')
        .update({ fraud_analyzed: true })
        .in('id', batch)
    }
    logger.info({ marked: uniqueIds.length }, 'Marked tenders as fraud_analyzed')
  }

  logger.info({ results, totalNewAlerts: totalNew }, '=== Fraud detection cycle complete ===')
}

// ─── Entry Point ────────────────────────────────────────────────────────────
async function main() {
  logger.info('Fraud Detector Worker started (top-down strategy)')

  try {
    await pgPool.query('SELECT 1')
    logger.info('Local PostgreSQL connection verified')
  } catch (err) {
    logger.fatal({ err }, 'Cannot connect to local PostgreSQL')
    process.exit(1)
  }

  // Count available data
  const { rows: [{ count: sancoesCount }] } = await pgPool.query('SELECT count(DISTINCT cpf_cnpj) as count FROM sancoes')
  const { rows: [{ count: sociosCount }] } = await pgPool.query('SELECT count(*) as count FROM socios')
  const { rows: [{ count: empresasCount }] } = await pgPool.query('SELECT count(*) as count FROM empresas')

  logger.info(
    { sancoes: Number(sancoesCount), socios: Number(sociosCount), empresas: Number(empresasCount) },
    'Reference data loaded',
  )

  await run()
  setInterval(run, RUN_INTERVAL_MS)
}

main().catch(err => {
  logger.fatal({ err }, 'Fraud Detector Worker crashed')
  process.exit(1)
})
