require('dotenv').config({ path: 'apps/web/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('admin_leads_fornecedores').select('cnpj', { count: 'exact', head: true });
  console.log('Result:', JSON.stringify({ data, error }, null, 2));
}
run();
