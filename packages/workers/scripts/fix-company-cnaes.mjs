import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: company } = await sb.from('companies').select('*').eq('id', '24cdf940-734b-41ef-b068-3de0107122f4').single()

// Fix cnaes_secundarios — split comma-separated string into individual items
const fixedCnaes = company.cnaes_secundarios.flatMap(item =>
  item.includes(',') ? item.split(',').map(s => s.trim()).filter(Boolean) : [item.trim()]
)

console.log('Before:', company.cnaes_secundarios)
console.log('After:', fixedCnaes)

const { error } = await sb.from('companies')
  .update({ cnaes_secundarios: fixedCnaes })
  .eq('id', company.id)

if (error) console.error('Error:', error)
else console.log('Fixed!')
