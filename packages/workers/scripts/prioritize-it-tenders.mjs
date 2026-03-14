import { createClient } from '@supabase/supabase-js'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null })
const extractionQueue = new Queue('extraction', { connection: redis })

// Find IT-related tenders that are still 'new'
const itKeywords = ['software', 'sistema de informação', 'tecnologia da informação', 'informática', 'TI ', 'digital', 'consultoria em', 'desenvolvimento de software', 'plataforma', 'automação', 'dados', 'cloud', 'computação', 'suporte técnico', 'licenciamento']

let itTenderIds = new Set()
for (const keyword of itKeywords) {
  const { data } = await sb.from('tenders')
    .select('id')
    .ilike('objeto', `%${keyword}%`)
    .eq('status', 'new')
    .limit(50)

  if (data) {
    for (const t of data) itTenderIds.add(t.id)
  }
}

console.log(`Found ${itTenderIds.size} IT tenders to prioritize`)

// Add with high priority
let count = 0
for (const id of itTenderIds) {
  await extractionQueue.add(
    `priority-extract-${id}`,
    { tenderId: id },
    { priority: 1, attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  )
  count++
}

console.log(`Enqueued ${count} priority extraction jobs`)
await redis.quit()
process.exit(0)
