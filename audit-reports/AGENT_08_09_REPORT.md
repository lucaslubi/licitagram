# AGENT 08+09 -- Observability & Infrastructure Audit Report

**Date**: 2026-03-19
**Scope**: Observability (logging, error tracking, health checks, metrics) and Infrastructure (PM2, graceful shutdown, Docker, backups, env validation)
**Codebase**: `/Users/lucasdelima/Desktop/licitagram/`

---

## Executive Summary

The system has a **solid foundation** for a production application of this scale. Structured JSON logging via Pino, a self-healing pipeline health supervisor, queue metrics daemon, graceful shutdown handlers, and memory pressure monitoring are all in place. However, there are **critical gaps**: no error tracking service (Sentry/Datadog), no HTTP health check endpoints, no log rotation configuration, no database backup automation, no environment validation for worker processes, and numerous silent catch blocks that swallow errors without any logging.

**Overall Risk Level: MEDIUM-HIGH** -- The system works today but has significant blind spots that will make incident diagnosis and disaster recovery difficult.

---

## PART 1: OBSERVABILITY AUDIT

### 1. Silent Failures

**Severity: HIGH**

The codebase has two categories of silent failures:

#### A. Completely Silent `catch {}` Blocks (no logging, no error capture)

These are the most dangerous -- errors are swallowed with zero visibility:

| File | Line | Context |
|------|------|---------|
| `packages/workers/src/lib/redis-cache.ts` | L40, L51, L67, L105, L117, L134, L146 | **7 instances** -- All Redis cache operations silently fail. If Redis goes down, there is zero logging of cache misses/failures. |
| `packages/workers/src/processors/pipeline-health.processor.ts` | L103, L155, L231, L368, L385 | Health supervisor itself silently catches errors in stalled job recovery (L103), admin alerting (L155), and queue checks (L231). |
| `packages/workers/src/processors/ai-triage.processor.ts` | L281, L369, L391 | Notification queue enqueueing and semantic matching triggers silently fail. |
| `packages/workers/src/processors/semantic-matcher.ts` | L431, L439, L449 | Cache invalidation and notification enqueueing silently fail. |
| `packages/workers/src/processors/keyword-matcher.ts` | L713 | CNAE classification failure silently swallowed. |
| `packages/workers/src/processors/contact-enrichment.processor.ts` | L37 | Contact lookup silently fails. |
| `packages/workers/src/whatsapp/client.ts` | L84 | WhatsApp connectivity check silently fails. |
| `packages/workers/src/scrapers/bec-sp-client.ts` | L187 | Malformed row parsing silently skipped. |
| `packages/workers/src/scrapers/compras-mg-client.ts` | L153 | Malformed entry parsing silently skipped. |
| `packages/workers/src/scrapers/pncp-results-client.ts` | L62, L116 | Results client errors silently swallowed. |
| `packages/workers/src/scripts/enrich-contacts.ts` | L52 | Contact enrichment silently fails. |
| `apps/web/src/lib/redis.ts` | L64, L72, L91, L103 | All Redis cache operations on web side silently fail. |
| `apps/web/src/lib/rate-limit.ts` | L52 | Rate limiting silently fails (fail-open is intentional but no logging). |
| `apps/web/src/app/api/batch-triage/route.ts` | L259 | Cache invalidation silently fails. |
| `apps/web/src/app/api/admin/retriage/route.ts` | L220 | Cache invalidation silently fails. |
| `apps/web/src/app/api/stripe/webhook/route.ts` | L80 | Redis invalidation on subscription change silently fails. |

**Total: ~30+ silent catch blocks across the codebase.**

#### B. `catch` with Only `console.log/error` (Not Structured, Lost in Production)

These use `console.error` instead of the structured `logger`, meaning they lack JSON formatting and context:

