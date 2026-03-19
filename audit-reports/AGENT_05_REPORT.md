# AGENT 05 -- API Design & Integration Reliability Audit

**Date:** 2026-03-19
**Scope:** 20 API routes in `apps/web/src/app/api/`, 17+ external API integrations in `packages/workers/`

---

## 1. HTTP Status Codes -- Incorrect 200 With Error Payloads

### SEVERITY: HIGH

| Endpoint | Issue | File |
|----------|-------|------|
| `GET /api/admin/whatsapp` | Returns 200 with `{ state: 'error', error: '...' }` when Evolution API is unreachable (line 52-57) | `apps/web/src/app/api/admin/whatsapp/route.ts` |
| `GET /api/admin/retriage` | Returns 200 with `{ message: 'No untriaged matches found', total: 0 }` -- debatable, but no clear error/success envelope | `apps/web/src/app/api/admin/retriage/route.ts` |
| `POST /api/batch-triage` | Returns 200 with `{ results: [] }` when matches are empty (line 141) -- no distinction from success with zero results vs. "matches not found" | `apps/web/src/app/api/batch-triage/route.ts` |

**Recommendation:** The admin whatsapp GET endpoint is the most egregious -- an error reaching the Evolution API returns HTTP 200. This should return 502 (Bad Gateway). The batch endpoints returning empty arrays on 200 are debatable but should at least be documented.

---

## 2. Input Validation

### SEVERITY: HIGH

| Endpoint | Issue | File |
|----------|-------|------|
| `GET /api/admin/prospects/export` | `sortField` from query params is passed directly to `.order()` (line 21-27). No validation of the field name. **SQL injection risk via Supabase order clause.** | `apps/web/src/app/api/admin/prospects/export/route.ts` |
| `POST /api/admin/whatsapp` | `action` from request body is loosely checked with `if` statements but no schema validation. No validation of JSON parse. | `apps/web/src/app/api/admin/whatsapp/route.ts` |
| `POST /api/stripe/checkout` | `planId` from body is not validated as UUID before DB query. | `apps/web/src/app/api/stripe/checkout/route.ts` |
| `POST /api/generate-profile` | `type` field has loose manual validation. No Zod/schema validation. `razao_social`, `capacidades`, `palavras_chave` are accepted without type checking. | `apps/web/src/app/api/generate-profile/route.ts` |
| `POST /api/chat` | `question` length validated (max 2000) but `chatHistory` array has no size cap -- could send thousands of messages. `uploadedDocsText` has no size limit. | `apps/web/src/app/api/chat/route.ts` |
| `POST /api/admin/retriage` | `company_id` from query params is not validated as UUID. | `apps/web/src/app/api/admin/retriage/route.ts` |
| `POST /api/revalidate` | `target` is validated via switch/default, but `companyId` is not validated. | `apps/web/src/app/api/revalidate/route.ts` |
| `POST /api/whatsapp/disconnect` | No request body expected, no validation needed -- acceptable. | `apps/web/src/app/api/whatsapp/disconnect/route.ts` |

### SEVERITY: MEDIUM -- No Zod/Joi Anywhere

**Zero endpoints use schema validation libraries.** All input validation is manual `if` checks. This is fragile and inconsistent. The codebase should adopt Zod for all POST body validation.

**Affected endpoints (all 13 POST routes):**
- `/api/analyze`
- `/api/batch-triage`
- `/api/chat`
- `/api/chat/upload`
- `/api/competitors/analyze`
- `/api/generate-profile`
- `/api/revalidate`
- `/api/stripe/checkout`
- `/api/stripe/webhook`
- `/api/admin/retriage`
- `/api/admin/whatsapp`
- `/api/whatsapp/send-code`
- `/api/whatsapp/verify-code`

---

## 3. Response Consistency

### SEVERITY: MEDIUM

**No unified response envelope format.** Endpoints return inconsistent shapes:

| Pattern | Used By |
|---------|---------|
| `{ error: string }` | Most error responses |
| `{ success: true }` | `/whatsapp/disconnect`, `/whatsapp/send-code` |
| `{ ok: true }` | `/admin/whatsapp` POST, `/revalidate` |
| `{ received: true }` | `/stripe/webhook` |
| `{ cached: boolean, matchId, score, ... }` | `/analyze` |
| `{ results: [...] }` | `/batch-triage` |
| `{ url: string }` | `/stripe/checkout` |
| Raw binary (CSV/XLSX/PDF) | `/export`, `/admin/prospects/export`, `/chat/proxy-pdf` |
| SSE stream | `/chat` |

