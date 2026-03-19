# AGENT 06 -- Database & Data Integrity Audit Report

**Date:** 2026-03-19
**Scope:** 25 migration files, all worker processors, all API routes, all server actions
**Database:** Supabase PostgreSQL (Small plan, 2GB RAM, ~126K tenders, ~29K matches, ~16K competitors)

---

## Executive Summary

The schema is generally well-designed with proper use of NUMERIC for monetary fields, UUIDs, and RLS. However, there are **3 critical issues**, **5 high-severity issues**, and **9 medium-severity issues** that could cause data corruption, orphaned records, or security gaps at 15K-user scale.

---

## 1. Missing Constraints

### CRITICAL: `users.company_id` is nullable with no ON DELETE behavior specified

**File:** `supabase/migrations/20260311000000_initial_schema.sql`, line 37
```sql
company_id UUID REFERENCES public.companies(id),
```

The FK has **no ON DELETE clause**, which defaults to `NO ACTION`. If a company is deleted, users referencing it will have a dangling FK that blocks the delete or leaves orphaned references depending on timing. This is particularly dangerous because:
- `companies_insert` policy has `WITH CHECK (true)` -- anyone can insert a company
- No mechanism prevents a company from being deleted while users still reference it

**Impact:** Orphaned user records with invalid company_id references.

### HIGH: `competitors` table has nullable business keys

**File:** `supabase/migrations/20260311000000_initial_schema.sql`, lines 137-143
```sql
tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE,  -- nullable!
cnpj TEXT,  -- nullable!
nome TEXT,  -- nullable!
```

Both `tender_id` and `cnpj` are nullable on the competitors table. A competitor record without a tender or CNPJ is meaningless. With ~16K rows and growing, this allows garbage data.

### MEDIUM: `competitors` table has no UNIQUE constraint on (tender_id, cnpj)

Nothing prevents duplicate competitor entries for the same tender+CNPJ pair. The scraping processors do upsert-style logic in application code but there is no database-level protection.

### GOOD: Monetary fields use NUMERIC(15,2)

All monetary columns (`valor_estimado`, `valor_homologado`, `valor_proposta`, `faturamento_anual`, `price_cents`, `valor_total_ganho`) correctly use NUMERIC. No FLOAT/DOUBLE precision issues found.

---

## 2. Missing FK Constraints / ON DELETE Behavior

### Summary of ON DELETE behavior across all FKs:

| Parent | Child | FK Column | ON DELETE | Risk |
|--------|-------|-----------|-----------|------|
| auth.users | users | id | CASCADE | OK |
| companies | users | company_id | **NO ACTION (default)** | Orphaned users |
| companies | subscriptions | company_id | **NOT NULL, no ON DELETE** | Blocks company deletion |
| companies | matches | company_id | CASCADE | OK |
| companies | company_documents | company_id | CASCADE | OK |
| companies | competitor_watchlist | company_id | CASCADE | OK |
| tenders | matches | tender_id | CASCADE | OK |
| tenders | tender_documents | tender_id | CASCADE | OK |
| tenders | competitors | tender_id | CASCADE | OK (but FK is nullable) |
| users | audit_logs | actor_id | SET NULL | OK |
| users | whatsapp_verifications | user_id | CASCADE | OK |
| plans | subscriptions | plan_id | **NO ACTION (default)** | Can't deactivate/delete plans |

### HIGH: `subscriptions.company_id` has no ON DELETE clause

**File:** `supabase/migrations/20260311000000_initial_schema.sql`, line 54

If a company is deleted, the subscription row blocks the deletion (NO ACTION). There is a UNIQUE constraint on `company_id` (added in stripe migration), but no cascade. This means:
- Companies cannot be deleted without first manually deleting their subscription
- No admin UI for this exists

### MEDIUM: `subscriptions.plan_id` has no ON DELETE clause

**File:** `supabase/migrations/20260313100000_subscription_plan_id.sql`, line 6

If a plan row is deleted, subscriptions referencing it will block the deletion. The `plans.is_active` soft flag helps, but there is no protection if someone does a hard DELETE on plans.

