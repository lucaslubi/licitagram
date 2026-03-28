import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import pino from 'pino'

// ─── Config ─────────────────────────────────────────────────────────────────
const logger = pino({ name: 'cnpj-enrichment-worker', level: process.env.LOG_LEVEL || 'info' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Local PostgreSQL on VPS2 (85.31.60.53)
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

const BATCH_SIZE = 100
const RUN_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatCnpj14(cnpj: string): string {
  return cnpj.replace(/\D/g, '').padStart(14, '0')
}

// ─── Main Logic ─────────────────────────────────────────────────────────────
async function enrichBatch() {
  // Get un-enriched competitor_stats rows
  const { data: rows, error } = await supabase
    .from('competitor_stats')
    .select('id, cnpj')
    .or('enriched.is.null,enriched.eq.false,cnae_codigo.is.null')
    .limit(BATCH_SIZE)

  if (error) {
    logger.error({ error }, 'Failed to query competitor_stats')
    return 0
  }

  if (!rows || rows.length === 0) return 0

  let enriched = 0

  for (const row of rows) {
    const cnpj14 = formatCnpj14(row.cnpj)

    try {
      // Query empresa data from local PostgreSQL
      const empresaResult = await pgPool.query(
        `SELECT
          razao_social,
          cnae_fiscal,
          descricao_cnae_principal,
          porte_empresa,
          capital_social,
          data_inicio_atividade,
          natureza_juridica,
          uf,
          municipio,
          logradouro,
          numero,
          bairro,
          cep,
          situacao_cadastral,
          data_situacao_cadastral
        FROM empresas
        WHERE cnpj = $1
        LIMIT 1`,
        [cnpj14],
      )

      const empresa = empresaResult.rows[0]

      // Query socios from local PostgreSQL
      const sociosResult = await pgPool.query(
        `SELECT
          nome_socio,
          cnpj_cpf_socio,
          codigo_qualificacao_socio,
          data_entrada_sociedade,
          faixa_etaria
        FROM socios
        WHERE cnpj = $1
        ORDER BY data_entrada_sociedade DESC`,
        [cnpj14],
      )

      const socios = sociosResult.rows

      // Build update payload
      const updateData: Record<string, unknown> = {
        enriched: true,
        enriched_at: new Date().toISOString(),
        socios_count: socios.length,
        socios: socios.length > 0 ? socios : null,
      }

      if (empresa) {
        Object.assign(updateData, {
          razao_social: empresa.razao_social,
          cnae_codigo: empresa.cnae_fiscal ? String(empresa.cnae_fiscal) : null,
          cnae_descricao: empresa.descricao_cnae_principal || null,
          porte: empresa.porte_empresa || null,
          capital_social: empresa.capital_social ? Number(empresa.capital_social) : null,
          data_abertura: empresa.data_inicio_atividade || null,
          natureza_juridica: empresa.natureza_juridica || null,
          uf: empresa.uf || null,
          municipio: empresa.municipio || null,
          logradouro: empresa.logradouro || null,
          numero: empresa.numero || null,
          bairro: empresa.bairro || null,
          cep: empresa.cep || null,
          situacao_cadastral: empresa.situacao_cadastral || null,
        })
      } else {
        // CNPJ not found in local DB — mark as enriched but flag it
        updateData.enrichment_note = 'CNPJ not found in local database'
      }

      const { error: updateError } = await supabase
        .from('competitor_stats')
        .update(updateData)
        .eq('id', row.id)

      if (updateError) {
        logger.error({ updateError, cnpj: row.cnpj }, 'Failed to update competitor_stats')
      } else {
        enriched++
      }
    } catch (err) {
      logger.error({ err, cnpj: row.cnpj }, 'Error enriching CNPJ')
    }
  }

  return enriched
}

async function run() {
  logger.info('Starting CNPJ enrichment cycle')

  let totalEnriched = 0
  let batchCount: number

  do {
    batchCount = await enrichBatch()
    totalEnriched += batchCount
  } while (batchCount === BATCH_SIZE) // Continue if there might be more

  logger.info({ totalEnriched }, 'CNPJ enrichment cycle complete')
}

// ─── Entry Point ────────────────────────────────────────────────────────────
async function main() {
  logger.info('CNPJ Enrichment Worker started')

  // Verify PostgreSQL connection
  try {
    const res = await pgPool.query('SELECT 1')
    logger.info('Local PostgreSQL connection verified')
  } catch (err) {
    logger.fatal({ err }, 'Cannot connect to local PostgreSQL')
    process.exit(1)
  }

  await run()
  setInterval(run, RUN_INTERVAL_MS)
}

main().catch(err => {
  logger.fatal({ err }, 'CNPJ Enrichment Worker crashed')
  process.exit(1)
})
