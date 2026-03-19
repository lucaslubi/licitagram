# AGENT 01 -- Architecture & Code Quality Audit Report

**Date**: 2026-03-19
**Scope**: Full monorepo (`apps/web/`, `packages/workers/`, `packages/shared/`)
**Auditor**: Agent 01 -- Architecture & Code Quality Specialist

---

## 1. Dead Code

### 1.1 Orphaned Files (never imported)

| File | Evidence |
|------|----------|
| `packages/workers/src/lib/ai-competitor-analysis.ts` | No file in the repo imports from this module. Contains `generateCompetitiveInsight()` using Gemini -- completely unused. |
| `packages/workers/src/scrapers/bec-sp-client.ts` | The BEC-SP scraper is acknowledged as broken in comments ("BEC is migrating to Compras.gov.br"). Worker and queue exist but are never registered in `worker-scraping.ts` or `worker-matching.ts`. |
| `packages/workers/src/scrapers/compras-mg-client.ts` | Same situation as BEC-SP. Comment in `index.ts` line 149 confirms: "BEC-SP and Portal MG scrapers are broken (site migrated / WAF blocks)". |
| `packages/workers/src/processors/bec-sp-scraping.processor.ts` | Has a worker definition but is never imported in any entrypoint (`worker-scraping.ts`, `worker-matching.ts`, `index.ts`). The `index.ts` legacy entrypoint does not load it. |
| `packages/workers/src/processors/compras-mg.processor.ts` | Same as BEC-SP -- never imported in any worker entrypoint. Dead processor. |
| `packages/workers/src/queues/bec-sp-scraping.queue.ts` | Queue definition for dead BEC-SP processor. |
| `packages/workers/src/queues/compras-mg.queue.ts` | Queue definition for dead MG processor. |
| `packages/workers/src/queues/notification-telegram.queue.ts` | Separate telegram queue file exists but the system uses `notification.queue.ts` for Telegram. Check if actually used. |
| `packages/workers/src/scripts/test-local-classifier.ts` | Test/dev script, not production code. |
| `packages/workers/src/scripts/test-local-classifier-v3.ts` | Test/dev script, superseded by v3. |
| `packages/workers/src/scripts/test-matcher-precision.ts` | Test/dev script. |

### 1.2 Unused Imports / Functions

| Location | Issue |
|----------|-------|
| `packages/workers/src/ai/matcher.ts` | `matchCompanyToTender()` is the on-demand AI matcher. Now that matching is on-demand via `/api/analyze`, this entire file is only called from the web API, not from the worker pipeline. The `CNAE_GROUPS` dict duplicates what exists in `ai-triage.processor.ts`. |
| `packages/workers/src/ai/requirement-extractor.ts` | `extractRequirements()` is defined but never called from any processor. The extraction pipeline in `extraction.processor.ts` does PDF text extraction + CNAE classification but does NOT call `extractRequirements()`. |
| `packages/workers/src/ai/summarizer.ts` | `summarizeTender()` is defined but never called from any processor or worker entrypoint. |

**Impact**: ~5 dead scraper files + 2 dead AI modules + 2 dead queues. Approximately 700 lines of unreachable code.

---

## 2. God Objects / Large Files

### Files over 500 lines

| File | Line Count | Issue |
|------|-----------|-------|
| `packages/workers/src/processors/keyword-matcher.ts` | ~742 | Single-file matching engine with 5+ responsibilities: text processing, CNAE scoring, phrase matching, match persistence, notification enqueueing, sweep logic. Should be decomposed. |
| `packages/workers/src/index.ts` | ~742 | Legacy entrypoint that duplicates ALL scheduling logic from `worker-scraping.ts` and `worker-matching.ts`. The entire `setupRepeatableJobs()` function (lines 105-376) is a copy-paste of scheduling logic that exists separately in the split entrypoints. |
| `packages/workers/src/processors/hot-alerts.processor.ts` | ~578 | Three separate job handlers (`handleHotDaily`, `handleUrgencyCheck`, `handleNewMatchesDigest`) packed into one file. Each is a complex function. |
| `packages/workers/src/processors/ai-triage.processor.ts` | ~526 | Contains both the AI triage worker AND the `generateCompanyTerms()` function which is a completely separate concern (term generation). |
| `packages/workers/src/processors/semantic-matcher.ts` | ~515 | Multi-layer matching architecture (recall + precision + LLM judge) in one file. |
| `packages/workers/src/processors/pipeline-health.processor.ts` | ~471 | Close to threshold. Contains recovery actions, health checks, and queue monitoring all in one file. |
| `apps/web/src/lib/cache.ts` | ~536+ | Server-side caching layer with many responsibilities. |