---

## 3. Transactions -- Multi-Step Writes NOT Wrapped in Transactions

### CRITICAL: `saveCompany()` performs 3 separate writes without a transaction

**File:** `apps/web/src/actions/company.ts`, lines 225-264

```
Step 1: INSERT into companies
Step 2: UPDATE users SET company_id = ...
Step 3: INSERT into subscriptions (trial)
```

If step 2 or step 3 fails:
- **Step 1 succeeds, step 2 fails:** A company exists with no user linked to it. The user has no company_id and cannot see the company. Orphaned company record.
- **Step 1+2 succeed, step 3 fails:** Company exists, user is linked, but no subscription. The user cannot use the platform (match limit checks will fail with "no active subscription"). The code even catches this as "non-critical" when it is actually critical for functionality.

**Impact:** At scale, network blips or Supabase timeouts will cause inconsistent state. Users will be stuck with no recourse.

**Note:** Supabase JS client does not natively support multi-statement transactions. The fix requires using an RPC function (PL/pgSQL) or the `supabase.rpc()` approach to wrap these in a single DB transaction.

### HIGH: Stripe webhook handler has no transaction protection

**File:** `apps/web/src/app/api/stripe/webhook/route.ts`, lines 50-84

The `checkout.session.completed` handler:
1. Fetches user profile
2. Upserts subscription
3. Invalidates Redis cache

If the upsert succeeds but the Redis invalidation fails, the UI shows stale data. More critically, if the webhook is retried by Stripe and the upsert partially applies, there is no idempotency check on the subscription state.

### MEDIUM: `updateClientSubscription()` admin action has two separate writes

**File:** `apps/web/src/actions/admin/clients.ts`, lines 97-117

Fetches plan slug, then either updates or inserts subscription -- two separate operations that should be atomic.

---

## 4. Raw SQL / SQL Injection Risk

### MEDIUM: User search input interpolated directly into Supabase `.or()` and `.ilike()` filters

**File:** `apps/web/src/actions/admin/clients.ts`, line 35
```typescript
query = query.or(`razao_social.ilike.%${params.search}%,cnpj.ilike.%${params.search}%,nome_fantasia.ilike.%${params.search}%`)
```

**File:** `apps/web/src/actions/admin/users.ts`, line 35
```typescript
query = query.or(`full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`)
```

**File:** `apps/web/src/app/api/admin/prospects/export/route.ts`, line 32
```typescript
query = query.or(`razao_social.ilike.%${s}%,cnpj.ilike.%${s}%`)
```

**File:** `apps/web/src/lib/cache.ts`, line 184
```typescript
query = query.ilike('objeto', `%${normalized}%`)
```

While PostgREST parameterizes the actual SQL, the `.or()` filter string is parsed by PostgREST's query parser. A crafted search string containing PostgREST filter syntax (e.g., commas, dots, parentheses) could alter the filter logic. This is NOT traditional SQL injection but IS a **filter manipulation** risk.

**Mitigation:** All admin routes require `requirePlatformAdmin()`, which limits the attack surface to admin users. The `cache.ts` search path normalizes input with `stripAccents()` first. Risk is **low but non-zero**.

### GOOD: No raw SQL string concatenation found

No instances of string-concatenated SQL queries. All database access goes through Supabase JS client or RPC functions with parameterized inputs.

---

## 5. Missing Indexes

### HIGH: `matches.tender_id` has no dedicated index

The `matches` table has indexes on `company_id`, `score`, `status`, and compound `(company_id, status)` and `(company_id, score)`, but **no index on `tender_id` alone**.

Multiple queries filter or join on `tender_id`:
- `keyword-matcher.ts` line 293: `.eq('tender_id', tenderId)` (per-match lookup)
- `keyword-matcher.ts` line 697: `.in('tender_id', tenderIds)` (batch check in sweep)
- `hot-alerts.processor.ts` line 343: `.eq('is_hot', true)` with join on tenders
- Every match detail page joins matches to tenders

With ~29K matches and growing, the FK join on `tender_id` without an index causes sequential scans.