**Recommendation:** Adopt a standard envelope like `{ success: boolean, data?: T, error?: string, meta?: {} }` for all JSON responses. Binary/stream endpoints are exempt.

---

## 4. External API Resilience

### 4.1 PNCP API (pncp.gov.br)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | YES | 3 retries with exponential backoff (`2^attempt * 2000ms`) |
| Timeout | NO | No AbortSignal/timeout on fetch calls |
| Circuit breaker | NO | None |
| Error transformation | PARTIAL | Errors logged, some swallowed silently in `fetchDocumentos` |

**File:** `packages/workers/src/scrapers/pncp-client.ts`
**Severity:** MEDIUM -- Missing timeouts mean a hung PNCP server blocks the worker indefinitely.

### 4.2 Comprasgov / DadosAbertos API

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | YES | 3 retries with exponential backoff (`2^attempt * 3000ms`) |
| Timeout | YES | 30s via AbortController |
| Circuit breaker | NO | None |
| Error transformation | YES | Errors properly logged and re-thrown |

**File:** `packages/workers/src/scrapers/comprasgov-client.ts`
**Severity:** LOW -- Well-implemented. ARP endpoint has extended 45s timeout for its known slowness.

### 4.3 BEC SP (Bolsa Eletronica de Compras)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | YES | 2 retries with exponential backoff |
| Timeout | YES | 15s via AbortController |
| Circuit breaker | NO | None |
| Error transformation | YES | Graceful degradation, returns empty array on failure |

**File:** `packages/workers/src/scrapers/bec-sp-client.ts`
**Severity:** LOW -- Graceful degradation is well implemented.

### 4.4 Portal MG (Compras Minas Gerais)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | YES | 2 retries with exponential backoff |
| Timeout | YES | 20s via AbortController |
| Circuit breaker | NO | None |
| Error transformation | YES | Graceful degradation |

**File:** `packages/workers/src/scrapers/compras-mg-client.ts`
**Severity:** LOW

### 4.5 PNCP Results API

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | YES | 3 retries, linear backoff for 429 (5s * attempt) |
| Timeout | NO | No AbortSignal on fetch calls |
| Circuit breaker | NO | None |
| Error transformation | PARTIAL | Some errors silently return empty |

**File:** `packages/workers/src/scrapers/pncp-results-client.ts`
**Severity:** MEDIUM -- Missing timeouts.

### 4.6 DeepSeek API (LLM)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | YES (workers) / NO (web API routes) | `llm-client.ts` has 3 retries with multi-provider fallback. Web routes (`/analyze`, `/batch-triage`, `/generate-profile`) make single calls with no retry. |
| Timeout | PARTIAL | `generate-profile` sets `timeout: 45_000` on the client. Other routes rely on Vercel function timeout (60s). |
| Circuit breaker | NO | None |
| Error transformation | YES | 429/rate limit errors are detected and transformed to proper HTTP 429 |

**Files:** `packages/workers/src/ai/llm-client.ts`, `apps/web/src/app/api/analyze/route.ts`, `apps/web/src/app/api/batch-triage/route.ts`, `apps/web/src/app/api/generate-profile/route.ts`
**Severity:** HIGH -- Web API routes calling DeepSeek directly have no retry logic. A single transient failure returns a 500 to the user.

### 4.7 OpenRouter / Gemini (Chat)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | PARTIAL | Falls back from OpenRouter to DeepSeek on failure, but no retry within each provider |
| Timeout | NO | No explicit timeout on streaming calls. Relies on Vercel function timeout. |
| Circuit breaker | NO | None |
| Error transformation | YES | Stream errors are caught and error message injected into stream |

**File:** `apps/web/src/app/api/chat/route.ts`
**Severity:** MEDIUM

### 4.8 Gemini API (Competitor Analysis)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | NO | Single call, no retry |
| Timeout | NO | No explicit timeout |
| Circuit breaker | NO | None |
| Error transformation | PARTIAL | 429 detected, but general errors become generic 500 |

**Files:** `apps/web/src/app/api/competitors/analyze/route.ts`, `packages/workers/src/lib/ai-competitor-analysis.ts`
**Severity:** HIGH -- No retry, no timeout. Gemini API transient failures directly fail the user request.

### 4.9 Jina AI (Embeddings)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | PARTIAL | Falls back to OpenAI, but no retry within Jina |
| Timeout | NO | No timeout on fetch calls |
| Circuit breaker | NO | None |
| Error transformation | YES | Errors logged, fallback invoked |

