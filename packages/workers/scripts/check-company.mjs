import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await sb.from('companies').select('*').eq('id', '24cdf940-734b-41ef-b068-3de0107122f4').single()
if (error) console.error('Error:', error)
else {
  console.log('Company data:')
  console.log('cnaes_secundarios:', JSON.stringify(data.cnaes_secundarios), typeof data.cnaes_secundarios)
  console.log('capacidades:', JSON.stringify(data.capacidades), typeof data.capacidades)
  console.log('certificacoes:', JSON.stringify(data.certificacoes), typeof data.certificacoes)
  console.log('palavras_chave:', JSON.stringify(data.palavras_chave), typeof data.palavras_chave)
  console.log('cnae_principal:', data.cnae_principal)
  console.log('descricao_servicos:', data.descricao_servicos)
  console.log('porte:', data.porte)
  console.log('uf:', data.uf)
}
