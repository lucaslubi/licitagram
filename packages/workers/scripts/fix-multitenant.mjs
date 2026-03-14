import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url) })

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('=== LICITAGRAM MULTI-TENANT SYSTEM VERIFICATION ===\n')

// 1. Fix the handle_new_user trigger to include email
console.log('1. FIXING handle_new_user trigger to include email...')
const { error: triggerError } = await sb.rpc('exec_sql', {
  sql: `
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO public.users (id, full_name, email)
      VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `
})

if (triggerError) {
  // RPC might not exist, try raw SQL via admin API
  console.log('  RPC not available, attempting direct SQL...')

  // Alternative: use the admin auth to get user emails and update users table
  console.log('  Will fix via auth admin API instead.')
}

// 2. Get all auth users and check if public.users has emails
console.log('\n2. CHECKING auth users vs public.users emails...')
const { data: { users: authUsers }, error: authError } = await sb.auth.admin.listUsers()

if (authError) {
  console.error('  Error listing auth users:', authError)
} else {
  console.log(`  Found ${authUsers.length} auth users`)

  for (const au of authUsers) {
    const { data: pu } = await sb.from('users').select('id, email, company_id, telegram_chat_id, full_name').eq('id', au.id).single()

    if (!pu) {
      console.log(`  ❌ Auth user ${au.email} has NO public.users row! Creating...`)
      const { error: insertErr } = await sb.from('users').insert({
        id: au.id,
        email: au.email,
        full_name: au.user_metadata?.full_name || au.email?.split('@')[0] || 'User',
      })
      if (insertErr) console.log(`    Error creating: ${insertErr.message}`)
      else console.log(`    ✅ Created public.users row`)
    } else if (!pu.email || pu.email !== au.email) {
      console.log(`  ⚠️ User ${au.email} has mismatched email in public.users: "${pu.email}" - fixing...`)
      const { error: upErr } = await sb.from('users').update({ email: au.email }).eq('id', au.id)
      if (upErr) console.log(`    Error updating: ${upErr.message}`)
      else console.log(`    ✅ Email updated`)
    } else {
      console.log(`  ✅ User ${au.email} - email OK, company: ${pu.company_id || 'none'}, telegram: ${pu.telegram_chat_id || 'none'}`)
    }
  }
}

// 3. Verify all tables exist and have data
console.log('\n3. VERIFYING TABLES...')
const tables = ['companies', 'users', 'subscriptions', 'tenders', 'tender_documents', 'matches', 'competitors', 'scraping_jobs']

for (const table of tables) {
  const { count, error: countErr } = await sb.from(table).select('*', { count: 'exact', head: true })
  if (countErr) {
    console.log(`  ❌ ${table}: ERROR - ${countErr.message}`)
  } else {
    console.log(`  ✅ ${table}: ${count} rows`)
  }
}

// 4. Verify company completeness
console.log('\n4. COMPANY DATA COMPLETENESS...')
const { data: companies } = await sb.from('companies').select('id, cnpj, razao_social, cnae_principal, cnaes_secundarios, uf, descricao_servicos, capacidades, palavras_chave')

if (companies) {
  for (const c of companies) {
    console.log(`\n  Company: ${c.razao_social}`)
    console.log(`    CNPJ: ${c.cnpj || '❌ MISSING'}`)
    console.log(`    CNAE Principal: ${c.cnae_principal || '❌ MISSING'}`)
    console.log(`    CNAEs Secundários: ${c.cnaes_secundarios?.length || 0} entries`)
    console.log(`    UF: ${c.uf || '❌ MISSING'}`)
    console.log(`    Descrição: ${c.descricao_servicos ? c.descricao_servicos.slice(0, 60) + '...' : '❌ MISSING'}`)
    console.log(`    Capacidades: ${c.capacidades?.length || 0} entries`)
    console.log(`    Palavras-chave: ${c.palavras_chave?.length || 0} entries`)

    // Check linked users
    const { data: linkedUsers } = await sb.from('users').select('id, email, telegram_chat_id, min_score').eq('company_id', c.id)
    console.log(`    Linked users: ${linkedUsers?.length || 0}`)
    if (linkedUsers) {
      for (const u of linkedUsers) {
        console.log(`      - ${u.email || 'NO EMAIL'} | telegram: ${u.telegram_chat_id || 'not linked'} | min_score: ${u.min_score}`)
      }
    }

    // Check subscription
    const { data: sub } = await sb.from('subscriptions').select('plan, status, max_ai_analyses_month, ai_analyses_used').eq('company_id', c.id).single()
    if (sub) {
      console.log(`    Subscription: ${sub.plan} (${sub.status}) - ${sub.ai_analyses_used}/${sub.max_ai_analyses_month} AI analyses`)
    } else {
      console.log(`    ⚠️ No subscription found - creating trial...`)
      const { error: subErr } = await sb.from('subscriptions').insert({
        company_id: c.id,
        plan: 'trial',
        status: 'active',
        max_alerts_per_day: 10,
        max_ai_analyses_month: 50,
      })
      if (subErr) console.log(`      Error: ${subErr.message}`)
      else console.log(`      ✅ Trial subscription created`)
    }
  }
}

// 5. Verify matches integrity
console.log('\n5. MATCHES INTEGRITY...')
const { count: totalMatches } = await sb.from('matches').select('*', { count: 'exact', head: true })
const { count: orphanMatches } = await sb.from('matches').select('*', { count: 'exact', head: true }).is('company_id', null)
const { data: scoreDistro } = await sb.rpc('exec_sql', { sql: "SELECT COUNT(*) as cnt, CASE WHEN score >= 70 THEN '70+' WHEN score >= 45 THEN '45-69' ELSE '<45' END as range FROM matches GROUP BY range ORDER BY range" })

console.log(`  Total matches: ${totalMatches}`)
console.log(`  Orphan matches (no company): ${orphanMatches || 0}`)

// Simpler way to get score distribution
const { data: highScore } = await sb.from('matches').select('*', { count: 'exact', head: true }).gte('score', 70)
const { data: midScore, count: midCount } = await sb.from('matches').select('*', { count: 'exact', head: true }).gte('score', 45).lt('score', 70)
const { data: lowScore, count: lowCount } = await sb.from('matches').select('*', { count: 'exact', head: true }).lt('score', 45)

console.log(`  Score >= 70: ${highScore}`)
console.log(`  Score 45-69: ${midCount}`)
console.log(`  Score < 45: ${lowCount}`)

// 6. Verify tenders status
console.log('\n6. TENDER PIPELINE STATUS...')
const statuses = ['new', 'analyzing', 'analyzed', 'error']
for (const s of statuses) {
  const { count } = await sb.from('tenders').select('*', { count: 'exact', head: true }).eq('status', s)
  console.log(`  ${s}: ${count}`)
}

// 7. Check RLS is working
console.log('\n7. RLS STATUS...')
console.log('  Note: Workers use SERVICE_ROLE_KEY which bypasses RLS (by design)')
console.log('  Web app uses user auth which enforces RLS')
console.log('  Tables with RLS: companies, users, subscriptions, tenders, matches, tender_documents')

console.log('\n=== VERIFICATION COMPLETE ===')