**Fix:** `CREATE INDEX idx_matches_tender_id ON matches(tender_id);`

### MEDIUM: `tenders.situacao_id` has no index

The UI shows `situacao_nome` and filters could be added. No index exists for `situacao_id` or `situacao_nome`.

### MEDIUM: `audit_logs` will grow unbounded

The audit_logs table has no retention policy, no partition strategy, and no index on `created_at` for cleanup queries. At 15K users with admin actions, this table could grow large.

**Note:** Indexes on `audit_logs(created_at DESC)` and `(target_type, created_at DESC)` exist, which partially mitigates this.

### GOOD: Most query patterns are well-indexed

The codebase has good coverage for:
- Tender queries by `data_publicacao`, `status`, `uf`, `source`, `pncp_id`, `orgao_cnpj`
- Match queries by `company_id`, `score`, `status`, `match_source`
- Competitor queries by `tender_id`, `cnpj`, `cnae_codigo`
- Full-text search via `gin_trgm_ops` on `objeto` and `texto_extraido`
- Vector similarity via HNSW on embeddings

---

## 6. Unbounded Queries

### HIGH: `runKeywordMatching()` fetches ALL companies without LIMIT

**File:** `packages/workers/src/processors/keyword-matcher.ts`, line 427-429
```typescript
const { data: allCompanies } = await supabase
  .from('companies')
  .select('id, cnae_principal, cnaes_secundarios, palavras_chave, descricao_servicos, capacidades')
```

No `.limit()` is applied. At 15K companies, this loads all company data into memory on every tender match run. Each scraping cycle processes hundreds of tenders, triggering this query for EACH one.

**Impact:** Memory pressure on workers. At 15K companies with arrays of keywords, capacidades, and cnaes, this could be several MB per query, multiplied by concurrent matching jobs.

### MEDIUM: `getCompaniesWithUsers()` in hot-alerts fetches ALL users

**File:** `packages/workers/src/processors/hot-alerts.processor.ts`, line 134-137
```typescript
const { data: users } = await supabase
  .from('users')
  .select('id, company_id, telegram_chat_id, notification_preferences')
  .not('company_id', 'is', null)
```

No limit. At 15K users, this loads the full user table into memory.

### MEDIUM: Match list query fetches up to 2000 rows for client-side sorting

**File:** `apps/web/src/lib/cache.ts`, line 313
```typescript
query = query.order('score', { ascending: false }).limit(2000)
```

This pulls up to 2000 match rows with nested tender data for client-side sorting. The result is cached in Redis, but the initial fetch is heavy. A company with many matches could cause slow first-load times.

### LOW: Export route capped at 500 rows

**File:** `apps/web/src/app/api/export/route.ts`, lines 64, 93 -- Both export queries have `.limit(500)`. This is a reasonable cap.

---

## 7. Migration Safety

### HIGH: Migration `20260316100000_precision_cleanup.sql` runs mass UPDATE on matches

This migration recalculates scores for ALL keyword matches with a complex regex-based UPDATE. On a table with ~29K rows, this likely acquires a ROW EXCLUSIVE lock on each row, which is fine, but the regex computation (`REGEXP_REPLACE`) per row is CPU-intensive.

### HIGH: Migration `20260316300000_cap_keyword_scores.sql` runs DELETE on matches

```sql
DELETE FROM public.matches WHERE tender_id IN (
  SELECT id FROM public.tenders WHERE data_encerramento IS NOT NULL
    AND data_encerramento < NOW() - INTERVAL '7 days'
);
```

This is a **mass DELETE** that could affect thousands of rows. It is also **irreversible** -- deleted matches cannot be recovered. There is no backup/archive step.

### MEDIUM: Multiple migrations do mass UPDATEs without batching

Migrations `20260316000000`, `20260316100000`, `20260316200000`, `20260316300000` all perform unbatched mass updates/deletes. On a growing database, these could lock significant portions of the matches table.

### GOOD: All migrations use `IF NOT EXISTS` / `IF EXISTS` guards