### Functions over 200 lines

| Function | File | Approx Lines |
|----------|------|-------------|
| `setupRepeatableJobs()` | `packages/workers/src/index.ts` | ~272 (lines 105-376) |
| `runKeywordMatching()` | `keyword-matcher.ts` | ~204 (lines 382-586) |
| `handleHotDaily()` | `hot-alerts.processor.ts` | ~158 (borderline, but complex nesting) |

---

## 3. Circular Dependencies

No true circular import chains detected. The architecture uses a clean layered approach: `processors` -> `lib`/`ai`/`scrapers` -> `queues`. However, there is a concerning pattern:

- `extraction.processor.ts` dynamically imports `company-profiler.ts` (line 156: `await import('./company-profiler')`)
- `semantic-matcher.ts` imports `company-profiler.ts` statically
- `ai-triage.processor.ts` dynamically imports `queues/pending-notifications.queue` and `queues/semantic-matching.queue`
- `worker-matching.ts` dynamically imports `ai-triage.processor.ts` for `generateCompanyTerms`

These dynamic imports suggest the authors were working around circular dependency risks but never restructured to eliminate them properly.

---

## 4. Duplicated Logic

### 4.1 CRITICAL: `CNAE_GROUPS` dictionary duplicated 3 times

| Location | Evidence |
|----------|----------|
| `packages/workers/src/processors/ai-triage.processor.ts` lines 16-37 | Full `CNAE_GROUPS: Record<string, string>` with 20 entries |
| `packages/workers/src/ai/matcher.ts` lines 36-53 | Nearly identical `CNAE_GROUPS: Record<string, string>` with 14 entries (subset!) |
| Note: `packages/shared/src/constants/cnae-divisions.ts` has the authoritative `CNAE_DIVISIONS` with richer data | Should be the single source of truth |

**Risk**: The versions are already out of sync. `matcher.ts` has 14 entries while `ai-triage.processor.ts` has 20. Adding a new CNAE group requires updating 3 places. This WILL cause bugs.

### 4.2 Company context builder duplicated 3 times

| Location | Function |
|----------|----------|
| `ai-triage.processor.ts` | `buildCompanyContext()` -- builds text from company data for AI prompts |
| `semantic-matcher.ts` | `buildCompanyContextForJudge()` -- nearly identical logic |
| `ai/matcher.ts` | `cleanCompanyProfile()` -- similar logic with JSON output instead of text |

All three iterate over company CNAEs, build descriptions, and construct prompt context. Should be a single shared utility.

### 4.3 `sleep()` function duplicated 6 times

| Locations |
|-----------|
| `scrapers/pncp-client.ts`, `scrapers/comprasgov-client.ts`, `scrapers/bec-sp-client.ts`, `scrapers/compras-mg-client.ts`, `ai/embedding-client.ts`, `ai/llm-client.ts` |

All are identical `function sleep(ms: number): Promise<void>`. Should be in `lib/utils.ts`.

### 4.4 Scheduling logic duplicated between entrypoints

`index.ts` contains a complete copy of all scheduling logic from `worker-scraping.ts` and `worker-matching.ts`. The `setupRepeatableJobs()` in `index.ts` (272 lines) is a superset of the scheduling in both split entrypoints. This means any scheduling change must be applied in 3 places.

### 4.5 Tender expiry check duplicated