**File:** `packages/workers/src/ai/embedding-client.ts`
**Severity:** MEDIUM -- Missing timeout means a hung Jina API blocks the embedding pipeline.

### 4.10 OpenAI (Embeddings fallback)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | NO | Single attempt, throws on failure |
| Timeout | NO | No timeout |
| Circuit breaker | NO | None |
| Error transformation | YES | Error message includes status code |

**File:** `packages/workers/src/ai/embedding-client.ts`
**Severity:** MEDIUM

### 4.11 Together.ai / Groq (LLM fallback)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | YES | Part of the multi-provider chain in `llm-client.ts` |
| Timeout | NO | No explicit timeout on OpenAI SDK calls |
| Circuit breaker | NO | None |
| Error transformation | YES | Proper fallback chain |

**File:** `packages/workers/src/ai/llm-client.ts`
**Severity:** LOW -- Fallback chain provides resilience.

### 4.12 Evolution API (WhatsApp)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | NO | Single attempt in both web and worker clients |
| Timeout | YES | 30s via AbortSignal.timeout |
| Circuit breaker | NO | None |
| Error transformation | YES | HTTP errors thrown with status and body |

**Files:** `packages/workers/src/whatsapp/client.ts`, `apps/web/src/lib/evolution-api.ts`
**Severity:** MEDIUM -- No retry. If Evolution API is temporarily down, WhatsApp notifications silently fail.

### 4.13 Telegram Bot (grammY)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | PARTIAL | grammY library handles some retries internally |
| Timeout | PARTIAL | 5s timeout on deleteWebhook at startup |
| Circuit breaker | NO | None |
| Error transformation | YES | `bot.catch()` handler logs errors |

**File:** `packages/workers/src/telegram/bot.ts`
**Severity:** LOW -- grammY handles most resilience internally.

### 4.14 BrasilAPI (CNPJ Lookup)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | PARTIAL | Single retry on 429 after 5s delay. No retry on other errors. |
| Timeout | YES | 15s via AbortSignal.timeout |
| Circuit breaker | NO | None |
| Error transformation | YES | Returns null on failure |

**File:** `packages/workers/src/processors/contact-enrichment.processor.ts`
**Severity:** LOW -- Graceful degradation (returns null) prevents pipeline blocking.

### 4.15 Stripe API

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | YES | Stripe SDK has built-in retry logic |
| Timeout | YES | Stripe SDK handles timeouts |
| Circuit breaker | NO | None (SDK manages) |
| Error transformation | PARTIAL | Errors bubble up as 500 without specific handling |

**Files:** `apps/web/src/app/api/stripe/checkout/route.ts`, `apps/web/src/app/api/stripe/webhook/route.ts`
**Severity:** LOW

### 4.16 Supabase

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | NO | Single attempt everywhere |
| Timeout | NO | No explicit timeout |
| Circuit breaker | NO | None |
| Error transformation | PARTIAL | Some endpoints check for errors, others ignore the error field |

**Files:** Used in every route and processor
**Severity:** MEDIUM -- Multiple endpoints ignore Supabase error responses (e.g., `whatsapp/disconnect` lines 12-18 do not check update error).

### 4.17 PDF Extraction (pdf-parse)

| Aspect | Status | Detail |
|--------|--------|--------|
| Retry logic | NO | Single attempt |
| Timeout | YES | 60s via AbortSignal.timeout on the fetch |
| Circuit breaker | NO | None |
| Error transformation | YES | Returns null on failure |

**Files:** `packages/workers/src/scrapers/pdf-extractor.ts`, `apps/web/src/app/api/chat/route.ts`
**Severity:** LOW -- 60s timeout is appropriate for large PDFs.

---

## 5. Webhook Security

### 5.1 Stripe Webhook

**Severity:** LOW (properly implemented)

- Signature verification: **YES** -- `stripe.webhooks.constructEvent(body, sig, webhookSecret)` on line 38 of `apps/web/src/app/api/stripe/webhook/route.ts`
- Raw body handling: **YES** -- uses `request.text()` (not `request.json()`) to preserve the raw body for signature verification
- Missing signature check: **YES** -- returns 400 if `stripe-signature` header is absent

### 5.2 Revalidation Webhook

**Severity:** LOW (properly implemented)

- Uses constant-time comparison via `timingSafeEqual` to prevent timing attacks
- Bearer token authentication
- File: `apps/web/src/app/api/revalidate/route.ts`

### 5.3 Missing Webhook Security

**Severity:** INFO

