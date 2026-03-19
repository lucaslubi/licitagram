# AGENT 02 -- Performance & Scalability Audit Report

**Date:** 2026-03-19
**Target:** 15,000 concurrent users
**Infrastructure:** Supabase Small (2GB), Upstash Redis, Hostinger VPS (7.8GB), 7 PM2 processes

---

## Executive Summary

The Licitagram codebase has solid foundations (Redis caching, BullMQ with retry configs, connection reuse) but contains **6 CRITICAL**, **11 HIGH**, and several MEDIUM/LOW issues that will block scaling to 15,000 concurrent users. The most severe problems are: N+1 query loops in the keyword matcher and hot alerts processor (O(companies * tenders) DB calls), missing pagination in the system-health endpoint (10,000 row fetch), duplicate Redis connections, and multiple API routes without rate limiting. Fixing the CRITICAL and HIGH issues alone should yield a 3-5x throughput improvement.

---

## 1. Database Queries -- N+1 Patterns

### ISSUE 1.1: keyword-matcher fetches ALL companies for every tender (CRITICAL)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/keyword-matcher.ts`, lines 427-434
- **Severity:** CRITICAL
- **Description:** `runKeywordMatching()` fetches ALL companies from the `companies` table for EVERY new tender. With 100 companies and 500 tenders/day, this is 50,000 full-table fetches per day. Each company is then scored in a loop that calls `upsertMatchAndNotify()`, which itself performs 2-4 DB calls per match (check existing, upsert, increment_match_count RPC, fetch new match ID).
- **Lines 454-578:** The inner loop iterates over every company and for each match calls `upsertMatchAndNotify()` which makes 3-5 sequential DB queries (lines 290-373).
- **Recommended fix:** Cache the companies list in Redis (TTL 5 min). Batch the match upserts using Supabase bulk insert. Move the "check existing match" query to a batch `IN` query instead of one-per-company.
- **Estimated impact:** 10-50x reduction in DB calls during matching. Current bottleneck for extraction pipeline throughput.

### ISSUE 1.2: enqueueNotifications makes per-user DB query inside a loop (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/keyword-matcher.ts`, lines 590-648
- **Severity:** HIGH
- **Description:** For each match created, `enqueueNotifications()` fetches all users for the company (line 592), then for EACH user queries the matches table again (line 610) to get the match ID. This is an N+1 pattern: 1 query to get users + N queries (one per user) to get the match row.
- **Recommended fix:** The match ID is already known from `upsertMatchAndNotify()`. Pass it directly to `enqueueNotifications()` instead of re-querying. Cache company users in Redis.
- **Estimated impact:** Eliminates N redundant DB queries per match notification.

### ISSUE 1.3: hot-alerts processor has O(companies * matches * RPC) DB calls (CRITICAL)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/hot-alerts.processor.ts`, lines 190-330
- **Severity:** CRITICAL
- **Description:** `handleHotDaily()` iterates over ALL companies (line 190), for each fetches matches (line 193), then fetches the company plan (line 210), company CNAE data (line 213), and for EACH match calls `calculateCompetitionScore()` (line 245) which makes 1-N RPC calls to `find_competitors_by_cnae_uf` (lines 43-64). Then for each match, it does individual UPDATE calls (lines 252-254, 284-289, 317-321). With 50 companies, 20 matches each, and 3 CNAE divisions, this is 50 * (1 + 1 + 1 + 20 * 3 + 20 * 3) = 6,200+ DB operations per hourly run.
- **Recommended fix:** Batch competition score calculations. Use a single bulk UPDATE instead of per-match updates. Parallelize company processing with `Promise.allSettled()` in batches of 5.
- **Estimated impact:** 10-20x reduction in DB round trips for hot alerts processing.

### ISSUE 1.4: handleUrgencyCheck and handleNewMatchesDigest iterate all companies (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/hot-alerts.processor.ts`, lines 336-464, 467-547
- **Severity:** HIGH
- **Description:** Both functions iterate over ALL companies and make per-company DB queries. `handleUrgencyCheck()` queries matches per company (line 377), then does per-batch UPDATE (line 455). `handleNewMatchesDigest()` queries matches per company (line 483) and does per-batch UPDATE (line 539).
- **Recommended fix:** Use a single DB query to fetch all pending urgency matches grouped by company using a JOIN, instead of N+1 queries.
- **Estimated impact:** N-fold reduction in DB calls where N is the number of companies.