Schema changes (ALTER TABLE ADD COLUMN, CREATE INDEX, CREATE TABLE) consistently use `IF NOT EXISTS`, making migrations idempotent and safe to re-run.

---

## 8. Audit Timestamps

### Tables WITH created_at/updated_at:

| Table | created_at | updated_at | Trigger |
|-------|-----------|-----------|---------|
| companies | YES (NOT NULL) | YES (NOT NULL) | YES |
| users | YES (NOT NULL) | **NO** | **NO** |
| subscriptions | YES (NOT NULL) | **NO** | **NO** |
| tenders | YES (NOT NULL) | YES (NOT NULL) | YES |
| matches | YES (NOT NULL) | YES (NOT NULL) | YES |
| tender_documents | YES (NOT NULL) | **NO** | **NO** |
| competitors | YES (NOT NULL) | **NO** | **NO** |
| scraping_jobs | YES (NOT NULL) | **NO** | **NO** |
| company_documents | YES | YES | YES |
| competitor_watchlist | YES | **NO** | **NO** |
| plans | YES (NOT NULL) | YES (NOT NULL) | YES |
| audit_logs | YES (NOT NULL) | **NO** (append-only, OK) | N/A |
| whatsapp_verifications | YES (NOT NULL) | **NO** | **NO** |
| competitor_stats | **NO** | YES | **NO** |

### HIGH: `users` table has no `updated_at` column or trigger

The users table is frequently updated (telegram_chat_id, whatsapp_number, notification_preferences, min_score, stripe_customer_id, is_platform_admin). Without updated_at, there is no way to:
- Track when a user's settings last changed
- Debug notification issues ("when did user set their telegram_chat_id?")
- Implement cache invalidation based on staleness

### MEDIUM: `subscriptions` table has no `updated_at` column or trigger

Subscriptions change status frequently (active, past_due, canceled, trialing). Without updated_at, there is no audit trail for status transitions.

### MEDIUM: `competitors` table has no `updated_at`

Competitors are enriched by the fornecedor-enrichment processor (adding cnae_codigo, porte, uf_fornecedor). No way to track when enrichment happened.

### MEDIUM: `competitor_stats` has no `created_at`

The materialized competitor stats table has `updated_at` but no `created_at`. Cannot tell when a competitor was first tracked.

---

## 9. Data Consistency

### Can tenders exist without matches?

**YES, by design.** Not all tenders match any company. This is correct behavior.

### Can matches point to deleted tenders?

**NO.** `matches.tender_id` has `ON DELETE CASCADE`. If a tender is deleted, all its matches are automatically deleted. This is correct.

### Can subscriptions exist without companies?

**NO.** `subscriptions.company_id` has `NOT NULL` and a FK to `companies(id)`. However, the reverse is possible:

### CRITICAL: Companies can exist without subscriptions

**File:** `apps/web/src/actions/company.ts`, lines 241-264

The trial subscription creation in `saveCompany()` is wrapped in a try/catch that logs the error as "non-critical":
```typescript
} catch (subErr) {
  console.error('[COMPANY] Failed to create trial subscription (non-critical):', subErr)
}
```

This is **critical, not non-critical**. The keyword-matcher checks subscription limits via `increment_match_count()` RPC. If no subscription exists, the RPC returns `NOT FOUND` and sets `limit_reached = true`, **blocking ALL matches for that company permanently**.

### Can users exist without companies?

**YES.** The `handle_new_user()` trigger creates a user row with `company_id = NULL`. The user is expected to register their company later. This is correct but means queries must handle `company_id IS NULL`.

### Can matches exist for non-competitive modalities?

**Prevented at application level** (keyword-matcher skips modalidade_id 9, 14), but there is **no database-level constraint**. Multiple cleanup migrations had to retroactively delete these, suggesting the app-level gate has had gaps. A CHECK constraint or trigger would be safer.

---

## 10. Soft Delete

### NO soft delete is used anywhere in the schema.

There is no `deleted_at` column on any table. All deletions are hard deletes.