The pattern `if (tender.data_encerramento) { const enc = new Date(...); if (enc < new Date()) ... }` appears in:
- `keyword-matcher.ts` (lines 403-409)
- `notification.processor.ts` (lines 153-166)
- `pending-notifications.processor.ts` (lines 118-123)
- `map-cache.processor.ts` (line 84)
- `hot-alerts.processor.ts` (line 400)

Should be a shared `isTenderExpired(tender)` utility.

---

## 5. Naming Inconsistencies

| Issue | Examples |
|-------|----------|
| Mixed Portuguese/English naming | Functions: `sanitizeValor()`, `upsertTender()`, `enqueueNotifications()`. Fields: `orgao_nome`, `data_encerramento`, `valor_estimado`. Constants: `MIN_NOTIFICATION_SCORE`, `BATCH_SIZE`. The codebase mixes languages inconsistently. |
| Processor file naming | `keyword-matcher.ts` (no `.processor` suffix) vs `ai-triage.processor.ts` (has suffix). `semantic-matcher.ts` (no suffix) vs `semantic-matching.processor.ts` (has suffix). `company-profiler.ts` (no suffix, not a BullMQ worker). |
| Export naming | `mgScrapingWorker` vs `comprasgovScrapingWorker` vs `becSpScrapingWorker` -- some use full name, some abbreviate. |
| Queue vs Worker naming | Queue `notification-whatsapp` vs worker variable `whatsappNotificationWorker` -- inverted word order. |
| `match_source` values | `'keyword'`, `'ai'`, `'ai_triage'`, `'semantic'` -- inconsistent delimiter usage (underscore vs none). |

---

## 6. Deprecated Patterns

| Pattern | Location | Issue |
|---------|----------|-------|
| No `var` usage found | N/A | Good -- all `const`/`let`. |
| Shell command execution | `pipeline-health.processor.ts` line 21-24 | Uses `child_process.exec()` with `promisify` to restart PM2 workers. Should use `execFile()` for safety against injection. |
| `setInterval` for job scheduling | `index.ts`, `worker-matching.ts` | Uses raw `setInterval()` for periodic tasks (CNAE classification every 15min, keyword sweep every 4h). These should use BullMQ repeatable jobs for reliability -- `setInterval` does not survive process restarts and lacks retry/backoff. |
| Module-level `new IORedis()` | `competition-analysis.processor.ts` line 11 | Creates a Redis connection at module load time, separate from the BullMQ connection. Should reuse the shared connection or be lazy-initialized. |
| Direct `fetch()` to Telegram API | `pipeline-health.processor.ts` lines 146-155 | Bypasses the existing `bot` instance to send Telegram messages directly via `fetch()`. Should use the existing bot instance for consistency. |

---

## 7. TODO / FIXME / HACK Comments

| Location | Comment | Risk |
|----------|---------|------|
| `apps/web/src/lib/cache.ts:535` | `// TODO: aggregate by UF if needed` | LOW -- feature gap, not a bug. Map page may show incomplete data by UF. |
| `apps/web/src/lib/cache.ts:536` | `// TODO: aggregate by source if needed` | LOW -- same as above. |
| `packages/workers/src/index.ts:149` | `// BEC-SP and Portal MG scrapers are broken (site migrated / WAF blocks)` | MEDIUM -- dead code that should be removed, not commented about. |

**Note**: Surprisingly few TODO/FIXME comments for a codebase of this size. This suggests either good discipline or undocumented technical debt.

---

## 8. SOLID Violations (Top 5)

### 8.1 Single Responsibility Principle -- `keyword-matcher.ts`

This 742-line file handles: text normalization, tokenization, CNAE scoring, phrase matching, description scoring, match persistence to DB, notification enqueueing, and periodic sweep logic. At least 4 distinct responsibilities that should be separate modules.

### 8.2 Single Responsibility Principle -- `index.ts` (legacy entrypoint)

