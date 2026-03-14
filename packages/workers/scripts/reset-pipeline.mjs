import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import Redis from 'ioredis'

config({ path: new URL('../.env', import.meta.url) })

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

// 1. Reset tenders with status 'error' back to 'new'
const { data: errorTenders, count: errorCount } = await sb
  .from('tenders')
  .update({ status: 'new' })
  .eq('status', 'error')
  .select('id', { count: 'exact' })

console.log(`Reset ${errorCount ?? 0} error tenders back to 'new'`)

// 2. Count current tenders by status
for (const status of ['new', 'analyzed', 'error']) {
  const { count } = await sb.from('tenders').select('id', { count: 'exact', head: true }).eq('status', status)
  console.log(`  Tenders with status '${status}': ${count}`)
}

// 3. Count matches
const { count: matchCount } = await sb.from('matches').select('id', { count: 'exact', head: true })
console.log(`  Total matches: ${matchCount}`)

const { count: goodMatches } = await sb.from('matches').select('id', { count: 'exact', head: true }).gte('score', 30)
console.log(`  Matches with score >= 30: ${goodMatches}`)

// 4. Clear BullMQ rate limiters
for (const queue of ['scraping', 'extraction', 'matching', 'notification']) {
  await redis.del(`bull:${queue}:limiter`)
}
console.log('Cleared all BullMQ rate limiters')

// 5. Clean stalled jobs
for (const queue of ['extraction', 'matching']) {
  const stalledKey = `bull:${queue}:stalled`
  await redis.del(stalledKey)
}
console.log('Cleared stalled job markers')

await redis.quit()
process.exit(0)