- No Telegram webhook endpoint (bot uses polling, not webhooks)
- No Evolution API webhook endpoint (only outbound calls)

---

## 6. Rate Limiting Coverage

### Endpoints WITH Rate Limiting

| Endpoint | Limit | Window | File |
|----------|-------|--------|------|
| `POST /api/analyze` | 10 req | 60s | `apps/web/src/app/api/analyze/route.ts` |
| `POST /api/batch-triage` | 30 req | 60s | `apps/web/src/app/api/batch-triage/route.ts` |
| `GET /api/chat/proxy-pdf` | 30 req | 60s | `apps/web/src/app/api/chat/proxy-pdf/route.ts` |
| `POST /api/chat/upload` | 10 req | 60s | `apps/web/src/app/api/chat/upload/route.ts` |
| `POST /api/competitors/analyze` | 5 req | 60s | `apps/web/src/app/api/competitors/analyze/route.ts` |
| `GET /api/export` | 5 req | 60s | `apps/web/src/app/api/export/route.ts` |
| `POST /api/whatsapp/send-code` | 3 req | 300s | `apps/web/src/app/api/whatsapp/send-code/route.ts` |
| `POST /api/whatsapp/verify-code` | 10 req | 300s | `apps/web/src/app/api/whatsapp/verify-code/route.ts` |

### Endpoints WITHOUT Rate Limiting (that SHOULD have it)

**Severity:** HIGH

| Endpoint | Risk | Recommendation |
|----------|------|----------------|
| `POST /api/chat` | Streams AI responses, expensive API calls (Gemini/DeepSeek). No rate limit. | Add 10 req/min per user |
| `POST /api/stripe/checkout` | Could be abused to create many Stripe checkout sessions | Add 5 req/min per user |
| `POST /api/generate-profile` | Calls DeepSeek API, no rate limit | Add 10 req/min per user |
| `GET /api/admin/retriage` | Triggers potentially thousands of DeepSeek API calls | Add 1 req/5min (admin-only but still expensive) |
| `GET /api/admin/prospects/export` | Large CSV export, limit 10000 rows, no rate limit | Add 5 req/min |

### Rate Limiter Design Issue

**Severity:** MEDIUM

The rate limiter in `apps/web/src/lib/rate-limit.ts` (line 15) is **fail-open**: if Redis is unavailable, all requests are allowed. This is intentional but means rate limiting is completely bypassed during Redis outages.

---

## 7. Timeout Handling

### SEVERITY: HIGH

| Operation | Timeout | Issue | File |
|-----------|---------|-------|------|
| `POST /api/chat` (AI streaming) | None explicit | Relies on Vercel function timeout (default 10s on hobby, 60s on pro). No AbortSignal on OpenRouter/DeepSeek streaming calls. If the AI hangs, the request hangs. | `apps/web/src/app/api/chat/route.ts` |
| `POST /api/analyze` (AI analysis) | None explicit | DeepSeek SDK call with no timeout. Document text can be 200K+ chars. | `apps/web/src/app/api/analyze/route.ts` |
| `POST /api/batch-triage` | None explicit | DeepSeek call with no timeout. | `apps/web/src/app/api/batch-triage/route.ts` |
| `POST /api/competitors/analyze` | None explicit | Gemini API call with no timeout. | `apps/web/src/app/api/competitors/analyze/route.ts` |
| `GET /api/admin/retriage` | None | Processes up to 2000 matches sequentially with 300ms delays. Could run for 10+ minutes. No overall timeout. | `apps/web/src/app/api/admin/retriage/route.ts` |
| `POST /api/generate-profile` | 45s (SDK level) | Only endpoint with an explicit timeout on the AI call. Good. | `apps/web/src/app/api/generate-profile/route.ts` |
| PNCP client (fetch) | None | `fetchWithRetry` has no AbortSignal. | `packages/workers/src/scrapers/pncp-client.ts` |
| PNCP Results client | None | `fetchWithRetry` has no AbortSignal. | `packages/workers/src/scrapers/pncp-results-client.ts` |
| Embedding client (Jina/OpenAI) | None | Fetch calls have no timeout. | `packages/workers/src/ai/embedding-client.ts` |
| LLM client (workers) | None | OpenAI SDK calls have no timeout. | `packages/workers/src/ai/llm-client.ts` |