This 742-line file is a "god entrypoint" that does: worker loading, job scheduling, Redis pub/sub event handling, CNAE classification scheduling, keyword matching scheduling, monthly reset scheduling, semantic matching initialization, memory pressure monitoring, document backfill, and graceful shutdown. Should be decomposed into a scheduling module, an event handler module, and a thin entrypoint.

### 8.3 Open/Closed Principle -- Notification processor

`notification.processor.ts` uses a chain of `if ('type' in job.data && job.data.type === '...')` checks (lines 18, 74, 96) to dispatch different notification types. Adding a new notification type requires modifying this file. Should use a strategy pattern or separate workers per notification type.

### 8.4 Dependency Inversion Principle -- Direct Supabase calls everywhere

Every processor directly imports and calls `supabase` from `lib/supabase.ts`. There is no repository layer or data access abstraction. This makes testing impossible without a live Supabase instance and couples business logic tightly to the database client.

### 8.5 Interface Segregation Principle -- `Record<string, unknown>` overuse

Throughout the codebase, company and tender data is passed as `Record<string, unknown>` and then cast with `as string`, `as string[]`, `as number | null`, etc. Examples:
- `ai-triage.processor.ts` line 315: `const companyData = company as Record<string, unknown>`
- `semantic-matcher.ts` line 311: `company as Record<string, unknown>`
- `notification.processor.ts` line 40: `const tender = (match.tenders as unknown) as Record<string, unknown>`

This abandons type safety entirely. Proper interfaces for company/tender data should be defined in `@licitagram/shared` and used consistently.

---

## 9. Broken / Unused Processors

| Processor | Status | Evidence |
|-----------|--------|----------|
| `matching.processor.ts` | **NO-OP** | Explicitly documented as no-op (line 7-10): "This worker drains any leftover jobs in the queue without calling AI." Just logs and skips. The queue `matching` still exists and `matchingWorker` is registered in `worker-matching.ts`. Should be removed entirely along with the queue. |
| `bec-sp-scraping.processor.ts` | **DEAD** | Has working code but is never imported in any worker entrypoint. BEC-SP site has migrated. |
| `compras-mg.processor.ts` | **DEAD** | Same as BEC-SP. Never imported. Portal MG WAF blocks scraping. |
| `ai/requirement-extractor.ts` | **DEAD** | `extractRequirements()` is never called from any processor. The extraction pipeline skips it entirely. |
| `ai/summarizer.ts` | **DEAD** | `summarizeTender()` is never called from any processor. |

---

## 10. Type Safety Gaps (`any` usage)

### Workers package (6 instances)

| Location | Usage | Severity |
|----------|-------|----------|
| `telegram/bot.ts:273` | `async function handleNotificar(ctx: any)` | MEDIUM -- Telegram context should be typed with grammY types. |
| `keyword-matcher.ts:397` | `tender.modalidade_id as any` | LOW -- cast to bypass `includes()` type check. |
| `map-cache.processor.ts:46,80,89` | `const allMatches: any[]`, `.filter((m: any) =>`, `.map((m: any) =>` | HIGH -- entire map cache data pipeline is untyped. Supabase join results are treated as `any`. |
| `pending-notifications.processor.ts:118` | `pendingMatches.filter((m: any) =>` | MEDIUM -- filter on joined data. |

### Web app (26+ instances)