| File | Line | Context |
|------|------|---------|
| `apps/web/src/app/api/batch-triage/route.ts` | L263 | `console.error('Batch triage AI error:', err)` |
| `apps/web/src/app/api/admin/retriage/route.ts` | L208 | `console.error('Retriage batch error:', err)` |
| `apps/web/src/app/api/admin/system-health/route.ts` | L242 | `console.error('System health check failed:', err)` |
| `apps/web/src/app/api/generate-profile/route.ts` | L108, L165 | `console.error('[GENERATE] Description/Keywords error:', err)` |
| `apps/web/src/app/api/whatsapp/send-code/route.ts` | L58 | `console.error('[WhatsApp] Send code error:', err)` |
| `apps/web/src/app/api/chat/proxy-pdf/route.ts` | L91 | `console.error('[PDF Proxy] Error:', err)` |
| `apps/web/src/app/api/chat/route.ts` | L472, L550 | `console.error('[Chat] stream error:', err)` |
| `apps/web/src/app/api/chat/upload/route.ts` | L100 | `console.error('[Chat Upload] PDF extraction error:', err)` |
| `apps/web/src/actions/company.ts` | L263, L284, L646 | `console.error('[COMPANY]...')` |
| `apps/web/src/lib/geo/municipalities.ts` | L78 | `console.error('Failed to load municipalities:', error)` |

#### C. Silent Counter Increment (No Error Logged)

| File | Line | Context |
|------|------|---------|
| `packages/workers/src/index.ts` | L443-446 | `backfillComprasgovDocuments()` catches errors with only `failed++` and a comment "Don't log every failure". This silently swallows potentially hundreds of errors with no way to diagnose. |

**Recommendation**: Replace all silent `catch {}` blocks with `logger.warn()` or `logger.debug()` calls. Replace all `console.error` in the web app with a structured logger. At minimum, add a counter metric for suppressed errors.

---

### 2. Structured Logging

**Severity: MEDIUM**

**What exists (good)**:
- Workers use **Pino** (`packages/workers/src/lib/logger.ts`) -- outputs JSON-structured logs
- Log level is configurable via `LOG_LEVEL` env var
- Most worker code consistently uses `logger.info/warn/error` with contextual objects (e.g., `{ tenderId, err }`)
- PM2 config adds `log_date_format: 'YYYY-MM-DD HH:mm:ss Z'`

**What is missing**:
- **No `request_id` or `correlation_id`**: There is no request tracing across the pipeline. A tender goes through scraping -> extraction -> matching -> triage -> notification, but there is no shared trace ID linking these steps.
- **No `user_id` in worker logs**: Worker logs include `companyId` and `matchId` but never `user_id`, making it hard to trace issues for specific users.
- **Web app has NO structured logger**: All 10+ API routes use `console.error` instead of Pino or any structured logger. Vercel captures these but they lack structured fields.
- **Logger is minimal**: Only 6 lines of configuration. No transport, no redaction, no serializers for error objects.

**Recommendation**:
1. Add a `child` logger pattern: `logger.child({ jobId, tenderId })` at the start of each processor.
2. Add `pino-http` or equivalent for the web app API routes.
3. Consider adding a `traceId` that flows from scraping through to notification.

---

### 3. Error Tracking (Sentry/Datadog)

**Severity: CRITICAL**

**No error tracking service is integrated.** Zero references to Sentry, Datadog, New Relic, or Bugsnag anywhere in the codebase (confirmed via full-text search).

This means:
- No error aggregation or deduplication
- No alerting on new error types
- No stack trace collection with source maps
- No performance monitoring (transaction traces)
- No release tracking

**Recommendation**: Integrate Sentry (free tier supports 5K events/month). Requires:
1. `@sentry/node` for workers (initialize in `index.ts` before anything else)
2. `@sentry/nextjs` for the web app
3. Source map upload in build pipeline
4. Estimated effort: 2-4 hours for basic integration

---

### 4. Health Check Endpoints

**Severity: HIGH**

**No `/health` or `/health/ready` endpoints exist** for the worker processes. There is no way for external monitoring (UptimeRobot, Pingdom, load balancers) to verify worker health.

**What exists (partial)**:
- `apps/web/src/app/api/admin/system-health/route.ts` -- An admin-only dashboard endpoint that returns database stats, but it:
  - Requires authentication (not usable by monitoring tools)
  - Is a Vercel serverless function, not a worker health check
  - Does not check individual worker process health
  - Does not have a simple pass/fail response code

- `packages/workers/src/processors/pipeline-health.processor.ts` -- A BullMQ-based internal health supervisor that:
  - Runs every 5 minutes as a queue job
  - Checks Redis/Supabase connectivity, queue depths, pipeline flow
  - Has self-healing (escalating recovery: retry -> restart PM2 -> alert admin)
  - This is excellent for self-healing but not a substitute for external health probes

