# Competitive Intelligence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a competitive intelligence system that materializes competitor stats, calculates competition_score per match, and surfaces insights across Telegram alerts, map, pipeline, competitors page, and opportunity detail.

**Architecture:** Event-driven materialization from raw `competitors` table into `competitor_stats` (one row per CNPJ). Hot scan calculates `competition_score` on-the-fly using `competitor_stats`. Frontend reads directly from `competitor_stats`. AI insights gated behind enterprise plan.

**Tech Stack:** Supabase (PostgreSQL + RPC), BullMQ (workers), Next.js server components, Grammy (Telegram), Gemini Flash (AI insights)

**Spec:** `docs/superpowers/specs/2026-03-17-competitive-intelligence-design.md`

---

## Chunk 1: Database + Materialization Worker (Tasks 1-4)

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260317100000_competitive_intelligence.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- competitor_stats table
CREATE TABLE IF NOT EXISTS public.competitor_stats (
  cnpj TEXT PRIMARY KEY,
  nome TEXT,
  total_participations INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  win_rate NUMERIC(5,4) DEFAULT 0,
  avg_valor_proposta NUMERIC(15,2),
  avg_discount_pct NUMERIC(5,4),
  participations_by_uf JSONB DEFAULT '{}',
  wins_by_uf JSONB DEFAULT '{}',
  participations_by_cnae JSONB DEFAULT '{}',
  wins_by_cnae JSONB DEFAULT '{}',
  modalidades JSONB DEFAULT '{}',
  porte TEXT,
  uf_sede TEXT,
  municipio_sede TEXT,
  last_participation_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_stats_uf ON competitor_stats (uf_sede);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_porte ON competitor_stats (porte);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_wins ON competitor_stats (total_wins DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_cnae_gin ON competitor_stats USING GIN (participations_by_cnae);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_uf_gin ON competitor_stats USING GIN (participations_by_uf);

ALTER TABLE public.competitor_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY competitor_stats_select_authenticated ON public.competitor_stats
  FOR SELECT TO authenticated USING (true);

-- competition_score on matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS competition_score INTEGER
  CHECK (competition_score >= 0 AND competition_score <= 100);

-- Index for incremental materialization
CREATE INDEX IF NOT EXISTS idx_competitors_created_at ON public.competitors (created_at);

-- RPC function for materialization
CREATE OR REPLACE FUNCTION materialize_competitor_stats(p_cnpjs TEXT[])
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  IF array_length(p_cnpjs, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH upserted AS (
    INSERT INTO competitor_stats (
      cnpj, nome, total_participations, total_wins, win_rate,
      avg_valor_proposta, avg_discount_pct,
      participations_by_uf, wins_by_uf,
      participations_by_cnae, wins_by_cnae,
      modalidades, porte, uf_sede, municipio_sede,
      last_participation_at, updated_at
    )
    SELECT
      c.cnpj,
      MAX(c.nome),
      COUNT(*),
      COUNT(*) FILTER (WHERE LOWER(c.situacao) LIKE '%homologad%'),
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE LOWER(c.situacao) LIKE '%homologad%')::NUMERIC / COUNT(*)
        ELSE 0 END,
      AVG(c.valor_proposta),
      AVG(
        CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0 AND c.valor_proposta <= t.valor_estimado
        THEN (t.valor_estimado - c.valor_proposta) / t.valor_estimado
        ELSE NULL END
      ),
      (SELECT COALESCE(jsonb_object_agg(uf, cnt), '{}') FROM (
        SELECT t2.uf, COUNT(*) as cnt FROM competitors c2
        JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.uf IS NOT NULL GROUP BY t2.uf
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(uf, cnt), '{}') FROM (
        SELECT t2.uf, COUNT(*) as cnt FROM competitors c2
        JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.uf IS NOT NULL AND LOWER(c2.situacao) LIKE '%homologad%'
        GROUP BY t2.uf
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(cnae_div, cnt), '{}') FROM (
        SELECT LEFT(c2.cnae_codigo::TEXT, 2) as cnae_div, COUNT(*) as cnt
        FROM competitors c2
        WHERE c2.cnpj = c.cnpj AND c2.cnae_codigo IS NOT NULL GROUP BY cnae_div
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(cnae_div, cnt), '{}') FROM (
        SELECT LEFT(c2.cnae_codigo::TEXT, 2) as cnae_div, COUNT(*) as cnt
        FROM competitors c2
        WHERE c2.cnpj = c.cnpj AND c2.cnae_codigo IS NOT NULL AND LOWER(c2.situacao) LIKE '%homologad%'
        GROUP BY cnae_div
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(mod_id::TEXT, cnt), '{}') FROM (
        SELECT t2.modalidade_id as mod_id, COUNT(*) as cnt
        FROM competitors c2 JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.modalidade_id IS NOT NULL GROUP BY t2.modalidade_id
      ) sub),
      MAX(c.porte),
      MAX(c.uf_fornecedor),
      MAX(c.municipio_fornecedor),
      MAX(c.created_at),
      now()
    FROM competitors c
    JOIN tenders t ON c.tender_id = t.id
    WHERE c.cnpj = ANY(p_cnpjs)
    GROUP BY c.cnpj
    HAVING COUNT(*) >= 3
    ON CONFLICT (cnpj) DO UPDATE SET
      nome = EXCLUDED.nome,
      total_participations = EXCLUDED.total_participations,
      total_wins = EXCLUDED.total_wins,
      win_rate = EXCLUDED.win_rate,
      avg_valor_proposta = EXCLUDED.avg_valor_proposta,
      avg_discount_pct = EXCLUDED.avg_discount_pct,
      participations_by_uf = EXCLUDED.participations_by_uf,
      wins_by_uf = EXCLUDED.wins_by_uf,
      participations_by_cnae = EXCLUDED.participations_by_cnae,
      wins_by_cnae = EXCLUDED.wins_by_cnae,
      modalidades = EXCLUDED.modalidades,
      porte = EXCLUDED.porte,
      uf_sede = EXCLUDED.uf_sede,
      municipio_sede = EXCLUDED.municipio_sede,
      last_participation_at = EXCLUDED.last_participation_at,
      updated_at = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO affected FROM upserted;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- RPC to find competitors by CNAE divisions AND UF (uses GIN ? operator, not expressible via Supabase JS)
CREATE OR REPLACE FUNCTION find_competitors_by_cnae_uf(p_cnae_divisions TEXT[], p_uf TEXT)
RETURNS SETOF competitor_stats AS $$
BEGIN
  RETURN QUERY
    SELECT cs.*
    FROM competitor_stats cs
    WHERE cs.participations_by_uf ? p_uf
      AND EXISTS (
        SELECT 1 FROM unnest(p_cnae_divisions) d
        WHERE cs.participations_by_cnae ? d
      )
    ORDER BY cs.total_participations DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC to get all CNPJs with minimum participations (for full materialization mode)
CREATE OR REPLACE FUNCTION get_all_competitor_cnpjs_with_min_participations(min_count INTEGER)
RETURNS TABLE(cnpj TEXT) AS $$
BEGIN
  RETURN QUERY
    SELECT c.cnpj
    FROM competitors c
    WHERE c.cnpj IS NOT NULL
    GROUP BY c.cnpj
    HAVING COUNT(*) >= min_count;
END;
$$ LANGUAGE plpgsql STABLE;
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `npx supabase db push` or apply via Supabase dashboard SQL editor.

- [ ] **Step 3: Verify migration**

Run in SQL editor:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'competitor_stats' LIMIT 5;
SELECT proname FROM pg_proc WHERE proname = 'materialize_competitor_stats';
```
Expected: table columns visible, function exists.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260317100000_competitive_intelligence.sql
git commit -m "feat: add competitor_stats table, competition_score column, and materialization RPC"
```

---

### Task 2: Competition Analysis Queue + Worker

**Files:**
- Create: `packages/workers/src/queues/competition-analysis.queue.ts`
- Create: `packages/workers/src/processors/competition-analysis.processor.ts`

- [ ] **Step 1: Create the queue file**

Create `packages/workers/src/queues/competition-analysis.queue.ts`:

```typescript
import { Queue } from 'bullmq'
import { connection } from './connection'

export interface CompetitionAnalysisJobData {
  mode: 'full' | 'incremental'
}

export const competitionAnalysisQueue = new Queue<CompetitionAnalysisJobData>(
  'competition-analysis',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: 5,
      removeOnFail: 10,
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
    },
  },
)
```

- [ ] **Step 2: Create the processor**

Create `packages/workers/src/processors/competition-analysis.processor.ts`:

```typescript
import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { CompetitionAnalysisJobData } from '../queues/competition-analysis.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import IORedis from 'ioredis'

const REDIS_KEY_LAST_RUN = 'licitagram:competition-analysis:last-run'
const BATCH_SIZE = 500 // CNPJs per RPC call

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

async function processCompetitionAnalysis(job: Job<CompetitionAnalysisJobData>) {
  const { mode } = job.data
  const startTime = Date.now()

  logger.info({ mode }, 'Starting competition analysis materialization')

  let cnpjs: string[]

  if (mode === 'incremental') {
    // Get last run timestamp from Redis
    const lastRun = await redis.get(REDIS_KEY_LAST_RUN)
    const since = lastRun || '2000-01-01T00:00:00Z'

    // Find CNPJs with new data since last run
    const { data, error } = await supabase
      .from('competitors')
      .select('cnpj')
      .not('cnpj', 'is', null)
      .gte('created_at', since)

    if (error) {
      logger.error({ error }, 'Failed to fetch new competitor CNPJs')
      throw error
    }

    // Deduplicate
    cnpjs = [...new Set((data || []).map((r) => r.cnpj).filter(Boolean))]

    if (cnpjs.length === 0) {
      logger.info('No new competitor data since last run — skipping materialization')
      await redis.set(REDIS_KEY_LAST_RUN, new Date().toISOString())
      return
    }
  } else {
    // Full mode: get all CNPJs with >= 3 participations
    const { data, error } = await supabase.rpc('get_all_competitor_cnpjs_with_min_participations', {
      min_count: 3,
    })

    // Fallback: if RPC doesn't exist, do a raw query
    if (error) {
      logger.warn({ error }, 'RPC not available, using direct query for full mode')
      const { data: fallback } = await supabase
        .from('competitors')
        .select('cnpj')
        .not('cnpj', 'is', null)

      cnpjs = [...new Set((fallback || []).map((r) => r.cnpj).filter(Boolean))]
    } else {
      cnpjs = (data || []).map((r: { cnpj: string }) => r.cnpj)
    }
  }

  logger.info({ cnpjCount: cnpjs.length, mode }, 'Processing competitor CNPJs')

  let totalUpserted = 0

  // Process in batches to avoid exceeding RPC parameter limits
  for (let i = 0; i < cnpjs.length; i += BATCH_SIZE) {
    const batch = cnpjs.slice(i, i + BATCH_SIZE)

    try {
      const { data: count, error } = await supabase.rpc('materialize_competitor_stats', {
        p_cnpjs: batch,
      })

      if (error) {
        logger.error({ error, batchStart: i, batchSize: batch.length }, 'Materialization batch failed')
        continue
      }

      totalUpserted += (count as number) || 0
    } catch (err) {
      logger.error({ err, batchStart: i }, 'Materialization batch exception')
    }
  }

  // Update last run timestamp
  await redis.set(REDIS_KEY_LAST_RUN, new Date().toISOString())

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  logger.info(
    { totalUpserted, cnpjsProcessed: cnpjs.length, mode, elapsedSeconds: elapsed },
    'Competition analysis materialization complete',
  )
}

export const competitionAnalysisWorker = new Worker<CompetitionAnalysisJobData>(
  'competition-analysis',
  processCompetitionAnalysis,
  {
    connection,
    concurrency: 1,
  },
)

competitionAnalysisWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Competition analysis job failed')
})
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/workers/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/workers/src/queues/competition-analysis.queue.ts packages/workers/src/processors/competition-analysis.processor.ts
git commit -m "feat: add competition-analysis queue and materialization processor"
```

---

### Task 3: Register Worker + Schedule + Chain from Results Scraping

**Files:**
- Modify: `packages/workers/src/index.ts` (import + register + schedule)
- Modify: `packages/workers/src/processors/results-scraping.processor.ts:70-73` (chain job)

- [ ] **Step 1: Add imports and registration to index.ts**

At the top of `packages/workers/src/index.ts`, after the existing `hotAlertsWorker` import (line 29), add:

```typescript
import { competitionAnalysisWorker } from './processors/competition-analysis.processor'
```

In the `allWorkers` array (line 37), add `competitionAnalysisWorker` after `hotAlertsWorker`:

```typescript
  hotAlertsWorker,
  competitionAnalysisWorker,
```

After the existing `hotAlertsQueue` import (line 46), add:

```typescript
import { competitionAnalysisQueue } from './queues/competition-analysis.queue'
```

- [ ] **Step 2: Add schedule in setupRepeatableJobs()**

After the urgency-check schedule block (after line 190), add:

```typescript
  // Schedule competition analysis materialization every 12h (fallback — primary trigger is event-driven)
  await competitionAnalysisQueue.add(
    'materialize-stats',
    { mode: 'incremental' },
    {
      repeat: { every: 12 * 60 * 60 * 1000 },
      jobId: 'competition-analysis-12h-repeat',
    },
  )
  logger.info('Competition analysis scheduled (every 12h fallback)')

  // Trigger full materialization on startup (non-blocking)
  competitionAnalysisQueue.add('materialize-stats-startup', { mode: 'full' }).catch((err) => {
    logger.error({ err }, 'Failed to enqueue startup competition analysis')
  })
```

- [ ] **Step 3: Chain from results-scraping.processor.ts**

In `packages/workers/src/processors/results-scraping.processor.ts`, add import at the top (after line 6):

```typescript
import { competitionAnalysisQueue } from '../queues/competition-analysis.queue'
```

At the end of `processResultsJob`, after the logger.info on line 73 (before the closing `}`), add:

```typescript

  // Trigger incremental competition analysis after new results are scraped
  if (totalResults > 0) {
    const ts = Date.now()
    await competitionAnalysisQueue.add(
      `post-results-analysis-${ts}`,
      { mode: 'incremental' },
      { jobId: `post-results-analysis-${ts}` },
    )
    logger.info('Enqueued competition analysis after results scraping')
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/workers/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/workers/src/index.ts packages/workers/src/processors/results-scraping.processor.ts
git commit -m "feat: register competition-analysis worker, schedule 12h fallback, chain from results-scraping"
```

---

### Task 4: Competition Score Calculation in Hot Scan

**Files:**
- Modify: `packages/workers/src/processors/hot-alerts.processor.ts`

- [ ] **Step 1: Add competition score calculation function**

At the top of `hot-alerts.processor.ts`, after the existing constants (line 12), add:

```typescript
const HOT_SCORE_RELEVANCE_WEIGHT = 0.6
const HOT_SCORE_COMPETITION_WEIGHT = 0.4

interface CompetitorInfo {
  nome: string
  winRate: number
  porte: string
}

/**
 * Calculate competition_score for a match based on competitor_stats.
 * Returns { score, topCompetitors } or null if no data.
 */
async function calculateCompetitionScore(
  tenderUf: string | null,
  companyCnaeDivisions: string[],
): Promise<{ score: number; topCompetitors: CompetitorInfo[] } | null> {
  if (!tenderUf || companyCnaeDivisions.length === 0) return null

  // Find competitors who operate in the same CNAE AND UF
  // Uses the find_competitors_by_cnae_uf RPC (GIN ? operator not expressible via Supabase JS)
  const { data: stats, error } = await supabase.rpc('find_competitors_by_cnae_uf', {
    p_cnae_divisions: companyCnaeDivisions,
    p_uf: tenderUf,
  })

  if (error) {
    logger.warn({ error, tenderUf, companyCnaeDivisions }, 'Failed to query competitor stats')
    return null
  }

  if (!stats || stats.length === 0) return null

  const competitors = stats

  // Factor 1: Competition density (30%)
  const n = competitors.length
  let densityScore: number
  if (n === 0) densityScore = 100
  else if (n <= 3) densityScore = 80
  else if (n <= 7) densityScore = 60
  else if (n <= 15) densityScore = 40
  else densityScore = 20

  // Factor 2: Competitor strength (30%)
  const avgWinRate = competitors.reduce((s, c) => s + Number(c.win_rate || 0), 0) / Math.max(n, 1)
  let strengthScore: number
  if (avgWinRate < 0.2) strengthScore = 90
  else if (avgWinRate < 0.4) strengthScore = 70
  else if (avgWinRate < 0.6) strengthScore = 50
  else if (avgWinRate < 0.8) strengthScore = 30
  else strengthScore = 10

  // Factor 3: Geographic advantage (20%)
  const geoWinRates = competitors.map((c) => {
    const pByUf = (c.participations_by_uf as Record<string, number>) || {}
    const wByUf = (c.wins_by_uf as Record<string, number>) || {}
    const p = pByUf[tenderUf] || 0
    const w = wByUf[tenderUf] || 0
    return p > 0 ? w / p : 0
  })
  const avgGeoWinRate = geoWinRates.reduce((s, r) => s + r, 0) / Math.max(geoWinRates.length, 1)
  // Low competitor win rate in this UF = high geo advantage
  const geoScore = Math.round(100 - avgGeoWinRate * 100)

  // Factor 4: Discount pattern (20%)
  const discounts = competitors
    .map((c) => Number(c.avg_discount_pct || 0))
    .filter((d) => d > 0)
  const avgDiscount = discounts.length > 0
    ? discounts.reduce((s, d) => s + d, 0) / discounts.length
    : 0
  let discountScore: number
  if (avgDiscount < 0.05) discountScore = 90
  else if (avgDiscount < 0.10) discountScore = 75
  else if (avgDiscount < 0.15) discountScore = 60
  else if (avgDiscount < 0.20) discountScore = 45
  else discountScore = 30

  const score = Math.round(
    densityScore * 0.30 +
    strengthScore * 0.30 +
    geoScore * 0.20 +
    discountScore * 0.20,
  )

  // Top 3 competitors by win rate for display
  const topCompetitors: CompetitorInfo[] = competitors
    .sort((a, b) => Number(b.win_rate || 0) - Number(a.win_rate || 0))
    .slice(0, 3)
    .map((c) => ({
      nome: c.nome || 'N/I',
      winRate: Math.round(Number(c.win_rate || 0) * 100),
      porte: c.porte || 'N/I',
    }))

  return { score: Math.min(100, Math.max(0, score)), topCompetitors }
}
```

- [ ] **Step 2: Modify handleHotDaily to use competition_score**

Change `HOT_SCORE_THRESHOLD` from 80 to 70 (line 11):

```typescript
const HOT_SCORE_THRESHOLD = 70
```

In `handleHotDaily()`, after `const plan = await getCompanyPlan(companyId, planCache)` (line 99), add company CNAE lookup and competition score calculation. Replace the existing loop (lines 101-143) with:

```typescript
    // Get company CNAE divisions for competition analysis
    const { data: company } = await supabase
      .from('companies')
      .select('cnae_principal, cnaes_secundarios')
      .eq('id', companyId)
      .single()

    const cnaeDivisions: string[] = []
    if (company?.cnae_principal) {
      cnaeDivisions.push(company.cnae_principal.substring(0, 2))
    }
    if (company?.cnaes_secundarios) {
      for (const c of company.cnaes_secundarios) {
        const div = c.substring(0, 2)
        if (!cnaeDivisions.includes(div)) cnaeDivisions.push(div)
      }
    }

    // Calculate competition_score for each match and compute hot_score
    const scoredMatches: Array<{
      match: typeof matches[0]
      hotScore: number
      competitionScore: number
      topCompetitors: CompetitorInfo[]
    }> = []

    for (const match of matches) {
      const tender = match.tenders as unknown as Record<string, unknown>
      const tenderUf = tender.uf as string | null

      let competitionScore = 50 // default neutral
      let topCompetitors: CompetitorInfo[] = []

      const result = await calculateCompetitionScore(tenderUf, cnaeDivisions)
      if (result) {
        competitionScore = result.score
        topCompetitors = result.topCompetitors
      }

      // Save competition_score to DB
      await supabase
        .from('matches')
        .update({ competition_score: competitionScore })
        .eq('id', match.id)

      const hotScore = match.score * HOT_SCORE_RELEVANCE_WEIGHT +
        competitionScore * HOT_SCORE_COMPETITION_WEIGHT

      scoredMatches.push({ match, hotScore, competitionScore, topCompetitors })
    }

    // Sort by hot_score descending and take top N
    scoredMatches.sort((a, b) => b.hotScore - a.hotScore)
    const topMatches = scoredMatches.slice(0, HOT_TOP_N)

    for (let i = 0; i < topMatches.length; i++) {
      const { match, competitionScore, topCompetitors } = topMatches[i]
      const rank = i + 1

      // Mark as hot if not already
      if (!match.is_hot) {
        await supabase
          .from('matches')
          .update({ is_hot: true, hot_at: new Date().toISOString() })
          .eq('id', match.id)
        totalMarked++
      }

      // Skip Telegram send only if this match was already sent as hot
      if (match.is_hot) continue

      // Enqueue hot notification for each user
      for (const user of users) {
        try {
          await notificationQueue.add(
            `hot-${companyId}-${match.id}-${user.id}`,
            {
              matchId: match.id,
              telegramChatId: user.telegram_chat_id,
              type: 'hot' as const,
              rank,
              plan,
              competitionScore,
              topCompetitors,
            },
          )
          totalEnqueued++
        } catch (err) {
          logger.debug({ matchId: match.id, err }, 'Failed to enqueue hot notification')
        }
      }

      // Mark as notified (only if still 'new')
      await supabase
        .from('matches')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', match.id)
        .eq('status', 'new')
    }
```

Also update the Supabase select to include `tenders.uf`:

Change the select on line 84-86 from:
```
id, score, notified_at, is_hot,
tenders!inner(data_encerramento, modalidade_id)
```
to:
```
id, score, notified_at, is_hot,
tenders!inner(data_encerramento, modalidade_id, uf)
```

- [ ] **Step 3: Update NotificationJobData type**

In `packages/workers/src/queues/notification.queue.ts`, update the hot alert variant (line 20):

```typescript
  | { matchId: string; telegramChatId: number; type: 'hot'; rank: number; plan: string; competitionScore: number; topCompetitors: Array<{ nome: string; winRate: number; porte: string }> }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/workers/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/workers/src/processors/hot-alerts.processor.ts packages/workers/src/queues/notification.queue.ts
git commit -m "feat: calculate competition_score in hot scan, sort by hot_score, lower threshold to 70"
```

---

## Chunk 2: Telegram + Frontend Integration (Tasks 5-8)

### Task 5: Telegram Formatter — Competition Data in Hot Alerts

**Files:**
- Modify: `packages/workers/src/telegram/formatters.ts:107-194`
- Modify: `packages/workers/src/processors/notification.processor.ts` (pass competition data)

- [ ] **Step 1: Update HotAlertData interface**

In `packages/workers/src/telegram/formatters.ts`, update the `HotAlertData` interface (lines 109-128) to add competition fields:

```typescript
interface HotAlertData {
  matchId: string
  rank: number
  score: number
  breakdown: Array<{ category: string; score: number; reason: string }>
  justificativa: string
  plan: string
  competitionScore: number
  topCompetitors: Array<{ nome: string; winRate: number; porte: string }>
  tender: {
    objeto: string
    orgao_nome: string
    uf: string
    municipio: string
    valor_estimado: number | null
    modalidade_nome: string | null
    data_encerramento: string | null
    numero: string | null
    ano: string | null
    pncp_id: string | null
  }
}
```

- [ ] **Step 2: Add competition section to formatHotAlert**

In `formatHotAlert`, replace the header line (line 142):

```typescript
  let text = `🔥 <b>OPORTUNIDADE #${rank} — Score ${score} | Competitividade ${competitionScore}</b>\n\n`
```

After the existing enterprise/upsell block (before the valor line ~173), add competition section:

```typescript
  // Competition analysis section
  if (topCompetitors.length > 0) {
    if (plan === 'enterprise') {
      text += `📊 <b>Análise Competitiva:</b>\n`
      text += `├ ${topCompetitors.length} concorrente${topCompetitors.length > 1 ? 's' : ''} neste nicho:\n`
      for (const comp of topCompetitors) {
        text += `│  • ${escapeHtml(truncate(comp.nome, 35))} (win rate ${comp.winRate}%)\n`
      }
      const avgWinRate = Math.round(topCompetitors.reduce((s, c) => s + c.winRate, 0) / topCompetitors.length)
      text += `├ Win rate médio: ${avgWinRate}%\n`
      if (competitionScore >= 75) {
        text += `└ Baixa competição neste UF ✅\n\n`
      } else if (competitionScore >= 50) {
        text += `└ Competição moderada ⚠️\n\n`
      } else {
        text += `└ Mercado disputado 🔴\n\n`
      }
    } else {
      text += `📊 <b>Análise Competitiva:</b>\n`
      text += `├ ${topCompetitors.length} concorrente${topCompetitors.length > 1 ? 's' : ''} neste nicho\n`
      text += `├ Competitividade: ${'█'.repeat(Math.round(competitionScore / 10))}${'░'.repeat(10 - Math.round(competitionScore / 10))} ${competitionScore}/100\n`
      text += `└ 🔒 Nomes e detalhes no plano Enterprise\n\n`
    }
  }
```

- [ ] **Step 3: Update notification processor to pass competition data**

In `packages/workers/src/processors/notification.processor.ts`, line 20, change the destructuring from:

```typescript
      const { matchId, telegramChatId, rank, plan } = job.data
```

to:

```typescript
      const { matchId, telegramChatId, rank, plan, competitionScore, topCompetitors } = job.data
```

Then in the `formatHotAlert` call (line 42-61), add the two new fields after `plan`:

```typescript
      const { text, keyboard } = formatHotAlert({
        matchId: match.id,
        rank,
        score: match.score,
        breakdown: (match.breakdown as Array<{ category: string; score: number; reason: string }>) || [],
        justificativa: match.ai_justificativa || '',
        plan,
        competitionScore: competitionScore ?? 50,
        topCompetitors: topCompetitors ?? [],
        tender: {
          objeto: (tender?.objeto as string) || '',
          orgao_nome: (tender?.orgao_nome as string) || '',
          uf: (tender?.uf as string) || '',
          municipio: (tender?.municipio as string) || '',
          valor_estimado: tender?.valor_estimado as number | null,
          modalidade_nome: tender?.modalidade_nome as string | null,
          data_encerramento: tender?.data_encerramento as string | null,
          numero: tender?.numero as string | null,
          ano: tender?.ano_compra as string | null,
          pncp_id: tender?.pncp_id as string | null,
        },
      })
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/workers/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/workers/src/telegram/formatters.ts packages/workers/src/processors/notification.processor.ts
git commit -m "feat: show competition data in hot alert Telegram messages"
```

---

### Task 6: Map Sidebar — Competition Badge + Tag

**Files:**
- Modify: `apps/web/src/lib/geo/map-utils.ts` (add competitionScore to MatchMarker)
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx` (pass competition_score)
- Modify: `apps/web/src/components/map/IntelligenceMap.tsx` (render dual badge + tag)

- [ ] **Step 1: Add competitionScore to MatchMarker interface**

In `apps/web/src/lib/geo/map-utils.ts`, add to the `MatchMarker` interface:

```typescript
  competitionScore: number | null
```

- [ ] **Step 2: Pass competition_score from map page**

In `apps/web/src/app/(dashboard)/map/page.tsx`, add `competition_score` to the Supabase select query. In the marker builder, add:

```typescript
  competitionScore: (match as unknown as Record<string, unknown>).competition_score as number | null ?? null,
```

- [ ] **Step 3: Render dual badge and competition tag in sidebar**

In `apps/web/src/components/map/IntelligenceMap.tsx`, in the sidebar match card (the `selectedUfMarkers.map` block), add after the score circle:

For hot matches that have a competition_score, show:
- Dual display: score number under the gradient circle + small "Comp. XX" text
- Competition tag below the title: green/yellow/red based on score

Replace the `<span>` under the score circle that shows `${m.score}` or `IA`/`est.` with:

```typescript
<span className={`text-[8px] font-medium ${
  m.isHot ? 'text-orange-600' :
  m.matchSource === 'ai' || m.matchSource === 'ai_triage' || m.matchSource === 'semantic' ? 'text-blue-600' : 'text-gray-400'
}`}>
  {m.isHot && m.competitionScore != null ? `C:${m.competitionScore}` : m.matchSource === 'ai' || m.matchSource === 'ai_triage' || m.matchSource === 'semantic' ? 'IA' : 'est.'}
</span>
```

After the objeto text (`<p className="text-xs font-medium...">`) for hot matches, add a competition tag:

```typescript
{m.isHot && m.competitionScore != null && (
  <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${
    m.competitionScore >= 75 ? 'bg-green-100 text-green-700' :
    m.competitionScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-700'
  }`}>
    {m.competitionScore >= 75 ? '🟢 Baixa competição' :
     m.competitionScore >= 50 ? '🟡 Competição moderada' :
     '🔴 Mercado disputado'}
  </span>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/geo/map-utils.ts apps/web/src/app/\(dashboard\)/map/page.tsx apps/web/src/components/map/IntelligenceMap.tsx
git commit -m "feat: show competition score and tag in map sidebar cards"
```

---

### Task 7: Pipeline Kanban — Competition Badge + Tag

**Files:**
- Modify: `apps/web/src/app/(dashboard)/pipeline/page.tsx` (pass competition_score)
- Modify: `apps/web/src/app/(dashboard)/pipeline/kanban-board.tsx` (render)

- [ ] **Step 1: Add competitionScore to pipeline data**

In `apps/web/src/app/(dashboard)/pipeline/page.tsx`, add `competition_score` to the Supabase select. In the normalization, add:

```typescript
  competitionScore: (m as unknown as Record<string, unknown>).competition_score as number | null ?? null,
```

- [ ] **Step 2: Update Match interface in kanban-board.tsx**

Add `competitionScore: number | null` to the Match interface.

- [ ] **Step 3: Render dual badge and competition tag**

In the DraggableCard component, after the existing score display, for hot matches with competition_score, show:

```typescript
{match.isHot && match.competitionScore != null && (
  <div className="flex items-center gap-1 mt-1">
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
      match.competitionScore >= 75 ? 'bg-green-100 text-green-700' :
      match.competitionScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
      'bg-red-100 text-red-700'
    }`}>
      {match.competitionScore >= 75 ? 'Baixa competição' :
       match.competitionScore >= 50 ? 'Moderada' :
       'Disputado'} ({match.competitionScore})
    </span>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/pipeline/page.tsx apps/web/src/app/\(dashboard\)/pipeline/kanban-board.tsx
git commit -m "feat: show competition tag in pipeline kanban cards"
```

---

### Task 8: Deploy Backend (Migration + Workers)

**Files:** None (deployment only)

- [ ] **Step 1: Push to main (triggers Vercel deploy)**

```bash
git push origin main
```

- [ ] **Step 2: Apply migration to Supabase**

Apply the migration SQL via Supabase dashboard SQL editor (copy from `supabase/migrations/20260317100000_competitive_intelligence.sql`).

- [ ] **Step 3: Deploy workers to VPS**

```bash
ssh root@85.31.60.53 "cd /opt/licitagram && git pull origin main && pnpm install --frozen-lockfile && pnpm --filter workers build && pm2 restart worker-main"
```

- [ ] **Step 4: Trigger initial materialization**

```bash
ssh root@85.31.60.53 "cd /opt/licitagram/packages/workers && REDIS_URL='redis://:a15b96315876efb68a5a9bb4fd48b66e@localhost:6379' node -e \"
const { Queue } = require('bullmq');
const url = new URL(process.env.REDIS_URL);
const q = new Queue('competition-analysis', { connection: { host: url.hostname, port: Number(url.port), password: url.password } });
q.add('initial-full', { mode: 'full' }, { jobId: 'initial-full-' + Date.now() }).then(() => { console.log('dispatched'); return q.close(); }).then(() => process.exit(0));
\""
```

- [ ] **Step 5: Verify via logs**

```bash
ssh root@85.31.60.53 "pm2 logs worker-main --lines 30 --nostream 2>&1 | grep -i 'competition'"
```
Expected: "Competition analysis materialization complete" with totalUpserted > 0.

- [ ] **Step 6: Trigger hot scan to populate competition_scores**

```bash
ssh root@85.31.60.53 "cd /opt/licitagram/packages/workers && REDIS_URL='redis://:a15b96315876efb68a5a9bb4fd48b66e@localhost:6379' node -e \"
const { Queue } = require('bullmq');
const url = new URL(process.env.REDIS_URL);
const q = new Queue('hot-alerts', { connection: { host: url.hostname, port: Number(url.port), password: url.password } });
q.add('hot-daily', {}, { jobId: 'hot-manual-' + Date.now() }).then(() => { console.log('dispatched'); return q.close(); }).then(() => process.exit(0));
\""
```

---

## Chunk 3: Competitors Page + Opportunity Detail + AI (Tasks 9-14)

### Task 9: Watchlist Tab — Rich Cards from competitor_stats

**Files:**
- Modify: `apps/web/src/app/(dashboard)/competitors/page.tsx`

- [ ] **Step 1: Replace on-the-fly aggregation with competitor_stats query**

Replace the existing watchlistStats computation (lines 42-60) that queries raw `competitors` and manually aggregates, with a direct query to `competitor_stats`:

```typescript
  let watchlistStats: Record<string, {
    total_participations: number; total_wins: number; win_rate: number
    avg_valor_proposta: number; avg_discount_pct: number
    participations_by_uf: Record<string, number>; wins_by_uf: Record<string, number>
    porte: string | null; cnae_nome: string | null; uf_sede: string | null; municipio_sede: string | null
    last_participation_at: string | null
  }> = {}

  if (watchlistCnpjs.length > 0) {
    const { data: stats } = await supabase
      .from('competitor_stats')
      .select('*')
      .in('cnpj', watchlistCnpjs)

    if (stats) {
      for (const s of stats) {
        watchlistStats[s.cnpj] = {
          total_participations: s.total_participations,
          total_wins: s.total_wins,
          win_rate: Number(s.win_rate),
          avg_valor_proposta: Number(s.avg_valor_proposta || 0),
          avg_discount_pct: Number(s.avg_discount_pct || 0),
          participations_by_uf: (s.participations_by_uf as Record<string, number>) || {},
          wins_by_uf: (s.wins_by_uf as Record<string, number>) || {},
          porte: s.porte,
          cnae_nome: null, // TODO: join from competitors table if needed
          uf_sede: s.uf_sede,
          municipio_sede: s.municipio_sede,
          last_participation_at: s.last_participation_at,
        }
      }
    }

    // Fallback for CNPJs not yet in competitor_stats (< 3 participations)
    const missingCnpjs = watchlistCnpjs.filter((c) => !watchlistStats[c])
    if (missingCnpjs.length > 0) {
      const { data: rawStats } = await supabase
        .from('competitors')
        .select('cnpj, situacao, valor_proposta, porte, cnae_nome, uf_fornecedor, municipio_fornecedor')
        .in('cnpj', missingCnpjs)

      if (rawStats) {
        for (const s of rawStats) {
          if (!watchlistStats[s.cnpj]) {
            watchlistStats[s.cnpj] = {
              total_participations: 0, total_wins: 0, win_rate: 0,
              avg_valor_proposta: 0, avg_discount_pct: 0,
              participations_by_uf: {}, wins_by_uf: {},
              porte: s.porte, cnae_nome: s.cnae_nome,
              uf_sede: s.uf_fornecedor, municipio_sede: s.municipio_fornecedor,
              last_participation_at: null,
            }
          }
          watchlistStats[s.cnpj].total_participations++
          if (s.situacao?.toLowerCase().includes('homologad')) watchlistStats[s.cnpj].total_wins++
        }
      }
    }
  }
```

- [ ] **Step 2: Fetch overlap count for each watchlist competitor**

For each watchlist competitor, count open tenders where they historically participate in the same CNAE/UF as the user's active matches:

```typescript
  // Calculate overlap: open tenders where this competitor likely competes
  // Uses the same CNAE divisions + UFs from the user's active matches
  const { data: activeMatches } = await supabase
    .from('matches')
    .select('tenders!inner(uf)')
    .eq('company_id', profile?.company_id || '')
    .in('status', ['new', 'notified', 'viewed', 'interested'])

  const activeUfs = [...new Set((activeMatches || []).map((m) => {
    const t = m.tenders as unknown as Record<string, unknown>
    return t.uf as string
  }).filter(Boolean))]

  // For each watchlist competitor, check overlap with user's active UFs
  for (const cnpj of watchlistCnpjs) {
    const stats = watchlistStats[cnpj]
    if (!stats) continue
    const pByUf = stats.participations_by_uf || {}
    const overlapUfs = activeUfs.filter((uf) => pByUf[uf] > 0)
    stats.overlapCount = overlapUfs.length
  }
```

- [ ] **Step 3: Render rich watchlist cards**

Replace the existing watchlist card rendering with rich cards that show:
- Win rate as bold percentage with color coding (green >= 60%, yellow >= 30%, red < 30%)
- Geographic presence (top 5 UFs as horizontal bars with participation count)
- Activity trend badge: "Ativo" (last 30d), "Moderado" (last 90d), "Inativo" (>90d) — based on `last_participation_at`
- Ticket médio formatted as BRL
- Overlap alert: "⚠️ Competindo com você em X UFs" when `overlapCount > 0`

The exact JSX will follow the existing Card/Badge component patterns used in the page.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/competitors/page.tsx
git commit -m "feat: rich watchlist cards using competitor_stats data"
```

---

### Task 10: Panorama de Mercado Tab

**Files:**
- Modify: `apps/web/src/app/(dashboard)/competitors/page.tsx`

- [ ] **Step 1: Fetch market data**

In the page server component, add a query for the user's company CNAE and market competitors:

```typescript
  // Get company CNAE for market analysis
  const { data: company } = await supabase
    .from('companies')
    .select('cnae_principal, cnaes_secundarios')
    .eq('id', profile?.company_id || '')
    .single()

  const companyCnaeDivisions: string[] = []
  if (company?.cnae_principal) companyCnaeDivisions.push(company.cnae_principal.substring(0, 2))
  if (company?.cnaes_secundarios) {
    for (const c of company.cnaes_secundarios) {
      const div = c.substring(0, 2)
      if (!companyCnaeDivisions.includes(div)) companyCnaeDivisions.push(div)
    }
  }

  // Fetch top competitors in user's CNAE (market panorama)
  let marketCompetitors: Array<Record<string, unknown>> = []
  if (companyCnaeDivisions.length > 0) {
    const { data } = await supabase
      .from('competitor_stats')
      .select('*')
      .order('total_participations', { ascending: false })
      .limit(50) // Fetch more, filter client-side by CNAE

    // Filter to competitors who operate in same CNAE divisions
    marketCompetitors = (data || []).filter((s) => {
      const byCnae = (s.participations_by_cnae as Record<string, number>) || {}
      return companyCnaeDivisions.some((d) => byCnae[d] > 0)
    }).slice(0, 10)
  }
```

- [ ] **Step 2: Render Panorama tab content**

Add the "panorama" tab panel with:
- Top 10 table (Posição, Nome, Participações, Vitórias, Win Rate, Porte, UF)
- Competition by state summary (for each UF where user has matches: number of competitors, avg win rate, avg discount — UFs with LOW competition highlighted green as "Janela de oportunidade")
- Desconto médio por modalidade table: aggregate `modalidades` and `avg_discount_pct` across market competitors. Columns: Modalidade | Desconto Médio | Participantes Médios. Use the modalidade names from a lookup or fallback to IDs.
- Janelas de oportunidade cards: UF+CNAE combos where few competitors exist

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/competitors/page.tsx
git commit -m "feat: add Panorama de Mercado tab with top competitors and market analysis"
```

---

### Task 11: Análise Comparativa Tab (Enterprise) + Buscar Tab Enhancement

**Files:**
- Modify: `apps/web/src/app/(dashboard)/competitors/page.tsx`

- [ ] **Step 1: Add enterprise gating logic**

Fetch the user's subscription plan:

```typescript
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('company_id', profile?.company_id || '')
    .eq('status', 'active')
    .limit(1)
    .single()

  const userPlan = subscription?.plan || 'trial'
  const isEnterprise = userPlan === 'enterprise'
```

- [ ] **Step 2: Add Análise Comparativa tab**

When `tab === 'comparativa'`:
- If not enterprise: show blurred preview + upsell CTA
- If enterprise: show competitor selector (from watchlist) + side-by-side stats

- [ ] **Step 3: Enhance Buscar tab**

When search results come back, show the rich card format from `competitor_stats` instead of simple text.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/competitors/page.tsx
git commit -m "feat: add enterprise-gated Analise Comparativa tab and enhanced search"
```

---

### Task 12: Opportunity Detail Page — Competition Section

**Files:**
- Modify: `apps/web/src/app/(dashboard)/opportunities/[id]/page.tsx`

- [ ] **Step 1: Fetch competition data for the match**

Add `competition_score` to the existing match Supabase select query. Also fetch competitor stats for the tender's niche:

```typescript
  // Fetch competitors in this tender's niche for the competition section
  const tenderUf = tender?.uf as string | null
  const companyCnaeDivisions: string[] = []
  if (company?.cnae_principal) companyCnaeDivisions.push(company.cnae_principal.substring(0, 2))
  if (company?.cnaes_secundarios) {
    for (const c of company.cnaes_secundarios) {
      const div = c.substring(0, 2)
      if (!companyCnaeDivisions.includes(div)) companyCnaeDivisions.push(div)
    }
  }

  let nicheCompetitors: Array<Record<string, unknown>> = []
  if (tenderUf && companyCnaeDivisions.length > 0) {
    const { data: stats } = await supabase.rpc('find_competitors_by_cnae_uf', {
      p_cnae_divisions: companyCnaeDivisions,
      p_uf: tenderUf,
    })
    nicheCompetitors = stats || []
  }
```

- [ ] **Step 2: Render competition section**

After the match score/breakdown section, add a "Análise Competitiva" section:

```typescript
{/* Competition Analysis Section */}
<div className="bg-white rounded-lg border p-4 space-y-3">
  <h3 className="text-sm font-semibold flex items-center gap-2">
    📊 Análise Competitiva
    {match.competition_score != null && (
      <span className={`text-xs px-2 py-0.5 rounded-full ${
        match.competition_score >= 75 ? 'bg-green-100 text-green-700' :
        match.competition_score >= 50 ? 'bg-yellow-100 text-yellow-700' :
        'bg-red-100 text-red-700'
      }`}>
        {match.competition_score}/100
      </span>
    )}
  </h3>

  {/* Factor breakdown */}
  {match.competition_score != null && (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="bg-gray-50 rounded p-2">
        <div className="text-gray-500">Concorrentes no nicho</div>
        <div className="font-medium">{nicheCompetitors.length}</div>
      </div>
      <div className="bg-gray-50 rounded p-2">
        <div className="text-gray-500">Competitividade</div>
        <div className="font-medium">{match.competition_score >= 75 ? 'Baixa' : match.competition_score >= 50 ? 'Moderada' : 'Alta'}</div>
      </div>
    </div>
  )}

  {/* Known competitors table (enterprise: names, others: count + bar chart) */}
  {isEnterprise && nicheCompetitors.length > 0 ? (
    <div className="space-y-1">
      <div className="text-xs text-gray-500 font-medium">Principais concorrentes:</div>
      {nicheCompetitors.slice(0, 5).map((c, i) => (
        <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
          <span className="font-medium">{(c.nome as string) || 'N/I'}</span>
          <span className="text-gray-500">Win rate {Math.round(Number(c.win_rate || 0) * 100)}% · {c.porte || 'N/I'}</span>
        </div>
      ))}
    </div>
  ) : nicheCompetitors.length > 0 ? (
    <div className="text-xs text-gray-500">
      {nicheCompetitors.length} concorrentes identificados neste nicho.
      <span className="text-blue-600 ml-1">🔒 Nomes no plano Enterprise</span>
    </div>
  ) : (
    <div className="text-xs text-gray-400">Sem dados competitivos para esta licitação.</div>
  )}
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/opportunities/\[id\]/page.tsx
git commit -m "feat: add competition analysis section to opportunity detail page"
```

---

### Task 13: AI Strategic Analysis (Enterprise)

**Files:**
- Create: `packages/workers/src/lib/ai-competitor-analysis.ts`
- Modify: `apps/web/src/app/(dashboard)/competitors/page.tsx` (consume AI insights in Comparativa tab)

- [ ] **Step 1: Create AI analysis utility**

Create `packages/workers/src/lib/ai-competitor-analysis.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from './logger'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

interface CompetitorProfile {
  nome: string
  winRate: number
  totalParticipations: number
  topUfs: Array<{ uf: string; count: number; winRate: number }>
  avgDiscount: number
  porte: string
  topModalidades: string[]
}

interface CompanyProfile {
  nome: string
  cnaes: string[]
  uf: string
}

export async function generateCompetitiveInsight(
  company: CompanyProfile,
  competitor: CompetitorProfile,
): Promise<string | null> {
  try {
    const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `Você é um consultor estratégico de licitações públicas no Brasil.

Analise o perfil deste concorrente comparado à empresa do cliente e gere uma análise estratégica concisa (máx 200 palavras).

**Empresa do cliente:** ${company.nome}
- CNAEs: ${company.cnaes.join(', ')}
- UF: ${company.uf}

**Concorrente:** ${competitor.nome}
- Win rate: ${competitor.winRate}%
- Participações: ${competitor.totalParticipations}
- Porte: ${competitor.porte}
- Desconto médio: ${(competitor.avgDiscount * 100).toFixed(1)}%
- Principais UFs: ${competitor.topUfs.map(u => `${u.uf} (${u.count} participações, ${u.winRate}% win rate)`).join(', ')}
- Modalidades: ${competitor.topModalidades.join(', ')}

Responda em JSON:
{
  "pontos_fortes": ["lista de até 3 pontos fortes do concorrente"],
  "pontos_fracos": ["lista de até 3 pontos fracos/oportunidades"],
  "estrategia": "recomendação de 1-2 frases de como competir contra este concorrente"
}`

    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch (err) {
    logger.warn({ err, competitor: competitor.nome }, 'Failed to generate AI competitive insight')
    return null
  }
}
```

- [ ] **Step 2: Add AI insight to Análise Comparativa tab**

In `apps/web/src/app/(dashboard)/competitors/page.tsx`, for enterprise users on the Comparativa tab, when a competitor is selected:
- Call a Next.js API route that invokes `generateCompetitiveInsight`
- Display the returned `pontos_fortes`, `pontos_fracos`, and `estrategia` in styled cards
- Cache results in Supabase for 7 days (key: `company_id + competitor_cnpj`)

Create `apps/web/src/app/api/competitors/analyze/route.ts`:

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify enterprise plan
  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('company_id', profile?.company_id || '')
    .eq('status', 'active')
    .single()

  if (sub?.plan !== 'enterprise') {
    return NextResponse.json({ error: 'Enterprise plan required' }, { status: 403 })
  }

  const { competitorCnpj } = await request.json()

  // Check cache (7 days)
  const cacheKey = `ai_analysis_${profile?.company_id}_${competitorCnpj}`
  // TODO: implement cache check in a simple key-value table or use competitor_stats.updated_at

  // Fetch competitor stats
  const { data: competitor } = await supabase
    .from('competitor_stats')
    .select('*')
    .eq('cnpj', competitorCnpj)
    .single()

  if (!competitor) return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })

  // Generate insight using Gemini
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' })
  // ... (use prompt from Step 1 adapted for the API route context)

  return NextResponse.json({ insight: '...' })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json && npx tsc --noEmit -p packages/workers/tsconfig.json`

- [ ] **Step 4: Commit**

```bash
git add packages/workers/src/lib/ai-competitor-analysis.ts apps/web/src/app/api/competitors/analyze/route.ts apps/web/src/app/\(dashboard\)/competitors/page.tsx
git commit -m "feat: add AI strategic analysis for enterprise competitor comparison"
```

---

### Task 14: Final Push + Deploy

- [ ] **Step 1: Push all frontend changes**

```bash
git push origin main
```

- [ ] **Step 2: Deploy workers (if not already updated)**

```bash
ssh root@85.31.60.53 "cd /opt/licitagram && git pull origin main && pnpm install --frozen-lockfile && pnpm --filter workers build && pm2 restart worker-main"
```

- [ ] **Step 3: Verify end-to-end**

1. Check `/competitors` page — watchlist shows rich cards with overlap alerts
2. Check `/competitors?tab=panorama` — top 10 table, competition by state, desconto por modalidade
3. Check `/competitors?tab=comparativa` — blurred for non-enterprise, full for enterprise
4. Check `/opportunities/[id]` — competition analysis section visible
5. Check map sidebar — hot matches show competition tag
6. Check pipeline — hot cards show competition badge
7. Check Telegram — hot alert includes competition analysis section
8. Enterprise: AI competitive insights load on Comparativa tab

---
