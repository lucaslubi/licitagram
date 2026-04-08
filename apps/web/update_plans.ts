import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../../.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: plans } = await supabase.from('plans').select('*')
  
  if (!plans) {
    console.log('No plans found')
    return
  }

  for (const plan of plans) {
    const isEnterprise = plan.slug === 'enterprise'
    const isPro = plan.slug === 'professional' || plan.slug === 'enterprise'
    
    // Base features, maintaining existing ones
    const currentFeatures = typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features
    
    const newFeatures = {
      ...currentFeatures,
      telegram_alerts: true, // Everyone gets Telegram (basic notification)
      whatsapp_alerts: isPro,      // Pro+ gets Whatsapp integration
      radar_map: isPro,            // Pro+ gets Map Intelligence
      lead_engine: isEnterprise,   // Only Enterprise gets B2B CRM Outreach
      certidoes_bot: isEnterprise, // Only Enterprise gets automated document clearing
    }
    
    const { error } = await supabase
      .from('plans')
      .update({ features: newFeatures })
      .eq('id', plan.id)
      
    if (error) {
      console.error(`Failed to update ${plan.slug}:`, error)
    } else {
      console.log(`Updated ${plan.slug} successfully with new platform features`)
    }
  }
}

run().catch(console.error)