**What is missing**:
- No HTTP server in worker processes (needed for health endpoints)
- No `/health` (liveness) endpoint -- "is the process alive?"
- No `/health/ready` (readiness) endpoint -- "is the process able to process jobs?"
- No way for PM2 or external tools to probe worker health via HTTP

**Recommendation**: Add a lightweight HTTP server (e.g., `http.createServer`) in `index.ts` that exposes:
- `GET /health` -- returns 200 if process is alive
- `GET /health/ready` -- returns 200 if Redis is connected and workers are running

---

### 5. Metrics Collection

**Severity: MEDIUM**

**What exists (good)**:
- `packages/workers/src/scripts/queue-metrics.ts` -- Dedicated PM2 process that:
  - Polls all 17 queues every 60 seconds
  - Logs queue depths (waiting, active, delayed, completed, failed) as structured JSON
  - Emits threshold-based warnings for queue backlogs
  - Logs memory usage (heap + RSS)
- Memory pressure monitoring in `index.ts` (L670-683) -- pauses workers when heap > 800MB

**What is missing**:
- **No external metrics system**: No Prometheus, Grafana, CloudWatch, or Datadog. All metrics are only in log files.
- **No application-level metrics**: No tracking of:
  - Job processing latency (p50, p95, p99)
  - Error rates per queue
  - Scraping success rate
  - API response times
  - PDF extraction success/failure rate
- **No dashboard**: The `system-health` API provides a snapshot but no historical trends
- **No alerting beyond Telegram**: The pipeline health supervisor sends Telegram alerts, but there is no PagerDuty/OpsGenie integration for on-call rotation

**Recommendation**:
1. Short-term: Add job duration logging in each processor (`logger.info({ durationMs }, 'Job completed')`)
2. Medium-term: Export metrics to Prometheus via `prom-client` and use Grafana Cloud (free tier)

---

### 6. Background Worker Logging

**Severity: LOW**

This is the strongest area of observability.

**What exists (good)**:
- **All 21 processors** have `.on('failed')` event handlers that log failures with `jobId` and error details
- **9 processors** also have `.on('completed')` event handlers (scraping-related ones)
- Most processors log **job start** with contextual data (e.g., `logger.info({ tenderId }, 'Starting extraction')`)
- Scraping processor records job status in the `scraping_jobs` database table (running/completed/failed with timing)
- Pipeline health processor logs comprehensive health status every 5 minutes

**What is missing**:
- Not all processors log job completion (extraction, notification, ai-triage, semantic-matching, hot-alerts, contact-enrichment, fornecedor-enrichment, map-cache)
- No standardized log format across processors (some log `{ tenderId }`, some log `{ companyId }`, some log `{ matchId }` -- no consistent pattern)
- No job duration metric logged (how long each job took)

**Recommendation**: Add a BullMQ `Worker` wrapper or event handler that uniformly logs start/completion/failure with duration for all workers.

---

## PART 2: INFRASTRUCTURE AUDIT

### 7. PM2 Configuration

**Severity: LOW** (Well configured)

**File**: `packages/workers/ecosystem.config.js`

**What exists (good)**:
- 7 PM2 processes: 6 workers + 1 queue-metrics daemon
- `max_memory_restart: '800M'` (appropriate for 7.8GB VPS with 7 processes)
- `exp_backoff_restart_delay: 100` (exponential backoff on crashes)
- `max_restarts: 20` (prevents restart loops)
- `kill_timeout: 15000` (15s for graceful shutdown -- matches the shutdown handler)
- `--max-old-space-size=512` for scraping/extraction/matching (512MB V8 heap limit)
- `--max-old-space-size=256` for lighter workers (alerts, telegram, whatsapp, metrics)
- `--expose-gc` for scraping/extraction/matching (enables manual GC during memory pressure)
- Separate log files per worker in `/var/log/licitagram/`
- `merge_logs: true` and `log_date_format` configured
- `autorestart: true`

**What is missing**:
- No `watch` configuration (not needed for production)
- No `instances` (clustering) -- appropriate since each worker handles different queues
- No `max_restarts` cooldown period (`min_uptime` not set -- could rapidly exhaust restarts)