### ISSUE 1.5: pending-notifications processor queries per-user (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/pending-notifications.processor.ts`, lines 87-194
- **Severity:** HIGH
- **Description:** For each user (line 87), queries pending matches (line 104), then queries sent-today count (line 127). With 50 users, this is 100+ DB queries every 5 minutes (28,800/day).
- **Recommended fix:** Batch query: fetch all pending matches grouped by company_id in one query, then distribute to users in memory.
- **Estimated impact:** Reduce from O(users) to O(1) DB queries per 5-minute cycle.

### ISSUE 1.6: runKeywordMatchingSweep re-queries match count per tender (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/keyword-matcher.ts`, lines 720-727
- **Severity:** MEDIUM
- **Description:** After `runKeywordMatching()`, the sweep checks `count` of matches for each tender (line 722-727). This is redundant since `runKeywordMatching()` already returns the match results.
- **Recommended fix:** Use the return value of `runKeywordMatching()` to determine if matches were created.
- **Estimated impact:** Eliminates 1 DB query per tender in sweep.

---

## 2. Missing Pagination

### ISSUE 2.1: system-health endpoint fetches 10,000 match_source rows (CRITICAL)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/admin/system-health/route.ts`, lines 52-56
- **Severity:** CRITICAL
- **Description:** `select('match_source').limit(10000)` fetches up to 10,000 rows just to count match sources. This transfers massive amounts of data over the wire and will OOM the Supabase connection with scale.
- **Recommended fix:** Use a Supabase RPC or GROUP BY query to count match sources server-side. Or use `select('match_source', { count: 'exact', head: true })` with separate calls per source.
- **Estimated impact:** Reduces this endpoint from ~10MB response to ~1KB. Eliminates major Supabase load spike.

### ISSUE 2.2: admin prospects export fetches 10,000 rows without streaming (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/admin/prospects/export/route.ts`, line 28
- **Severity:** HIGH
- **Description:** `.limit(10000)` on `competitor_stats` with `select('*')` loads all columns of 10,000 rows into memory, then processes them into CSV in-memory. With wide rows (JSON columns like `ufs_atuacao`, `modalidades`, `orgaos_frequentes`), this can be 50-100MB.
- **Recommended fix:** Use cursor-based pagination or streaming. Select only needed columns instead of `*`. Consider background job for large exports.
- **Estimated impact:** Prevents OOM on Vercel serverless functions (256MB limit).

### ISSUE 2.3: admin retriage fetches 2000 matches without cursor (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/admin/retriage/route.ts`, line 104
- **Severity:** MEDIUM
- **Description:** `.limit(2000)` is a hard cap that may miss matches. No cursor pagination to process all keyword-only matches.
- **Recommended fix:** Implement cursor-based pagination to process all matches.
- **Estimated impact:** Ensures complete retriage coverage.

---

## 3. Blocking Operations

### ISSUE 3.1: PDF extraction blocks extraction worker (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/chat/route.ts`, lines 306-335
- **Severity:** MEDIUM
- **Description:** `extractPdfText()` downloads and parses PDFs inline during the chat API request (line 314). Large PDFs (up to 50MB) are downloaded, parsed, and then the text is stored. This blocks the API handler for up to 60 seconds.
- **Recommended fix:** Return immediately with available data and extract PDFs asynchronously via a background job. Show a "loading documents" state in the UI.
- **Estimated impact:** Reduces chat API p95 latency from 60s to <5s.

### ISSUE 3.2: Stripe webhook creates new Redis connection per invocation (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/stripe/webhook/route.ts`, lines 76-79
- **Severity:** MEDIUM
- **Description:** On every `checkout.session.completed` event, a new `IORedis` instance is created, used once, then `quit()` is called. This creates TCP connection overhead for every webhook.
- **Recommended fix:** Use the shared `getRedis()` singleton from `@/lib/redis`.
- **Estimated impact:** Eliminates connection overhead on payment events.

---

## 4. Memory Leaks

### ISSUE 4.1: competition-analysis.processor creates standalone Redis connection never closed (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/competition-analysis.processor.ts`, lines 11-13
- **Severity:** HIGH
- **Description:** `const redis = new IORedis(...)` at module level creates a persistent Redis connection that is never closed on shutdown. The `gracefulShutdown()` in worker-matching.ts only closes BullMQ workers, not this standalone Redis connection.
- **Recommended fix:** Use the shared `getCache()` from `redis-cache.ts` or register this connection for cleanup in graceful shutdown.
- **Estimated impact:** Prevents Redis connection leak on worker restart (7 PM2 processes * restarts).

