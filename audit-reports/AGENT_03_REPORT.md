# Licitagram Security & Compliance Audit Report

**Agent:** 03 - Security & Compliance Auditor
**Date:** 2026-03-19
**Scope:** Full codebase audit (apps/web, packages/workers, supabase migrations)
**Methodology:** Manual static analysis with automated pattern scanning

---

## Executive Summary

The Licitagram application demonstrates a generally solid security posture. Authentication is handled by Supabase Auth, RLS is enabled on all tables, Stripe webhook signatures are verified, and SSRF protections are in place on the PDF proxy. However, several findings require attention, including one **CRITICAL** unauthenticated admin endpoint, a **HIGH** severity Telegram account-linking vulnerability, and multiple **MEDIUM** severity issues around error information leakage and an overly permissive RLS policy.

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 2     |
| MEDIUM   | 5     |
| LOW      | 3     |
| INFO     | 4     |

---

## CRITICAL Findings

### C-01: Unauthenticated Admin Endpoint - System Health

**Severity:** CRITICAL
**OWASP:** A01:2021 - Broken Access Control
**File:** `apps/web/src/app/api/admin/system-health/route.ts`

The `/api/admin/system-health` endpoint has **no authentication or authorization check**. It does not call `getUserWithPlan()`, `requirePlatformAdmin()`, or `supabase.auth.getUser()`. Furthermore, the middleware explicitly excludes `/api/*` routes from auth checks (see middleware matcher pattern).

This endpoint exposes:
- Total counts of all users, companies, subscriptions
- Match source breakdown and subscription plan distribution
- Redis host information
- Infrastructure details (VPS provider, RAM, CPU, workers count)
- Operational alerts about system state

Any unauthenticated request to `GET /api/admin/system-health` returns full internal system metrics.

Additionally, this endpoint uses the **service role key** at module scope (line 7-10), which means the Supabase client is initialized once and reused, bypassing RLS on every call.

**Recommendation:** Add `getUserWithPlan()` + `isPlatformAdmin` check immediately, matching the pattern used in all other admin endpoints.

---

## HIGH Findings

### H-01: Telegram Bot Account Linking Without Verification

**Severity:** HIGH
**OWASP:** A07:2021 - Identification and Authentication Failures
**File:** `packages/workers/src/telegram/bot.ts` (lines 14-103)

The Telegram `/start email@example.com` command links a Telegram chat to a user account based solely on an email address. There is **no verification** that the person sending the command owns that email. An attacker who knows a user's email can link their own Telegram chat to that user's account and receive all tender alert notifications intended for the victim.

This contrasts with the WhatsApp integration, which correctly implements a 6-digit verification code flow (`/api/whatsapp/send-code`, `/api/whatsapp/verify-code`).

**Recommendation:** Implement a verification flow similar to WhatsApp: generate a code, send it to the user's email, and require the user to enter it in Telegram before linking.

### H-02: BOLA/IDOR in Analyze and Batch-Triage Endpoints

**Severity:** HIGH
**OWASP:** A01:2021 - Broken Access Control
**Files:**
- `apps/web/src/app/api/analyze/route.ts`
- `apps/web/src/app/api/batch-triage/route.ts`

Both endpoints accept a `matchId` (or `matchIds[]`) from the client and fetch the match using the authenticated Supabase client (which enforces RLS). However, the endpoints then fetch the associated `company` and `tender` records and update match data. While RLS on the `matches` table restricts reads/updates to the user's own company, there is no **application-level** verification that `match.company_id === userCtx.companyId`.

If RLS policies were ever loosened or a service-role client were accidentally used, this would allow any authenticated user to analyze or triage matches belonging to other companies. The defense-in-depth principle recommends explicit application-level checks.

**Recommendation:** Add an explicit check: `if (match.company_id !== userCtx.companyId) return 403`.

---

## MEDIUM Findings

### M-01: Error Information Leakage in Multiple Endpoints

**Severity:** MEDIUM
**OWASP:** A04:2021 - Insecure Design
**Files:**
- `apps/web/src/app/api/admin/system-health/route.ts` (line 237): `detail: String(err)` -- exposes full error object including stack traces
- `apps/web/src/app/api/admin/whatsapp/route.ts` (lines 75, 100): `error: String(err)` -- exposes Evolution API errors including internal URLs
- `apps/web/src/app/api/generate-profile/route.ts` (lines 109, 166): `err.message` -- exposes DeepSeek API error details
- `apps/web/src/app/api/chat/route.ts` (line 573): `msg.slice(0, 200)` -- exposes partial error messages from AI providers
- `apps/web/src/app/api/admin/prospects/export/route.ts` (line 41): `error.message` -- exposes Supabase query errors