**Recommendation**: Add `min_uptime: '10s'` to prevent PM2 from counting immediate crashes toward the restart limit.

---

### 8. Graceful Shutdown

**Severity: LOW** (Well implemented)

**What exists (good)**:
- `index.ts` (L717-736): Handles both `SIGINT` and `SIGTERM`
  - 15-second timeout with force exit
  - Calls `worker.close()` on all workers via `Promise.allSettled`
  - Logs shutdown start, completion, and errors
  - Timeout is `.unref()`'d to not keep the process alive
- `queue-metrics.ts` (L145-151): Separate graceful shutdown for metrics daemon
- `worker-scraping.ts` and `worker-matching.ts`: Both have their own shutdown handlers (legacy entry points)
- PM2 `kill_timeout: 15000` matches the 15s shutdown timeout

**What is missing**:
- Redis connections are not explicitly closed during shutdown (the `IORedis` subscriber created at L476 in `index.ts` is not tracked or closed)
- Telegram bot is not explicitly stopped during shutdown
- No drain of in-progress HTTP requests (not applicable -- workers don't serve HTTP)

**Recommendation**: Track the Redis subscriber and close it during shutdown. Stop the Telegram bot polling.

---

### 9. Statelessness

**Severity: LOW** (Mostly stateless)

**What exists (good)**:
- No `writeFile`, `createWriteStream`, `fs.write`, or `mkdirSync` calls in worker code
- No local file storage -- all data goes to Supabase (PostgreSQL) or Redis
- No in-memory sessions for users
- PDF extraction works via URL fetching, not local file download

**What has limited in-memory state**:
- `failureTracker` (Map) in `pipeline-health.processor.ts` (L33) -- tracks consecutive failures for escalation. Lost on restart, but this is acceptable since it just resets escalation.
- `_kwDivCount` (Map) in `cnae-keyword-classifier.ts` (L115) -- keyword division frequency cache. Rebuilt on each run.
- `STOPWORDS` (Set) in `keyword-matcher.ts` and related files -- static, immutable data.

**Verdict**: The application is effectively stateless. All persistent state is in Supabase or Redis. The in-memory Maps are caches/counters that safely reset on restart.

---

### 10. Log Rotation

**Severity: HIGH**

**No log rotation is configured.** PM2 log files in `/var/log/licitagram/` will grow unbounded until the disk fills up.

- No `pm2-logrotate` module referenced anywhere
- No `logrotate.d` configuration in the repository
- No log file size limits in `ecosystem.config.js`
- With 7 workers generating structured JSON logs at info level, especially scraping and matching which are verbose, **disk exhaustion is a real risk**.

**Recommendation**:
1. Install `pm2-logrotate`: `pm2 install pm2-logrotate`
2. Configure: `pm2 set pm2-logrotate:max_size 50M`, `pm2 set pm2-logrotate:retain 7`, `pm2 set pm2-logrotate:compress true`
3. Alternatively, use OS-level logrotate with a config in `/etc/logrotate.d/licitagram`

---

### 11. Docker Security

**Severity: MEDIUM** (Cannot fully assess)

**No Dockerfile or docker-compose.yml exists in the repository.** The Evolution API is mentioned as running in Docker on the VPS, but the Docker configuration is not version-controlled.

Based on references in the codebase:
- `EVOLUTION_API_URL` defaults to `http://localhost:8080` (L13 in `whatsapp/client.ts`)
- The Evolution API instance is named `licitagram` (L15)

**What cannot be verified without Docker config files**:
- Whether the container runs as non-root
- Whether the image version is pinned (vs. `latest` tag)
- Whether the container has resource limits (memory/CPU)
- Whether the container has a read-only filesystem
- Whether unnecessary capabilities are dropped
- Whether the container uses a health check

**Recommendation**:
1. Add a `docker-compose.yml` to the repository for the Evolution API
2. Pin the image version (e.g., `atendai/evolution-api:2.1.0` instead of `:latest`)
3. Run as non-root user
4. Set memory limits
5. Add a Docker health check

---

### 12. Backup Strategy

**Severity: CRITICAL**

**No database backup configuration exists in the repository.** Search for "backup", "pg_dump", or "supabase backup" found no relevant results.

- Supabase Pro plan includes daily automated backups (7-day retention), so the database is covered at the Supabase level
- However, there is no:
  - Application-level backup verification
  - Backup restoration testing
  - Point-in-time recovery documentation
  - Redis data backup (queue state, cache data)
  - Configuration/secrets backup

**Recommendation**:
1. Verify Supabase backup settings in the dashboard (Pro plan includes daily backups)
2. Document the backup restoration procedure
3. Schedule quarterly backup restoration tests
4. Consider `pg_dump` to a separate location for critical data redundancy
5. Export Redis `dump.rdb` periodically (note: `dump.rdb` exists in the project root, suggesting local Redis was used at some point)

---

### 13. Environment Validation

**Severity: HIGH**

**Split situation**: The web app validates env vars; the workers do not.

#### Web App (Good)
`apps/web/src/lib/env.ts` provides:
- `requireEnv()` function that throws on missing vars
- Validates `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Optional vars with defaults for Redis, AI keys, WhatsApp

#### Workers (Bad)
`packages/workers/src/lib/supabase.ts` uses TypeScript non-null assertion (`!`) on env vars:
```typescript
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
```
This will create a Supabase client with `undefined` URLs and keys, leading to cryptic runtime errors instead of a clear startup failure.

Other unvalidated critical env vars in workers:
- `REDIS_URL` (defaults to `localhost` -- will silently fail on VPS if unset)
- `TELEGRAM_BOT_TOKEN` (used in pipeline-health alerts, fails silently)
- `DEEPSEEK_API_KEY` (some checks exist in scripts, but not at startup)
- `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` (defaults to empty string/localhost)

**Recommendation**: Add a `validateEnvironment()` function in worker `index.ts` that runs before `main()` and fails fast with clear error messages for required vars.

---

## Summary Table

| # | Area | Severity | Status |
|---|------|----------|--------|
| 1 | Silent Failures | HIGH | 30+ silent catch blocks across codebase |
| 2 | Structured Logging | MEDIUM | Workers use Pino (good); web app uses console.error (bad); no request_id/trace_id |
| 3 | Error Tracking | CRITICAL | No Sentry/Datadog/etc. integrated |
| 4 | Health Checks | HIGH | No HTTP health endpoints; internal pipeline supervisor exists but not externally probeable |
| 5 | Metrics | MEDIUM | Queue depth monitoring exists; no latency/error rate/external metrics system |
| 6 | Worker Logging | LOW | All processors log failures; most log start; few log completion with duration |
| 7 | PM2 Config | LOW | Well configured with memory limits, backoff, kill timeout |
| 8 | Graceful Shutdown | LOW | Properly handles SIGTERM/SIGINT with timeout; minor gap with Redis subscriber |
| 9 | Statelessness | LOW | Effectively stateless; all persistent state in Supabase/Redis |
| 10 | Log Rotation | HIGH | No rotation configured; disk will fill |
| 11 | Docker Security | MEDIUM | Cannot verify; Docker config not in repo |
| 12 | Backup Strategy | CRITICAL | No backup automation or documentation in codebase |
| 13 | Env Validation | HIGH | Web app validates; workers use `!` assertions that silently produce broken clients |

---

## Priority Actions (Ranked)

1. **[CRITICAL] Integrate Sentry** -- 2-4 hours, covers error tracking, alerting, performance monitoring
2. **[CRITICAL] Document/verify backup strategy** -- Confirm Supabase backups, document restoration
3. **[HIGH] Install pm2-logrotate** -- 5 minutes, prevents disk exhaustion
4. **[HIGH] Add env validation to workers** -- 30 minutes, prevents silent startup failures
5. **[HIGH] Add HTTP health endpoints** -- 1-2 hours, enables external monitoring
6. **[HIGH] Fix silent catch blocks** -- 2-3 hours, add `logger.warn/debug` to all 30+ instances
7. **[MEDIUM] Add structured logger to web app** -- 1 hour, replace console.error with Pino
8. **[MEDIUM] Add Docker config to repo** -- 1 hour, version-control Evolution API setup
9. **[MEDIUM] Add job duration logging** -- 1 hour, essential for performance monitoring
10. **[LOW] Close Redis subscriber on shutdown** -- 15 minutes