### ISSUE 4.2: worker-matching.ts Redis subscriber connection never closed (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/worker-matching.ts`, lines 77-79
- **Severity:** HIGH
- **Description:** `setupRedisEvents()` creates a new `IORedis` subscriber connection (line 78) that is never closed during graceful shutdown. The `gracefulShutdown()` function only closes BullMQ workers.
- **Recommended fix:** Store the subscriber reference and close it in `gracefulShutdown()`.
- **Estimated impact:** Prevents Redis connection leak and ensures clean shutdown.

### ISSUE 4.3: setInterval in worker-matching never cleared on shutdown (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/worker-matching.ts`, lines 158-175, 199-207, 214-224
- **Severity:** MEDIUM
- **Description:** Multiple `setInterval()` calls for CNAE classification (line 161), keyword matching sweep (line 170), monthly reset (line 186), and semantic matching (line 199) are never cleared in `gracefulShutdown()`. The memory pressure monitor interval (line 214) is also not cleared.
- **Recommended fix:** Store interval references and clear them in `gracefulShutdown()`.
- **Estimated impact:** Ensures clean process exit without lingering timers.

### ISSUE 4.4: setInterval in worker-scraping never cleared on shutdown (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/worker-scraping.ts`, lines 153-163
- **Severity:** MEDIUM
- **Description:** Memory pressure monitor `setInterval()` is not cleared during graceful shutdown.
- **Recommended fix:** Store interval reference and clear in `gracefulShutdown()`.
- **Estimated impact:** Clean process exit.

---

## 5. Missing Rate Limiting

### ISSUE 5.1: /api/generate-profile has no rate limiting (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/generate-profile/route.ts`, line 54
- **Severity:** HIGH
- **Description:** This endpoint calls DeepSeek AI (external API with cost per token) but has NO rate limiting. A malicious user could spam this endpoint and rack up AI API costs.
- **Recommended fix:** Add `checkRateLimit('generate-profile:userId', 5, 60)`.
- **Estimated impact:** Prevents AI cost abuse. Critical for cost control at scale.

### ISSUE 5.2: /api/admin/system-health has no rate limiting (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/admin/system-health/route.ts`, line 15
- **Severity:** MEDIUM
- **Description:** This endpoint makes 12+ parallel DB count queries. No rate limiting means an admin could accidentally DDoS the database by refreshing the dashboard rapidly.
- **Recommended fix:** Add rate limiting (10 req/min) or cache the response in Redis with 60s TTL.
- **Estimated impact:** Prevents accidental DB overload from admin dashboard.

### ISSUE 5.3: /api/admin/retriage has no rate limiting (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/admin/retriage/route.ts`, line 82
- **Severity:** MEDIUM
- **Description:** This endpoint processes up to 2000 matches and calls DeepSeek AI for each batch. No rate limit means it can be called multiple times concurrently.
- **Recommended fix:** Add rate limiting (1 req/5min) or a job-level lock.
- **Estimated impact:** Prevents duplicate processing and AI cost waste.

### ISSUE 5.4: /api/admin/whatsapp has no rate limiting (LOW)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/admin/whatsapp/route.ts`
- **Severity:** LOW
- **Description:** No rate limiting on admin WhatsApp management endpoint. Low risk since admin-only.
- **Recommended fix:** Add basic rate limiting.
- **Estimated impact:** Minor.

### ISSUE 5.5: /api/chat (streaming) has no rate limiting (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/chat/route.ts`, line 156
- **Severity:** HIGH
- **Description:** The chat endpoint calls Gemini 2.5 Flash or DeepSeek with potentially 1M tokens of context. No rate limiting means users can abuse the most expensive endpoint in the system.
- **Recommended fix:** Add `checkRateLimit('chat:userId', 20, 60)`.
- **Estimated impact:** Prevents AI cost explosion. At 1M tokens per request, even 100 req/min = massive costs.

---

## 6. Bundle Size

### ISSUE 6.1: pdfjs-dist included in web app (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/package.json`, line 34
- **Severity:** HIGH
- **Description:** `pdfjs-dist@4.4.168` is ~3MB and is a heavy dependency. The web app also has `pdf-parse` (line 33). Having BOTH PDF libraries is redundant. `pdfjs-dist` is typically for client-side rendering; `pdf-parse` is for server-side extraction.
- **Recommended fix:** Remove `pdfjs-dist` if only using server-side PDF extraction via `pdf-parse`. If client-side PDF viewing is needed, lazy-load it.
- **Estimated impact:** ~3MB reduction in bundle size, faster cold starts on Vercel.