**Recommendation:** Return generic error messages to clients. Log detailed errors server-side only.

### M-02: Overly Permissive RLS Policy on Companies INSERT

**Severity:** MEDIUM
**OWASP:** A01:2021 - Broken Access Control
**File:** `supabase/migrations/20260311000000_initial_schema.sql` (line 206-207)

The companies table has an INSERT policy with `WITH CHECK (true)`, meaning any authenticated user can insert arbitrary company records. While the application may control this via UI/API, the database layer has no restriction. An attacker with a valid JWT could insert unlimited company records directly via the Supabase PostgREST API.

**Recommendation:** Restrict to users who do not already have a `company_id` set, or use a Supabase Edge Function for company creation.

### M-03: Missing Rate Limiting on Chat Endpoint

**Severity:** MEDIUM
**OWASP:** A04:2021 - Insecure Design
**File:** `apps/web/src/app/api/chat/route.ts`

The chat endpoint (`POST /api/chat`) does not implement rate limiting, unlike all other AI endpoints which use `checkRateLimit()`. This endpoint streams responses from Gemini/DeepSeek and could be abused to run up API costs.

**Recommendation:** Add `checkRateLimit('chat:${userCtx.userId}', ...)` at the start of the handler.

### M-04: Weak Password Policy

**Severity:** MEDIUM
**OWASP:** A07:2021 - Identification and Authentication Failures
**File:** `apps/web/src/app/(auth)/register/page.tsx` (line 104)

The registration form only enforces `minLength={6}` on the password field. There are no complexity requirements (uppercase, numbers, special characters). The server-side `signUp` action delegates to Supabase Auth which has its own minimum but no complexity enforcement by default.

**Recommendation:** Enforce a stronger password policy: minimum 8 characters, at least one uppercase letter, one number, and one special character. Implement this both client-side (UI feedback) and server-side (Supabase Auth configuration or custom validation).

### M-05: SSRF Bypass via DNS Rebinding in PDF Proxy

**Severity:** MEDIUM
**OWASP:** A10:2021 - Server-Side Request Forgery
**Files:**
- `apps/web/src/app/api/chat/proxy-pdf/route.ts`
- `apps/web/src/app/api/chat/route.ts` (function `isSafeUrl`)

Both SSRF protection implementations check hostnames against a blocklist (localhost, 10.x, 192.168.x, etc.) but do not resolve DNS before making the request. An attacker could use DNS rebinding: register a domain that initially resolves to a public IP (passing the check) but then resolves to an internal IP (127.0.0.1) when `fetch()` actually connects.

Additionally, the proxy-pdf endpoint allows `http://` protocol (line 34), which could be used to probe internal HTTP services even without DNS rebinding.

The `redirect: 'follow'` option means the initial URL could pass validation but redirect to an internal address.

**Recommendation:**
1. Resolve DNS and check the resulting IP address, not just the hostname string
2. Block `http://` protocol in the proxy endpoint (only allow `https://`)
3. Consider using `redirect: 'manual'` and validating each redirect URL

---

## LOW Findings

### L-01: Supabase Service Role Key Used at Module Scope

**Severity:** LOW
**OWASP:** A05:2021 - Security Misconfiguration
**File:** `apps/web/src/app/api/admin/system-health/route.ts` (lines 7-10)

The Supabase service role client is created at module scope (not inside a function). This means the client is shared across all requests in the same serverless function instance. While not directly exploitable in Vercel's environment, it is a deviation from the pattern used in all other files which create clients inside functions.

**Recommendation:** Move client creation inside the request handler or into a factory function, matching the pattern in other files.

### L-02: Missing Content-Type Validation on PDF Proxy Response

**Severity:** LOW
**OWASP:** A04:2021 - Insecure Design
**File:** `apps/web/src/app/api/chat/proxy-pdf/route.ts`

The proxy downloads content from a user-supplied URL but does not validate that the response is actually a PDF before returning it with `Content-Type: application/pdf`. A malicious URL could return HTML/JavaScript content that would be served from the application's origin.

**Recommendation:** Check the response Content-Type header or validate the PDF magic bytes (`%PDF`) before proxying.

### L-03: Telegram Bot Match Actions Without Ownership Verification

