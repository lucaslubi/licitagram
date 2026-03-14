import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: company } = await sb.from('companies').select('*').eq('id', '24cdf940-734b-41ef-b068-3de0107122f4').single()

// Fix capacidades - split comma-separated strings
const fixArray = (arr) => {
  if (!arr || arr.length === 0) return []
  return arr.flatMap(item =>
    item.includes(',') ? item.split(',').map(s => s.trim()).filter(Boolean) : [item.trim()]
  ).filter(Boolean)
}

const fixedCapacidades = fixArray(company.capacidades)

console.log('Capacidades before:', company.capacidades)
console.log('Capacidades after:', fixedCapacidades)

// Also add useful keywords and description if empty
const updates = { capacidades: fixedCapacidades }

if (!company.descricao_servicos) {
  updates.descricao_servicos = 'Empresa de tecnologia da informacao especializada em desenvolvimento de software sob encomenda, consultoria em TI, suporte tecnico, manutencao de sistemas, web design e solucoes digitais.'
  console.log('Added descricao_servicos')
}

if (!company.palavras_chave || company.palavras_chave.length === 0) {
  updates.palavras_chave = [
    'software', 'desenvolvimento', 'sistemas', 'TI', 'tecnologia',
    'consultoria', 'suporte tecnico', 'web', 'manutencao', 'digital',
    'automacao', 'informatica', 'programacao', 'dados', 'cloud'
  ]
  console.log('Added palavras_chave')
}

const { error } = await sb.from('companies').update(updates).eq('id', company.id)
if (error) console.error('Error:', error)
else console.log('Company data fixed!')