### ISSUE 6.2: xlsx bundled in client (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/package.json`, line 43
- **Severity:** MEDIUM
- **Description:** `xlsx@0.18.5` is ~1.5MB. It's only used in the export API route (server-side). If it's being bundled in client code through barrel exports, it inflates the client bundle.
- **Recommended fix:** Ensure `xlsx` is only imported in API routes (server-side). Use dynamic import if needed.
- **Estimated impact:** Up to 1.5MB client bundle reduction.

### ISSUE 6.3: mapbox-gl always loaded (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/package.json`, line 30
- **Severity:** MEDIUM
- **Description:** `mapbox-gl@3.20.0` is ~1MB and only needed for map views. Should be lazy-loaded.
- **Recommended fix:** Use `next/dynamic` with `ssr: false` for map components.
- **Estimated impact:** ~1MB reduction on initial page load.

### ISSUE 6.4: Duplicate AI SDK in web and workers (LOW)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/package.json` and `/Users/lucasdelima/Desktop/licitagram/packages/workers/package.json`
- **Severity:** LOW
- **Description:** Both `@google/generative-ai` and `openai` are duplicated across web and workers packages. Not a runtime issue but increases install size.
- **Recommended fix:** Consider a shared AI utilities package.
- **Estimated impact:** Minor disk savings.

---

## 7. Connection Pooling

### ISSUE 7.1: Supabase client has no connection pool configuration (CRITICAL)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/lib/supabase.ts`, lines 1-6
- **Severity:** CRITICAL
- **Description:** The Supabase client is a simple singleton with no connection pooling configuration. With 24 processors across 7 PM2 processes, each process creates its own Supabase client. The Supabase Small plan has a connection limit. The `@supabase/supabase-js` client uses `fetch()` under the hood (no persistent TCP pool), but concurrent requests from BullMQ workers can exceed Supabase's connection limits.
- **Recommended fix:** Configure the Supabase client to use the connection pooler URL (pgBouncer on port 6543) instead of the direct URL. Set `db: { schema: 'public' }` and ensure the pooler is enabled in Supabase dashboard.
- **Estimated impact:** Prevents "too many connections" errors under load. Critical for 15K users.

### ISSUE 7.2: Multiple Redis connections per worker process (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/queues/connection.ts` (BullMQ), `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/lib/redis-cache.ts` (cache), `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/competition-analysis.processor.ts` (standalone), `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/worker-matching.ts` (subscriber)
- **Severity:** HIGH
- **Description:** Each worker process creates at least 4 separate Redis connections: (1) BullMQ connection in `connection.ts`, (2) cache connection in `redis-cache.ts`, (3) standalone connection in `competition-analysis.processor.ts`, (4) subscriber in `worker-matching.ts`. With 7 PM2 processes, this is 28+ Redis connections. Upstash free tier limits to 100 concurrent connections.
- **Recommended fix:** Share a single IORedis connection for cache and non-BullMQ operations. BullMQ requires its own connection. Keep subscriber separate (required for pub/sub). Close the standalone competition-analysis connection and use the shared cache.
- **Estimated impact:** Reduces Redis connections from 28+ to ~14 (2 per process: BullMQ + shared cache, with subscriber only in matching pool).

### ISSUE 7.3: Web app Redis connection has no TLS configuration (LOW)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/lib/redis.ts`, lines 21-32
- **Severity:** LOW
- **Description:** Unlike the workers' `connection.ts` (which has TLS config for `rediss://`), the web app's Redis client does not configure TLS for Upstash connections using `rediss://` protocol.
- **Recommended fix:** Add TLS config: `...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {})`.
- **Estimated impact:** Prevents connection failures with Upstash when using TLS.

---

## 8. Background Job Retry & Dead Letter Config

### ISSUE 8.1: hot-alerts queue has no retry configuration (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/queues/hot-alerts.queue.ts`, lines 4-9
- **Severity:** HIGH
- **Description:** No `attempts` or `backoff` in `defaultJobOptions`. If the hot-daily or urgency-check job fails (DB timeout, API error), it will NOT be retried. These are critical business jobs that determine user notifications.
- **Recommended fix:** Add `attempts: 3, backoff: { type: 'exponential', delay: 10000 }`.
- **Estimated impact:** Prevents silent failures of the hot alerts pipeline.