**Well-handled timeouts:**
- PDF proxy: 60s (`AbortSignal.timeout`)
- Chat PDF extraction: 60s (`AbortSignal.timeout`)
- Worker PDF extraction: 60s (`AbortSignal.timeout`)
- Comprasgov client: 30s (`AbortController`)
- BEC SP client: 15s (`AbortController`)
- Portal MG client: 20s (`AbortController`)
- Evolution API: 30s (`AbortSignal.timeout`)
- BrasilAPI: 15s (`AbortSignal.timeout`)
- Comprasgov ARP: 45s (extended for known slowness)

**Critical gap:** The `GET /api/admin/retriage` endpoint has `maxDuration` not set and could run for 10+ minutes, well beyond Vercel's function timeout. However, `GET /api/admin/system-health` correctly sets `export const maxDuration = 30`.

---

## 8. Idempotency

### SEVERITY: HIGH

#### Stripe Webhook Idempotency

**File:** `apps/web/src/app/api/stripe/webhook/route.ts`

- `checkout.session.completed`: Uses `upsert` with `onConflict: 'company_id'` (line 58-69). This IS idempotent for the subscription record itself. **However**, the Stripe customer creation and Redis cache invalidation happen every time, which could cause unnecessary Redis churn on duplicate deliveries.

- `invoice.paid`: Uses `update ... eq('stripe_subscription_id', subscriptionId)`. Idempotent -- re-running sets the same values.

- `customer.subscription.deleted`: Uses `update ... eq('stripe_subscription_id', subscription.id)`. Idempotent.

- `invoice.payment_failed`: Uses `update ... eq('stripe_subscription_id', failedSubId)`. Idempotent.

**Overall Stripe webhook idempotency:** ACCEPTABLE. The upsert pattern prevents duplicate subscriptions. No event deduplication by event ID, but the operations are naturally idempotent.

#### Revalidation Webhook Idempotency

**File:** `apps/web/src/app/api/revalidate/route.ts`

Naturally idempotent -- cache invalidation is safe to repeat.

#### WhatsApp Verification Code

**File:** `apps/web/src/app/api/whatsapp/send-code/route.ts`

- Deletes existing unverified codes before inserting new one (line 33-37). Safe for duplicates.
- But rate limiting is the main protection here.

#### Match Status Updates (Telegram bot)

**File:** `packages/workers/src/telegram/bot.ts`

- `match_(interested|dismiss)` callback: Updates match status via `supabase.from('matches').update(...)`. Idempotent -- same status is set regardless of duplicates.
- **However**, `/notificar` command marks matches as `notified` (line 337). If run concurrently or duplicated, could send the same alert twice before the status is updated. No transaction/lock.

**Severity:** MEDIUM for the notification race condition.

---

## Summary of Critical Findings

### HIGH Severity (Fix Immediately)

1. **No input validation library** -- All 13 POST endpoints use ad-hoc manual checks. Adopt Zod.
2. **`sortField` injection in prospects export** -- User-controlled query param passed directly to Supabase `.order()` without allowlist validation.
3. **`POST /api/chat` has no rate limiting** -- Most expensive endpoint (AI streaming) is completely unthrottled.
4. **Web API routes calling AI without retry** -- `/analyze`, `/batch-triage`, `/competitors/analyze` make single AI calls with no retry. Transient failures directly fail user requests.
5. **Missing timeouts on AI calls** -- Most AI SDK calls in web routes have no explicit timeout. A hung AI provider hangs the user request until Vercel kills it.
6. **`GET /api/admin/whatsapp` returns 200 on error** -- Evolution API unreachable returns HTTP 200 with error in body.

### MEDIUM Severity (Fix Soon)

7. **No unified response envelope** -- Inconsistent response shapes across endpoints.
8. **Rate limiter is fail-open** -- Redis outage disables all rate limiting.
9. **No circuit breakers anywhere** -- If an external API goes down, the system keeps hammering it with requests.
10. **Missing timeouts on PNCP and embedding clients** -- Workers can hang indefinitely.
11. **No retry on Evolution API calls** -- WhatsApp notification delivery has no retry logic.
12. **`/admin/retriage` can run indefinitely** -- No `maxDuration` export, no overall timeout.
13. **Supabase error responses ignored** in several places (`/whatsapp/disconnect`, various update calls).
14. **Notification race condition** -- Telegram `/notificar` can double-send if triggered concurrently.

### LOW Severity (Track/Improve)

15. Stripe webhook has no event ID deduplication (but operations are naturally idempotent).
16. No structured error codes -- errors are free-text strings, making client-side error handling fragile.
17. `chatHistory` array in `/api/chat` has no max size validation.
18. `uploadedDocsText` in `/api/chat` has no max size validation.