- **matches:** Hard-deleted by cleanup migrations and the rematch purge logic
- **competitors:** No delete mechanism found
- **tenders:** No delete mechanism found
- **companies:** No delete mechanism (ON DELETE behavior issues noted above)
- **users:** `is_active` flag exists (added in admin migration) but this is a deactivation flag, not soft delete. Deactivated users still exist in the database.

### Risk Assessment:

For the current scale (15K users), the lack of soft delete is acceptable IF:
1. No data needs to be recoverable after deletion
2. CASCADE deletes on tenders are intentional (deleting a tender wipes all matches, documents, and competitor data)

However, at scale, accidental deletion of a tender would cascade to destroy all match data for all companies, with no recovery path.

---

## Priority Remediation List

### P0 (Fix immediately -- data corruption risk):

1. **Wrap `saveCompany()` in a transaction** via an RPC function. The current 3-step non-atomic write will cause orphaned data at scale.
2. **Make trial subscription creation non-optional.** Remove the try/catch that swallows the error. A company without a subscription is a broken state.
3. **Add `ON DELETE SET NULL` to `users.company_id` FK** (or CASCADE if users should be deleted with their company).

### P1 (Fix soon -- operational risk):

4. **Add index on `matches.tender_id`**. Missing index on a frequently-joined column with 29K+ rows.
5. **Add `updated_at` to `users` table** with trigger. Critical for debugging and auditing.
6. **Add `NOT NULL` to `competitors.tender_id` and `competitors.cnpj`**. Prevent garbage data.
7. **Add UNIQUE constraint on `competitors(tender_id, cnpj)`**. Prevent duplicate entries.
8. **Paginate the `allCompanies` fetch in `runKeywordMatching()`**. Current unbounded SELECT will OOM at 15K companies.

### P2 (Fix when possible -- quality/hygiene):

9. **Add `updated_at` to `subscriptions`, `competitors`, `tender_documents` tables**.
10. **Add `ON DELETE` clauses to `subscriptions.company_id` and `subscriptions.plan_id` FKs**.
11. **Sanitize search inputs** before passing to `.or()` filters (strip PostgREST special chars).
12. **Add `created_at` to `competitor_stats` table**.
13. **Add retention policy for `audit_logs`** (e.g., auto-delete after 1 year).
14. **Consider soft delete on `tenders`** to prevent cascading data loss.
15. **Add database-level constraint to prevent matches on non-competitive modalities** (CHECK constraint or trigger).

---

## Files Examined

### Migrations (all 25):
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260311000000_initial_schema.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260311100000_fix_user_trigger_email.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260311200000_add_match_riscos_acoes.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260311300000_add_source_and_documents.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260312000000_stripe_integration.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260312100000_competitor_enrichment_columns.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260312200000_robustness_fixes.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260312300000_on_demand_ai.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260313000000_plans_system.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260313100000_subscription_plan_id.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260313200000_admin_roles_permissions.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260313300000_audit_log.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260313400000_match_counting.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260313500000_cnae_classificados.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260314000000_whatsapp_integration.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260316000000_reset_inflated_scores.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260316100000_precision_cleanup.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260316200000_fix_remaining_inflated.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260316300000_cap_keyword_scores.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260316400000_vector_embeddings.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260316500000_add_match_sources.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260317000000_hot_alerts.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260317100000_competitive_intelligence.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260318000000_lower_min_participations.sql`
- `/Users/lucasdelima/Desktop/licitagram/supabase/migrations/20260318100000_competitor_contacts.sql`

### Application Code:
- `/Users/lucasdelima/Desktop/licitagram/apps/web/src/actions/company.ts`
- `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/stripe/webhook/route.ts`
- `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/stripe/checkout/route.ts`
- `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/export/route.ts`
- `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/analyze/route.ts`
- `/Users/lucasdelima/Desktop/licitagram/apps/web/src/lib/cache.ts`
- `/Users/lucasdelima/Desktop/licitagram/apps/web/src/actions/admin/clients.ts`
- `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/keyword-matcher.ts`
- `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/scraping.processor.ts`
- `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/notification.processor.ts`
- `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/hot-alerts.processor.ts`
- `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/matching.processor.ts`