### ISSUE 8.2: pending-notifications queue has no retry configuration (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/queues/pending-notifications.queue.ts`, lines 4-9
- **Severity:** HIGH
- **Description:** No `attempts` or `backoff`. This is a critical queue that runs every 5 minutes to check for undelivered notifications. A single failure means a 5-minute gap in notification delivery.
- **Recommended fix:** Add `attempts: 2, backoff: { type: 'exponential', delay: 5000 }`.
- **Estimated impact:** Ensures notification delivery reliability.

### ISSUE 8.3: map-cache and pipeline-health queues have no retry configuration (LOW)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/queues/map-cache.queue.ts`, `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/queues/pipeline-health.queue.ts`
- **Severity:** LOW
- **Description:** No `attempts` or `backoff`. These are less critical but should still retry on transient failures.
- **Recommended fix:** Add `attempts: 2, backoff: { type: 'exponential', delay: 5000 }`.
- **Estimated impact:** Minor reliability improvement.

### ISSUE 8.4: No dead letter queue (DLQ) for any queue (MEDIUM)

- **File:** All queue files in `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/queues/`
- **Severity:** MEDIUM
- **Description:** None of the 23 BullMQ queues configure a dead letter queue. Failed jobs are kept in-queue (`removeOnFail: N`) but there's no mechanism to alert on persistent failures or move them to a separate queue for manual inspection.
- **Recommended fix:** Implement a global error handler that publishes to a dead-letter queue after max attempts. Add monitoring/alerting on DLQ depth.
- **Estimated impact:** Improves operational visibility and prevents silent data loss.

---

## 9. Caching Gaps

### ISSUE 9.1: Companies table queried on every tender extraction without caching (CRITICAL)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/keyword-matcher.ts`, lines 427-434
- **Severity:** CRITICAL
- **Description:** `runKeywordMatching()` fetches ALL companies from DB on every call. With extraction running at concurrency 3 and 500+ tenders/day, this is 1,500+ full-table reads/day of data that changes maybe once a week.
- **Recommended fix:** Cache the companies list in Redis with a 5-minute TTL. Invalidate on company save (already have the `licitagram:company-saved` pub/sub event).
- **Estimated impact:** Eliminates ~1,500 daily full-table reads. Major DB load reduction.

### ISSUE 9.2: getCompaniesWithUsers() called 3 times per hot-alerts run (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/hot-alerts.processor.ts`, lines 179, 363, 471
- **Severity:** HIGH
- **Description:** Each of the 3 hot-alerts job handlers (`handleHotDaily`, `handleUrgencyCheck`, `handleNewMatchesDigest`) independently calls `getCompaniesWithUsers()`, which queries all users. In a single hot-alerts run, the same user data is fetched 3 times.
- **Recommended fix:** Cache the result in memory within the worker or pass it between handlers.
- **Estimated impact:** 2/3 reduction in user table reads during hot-alerts processing.

### ISSUE 9.3: system-health endpoint has no caching (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/apps/web/src/app/api/admin/system-health/route.ts`
- **Severity:** MEDIUM
- **Description:** Makes 12+ parallel COUNT queries and a 10,000-row fetch on every request. The data changes slowly (minutes, not seconds).
- **Recommended fix:** Cache the entire response in Redis with a 60-second TTL using the existing `cached()` helper.
- **Estimated impact:** Reduces DB load from admin dashboard refreshes.

### ISSUE 9.4: Company plan fetched per-company in hot-alerts without batching (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/hot-alerts.processor.ts`, lines 155-172
- **Severity:** MEDIUM
- **Description:** `getCompanyPlan()` queries the subscriptions table per company with an in-memory cache. However, the initial population requires N queries (one per company).
- **Recommended fix:** Batch-fetch all subscriptions in one query at the start of the hot-daily job.
- **Estimated impact:** Reduces N subscription queries to 1.

---

## 10. Concurrent Access / Race Conditions

