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
interface FraudAlert {
  tender_id: string
  alert_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  evidence: Record<string, unknown>
  cnpjs_envolvidos: string[]
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

async function saveAlert(alert: FraudAlert) {
  const { error } = await supabase
    .from('fraud_alerts')
    .upsert(alert, { onConflict: 'tender_id,alert_type,cnpjs_envolvidos' })

  if (error) {
    logger.error({ error, alert_type: alert.alert_type, tender_id: alert.tender_id }, 'Failed to save fraud alert')
  }
}

// ─── Detection 1: Socio em comum ────────────────────────────────────────────
async function detectSocioEmComum(tenderId: string, competitors: Competitor[]) {
  if (competitors.length < 2) return

  const cnpjs = competitors.map(c => formatCnpj14(c.cnpj))

  try {
    const result = await pgPool.query(
      `SELECT cnpj, nome_socio, cnpj_cpf_socio
       FROM socios
       WHERE cnpj = ANY($1)
       ORDER BY cnpj, nome_socio`,
      [cnpjs],
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

    // Find socios present in 2+ competitors of this tender
    for (const [_key, { cnpjs: socioCnpjs, nome }] of socioMap) {
      if (socioCnpjs.size >= 2) {
        const cnpjsEnvolvidos = Array.from(socioCnpjs)
        await saveAlert({
          tender_id: tenderId,
          alert_type: 'socio_em_comum',
          severity: 'high',
          description: `Padrao detectado: socio "${nome}" aparece em ${socioCnpjs.size} empresas concorrentes nesta licitacao.`,
          evidence: {
            socio_nome: nome,
            empresas: cnpjsEnvolvidos,
            total_empresas: socioCnpjs.size,
          },
          cnpjs_envolvidos: cnpjsEnvolvidos,
        })
      }
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
        await saveAlert({
          tender_id: tenderId,
          alert_type: 'empresa_recente',
          severity: 'medium',
          description: `Padrao detectado: empresa vencedora "${winner.razao_social || winner.cnpj}" foi aberta em ${abertura}, menos de 6 meses antes da licitacao.`,
          evidence: {
            cnpj: winner.cnpj,
            razao_social: winner.razao_social,
            data_abertura: abertura,
            data_licitacao: tenderDate,
            dias_antes: Math.floor((tenderDateObj.getTime() - aberturaDate.getTime()) / (1000 * 60 * 60 * 24)),
          },
          cnpjs_envolvidos: [winner.cnpj],
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
          alert_type: 'capital_incompativel',
          severity: 'medium',
          description: `Padrao detectado: empresa vencedora "${winner.razao_social || winner.cnpj}" tem capital social de R$ ${capitalSocial.toLocaleString('pt-BR')} para contrato de R$ ${valorContrato.toLocaleString('pt-BR')}.`,
          evidence: {
            cnpj: winner.cnpj,
            razao_social: winner.razao_social,
            capital_social: capitalSocial,
            valor_contrato: valorContrato,
            percentual: ((capitalSocial / valorContrato) * 100).toFixed(4),
          },
          cnpjs_envolvidos: [winner.cnpj],
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
        alert_type: 'sancionada',
        severity: 'critical',
        description: `Padrao detectado: empresa "${comp?.razao_social || cnpj}" possui ${sancoes.length} sancao(oes) registrada(s).`,
        evidence: {
          cnpj,
          razao_social: comp?.razao_social,
          sancoes: sancoes.map(s => ({
            tipo: s.tipo_sancao,
            orgao: s.orgao_sancionador,
            inicio: s.data_inicio,
            fim: s.data_fim,
          })),
        },
        cnpjs_envolvidos: [cnpj],
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

  try {
    const result = await pgPool.query(
      `SELECT cnpj, logradouro, municipio, uf, numero
       FROM empresas
       WHERE cnpj = ANY($1) AND logradouro IS NOT NULL AND municipio IS NOT NULL`,
      [cnpjs],
    )

    if (result.rows.length < 2) return

    // Group by address key (logradouro + municipio)
    const addressMap = new Map<string, { cnpjs: string[]; endereco: string }>()
    for (const row of result.rows) {
      const key = `${(row.logradouro || '').trim().toUpperCase()}|${(row.municipio || '').trim().toUpperCase()}`
      if (!addressMap.has(key)) {
        addressMap.set(key, {
          cnpjs: [],
          endereco: `${row.logradouro}${row.numero ? ', ' + row.numero : ''} - ${row.municipio}/${row.uf}`,
        })
      }
      addressMap.get(key)!.cnpjs.push(row.cnpj)
    }

    for (const [_key, { cnpjs: addrCnpjs, endereco }] of addressMap) {
      if (addrCnpjs.length >= 2) {
        await saveAlert({
          tender_id: tenderId,
          alert_type: 'mesmo_endereco',
          severity: 'high',
          description: `Padrao detectado: ${addrCnpjs.length} empresas concorrentes compartilham o endereco "${endereco}".`,
          evidence: {
            endereco,
            empresas: addrCnpjs,
            total_empresas: addrCnpjs.length,
          },
          cnpjs_envolvidos: addrCnpjs,
        })
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
  valor_total?: number
}) {
  // Get competitors for this tender
  const { data: competitors, error } = await supabase
    .from('competitors')
    .select('cnpj, razao_social, valor_proposta, is_winner')
    .eq('tender_id', tender.id)

  if (error || !competitors || competitors.length === 0) return

  const tenderDate = tender.data_abertura || tender.data_publicacao || null
  const valorContrato = tender.valor_total || tender.valor_estimado || null

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
      .select('id, data_abertura, data_publicacao, valor_estimado, valor_total')
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
