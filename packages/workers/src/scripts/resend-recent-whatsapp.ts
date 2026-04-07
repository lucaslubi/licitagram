/**
 * Reenviar notificações WhatsApp dos últimos N horas
 *
 * Os matches foram marcados como "notified" mas chegaram vazios no WhatsApp
 * devido ao bug do formato Evolution API v1 vs v2.
 * Este script reseta notified_at e status dos matches recentes para que o
 * worker-alerts os reprocesse e o worker-whatsapp envie de novo (agora com
 * o payload correto).
 *
 * Uso:
 *   HOURS=24 tsx src/scripts/resend-recent-whatsapp.ts
 *   HOURS=6 DRY_RUN=1 tsx src/scripts/resend-recent-whatsapp.ts
 */
import { db } from '../lib/db'

const HOURS = parseInt(process.env.HOURS || '24', 10)
const DRY_RUN = process.env.DRY_RUN === '1'

async function main() {
  const cutoff = new Date(Date.now() - HOURS * 60 * 60 * 1000).toISOString()
  console.log(`[resend] cutoff=${cutoff} dryRun=${DRY_RUN}`)

  // Só mexer em matches de empresas cujos usuários tem WhatsApp conectado
  const { data: wausers, error: e0 } = await db
    .from('users')
    .select('company_id')
    .not('whatsapp_number', 'is', null)
  if (e0) throw e0
  const companyIds = Array.from(new Set((wausers || []).map((u: { company_id: string | null }) => u.company_id).filter(Boolean)))
  console.log(`[resend] empresas com WhatsApp conectado: ${companyIds.length}`)
  if (companyIds.length === 0) return

  const { data: found, error: e1 } = await db
    .from('matches')
    .select('id, company_id, score, notified_at')
    .in('company_id', companyIds)
    .gte('notified_at', cutoff)
    .eq('status', 'notified')
    .limit(10000)
  if (e1) throw e1

  console.log(`[resend] matches notificados nas ultimas ${HOURS}h: ${found?.length || 0}`)
  if (!found || found.length === 0) return

  if (DRY_RUN) {
    console.log('[resend] DRY_RUN=1 — nada foi alterado')
    console.log('[resend] sample:', found.slice(0, 5))
    return
  }

  // Reseta em lotes de 500
  const ids = found.map((m: { id: string }) => m.id)
  const batchSize = 500
  let updated = 0
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const { error: e2 } = await db
      .from('matches')
      .update({ notified_at: null, status: 'new' })
      .in('id', batch)
    if (e2) throw e2
    updated += batch.length
    console.log(`[resend] reset ${updated}/${ids.length}`)
  }

  console.log(`[resend] feito. ${updated} matches resetados para renotificação.`)
  console.log('[resend] o worker-alerts vai reprocessar no proximo ciclo.')
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
