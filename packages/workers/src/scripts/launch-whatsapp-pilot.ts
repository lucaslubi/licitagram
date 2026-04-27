/**
 * Pilot launch script: top 50 HOT ENTERPRISE leads → outbound-personalize queue.
 *
 * Run dry-run first:
 *   npx tsx src/scripts/launch-whatsapp-pilot.ts --dry-run
 *
 * Run for real:
 *   npx tsx src/scripts/launch-whatsapp-pilot.ts
 *
 * Tweak with env:
 *   PILOT_LIMIT=50 PILOT_PRIORIDADE=HOT PILOT_PLANO=ENTERPRISE
 */
import 'dotenv/config'
import IORedis from 'ioredis'
import { Queue } from 'bullmq'
import { randomUUID } from 'node:crypto'
import { localPool } from '../lib/local-db'
import { supabase } from '../lib/supabase'
import { normalizeBrPhone } from '../lib/phone'
import { fetchOpportunities, buildMessage } from '../lib/outbound-templates'
import type { OutboundPersonalizeJobData } from '../queues/outbound-personalize.queue'

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = Number(process.env.PILOT_LIMIT || 50)
const PRIORIDADE = process.env.PILOT_PRIORIDADE || 'HOT'
const PLANO = process.env.PILOT_PLANO || 'ENTERPRISE'

interface LeadRow {
  id: string
  cnpj: string
  razao_social: string
  telefone_comercial: string | null
  cnae_principal_codigo: string | null
  uf: string | null
  total_licitacoes_ganhas_total: number | null
  valor_total_contratos_ganhos_total: number | null
}

async function main() {
  console.log(`[pilot] mode=${DRY_RUN ? 'DRY-RUN' : 'LIVE'} limit=${LIMIT} prioridade=${PRIORIDADE} plano=${PLANO}`)

  // Pull eligible leads from VPS2
  const { rows: leads } = await localPool.query<LeadRow>(
    `
    SELECT id::text, cnpj, razao_social, telefone_comercial,
           cnae_principal_codigo, uf,
           total_licitacoes_ganhas_total,
           valor_total_contratos_ganhos_total
    FROM admin_leads_fornecedores
    WHERE prioridade_outreach = $1
      AND plano_recomendado = $2
      AND telefone_comercial IS NOT NULL
      AND length(regexp_replace(telefone_comercial, '\\D','','g')) >= 10
      AND COALESCE(bloqueado_disparo, false) = false
      AND COALESCE(opt_out, false) = false
      AND COALESCE(ja_e_cliente_licitagram, false) = false
    ORDER BY score_fit_licitagram DESC NULLS LAST
    LIMIT $3
    `,
    [PRIORIDADE, PLANO, LIMIT],
  )

  console.log(`[pilot] ${leads.length} leads found`)

  // Fetch already-opted-out CNPJs to filter early
  const cnpjs = leads.map((l) => l.cnpj)
  const { data: optouts } = await supabase
    .from('outbound_optouts')
    .select('cnpj')
    .in('cnpj', cnpjs)
    .eq('channel', 'whatsapp')
  const optedOut = new Set((optouts || []).map((o: any) => o.cnpj as string))

  const campaignId = randomUUID()
  console.log(`[pilot] campaign=${campaignId}`)

  let prepared = 0
  let skippedPhone = 0
  let skippedOpt = 0
  let skippedNoOpps = 0
  const samples: Array<{ cnpj: string; phone: string; preview: string }> = []

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: building messages without enqueue or DB writes ---\n')
    for (const lead of leads) {
      if (optedOut.has(lead.cnpj)) {
        skippedOpt++
        continue
      }
      const phone = normalizeBrPhone(lead.telefone_comercial)
      if (!phone) {
        skippedPhone++
        continue
      }
      const opps = await fetchOpportunities(lead.cnae_principal_codigo, lead.uf)
      if (opps.length === 0) {
        skippedNoOpps++
        continue
      }
      const body = buildMessage({
        leadRazaoSocial: lead.razao_social,
        leadTotalGanhas: lead.total_licitacoes_ganhas_total,
        leadValorTotal: lead.valor_total_contratos_ganhos_total,
        opportunities: opps,
      })
      prepared++
      if (samples.length < 5) {
        samples.push({
          cnpj: lead.cnpj.slice(0, 8) + 'xxxxxx',
          phone: '***' + phone.slice(-4),
          preview: body,
        })
      }
    }

    console.log(
      `[pilot:dry] prepared=${prepared} skipped_phone=${skippedPhone} skipped_optout=${skippedOpt} skipped_no_opps=${skippedNoOpps}`,
    )
    console.log('\n--- 5 SAMPLE MESSAGES ---\n')
    for (const s of samples) {
      console.log('─'.repeat(70))
      console.log(`CNPJ: ${s.cnpj}  PHONE: ${s.phone}`)
      console.log('─'.repeat(70))
      console.log(s.preview)
      console.log()
    }
    await localPool.end()
    process.exit(0)
  }

  // LIVE mode — enqueue personalize jobs
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const redis = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
  })
  const queue = new Queue<OutboundPersonalizeJobData>('outbound-personalize', { connection: redis as any })

  let enqueued = 0
  for (const lead of leads) {
    if (optedOut.has(lead.cnpj)) {
      skippedOpt++
      continue
    }
    const phone = normalizeBrPhone(lead.telefone_comercial)
    if (!phone) {
      skippedPhone++
      continue
    }
    await queue.add(
      'personalize',
      {
        leadCnpj: lead.cnpj,
        leadId: lead.id,
        leadRazaoSocial: lead.razao_social,
        leadTelefone: lead.telefone_comercial!,
        leadCnae: lead.cnae_principal_codigo,
        leadUf: lead.uf,
        leadTotalGanhas: lead.total_licitacoes_ganhas_total,
        leadValorTotal: lead.valor_total_contratos_ganhos_total,
        campaignId,
        template: 'cold_intro_v1',
      },
      { jobId: `personalize-${campaignId}-${lead.cnpj}` },
    )
    enqueued++
  }

  console.log(
    `[pilot:live] enqueued=${enqueued} skipped_phone=${skippedPhone} skipped_optout=${skippedOpt} campaign=${campaignId}`,
  )
  console.log('Track via: SELECT status, count(*) FROM outbound_messages WHERE campaign_id=$1 GROUP BY 1')

  await queue.close()
  await redis.quit()
  await localPool.end()
  process.exit(0)
}

main().catch((e) => {
  console.error('[pilot] FATAL:', e)
  process.exit(1)
})
