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

interface Competitor {
  cnpj: string
  razao_social?: string
  valor_proposta?: number
  is_winner?: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatCnpj14(cnpj: string): string {
  return cnpj.replace(/\D/g, '').padStart(14, '0')
}

/** Normalize pair key so A-B and B-A are the same */
function pairKey(cnpj1: string, cnpj2: string): string {
  return [cnpj1, cnpj2].sort().join('|')
}

async function saveAlert(alert: FraudAlertRow) {
  // CRITICAL: never save self-comparison
  if (alert.cnpj_1 && alert.cnpj_2 && formatCnpj14(alert.cnpj_1) === formatCnpj14(alert.cnpj_2)) {
    logger.warn({ cnpj: alert.cnpj_1, alert_type: alert.alert_type }, 'Skipping self-comparison alert')
    return
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
    // Ignore duplicate constraint violations
    if (error.code === '23505') {
      logger.debug({ alert_type: alert.alert_type, tender_id: alert.tender_id }, 'Duplicate alert skipped')
      return
    }
    logger.error({ error, alert_type: alert.alert_type, tender_id: alert.tender_id }, 'Failed to save fraud alert')
  }
}

// ─── Detection 1: Socio em comum ────────────────────────────────────────────
async function detectSocioEmComum(tenderId: string, competitors: Competitor[]) {
  if (competitors.length < 2) return

  const cnpjs = competitors.map(c => formatCnpj14(c.cnpj))
  // Remove duplicates (same CNPJ appearing multiple times as competitor)
  const uniqueCnpjs = [...new Set(cnpjs)]
  if (uniqueCnpjs.length < 2) return

  try {
    const result = await pgPool.query(
      `SELECT cnpj, nome_socio, cnpj_cpf_socio
       FROM socios
       WHERE cnpj = ANY($1)
       ORDER BY cnpj, nome_socio`,
      [uniqueCnpjs],
    )

    // Group socios by identifier (cpf/name)
    const socioMap = new Map<string, { cnpjs: Set<string>; nome: string }>()
    for (const row of result.rows) {
      const key = row.cnpj_cpf_socio || row.nome_socio
      if (!key) continue
      if (!socioMap.has(key)) {
        socioMap.set(key, { cnpjs: new Set(), nome: row.nome_socio })
      }
      socioMap.get(key)!.cnpjs.add(row.cnpj)
    }

    // Find socios present in 2+ DIFFERENT competitors of this tender
    // Group shared socios by pair of companies to consolidate
    const pairAlerts = new Map<string, { cnpj1: string; cnpj2: string; socios: string[] }>()

    for (const [_key, { cnpjs: socioCnpjs, nome }] of socioMap) {
      if (socioCnpjs.size < 2) continue

      const cnpjArr = Array.from(socioCnpjs)
      // Generate all unique pairs (avoid self-comparison)
      for (let i = 0; i < cnpjArr.length; i++) {
        for (let j = i + 1; j < cnpjArr.length; j++) {
          // CRITICAL: skip if same CNPJ
          if (cnpjArr[i] === cnpjArr[j]) continue

          const pk = pairKey(cnpjArr[i], cnpjArr[j])
          if (!pairAlerts.has(pk)) {
            pairAlerts.set(pk, { cnpj1: cnpjArr[i], cnpj2: cnpjArr[j], socios: [] })
          }
          // Add socio name if not already there
          const entry = pairAlerts.get(pk)!
          if (!entry.socios.includes(nome)) {
            entry.socios.push(nome)
          }
        }
      }
    }

    // Save one alert per unique pair
    for (const [_pk, { cnpj1, cnpj2, socios }] of pairAlerts) {
      const comp1 = competitors.find(c => formatCnpj14(c.cnpj) === cnpj1)
      const comp2 = competitors.find(c => formatCnpj14(c.cnpj) === cnpj2)

      const nome1 = comp1?.razao_social || cnpj1
      const nome2 = comp2?.razao_social || cnpj2

      const maskedSocio = socios[0] // First shared partner for detail text
      const totalSocios = socios.length

      await saveAlert({
        tender_id: tenderId,
        alert_type: 'SOCIO_EM_COMUM',
        severity: 'HIGH',
        cnpj_1: cnpj1,
        cnpj_2: cnpj2,
        empresa_1: nome1,
        empresa_2: nome2,
        detail: `${nome1} e ${nome2} compartilham socio ${maskedSocio}. ${totalSocios} socio(s) em comum.`,
        metadata: {
          socios,
        },
      })
    }
  } catch (err) {
    logger.error({ err, tenderId }, 'Error in detectSocioEmComum')
  }
}

// ─── Detection 2: Empresa recente ───────────────────────────────────────────
async function detectEmpresaRecente(tenderId: string, competitors: Competitor[], tenderDate: string | null) {
  if (!tenderDate) return

  const winners = competitors.filter(c => c.is_winner)
  if (winners.length === 0) return

  const tenderDateObj = new Date(tenderDate)
  const sixMonthsBefore = new Date(tenderDateObj)
  sixMonthsBefore.setMonth(sixMonthsBefore.getMonth() - 6)

  for (const winner of winners) {
    const cnpj14 = formatCnpj14(winner.cnpj)

    try {
      const result = await pgPool.query(
        `SELECT data_inicio_atividade FROM empresas WHERE cnpj = $1 LIMIT 1`,
        [cnpj14],
      )

      if (result.rows.length === 0) continue

      const abertura = result.rows[0].data_inicio_atividade
      if (!abertura) continue

      const aberturaDate = new Date(abertura)
      if (aberturaDate > sixMonthsBefore) {
        const diasAntes = Math.floor((tenderDateObj.getTime() - aberturaDate.getTime()) / (1000 * 60 * 60 * 24))

        await saveAlert({
          tender_id: tenderId,
          alert_type: 'EMPRESA_RECENTE',
          severity: 'MEDIUM',
          cnpj_1: cnpj14,
          cnpj_2: null,
          empresa_1: winner.razao_social || cnpj14,
          empresa_2: null,
          detail: `Empresa vencedora "${winner.razao_social || cnpj14}" foi aberta em ${abertura}, apenas ${diasAntes} dias antes da licitacao.`,
          metadata: {
            data_abertura_empresa: abertura,
            data_licitacao: tenderDate,
            dias_antes: diasAntes,
          },
        })
      }
    } catch (err) {
      logger.error({ err, tenderId, cnpj: winner.cnpj }, 'Error in detectEmpresaRecente')
    }
  }
}

// ─── Detection 3: Capital incompativel ──────────────────────────────────────
async function detectCapitalIncompativel(tenderId: string, competitors: Competitor[], valorContrato: number | null) {
  if (!valorContrato || valorContrato <= 0) return

  const winners = competitors.filter(c => c.is_winner)
  if (winners.length === 0) return

  const threshold = valorContrato * 0.01 // 1% of contract value

  for (const winner of winners) {
    const cnpj14 = formatCnpj14(winner.cnpj)

    try {
      const result = await pgPool.query(
        `SELECT capital_social FROM empresas WHERE cnpj = $1 LIMIT 1`,
        [cnpj14],
      )

      if (result.rows.length === 0) continue

      const capitalSocial = Number(result.rows[0].capital_social)
      if (!capitalSocial || capitalSocial <= 0) continue

      if (capitalSocial < threshold) {
        await saveAlert({
          tender_id: tenderId,
          alert_type: 'CAPITAL_INCOMPATIVEL',
          severity: 'MEDIUM',
          cnpj_1: cnpj14,
          cnpj_2: null,
          empresa_1: winner.razao_social || cnpj14,
          empresa_2: null,
          detail: `Empresa vencedora "${winner.razao_social || cnpj14}" tem capital social de R$ ${capitalSocial.toLocaleString('pt-BR')} para contrato de R$ ${valorContrato.toLocaleString('pt-BR')} (${((capitalSocial / valorContrato) * 100).toFixed(2)}%).`,
          metadata: {
            capital_social: capitalSocial,
            valor_contrato: valorContrato,
            percentual: ((capitalSocial / valorContrato) * 100).toFixed(4),
          },
        })
      }
    } catch (err) {
      logger.error({ err, tenderId, cnpj: winner.cnpj }, 'Error in detectCapitalIncompativel')
    }
  }
}

// ─── Detection 4: Sancionada ────────────────────────────────────────────────
async function detectSancionada(tenderId: string, competitors: Competitor[]) {
  const cnpjs = competitors.map(c => formatCnpj14(c.cnpj))

  try {
    const result = await pgPool.query(
      `SELECT DISTINCT cnpj, tipo_sancao, orgao_sancionador, data_inicio, data_fim
       FROM sancoes
       WHERE cnpj = ANY($1)`,
      [cnpjs],
    )

    if (result.rows.length === 0) return

    // Group by CNPJ
    const sancoesMap = new Map<string, typeof result.rows>()
    for (const row of result.rows) {
      if (!sancoesMap.has(row.cnpj)) sancoesMap.set(row.cnpj, [])
      sancoesMap.get(row.cnpj)!.push(row)
    }

    for (const [cnpj, sancoes] of sancoesMap) {
      const comp = competitors.find(c => formatCnpj14(c.cnpj) === cnpj)
      await saveAlert({
        tender_id: tenderId,
        alert_type: 'EMPRESA_SANCIONADA',
        severity: 'CRITICAL',
        cnpj_1: cnpj,
        cnpj_2: null,
        empresa_1: comp?.razao_social || cnpj,
        empresa_2: null,
        detail: `Empresa "${comp?.razao_social || cnpj}" possui ${sancoes.length} sancao(oes) registrada(s) no CEIS/CNEP e participa desta licitacao.`,
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
  } catch (err) {
    logger.error({ err, tenderId }, 'Error in detectSancionada')
  }
}

// ─── Detection 5: Mesmo endereco ────────────────────────────────────────────
async function detectMesmoEndereco(tenderId: string, competitors: Competitor[]) {
  if (competitors.length < 2) return

  const cnpjs = competitors.map(c => formatCnpj14(c.cnpj))
  const uniqueCnpjs = [...new Set(cnpjs)]
  if (uniqueCnpjs.length < 2) return

  try {
    const result = await pgPool.query(
      `SELECT cnpj, logradouro, municipio, uf, numero
       FROM empresas
       WHERE cnpj = ANY($1) AND logradouro IS NOT NULL AND municipio IS NOT NULL`,
      [uniqueCnpjs],
    )

    if (result.rows.length < 2) return

    // Group by address key (logradouro + municipio + numero)
    const addressMap = new Map<string, { cnpjs: string[]; endereco: string }>()
    for (const row of result.rows) {
      const key = `${(row.logradouro || '').trim().toUpperCase()}|${(row.numero || '').trim().toUpperCase()}|${(row.municipio || '').trim().toUpperCase()}`
      if (!addressMap.has(key)) {
        addressMap.set(key, {
          cnpjs: [],
          endereco: `${row.logradouro}${row.numero ? ', ' + row.numero : ''} - ${row.municipio}/${row.uf}`,
        })
      }
      addressMap.get(key)!.cnpjs.push(row.cnpj)
    }

    for (const [_key, { cnpjs: addrCnpjs, endereco }] of addressMap) {
      if (addrCnpjs.length < 2) continue

      // Generate alerts for each unique pair at the same address
      for (let i = 0; i < addrCnpjs.length; i++) {
        for (let j = i + 1; j < addrCnpjs.length; j++) {
          // CRITICAL: skip if same CNPJ
          if (addrCnpjs[i] === addrCnpjs[j]) continue

          const comp1 = competitors.find(c => formatCnpj14(c.cnpj) === addrCnpjs[i])
          const comp2 = competitors.find(c => formatCnpj14(c.cnpj) === addrCnpjs[j])

          await saveAlert({
            tender_id: tenderId,
            alert_type: 'MESMO_ENDERECO',
            severity: 'HIGH',
            cnpj_1: addrCnpjs[i],
            cnpj_2: addrCnpjs[j],
            empresa_1: comp1?.razao_social || addrCnpjs[i],
            empresa_2: comp2?.razao_social || addrCnpjs[j],
            detail: `${comp1?.razao_social || addrCnpjs[i]} e ${comp2?.razao_social || addrCnpjs[j]} concorrem na mesma licitacao e estao registradas no mesmo endereco: ${endereco}.`,
            metadata: {
              endereco,
              total_empresas_no_endereco: addrCnpjs.length,
            },
          })
        }
      }
    }
  } catch (err) {
    logger.error({ err, tenderId }, 'Error in detectMesmoEndereco')
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────────────
async function analyzeTender(tender: {
  id: string
  data_abertura?: string
  data_publicacao?: string
  valor_estimado?: number
}) {
  // Get competitors for this tender
  const { data: competitors, error } = await supabase
    .from('competitors')
    .select('cnpj, razao_social, valor_proposta, is_winner')
    .eq('tender_id', tender.id)

  if (error || !competitors || competitors.length === 0) return

  const tenderDate = tender.data_abertura || tender.data_publicacao || null
  const valorContrato = tender.valor_estimado || null

  await Promise.all([
    detectSocioEmComum(tender.id, competitors),
    detectEmpresaRecente(tender.id, competitors, tenderDate),
    detectCapitalIncompativel(tender.id, competitors, valorContrato),
    detectSancionada(tender.id, competitors),
    detectMesmoEndereco(tender.id, competitors),
  ])
}

async function run() {
  logger.info('Starting fraud detection cycle')

  let offset = 0
  let totalAnalyzed = 0

  while (true) {
    // Get tenders that have results imported but not yet analyzed for fraud
    const { data: tenders, error } = await supabase
      .from('tenders')
      .select('id, data_abertura, data_publicacao, valor_estimado')
      .eq('resultado_importado', true)
      .or('fraud_analyzed.is.null,fraud_analyzed.eq.false')
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      logger.error({ error }, 'Failed to query tenders for fraud analysis')
      break
    }

    if (!tenders || tenders.length === 0) break

    for (const tender of tenders) {
      await analyzeTender(tender)

      // Mark as analyzed
      await supabase
        .from('tenders')
        .update({ fraud_analyzed: true, fraud_analyzed_at: new Date().toISOString() })
        .eq('id', tender.id)

      totalAnalyzed++
    }

    offset += BATCH_SIZE
    if (tenders.length < BATCH_SIZE) break
  }

  logger.info({ totalAnalyzed }, 'Fraud detection cycle complete')
}

// ─── Entry Point ────────────────────────────────────────────────────────────
async function main() {
  logger.info('Fraud Detector Worker started')

  // Verify PostgreSQL connection
  try {
    await pgPool.query('SELECT 1')
    logger.info('Local PostgreSQL connection verified')
  } catch (err) {
    logger.fatal({ err }, 'Cannot connect to local PostgreSQL')
    process.exit(1)
  }

  await run()
  setInterval(run, RUN_INTERVAL_MS)
}

main().catch(err => {
  logger.fatal({ err }, 'Fraud Detector Worker crashed')
  process.exit(1)
})