**Severity:** LOW
**OWASP:** A01:2021 - Broken Access Control
**File:** `packages/workers/src/telegram/bot.ts` (lines 527-538)

The `match_(interested|dismiss)_(.+)` callback handler updates a match status using the service-role Supabase client. It does not verify that the Telegram user owns the match they are acting on. A user who receives a matchId (e.g., from a shared screenshot) could craft a callback to change another user's match status.

In practice, exploitation requires the attacker to be in the same Telegram bot chat and know a valid matchId, making this low severity.

**Recommendation:** Verify `match.company_id` matches the company linked to the Telegram chat ID before updating.

---

## INFO Findings

### I-01: No Hardcoded Secrets Found

**Severity:** INFO

Comprehensive scan of all `.ts`, `.tsx`, `.js`, `.json`, and `.yaml` files found no hardcoded API keys, passwords, tokens, or credentials. All secrets are loaded from environment variables. The `.env` file is properly listed in `.gitignore`. The `.env.example` file contains only empty placeholder values.

### I-02: No XSS Vulnerabilities Found

**Severity:** INFO

No instances of unsafe HTML rendering patterns were found in the codebase. React's default JSX escaping provides protection against XSS. User input rendered via `react-markdown` uses a safe Markdown parser.

### I-03: No SQL Injection Vulnerabilities Found

**Severity:** INFO

All database queries use the Supabase query builder (parameterized queries). No raw SQL string concatenation was found. The one instance of user input in an `.ilike()` filter (prospects export search, line 32) sanitizes input by stripping non-alphanumeric characters before use.

### I-04: Stripe Webhook Signature Verification is Correctly Implemented

**Severity:** INFO

The Stripe webhook endpoint (`/api/stripe/webhook/route.ts`) correctly:
- Requires `STRIPE_WEBHOOK_SECRET` to be configured
- Reads the raw request body with `request.text()`
- Validates the `stripe-signature` header
- Uses `stripe.webhooks.constructEvent()` for constant-time signature verification
- Returns 400 on missing or invalid signatures

---

## Additional Observations

### CSRF Protection

Next.js Server Actions use built-in CSRF tokens. API routes use Supabase session cookies (SameSite=Lax) which provides basic CSRF protection. The `PLAN_CTX_COOKIE` is set with `httpOnly: true`, `secure: true` (in production), and `sameSite: 'lax'`. The revalidate endpoint uses a shared secret with constant-time comparison (`timingSafeEqual`).

### CORS Configuration

No explicit CORS headers or wildcard CORS (`*`) were found in the codebase. Next.js API routes do not set CORS headers by default, which means they are only accessible from the same origin. This is the correct configuration for a server-rendered app.

### Admin Security

All admin API endpoints except `system-health` (see C-01) properly check `isPlatformAdmin` via `getUserWithPlan()`. The admin middleware redirects non-admin users to `/map`. Granular admin permissions are implemented via the `admin_permissions` JSONB column.

### File Upload Validation

The file upload endpoint (`/api/chat/upload`) validates:
- File type (PDF only, by MIME type and extension)
- File size (max 50MB, min 100 bytes)
- Content (attempts PDF text extraction, rejects if < 50 chars)

### Dependency Notes

- `pdf-parse` v1.1.1 is unmaintained (last updated 2019) and has known prototype pollution risk in test dependencies. Consider alternatives like `pdf2json` or `pdfjs-dist` (already in the project).
- `xlsx` v0.18.5 (SheetJS Community Edition) has limited security support. The commercial version receives security patches faster.

---

## Prioritized Remediation Plan

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | C-01: Add auth to system-health endpoint | 5 min | Blocks unauthenticated data leak |
| 2 | H-01: Add Telegram linking verification | 2-4 hrs | Prevents account hijacking |
| 3 | H-02: Add explicit company_id checks | 30 min | Defense-in-depth for BOLA |
| 4 | M-01: Sanitize error responses | 1 hr | Prevents info disclosure |
| 5 | M-02: Restrict companies INSERT policy | 15 min | Prevents data pollution |
| 6 | M-03: Add rate limiting to chat endpoint | 10 min | Prevents API cost abuse |
| 7 | M-04: Strengthen password policy | 1 hr | Improves auth security |
| 8 | M-05: Improve SSRF protections | 2-3 hrs | Prevents internal network access |

---

*Report generated by Agent 03 - Security & Compliance Auditor*
*Audit methodology: Static analysis of all source files, SQL migrations, and configuration*
