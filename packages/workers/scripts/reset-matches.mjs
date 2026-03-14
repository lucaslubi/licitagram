import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key)

const { data, error } = await sb.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id')
console.log('Deleted matches:', data?.length ?? 0, error ? `Error: ${error.message}` : 'OK')

// Re-enqueue tenders that have been analyzed for re-matching
const { data: tenders } = await sb.from('tenders').select('id').eq('status', 'analyzed')
console.log('Tenders to re-match:', tenders?.length ?? 0)