### ISSUE 10.1: Match upsert race condition between keyword-matcher and AI triage (HIGH)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/keyword-matcher.ts`, lines 281-373
- **Severity:** HIGH
- **Description:** `upsertMatchAndNotify()` checks for existing match (line 291), then conditionally upserts (line 324). Between the SELECT and the UPSERT, another worker (AI triage or semantic matcher) can modify the same match. The `onConflict` clause partially handles this, but the `match_source` check (lines 297, 312) can lead to lost updates when two workers process the same company-tender pair simultaneously.
- **Recommended fix:** Use a single atomic upsert with a Supabase RPC that handles the match_source priority logic in SQL, using `INSERT ... ON CONFLICT ... DO UPDATE WHERE match_source NOT IN ('ai', 'ai_triage')`.
- **Estimated impact:** Eliminates data inconsistency in match scoring.

### ISSUE 10.2: increment_match_count RPC has no idempotency guard (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/keyword-matcher.ts`, lines 349-359
- **Severity:** MEDIUM
- **Description:** `increment_match_count` is called after every upsert, but if the upsert was actually an UPDATE (not INSERT), the counter is still incremented. On retries (BullMQ attempts), the counter may be double-incremented.
- **Recommended fix:** Only call `increment_match_count` when a genuinely new match is created (check upsert return). Add idempotency key.
- **Estimated impact:** Prevents inflated match counters that could trigger false plan limit warnings.

### ISSUE 10.3: Notification status race condition (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/notification.processor.ts`, lines 201-206 and `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/processors/pending-notifications.processor.ts`, lines 157-193
- **Severity:** MEDIUM
- **Description:** Both the `notification` worker and `pending-notifications` worker can update match status to `notified` concurrently. The pending-notifications worker queries for `status: 'new'` matches (line 108) while the notification worker may be in the process of marking the same match as `notified`. This can lead to duplicate notifications.
- **Recommended fix:** Use a Redis lock (SETNX) keyed on matchId before sending, or use an `UPDATE ... WHERE status = 'new' RETURNING id` pattern to atomically claim the match.
- **Estimated impact:** Prevents duplicate Telegram/WhatsApp messages to users.

### ISSUE 10.4: Redis KEYS command used for cache invalidation (MEDIUM)

- **File:** `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/lib/redis-cache.ts`, lines 81, 82, 100 and `/Users/lucasdelima/Desktop/licitagram/apps/web/src/lib/redis.ts`, line 86
- **Severity:** MEDIUM
- **Description:** `redis.keys(pattern)` is O(N) and blocks Redis for the entire key space scan. At scale with thousands of cache keys, this can cause latency spikes across all Redis operations (including BullMQ).
- **Recommended fix:** Use `SCAN` with cursor-based iteration, or maintain a Redis SET of cache keys per entity for O(1) invalidation.
- **Estimated impact:** Prevents Redis latency spikes during cache invalidation.

---

## Priority Matrix

| Priority | Count | Key Actions |
|----------|-------|-------------|
| CRITICAL | 6 | Cache companies list, fix system-health 10K fetch, use Supabase pooler, batch hot-alerts DB calls |
| HIGH | 11 | Add rate limiting to /chat and /generate-profile, fix Redis connection leaks, add retry to hot-alerts/pending-notifications queues, fix N+1 in pending-notifications |
| MEDIUM | 11 | Fix setInterval cleanup, fix race conditions, use SCAN instead of KEYS, lazy-load heavy dependencies |
| LOW | 4 | Minor improvements |

## Estimated Throughput Impact

| Fix Category | Current Bottleneck | Expected Improvement |
|---|---|---|
| Cache companies in keyword-matcher | ~1,500 full-table reads/day | 10-50x reduction in DB calls |
| Supabase pooler connection | Connection exhaustion at ~100 concurrent | Supports 1,000+ concurrent |
| Fix system-health 10K row fetch | 10MB per admin request | 10,000x reduction |
| Add rate limiting to AI endpoints | Unlimited AI API spend | Cost-controlled scaling |
| Fix hot-alerts N+1 | 6,200+ DB ops per hourly run | 300-600 DB ops (10-20x reduction) |
| Fix Redis connection leaks | 28+ connections per restart cycle | 14 connections stable |
| Add retry to critical queues | Silent failures, lost notifications | 99.9% delivery reliability |

## Quick Wins (< 1 hour each)

1. Add `checkRateLimit()` to `/api/generate-profile` and `/api/chat` routes
2. Add `attempts: 3, backoff` to `hot-alerts` and `pending-notifications` queue configs
3. Replace `select('match_source').limit(10000)` with per-source COUNT queries in system-health
4. Close Redis subscriber connection in `gracefulShutdown()`
5. Use shared `getCache()` in competition-analysis instead of standalone Redis connection
6. Switch Supabase URL to pooler endpoint in worker env config
