import { createClient } from '@supabase/supabase-js'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key)

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const matchingQueue = new Queue('matching', { connection: redis })

// Get all analyzed tenders
const { data: tenders } = await sb.from('tenders').select('id').eq('status', 'analyzed')
// Get the company
const { data: companies } = await sb.from('companies').select('id')

console.log(`Re-enqueuing matching for ${tenders?.length ?? 0} tenders x ${companies?.length ?? 0} companies`)

let count = 0
for (const tender of tenders || []) {
  for (const company of companies || []) {
    await matchingQueue.add(
      `rematch-${company.id}-${tender.id}`,
      { companyId: company.id, tenderId: tender.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
    )
    count++
  }
}

console.log(`Enqueued ${count} matching jobs`)
await redis.quit()
process.exit(0)