| Location | Usage | Severity |
|----------|-------|----------|
| `components/map/IntelligenceMap.tsx:268,293,310` | `const fillLayer: any`, `const lineLayer: any`, `const heatmapLayer: any` | LOW -- Mapbox GL types are complex; `any` is common workaround. |
| `components/admin/user-actions.tsx:7` | `{ user: any }` | HIGH -- admin component with no type safety on user object. |
| `components/admin/admin-management.tsx:11` | `{ admin: any }` | HIGH -- same issue. |
| `components/admin/plan-edit-card.tsx:26` | `{ plan: any }` | HIGH -- plan editing with no type safety. |
| `app/(admin)/admin/clients/page.tsx:62` | `.map((client: any) =>` | HIGH -- entire admin client list untyped. |
| `app/(admin)/admin/users/page.tsx:58` | `.map((user: any) =>` | HIGH -- admin user list untyped. |
| `app/(admin)/admin/audit/page.tsx:51` | `.map((log: any) =>` | HIGH -- audit logs untyped. |
| `app/(admin)/admin/admins/page.tsx:17,23` | `.map((admin: any) =>`, `.map((a: any) =>` | HIGH -- admin list untyped. |
| `app/(admin)/admin/financial/page.tsx:67` | `.map((d: any) =>` | HIGH -- financial data untyped. |
| `app/(admin)/admin/clients/[id]/page.tsx:27,96` | `const sub = detail.subscription as any`, `.map((u: any) =>` | HIGH -- client detail page untyped. |
| `app/(dashboard)/opportunities/page.tsx:639` | `{matches?.map((match: any) =>` | HIGH -- main opportunities page, most-visited page, untyped. |
| `app/(admin)/admin/plans/page.tsx:17` | `.map((plan: any) =>` | MEDIUM -- plan listing. |
| `lib/supabase/middleware.ts:213,219` | `(sub as any).plans`, `sub.status as any` | MEDIUM -- middleware auth flow with casts. |
| `actions/company.ts:443` | `const t = m.tenders as any` | MEDIUM -- company action. |
| `actions/admin/financial.ts:24,46` | `(sub as any).plans` | MEDIUM -- repeated 2x in same file. |
| `app/api/admin/whatsapp/route.ts:51,71,96` | `catch (fetchErr: any)`, `catch (err: any)` | LOW -- error handling. |
| `app/api/chat/route.ts:121,370` | `entries.filter((e: any) =>`, `(tender as any).modalidade_id` | MEDIUM -- chat API. |
| `app/(dashboard)/map/page.tsx:26` | `const cacheData: any[] = []` | MEDIUM -- map page data. |

**Total**: 32+ `any` usages across the codebase. The admin section is the worst offender with virtually no type safety on any Supabase query results.

---

## Summary of Critical Findings

### Must-Fix (will cause bugs at scale)

1. **CNAE_GROUPS duplicated 3 times and already out of sync** -- The `matcher.ts` version has 14 entries while `ai-triage.processor.ts` has 20. Companies in CNAEs 73, 80, 81, 95, 26, 61 will get different scoring depending on which code path is used.

2. **matching.processor.ts is a no-op consuming resources** -- It creates a BullMQ worker with concurrency=10 that does nothing except log. Jobs are still being added to the `matching` queue. These consume Redis memory and worker slots for zero value.

3. **`index.ts` duplicates all scheduling from split entrypoints** -- If the system runs both `index.ts` and `worker-scraping.ts`/`worker-matching.ts`, every repeatable job will be scheduled twice, causing duplicate scraping, duplicate notifications, and duplicate AI token consumption.

4. **5 dead files never imported** -- `ai-competitor-analysis.ts`, `requirement-extractor.ts`, `summarizer.ts`, `bec-sp-scraping.processor.ts`, `compras-mg.processor.ts`. Dead code increases cognitive load and maintenance burden.

### Should-Fix (maintenance nightmares)

5. **26+ `any` casts in the web admin section** -- The entire admin panel has zero type safety. Any Supabase schema change will silently break the admin UI at runtime.

6. **`setInterval` for critical periodic tasks** -- CNAE classification (every 15min) and keyword matching sweep (every 4h) use `setInterval` which does not survive process restarts. If the process crashes and restarts, the interval timer resets and the first execution is delayed.

7. **Company context builders duplicated 3 times** -- Three nearly identical functions build AI prompts from company data. Adding a new company field requires updating 3 places.

8. **No data access abstraction** -- Every processor directly calls `supabase.from(...)`. Impossible to test, impossible to mock, impossible to add query logging/caching at the data layer.

9. **`sleep()` utility duplicated 6 times** -- Trivial but symptomatic of no shared utility layer.

10. **Tender expiry check duplicated 5+ times** -- Same date comparison logic scattered across processors.
