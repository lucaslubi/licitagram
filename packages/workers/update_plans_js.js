const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: plans } = await supabase.from('plans').select('*');
  for (const plan of plans) {
    const isEnterprise = plan.slug === 'enterprise';
    const isPro = plan.slug === 'professional' || plan.slug === 'enterprise';
    const currentFeatures = typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features;
    const newFeatures = {
      ...currentFeatures,
      telegram_alerts: true,
      whatsapp_alerts: isPro,
      radar_map: isPro,
      lead_engine: isEnterprise,
      certidoes_bot: isEnterprise
    };
    await supabase.from('plans').update({ features: newFeatures }).eq('id', plan.id);
    console.log(`Updated ${plan.slug}`);
  }
}
run();
