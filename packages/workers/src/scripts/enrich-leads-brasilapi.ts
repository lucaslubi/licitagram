/**
 * Standalone enrichment for admin_leads_fornecedores via BrasilAPI.
 *
 * Usage:
 *   npx tsx src/scripts/enrich-leads-brasilapi.ts --limit=100 --priority=HOT --dry-run
 *   npx tsx src/scripts/enrich-leads-brasilapi.ts --limit=2000 --priority=HOT
 *   npx tsx src/scripts/enrich-leads-brasilapi.ts --limit=5000 --priority=WARM
 *
 * Pulls cnpj data from BrasilAPI (no API key needed) and updates:
 *   email_institucional_generico/_fonte/_validado, telefone_comercial/_fonte,
 *   natureza_juridica, situacao_cadastral, bloqueado_disparo (cnpj_inativo / orgao_publico_rfb).
 *
 * One-off backfill — not a worker. Run from laptop or VPS1.
 */
import { Client } from 'pg'

const PG_CFG = {
  host: '85.31.60.53',
  port: 5432,
  user: 'postgres',
  password: 'pg2026secure',
  database: 'licitagram_data',
}

const RATE_LIMIT_MS = 1100 // ~55 req/min — BrasilAPI tolerates this
const PUBLIC_RFB_CODES = new Set<string>([
  '1015','1023','1031','1040','1058','1066','1074','1082','1104','1112','1120','1139',
  '1147','1155','1163','1171','1180','1198','1201','1210','1228','1236','1244','1252',
  '1260','1279','1287','1295','1325','1333','1341','1368','1376','1384','1392','1406',
  '1414','1422','1430','1449','1457','1465','1473','1481','2011','3034',
])

interface BrasilApiCnpj {
  email?: string | null
  ddd_telefone_1?: string | null
  telefone_1?: string | null
  codigo_natureza_juridica?: number | string | null
  descricao_situacao_cadastral?: string | null
}

async function main() {
  const args = process.argv.slice(2)
  const limit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '100', 10)
  const priorityFilter = args.find((a) => a.startsWith('--priority='))?.split('=')[1]
  const dryRun = args.includes('--dry-run')

  const pg = new Client(PG_CFG)
  await pg.connect()

  const where: string[] = [
    'NOT bloqueado_disparo',
    "(email_institucional_generico IS NULL OR email_institucional_generico = '')",
    'ja_e_cliente_licitagram = false',
    'cnpj IS NOT NULL',
  ]
  if (priorityFilter) where.push(`prioridade_outreach = '${priorityFilter}'`)

  const { rows: leads } = await pg.query<{ id: string; cnpj: string; razao_social: string }>(
    `SELECT id, cnpj, razao_social FROM admin_leads_fornecedores
     WHERE ${where.join(' AND ')}
     ORDER BY score_fit_licitagram DESC NULLS LAST
     LIMIT $1`,
    [limit],
  )

  console.log(
    `[enrich] ${leads.length} leads to enrich (priority=${priorityFilter || 'ALL'}, dryRun=${dryRun})`,
  )

  const stats = {
    processed: 0,
    ok: 0,
    with_email: 0,
    no_email: 0,
    error_404: 0,
    error_other: 0,
    blocked_inativo: 0,
    blocked_publico: 0,
  }

  const startedAt = Date.now()

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i]
    const cnpj = lead.cnpj.replace(/\D/g, '')
    if (cnpj.length !== 14) {
      stats.error_other++
      continue
    }

    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { 'User-Agent': 'Licitagram-Enrichment/1.0' },
        signal: AbortSignal.timeout(15000),
      })

      if (r.status === 404) {
        if (!dryRun) {
          await pg.query(
            `UPDATE admin_leads_fornecedores
             SET bloqueado_disparo=true, motivo_bloqueio='cnpj_invalido_rfb',
                 ultima_atualizacao_enriquecimento=NOW()
             WHERE id=$1`,
            [lead.id],
          )
        }
        stats.error_404++
      } else if (!r.ok) {
        console.warn(`[enrich] ${cnpj} HTTP ${r.status}`)
        stats.error_other++
      } else {
        const data = (await r.json()) as BrasilApiCnpj
        const email = ((data.email || '') as string).trim()
        const ddd = (data.ddd_telefone_1 || '') as string
        const tel = (data.telefone_1 || '') as string
        const telCombined = `${ddd}${tel}`.replace(/\D/g, '') || null
        const naturezaCodigo = String(data.codigo_natureza_juridica ?? '').padStart(4, '0')
        const situacao = (data.descricao_situacao_cadastral || '') as string
        const isActive = situacao.toUpperCase().includes('ATIVA')
        const isPublicCode = PUBLIC_RFB_CODES.has(naturezaCodigo)

        if (!dryRun) {
          await pg.query(
            `UPDATE admin_leads_fornecedores SET
              email_institucional_generico = COALESCE(NULLIF($2,''), email_institucional_generico),
              email_institucional_fonte = CASE WHEN $2 ~ '@' THEN 'RFB_CADASTRAL'::email_fonte_enum ELSE email_institucional_fonte END,
              email_institucional_validado = ($2 ~ '@'),
              telefone_comercial = COALESCE($3, telefone_comercial),
              telefone_fonte = CASE WHEN $3 IS NOT NULL THEN 'RFB_CADASTRAL'::telefone_fonte_enum ELSE telefone_fonte END,
              natureza_juridica = COALESCE(NULLIF($4,''), natureza_juridica),
              situacao_cadastral = COALESCE(NULLIF($5,''), situacao_cadastral),
              bloqueado_disparo = (bloqueado_disparo OR NOT $6 OR $7),
              motivo_bloqueio = CASE
                WHEN NOT $6 THEN 'cnpj_inativo'
                WHEN $7 THEN 'orgao_publico_rfb'
                ELSE motivo_bloqueio END,
              prioridade_outreach = CASE
                WHEN (NOT $6 OR $7) THEN 'NAO_DISPARAR'::prioridade_outreach_enum
                ELSE prioridade_outreach END,
              ultima_atualizacao_enriquecimento = NOW()
             WHERE id=$1`,
            [lead.id, email, telCombined, naturezaCodigo, situacao, isActive, isPublicCode],
          )
        }

        if (email && email.includes('@')) stats.with_email++
        else stats.no_email++
        if (!isActive) stats.blocked_inativo++
        if (isPublicCode) stats.blocked_publico++
        stats.ok++
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[enrich] ${cnpj} error: ${msg}`)
      stats.error_other++
    }

    stats.processed++
    if (stats.processed % 50 === 0) {
      const elapsedSec = (Date.now() - startedAt) / 1000
      const rate = stats.processed / elapsedSec
      const etaMin = ((leads.length - stats.processed) / rate / 60).toFixed(1)
      console.log(
        `[enrich] ${stats.processed}/${leads.length} | rate=${rate.toFixed(2)}/s | eta=${etaMin}min | ok=${stats.ok} email=${stats.with_email} 404=${stats.error_404}`,
      )
    }

    await new Promise((res) => setTimeout(res, RATE_LIMIT_MS))
  }

  const elapsedSec = (Date.now() - startedAt) / 1000
  console.log(`\n[enrich] DONE in ${(elapsedSec / 60).toFixed(1)}min`)
  console.log('[enrich] FINAL STATS:', JSON.stringify(stats, null, 2))
  if (stats.ok > 0) {
    console.log(
      `[enrich] email coverage: ${((stats.with_email / stats.ok) * 100).toFixed(1)}% (${stats.with_email}/${stats.ok})`,
    )
  }
  await pg.end()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
