# Hot Alerts System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify super-hot opportunities (score >= 80, top 10 daily), display them with special visuals on map/pipeline, and send rich Telegram alerts with urgency tiers (48h/24h) and financial loss messaging.

**Architecture:** New BullMQ processor (`hot-alerts.processor.ts`) with two jobs: daily hot identification + hourly urgency check. New Telegram formatters for 3 message types. Frontend changes to map markers and kanban cards for hot visual treatment. DB migration adds `is_hot`, `hot_at`, `urgency_48h_sent`, `urgency_24h_sent` columns to `matches`.

**Tech Stack:** BullMQ, Grammy (Telegram), Supabase (PostgreSQL), Next.js (React), react-map-gl/Mapbox, dnd-kit, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-17-hot-alerts-system-design.md`

**Simplifications from spec:**
- The `urgency_interest_<batchToken>` callback (batch "Interesse em todas" button with Redis token) is deferred to v2. Urgency alerts use URL buttons only (link to pipeline), avoiding the Redis token complexity.
- The `📊 Concorrencia` line is omitted entirely (not just "Em breve") as the feature doesn't exist yet.

---

## Chunk 1: Database Migration + Queue Setup + Hot Alerts Processor

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260317000000_hot_alerts.sql` | Create | Add is_hot, hot_at, urgency columns + indexes |
| `packages/workers/src/queues/hot-alerts.queue.ts` | Create | BullMQ queue definition |
| `packages/workers/src/queues/notification.queue.ts` | Modify | Extend NotificationJobData for hot/urgency types |
| `packages/workers/src/processors/hot-alerts.processor.ts` | Create | Two jobs: hot-daily + urgency-check |
| `packages/workers/src/index.ts` | Modify | Import worker, register in allWorkers, schedule jobs |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260317000000_hot_alerts.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Hot Alerts: Mark top daily opportunities and track urgency notifications
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_hot BOOLEAN DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS hot_at TIMESTAMPTZ;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS urgency_48h_sent BOOLEAN DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS urgency_24h_sent BOOLEAN DEFAULT false;

-- Partial index for fast hot marker queries (only true rows)
CREATE INDEX IF NOT EXISTS idx_matches_is_hot ON public.matches (is_hot) WHERE is_hot = true;

-- Index for urgency check: find matches by company with active statuses
CREATE INDEX IF NOT EXISTS idx_matches_urgency ON public.matches (company_id, status)
  WHERE status IN ('new', 'notified', 'viewed', 'interested');
```

- [ ] **Step 2: Apply migration locally**

Run: `cd /Users/lucasdelima/Desktop/licitagram && npx supabase db push`
Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260317000000_hot_alerts.sql
git commit -m "feat: add hot alerts columns to matches table"
```

---

### Task 2: Hot Alerts Queue

**Files:**
- Create: `packages/workers/src/queues/hot-alerts.queue.ts`

- [ ] **Step 1: Create the queue file**

Follow the exact pattern from `packages/workers/src/queues/pending-notifications.queue.ts`:

```typescript
import { Queue } from 'bullmq'
import { connection } from './connection'

export const hotAlertsQueue = new Queue('hot-alerts', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
  },
})
```

- [ ] **Step 2: Update NotificationJobData to support new types**

Edit `packages/workers/src/queues/notification.queue.ts` to extend the interface:

```typescript
import { Queue } from 'bullmq'
import { connection } from './connection'

interface UrgencyMatchItem {
  id: string
  score: number
  objeto: string
  orgao: string
  uf: string
  municipio: string
  valor: number
  modalidade: string
  dataEncerramento: string
  numero: string
  ano: string
}

export type NotificationJobData =
  | { matchId: string; telegramChatId?: number; whatsappNumber?: string }
  | { matchId: string; telegramChatId: number; type: 'hot'; rank: number; plan: string }
  | { telegramChatId: number; type: 'urgency_48h'; matches: UrgencyMatchItem[]; totalValor: number }
  | { telegramChatId: number; type: 'urgency_24h'; matches: UrgencyMatchItem[]; totalValor: number }

export const notificationQueue = new Queue<NotificationJobData, unknown, string>('notification', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})
```

- [ ] **Step 3: Commit**

```bash
git add packages/workers/src/queues/hot-alerts.queue.ts packages/workers/src/queues/notification.queue.ts
git commit -m "feat: add hot-alerts queue and extend notification job types"
```

---

### Task 3: Hot Alerts Processor — hot-daily job

**Files:**
- Create: `packages/workers/src/processors/hot-alerts.processor.ts`

This is the main processor with two jobs. We build it incrementally.

- [ ] **Step 1: Write the processor skeleton + hot-daily job**

Create `packages/workers/src/processors/hot-alerts.processor.ts`:

```typescript
import { Worker, Job } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue } from '../queues/notification.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const HOT_MIN_SCORE = 80
const HOT_TOP_N = 10
const HOT_EXPIRY_HOURS = 48
const AI_SOURCES = ['ai', 'ai_triage', 'semantic']

/**
 * Hot Alerts processor — two jobs:
 * 1. hot-daily: Identify top-10 matches per company (score >= 80), mark is_hot, send Telegram alerts
 * 2. urgency-check: Find matches closing in 48h/24h, send urgency alerts with financial loss
 */
export const hotAlertsWorker = new Worker(
  'hot-alerts',
  async (job: Job) => {
    if (job.name === 'hot-daily') {
      await processHotDaily()
    } else if (job.name === 'urgency-check') {
      await processUrgencyCheck()
    }
  },
  { connection, concurrency: 1 },
)

hotAlertsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Hot alerts job failed')
})

// ─── Cache: company plan lookups ────────────────────────────────────────────
const planCache = new Map<string, string>() // companyId → plan slug

async function getCompanyPlan(companyId: string): Promise<string> {
  if (planCache.has(companyId)) return planCache.get(companyId)!
  const { data } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .single()
  const plan = data?.plan || 'trial'
  planCache.set(companyId, plan)
  return plan
}

// ─── Job 1: hot-daily ───────────────────────────────────────────────────────

async function processHotDaily() {
  logger.info('Running hot-daily job...')
  planCache.clear()

  // Find users with telegram linked and notifications enabled
  const { data: users } = await supabase
    .from('users')
    .select('id, company_id, telegram_chat_id, notification_preferences')
    .not('company_id', 'is', null)
    .not('telegram_chat_id', 'is', null)

  if (!users || users.length === 0) {
    logger.info('No users with Telegram linked, skipping hot-daily')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let totalMarked = 0
  let totalSent = 0

  // Group users by company (multiple users may share one company)
  const companyUsers = new Map<string, typeof users>()
  for (const user of users) {
    const prefs = (user.notification_preferences as Record<string, boolean>) || {}
    if (prefs.telegram === false) continue
    if (!companyUsers.has(user.company_id)) companyUsers.set(user.company_id, [])
    companyUsers.get(user.company_id)!.push(user)
  }

  for (const [companyId, compUsers] of companyUsers) {
    // Find top matches from last 24h with score >= 80
    const { data: candidates } = await supabase
      .from('matches')
      .select(`
        id, score, breakdown, ai_justificativa, match_source, notified_at, is_hot,
        tenders!inner(id, objeto, orgao_nome, uf, municipio, valor_estimado, modalidade_nome,
          modalidade_id, data_encerramento, data_abertura, pncp_id, numero, ano_compra)
      `)
      .eq('company_id', companyId)
      .gte('score', HOT_MIN_SCORE)
      .in('match_source', AI_SOURCES)
      .gte('created_at', oneDayAgo)
      .not('tenders.modalidade_id', 'in', '(9,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(HOT_TOP_N)

    if (!candidates || candidates.length === 0) continue

    const plan = await getCompanyPlan(companyId)

    for (let rank = 0; rank < candidates.length; rank++) {
      const match = candidates[rank]

      // Skip if already marked hot (don't re-alert)
      if (match.is_hot) continue

      // Mark as hot
      await supabase
        .from('matches')
        .update({ is_hot: true, hot_at: new Date().toISOString() })
        .eq('id', match.id)
      totalMarked++

      // Dedup with normal notifications: if already notified, skip Telegram send
      // (match is still marked is_hot for map/pipeline display)
      if (match.notified_at) continue

      // Send hot alert to all company users with Telegram
      for (const user of compUsers) {
        await notificationQueue.add(
          `hot-alert-${user.id}-${match.id}`,
          {
            matchId: match.id,
            telegramChatId: user.telegram_chat_id,
            type: 'hot',
            rank: rank + 1,
            plan,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
        )
        totalSent++
      }

      // Mark notified_at so pending-notifications processor skips it
      await supabase
        .from('matches')
        .update({ notified_at: new Date().toISOString(), status: 'notified' })
        .eq('id', match.id)
        .eq('status', 'new') // Only update if still 'new'
    }
  }

  logger.info({ totalMarked, totalSent }, 'hot-daily complete')
}

// ─── Job 2: urgency-check ───────────────────────────────────────────────────

async function processUrgencyCheck() {
  logger.info('Running urgency-check job...')

  // Step 1: Expire old hot markers
  const expiryThreshold = new Date(Date.now() - HOT_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()
  await supabase
    .from('matches')
    .update({ is_hot: false })
    .eq('is_hot', true)
    .lt('hot_at', expiryThreshold)

  logger.info('Expired old hot markers (if any)')

  // Step 2: Find users with Telegram
  const { data: users } = await supabase
    .from('users')
    .select('id, company_id, telegram_chat_id, notification_preferences')
    .not('company_id', 'is', null)
    .not('telegram_chat_id', 'is', null)

  if (!users || users.length === 0) return

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
  const nowISO = now.toISOString()

  // Group users by company
  const companyUsers = new Map<string, typeof users>()
  for (const user of users) {
    const prefs = (user.notification_preferences as Record<string, boolean>) || {}
    if (prefs.telegram === false) continue
    if (!companyUsers.has(user.company_id)) companyUsers.set(user.company_id, [])
    companyUsers.get(user.company_id)!.push(user)
  }

  let totalUrgencySent = 0

  for (const [companyId, compUsers] of companyUsers) {
    // Find matches closing within 48h that haven't had urgency alert sent
    const { data: urgentMatches } = await supabase
      .from('matches')
      .select(`
        id, score, urgency_48h_sent, urgency_24h_sent,
        tenders!inner(id, objeto, orgao_nome, uf, municipio, valor_estimado,
          modalidade_nome, modalidade_id, data_encerramento, numero, ano_compra)
      `)
      .eq('company_id', companyId)
      .in('status', ['new', 'notified', 'viewed', 'interested'])
      .in('match_source', AI_SOURCES)
      .not('tenders.modalidade_id', 'in', '(9,14)')
      .gte('tenders.data_encerramento', nowISO)
      .lte('tenders.data_encerramento', in48h)
      .order('score', { ascending: false })

    if (!urgentMatches || urgentMatches.length === 0) continue

    // Split into 24h and 48h tiers
    const tier24h: typeof urgentMatches = []
    const tier48h: typeof urgentMatches = []

    for (const m of urgentMatches) {
      const tender = m.tenders as unknown as Record<string, unknown>
      const encerramento = tender?.data_encerramento as string
      if (!encerramento) continue

      const encDate = new Date(encerramento)
      const hoursLeft = (encDate.getTime() - now.getTime()) / (1000 * 60 * 60)

      if (hoursLeft <= 24 && !m.urgency_24h_sent) {
        tier24h.push(m)
      } else if (hoursLeft <= 48 && hoursLeft > 24 && !m.urgency_48h_sent) {
        tier48h.push(m)
      }
    }

    // Send 48h urgency alert (grouped per company)
    if (tier48h.length > 0) {
      const totalValor = tier48h.reduce((sum, m) => {
        const t = m.tenders as unknown as Record<string, unknown>
        return sum + ((t?.valor_estimado as number) || 0)
      }, 0)

      for (const user of compUsers) {
        await notificationQueue.add(
          `urgency-48h-${user.id}-${Date.now()}`,
          {
            telegramChatId: user.telegram_chat_id,
            type: 'urgency_48h',
            matches: tier48h.map((m) => {
              const t = m.tenders as unknown as Record<string, unknown>
              return {
                id: m.id,
                score: m.score,
                objeto: ((t?.objeto as string) || '').slice(0, 120),
                orgao: ((t?.orgao_nome as string) || '').slice(0, 60),
                uf: (t?.uf as string) || '',
                municipio: (t?.municipio as string) || '',
                valor: (t?.valor_estimado as number) || 0,
                modalidade: (t?.modalidade_nome as string) || '',
                dataEncerramento: (t?.data_encerramento as string) || '',
                numero: (t?.numero as string) || '',
                ano: (t?.ano_compra as string) || '',
              }
            }),
            totalValor,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
        )
        totalUrgencySent++
      }

      // Mark urgency_48h_sent
      const ids48 = tier48h.map((m) => m.id)
      await supabase
        .from('matches')
        .update({ urgency_48h_sent: true })
        .in('id', ids48)
    }

    // Send 24h urgency alert (grouped per company)
    if (tier24h.length > 0) {
      const totalValor = tier24h.reduce((sum, m) => {
        const t = m.tenders as unknown as Record<string, unknown>
        return sum + ((t?.valor_estimado as number) || 0)
      }, 0)

      for (const user of compUsers) {
        await notificationQueue.add(
          `urgency-24h-${user.id}-${Date.now()}`,
          {
            telegramChatId: user.telegram_chat_id,
            type: 'urgency_24h',
            matches: tier24h.map((m) => {
              const t = m.tenders as unknown as Record<string, unknown>
              return {
                id: m.id,
                score: m.score,
                objeto: ((t?.objeto as string) || '').slice(0, 120),
                orgao: ((t?.orgao_nome as string) || '').slice(0, 60),
                uf: (t?.uf as string) || '',
                municipio: (t?.municipio as string) || '',
                valor: (t?.valor_estimado as number) || 0,
                modalidade: (t?.modalidade_nome as string) || '',
                dataEncerramento: (t?.data_encerramento as string) || '',
                numero: (t?.numero as string) || '',
                ano: (t?.ano_compra as string) || '',
              }
            }),
            totalValor,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
        )
        totalUrgencySent++
      }

      // Mark urgency_24h_sent
      const ids24 = tier24h.map((m) => m.id)
      await supabase
        .from('matches')
        .update({ urgency_24h_sent: true })
        .in('id', ids24)
    }
  }

  logger.info({ totalUrgencySent }, 'urgency-check complete')
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/lucasdelima/Desktop/licitagram && npx tsc --noEmit --project packages/workers/tsconfig.json 2>&1 | head -30`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add packages/workers/src/processors/hot-alerts.processor.ts
git commit -m "feat: add hot-alerts processor with daily + urgency jobs"
```

---

### Task 4: Register Processor in index.ts

**Files:**
- Modify: `packages/workers/src/index.ts`

- [ ] **Step 1: Add imports**

After line 28 (`import { semanticMatchingWorker } from './processors/semantic-matching.processor'`), add:

```typescript
import { hotAlertsWorker } from './processors/hot-alerts.processor'
```

After line 43 (`import { startBot } from './telegram/bot'`), add:

```typescript
import { hotAlertsQueue } from './queues/hot-alerts.queue'
```

- [ ] **Step 2: Add worker to allWorkers array**

In the `allWorkers` array (line 30-36), add `hotAlertsWorker`:

```typescript
const allWorkers = [
  scrapingWorker, extractionWorker, matchingWorker, notificationWorker,
  pendingNotificationsWorker, comprasgovScrapingWorker,
  resultsScrapingWorker, documentExpiryWorker, fornecedorEnrichmentWorker,
  arpScrapingWorker, legadoScrapingWorker, aiTriageWorker,
  semanticMatchingWorker, hotAlertsWorker,
]
```

- [ ] **Step 3: Schedule repeatable jobs**

In `setupRepeatableJobs()`, after the legado scraping section (after line 165), add:

```typescript
  // Schedule hot-daily alerts at 7h BRT (10h UTC)
  await hotAlertsQueue.add(
    'hot-daily',
    {},
    {
      repeat: { pattern: '0 10 * * *' },
      jobId: 'hot-daily-repeat',
    },
  )
  logger.info('Hot alerts daily job scheduled (7h BRT)')

  // Schedule urgency check every hour
  await hotAlertsQueue.add(
    'urgency-check',
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      jobId: 'urgency-check-repeat',
    },
  )
  logger.info('Urgency check job scheduled (every hour)')
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/lucasdelima/Desktop/licitagram && npx tsc --noEmit --project packages/workers/tsconfig.json 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/workers/src/index.ts
git commit -m "feat: register hot-alerts worker and schedule jobs"
```

---

## Chunk 2: Telegram Formatters + Bot Callbacks + Notification Handler

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/workers/src/telegram/formatters.ts` | Modify | Add formatHotAlert, formatUrgencyAlert48h, formatUrgencyAlert24h |
| `packages/workers/src/telegram/bot.ts` | Modify | Add urgency_interest callback handler |
| `packages/workers/src/processors/notification.processor.ts` | Modify | Handle new notification types (hot, urgency_48h, urgency_24h) |

---

### Task 5: Hot Alert Telegram Formatter

**Files:**
- Modify: `packages/workers/src/telegram/formatters.ts`

- [ ] **Step 1: Add new interfaces and formatHotAlert function**

After the existing `formatMatchAlert` function (after line 105), add:

```typescript
interface HotAlertData {
  matchId: string
  rank: number
  score: number
  breakdown: Array<{ category: string; score: number; reason: string }>
  justificativa: string
  plan: string  // 'starter' | 'professional' | 'enterprise'
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

export function formatHotAlert(data: HotAlertData): { text: string; keyboard: InlineKeyboard } {
  const { matchId, rank, score, breakdown, justificativa, plan, tender } = data
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  // Extract top breakdown reason
  const sortedBreakdown = [...(breakdown || [])].sort((a, b) => b.score - a.score)
  const topReason = sortedBreakdown.length > 0 ? sortedBreakdown[0].reason : 'Match por IA'

  // Build modalidade display
  const modalidade = tender.modalidade_nome || 'Licitacao'
  const numero = tender.numero ? ` n\u00ba ${tender.numero}` : ''
  const ano = tender.ano ? `/${tender.ano}` : ''

  let text = `\ud83d\udd25 <b>OPORTUNIDADE #${rank} \u2014 Score ${score}/100</b>\n\n`
  text += `${escapeHtml(modalidade)}${escapeHtml(numero)}${escapeHtml(ano)}\n`
  text += `${escapeHtml(tender.orgao_nome)} \u2014 ${escapeHtml(tender.municipio || '')}/${tender.uf}\n`
  text += `<b>Objeto:</b> ${escapeHtml(truncate(tender.objeto, 200))}\n\n`
  text += `\u2705 <b>Aderencia:</b> ${score}% (${escapeHtml(truncate(topReason, 80))})\n\n`

  // Upsell block or real data based on plan
  if (plan === 'enterprise') {
    text += `\u250c\u2500 \ud83d\udcca ANALISE ESTRATEGICA \u2500\u2500\u2500\u2500\u2500\u2510\n`
    if (tender.valor_estimado) {
      text += `\u2502 Valor estimado: <b>${escapeHtml(formatCurrency(tender.valor_estimado))}</b>\n`
    }
    text += `\u2502 Estrategia: ${escapeHtml(truncate(justificativa || 'Analise por IA', 150))}\n`
    text += `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n\n`
  } else {
    text += `\u250c\u2500 \u2591\u2591 ANALISE ESTRATEGICA BLOQUEADA \u2591\u2591 \u2500\u2510\n`
    text += `\u2502\n`
    text += `\u2502 Valor estimado: R$ \u2588\u2588\u2588\u2588\u2588\u2588\u2588\n`
    text += `\u2502 Desconto sugerido: \u2588\u2588%\n`
    text += `\u2502 Estrategia recomendada: \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\n`
    text += `\u2502\n`
    text += `\u2502 \ud83c\udfc6 Quer GARANTIR que vai ganhar?\n`
    text += `\u2502\n`
    text += `\u2502 Nosso Consultor Estrategico\n`
    text += `\u2502 analisa esta oportunidade,\n`
    text += `\u2502 monta a estrategia de preco\n`
    text += `\u2502 e acompanha ate o resultado.\n`
    text += `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n\n`
  }

  if (tender.valor_estimado) {
    text += `\ud83d\udcb0 Esta oportunidade vale <b>${escapeHtml(formatCurrency(tender.valor_estimado))}</b>\n`
  }

  // Build keyboard
  const keyboard = new InlineKeyboard()

  // Upsell URL buttons (only for non-enterprise)
  if (plan !== 'enterprise') {
    const schedulingUrl = process.env.UPSELL_SCHEDULING_URL || `${appUrl}/consultoria`
    const plansUrl = process.env.UPSELL_PLANS_URL || `${appUrl}/plans`
    keyboard
      .url('\ud83d\udcde Agendar Ligacao', schedulingUrl)
      .url('\u2b06\ufe0f Upgrade Enterprise', plansUrl)
      .row()
  }

  // Action buttons
  keyboard
    .text('\u2705 Interesse', `match_interested_${matchId}`)
    .url('\ud83d\udc41 Ver no App', `${appUrl}/opportunities/${matchId}`)
    .text('\u274c Declinar', `match_dismiss_${matchId}`)

  return { text, keyboard }
}

interface UrgencyMatchData {
  id: string
  score: number
  objeto: string
  orgao: string
  uf: string
  municipio: string
  valor: number
  modalidade: string
  dataEncerramento: string
  numero: string
  ano: string
}

export function formatUrgencyAlert48h(matches: UrgencyMatchData[], totalValor: number): { text: string; keyboard: InlineKeyboard } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  let text = `\u26a0\ufe0f <b>ATENCAO \u2014 ${matches.length} oportunidade${matches.length > 1 ? 's' : ''} fecha${matches.length > 1 ? 'm' : ''} em 48h!</b>\n\n`

  for (let i = 0; i < Math.min(matches.length, 5); i++) {
    const m = matches[i]
    const num = m.numero ? ` n\u00ba ${m.numero}` : ''
    const enc = m.dataEncerramento ? formatDate(m.dataEncerramento) : 'N/I'

    text += `${i + 1}. ${escapeHtml(m.modalidade)}${escapeHtml(num)} \u2014 Score ${m.score}\n`
    text += `   ${escapeHtml(m.orgao)} \u2014 ${escapeHtml(m.municipio || '')}/${m.uf}\n`
    text += `   Encerra: ${escapeHtml(enc)}\n`
    if (m.valor > 0) {
      text += `   Valor: <b>${escapeHtml(formatCurrency(m.valor))}</b>\n`
    }
    text += `\n`
  }

  if (matches.length > 5) {
    text += `... e mais ${matches.length - 5} oportunidade${matches.length - 5 > 1 ? 's' : ''}\n\n`
  }

  if (totalValor > 0) {
    text += `\ud83d\udcb8 Voce esta deixando <b>${escapeHtml(formatCurrency(totalValor))}</b> na mesa.\n`
  }

  const keyboard = new InlineKeyboard()
    .url('\ud83d\udc41 Ver todas no App', `${appUrl}/pipeline`)

  return { text, keyboard }
}

export function formatUrgencyAlert24h(matches: UrgencyMatchData[], totalValor: number): { text: string; keyboard: InlineKeyboard } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  let text = `\ud83d\udea8 <b>ULTIMA CHANCE \u2014 ${matches.length} oportunidade${matches.length > 1 ? 's' : ''} fecha${matches.length > 1 ? 'm' : ''} em 24h!</b>\n\n`

  for (let i = 0; i < Math.min(matches.length, 5); i++) {
    const m = matches[i]
    const num = m.numero ? ` n\u00ba ${m.numero}` : ''
    const encDate = m.dataEncerramento ? new Date(m.dataEncerramento) : null
    const hora = encDate ? encDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : ''

    text += `${i + 1}. ${escapeHtml(m.modalidade)}${escapeHtml(num)} \u2014 Score ${m.score}\n`
    text += `   ${escapeHtml(m.orgao)} \u2014 ${escapeHtml(m.municipio || '')}/${m.uf}\n`
    text += `   \u23f0 Encerra AMANHA as ${hora}\n`
    if (m.valor > 0) {
      text += `   Valor: <b>${escapeHtml(formatCurrency(m.valor))}</b>\n`
    }
    text += `\n`
  }

  if (matches.length > 5) {
    text += `... e mais ${matches.length - 5}\n\n`
  }

  if (totalValor > 0) {
    text += `\ud83d\udd34 Voce vai <b>PERDER ${escapeHtml(formatCurrency(totalValor))}</b> em oportunidades se nao agir AGORA.\n`
  }

  const keyboard = new InlineKeyboard()
    .url('\ud83d\udd25 Ver oportunidades urgentes', `${appUrl}/pipeline`)

  return { text, keyboard }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/lucasdelima/Desktop/licitagram && npx tsc --noEmit --project packages/workers/tsconfig.json 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/workers/src/telegram/formatters.ts
git commit -m "feat: add hot alert and urgency Telegram formatters"
```

---

### Task 6: Update Notification Processor to Handle Hot/Urgency Types

**Files:**
- Modify: `packages/workers/src/processors/notification.processor.ts`

- [ ] **Step 1: Read the current notification processor**

Read `packages/workers/src/processors/notification.processor.ts` to understand the current flow.

- [ ] **Step 2: Add hot/urgency message handling**

The notification processor receives jobs from the notification queue. Currently it only handles standard match alerts. Add handling for the new types: `hot`, `urgency_48h`, `urgency_24h`.

**Insert the type-based routing AT THE TOP of the worker handler (line 18), BEFORE the existing `const { matchId, telegramChatId, whatsappNumber } = job.data` line.** New types return early so the existing standard logic is untouched.

```typescript
// ADD THIS at the very top of the handler, before line 18:
const jobType = (job.data as Record<string, unknown>).type as string | undefined

if (jobType === 'hot') {
  // Hot alert — fetch full match data and format
  const { matchId, telegramChatId, rank, plan } = job.data
  const { data: match } = await supabase
    .from('matches')
    .select(`
      id, score, breakdown, ai_justificativa,
      tenders!inner(id, objeto, orgao_nome, uf, municipio, valor_estimado,
        modalidade_nome, data_encerramento, numero, ano_compra, pncp_id)
    `)
    .eq('id', matchId)
    .single()

  if (!match) return

  const tender = match.tenders as unknown as Record<string, unknown>
  const { formatHotAlert } = await import('../telegram/formatters')
  const { text, keyboard } = formatHotAlert({
    matchId: match.id,
    rank,
    score: match.score,
    breakdown: (match.breakdown as Array<{ category: string; score: number; reason: string }>) || [],
    justificativa: match.ai_justificativa || '',
    plan,
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

  await bot!.api.sendMessage(telegramChatId, text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  })
  return
}

if (jobType === 'urgency_48h') {
  const { telegramChatId, matches, totalValor } = job.data
  const { formatUrgencyAlert48h } = await import('../telegram/formatters')
  const { text, keyboard } = formatUrgencyAlert48h(matches, totalValor)
  await bot!.api.sendMessage(telegramChatId, text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  })
  return
}

if (jobType === 'urgency_24h') {
  const { telegramChatId, matches, totalValor } = job.data
  const { formatUrgencyAlert24h } = await import('../telegram/formatters')
  const { text, keyboard } = formatUrgencyAlert24h(matches, totalValor)
  await bot!.api.sendMessage(telegramChatId, text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  })
  return
}

// ... existing standard notification logic continues below
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/lucasdelima/Desktop/licitagram && npx tsc --noEmit --project packages/workers/tsconfig.json 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/workers/src/processors/notification.processor.ts
git commit -m "feat: handle hot and urgency notification types in notification processor"
```

---

## Chunk 3: Map Hot Markers + Pipeline Hot Cards

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/src/lib/geo/map-utils.ts` | Modify | Add `isHot` to MatchMarker interface |
| `apps/web/src/app/(dashboard)/map/page.tsx` | Modify | Add `is_hot` to query, pass to markers |
| `apps/web/src/components/map/IntelligenceMap.tsx` | Modify | Hot marker rendering (pulsing gold, fire icon, z-index) |
| `apps/web/src/app/(dashboard)/pipeline/page.tsx` | Modify | Add `is_hot`, `data_encerramento` to query |
| `apps/web/src/app/(dashboard)/pipeline/kanban-board.tsx` | Modify | Hot card styling, sorting, countdown |

---

### Task 7: Update MatchMarker Interface

**Files:**
- Modify: `apps/web/src/lib/geo/map-utils.ts`

- [ ] **Step 1: Add isHot to MatchMarker interface**

In `apps/web/src/lib/geo/map-utils.ts`, add `isHot` field to the `MatchMarker` interface (after line 14 `lng: number`):

```typescript
  isHot: boolean
```

So the interface becomes:

```typescript
export interface MatchMarker {
  matchId: string
  tenderId: string
  objeto: string
  orgao: string
  uf: string
  municipio: string | null
  score: number
  matchSource: string
  valor: number | null
  modalidade: string | null
  recomendacao: string | null
  lat: number
  lng: number
  isHot: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/geo/map-utils.ts
git commit -m "feat: add isHot to MatchMarker interface"
```

---

### Task 8: Update Map Page Query

**Files:**
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx`

- [ ] **Step 1: Add `is_hot` to the select query**

In `apps/web/src/app/(dashboard)/map/page.tsx`, line 29, change the select to include `is_hot`:

```typescript
      id, score, status, recomendacao, match_source, is_hot,
```

- [ ] **Step 2: Pass isHot when building matchMarkers**

In the matchMarkers.push block (around line 68), add `isHot`:

```typescript
      matchMarkers.push({
        matchId: match.id,
        tenderId: tender.id as string,
        objeto: ((tender.objeto as string) || '').slice(0, 120),
        orgao: ((tender.orgao_nome as string) || '').slice(0, 60),
        uf,
        municipio,
        score: match.score,
        matchSource: (match.match_source as string) || 'keyword',
        valor: tender.valor_estimado as number | null,
        modalidade: tender.modalidade_nome as string | null,
        recomendacao: match.recomendacao as string | null,
        lat: coords.lat,
        lng: coords.lng,
        isHot: (match as unknown as Record<string, unknown>).is_hot === true,
      })
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/map/page.tsx
git commit -m "feat: include is_hot in map query and pass to markers"
```

---

### Task 9: Hot Marker Rendering on Map

**Files:**
- Modify: `apps/web/src/components/map/IntelligenceMap.tsx`

- [ ] **Step 1: Add CSS keyframe for pulse animation**

At the top of the file (after imports, before the component), add a `<style>` injection using a `useEffect` or inline style. Since this is a client component, we'll use a `<style jsx>` approach. Actually, the simplest approach with Tailwind is to add a global CSS keyframe. Instead, we'll define the animation inline in the marker div.

Actually, the cleanest approach: add the keyframes to the existing global CSS file.

Find the global CSS file: `apps/web/src/app/globals.css` and add:

```css
@keyframes pulse-hot {
  0%, 100% { box-shadow: 0 0 8px 3px rgba(255, 165, 0, 0.5); }
  50% { box-shadow: 0 0 22px 10px rgba(255, 165, 0, 0.85); }
}
```

- [ ] **Step 2: Sort groupedMarkers to render hot last (on top)**

In the `groupedMarkers` useMemo (around line 76-91), after the result array is built, sort it so hot markers come last:

```typescript
    // Sort: normal markers first, hot markers last (so they render on top via DOM order)
    result.sort((a, b) => {
      if (a.best.isHot && !b.best.isHot) return 1
      if (!a.best.isHot && b.best.isHot) return -1
      return 0
    })
    return result
```

- [ ] **Step 3: Update marker rendering for hot matches**

Replace the marker rendering block (lines 380-419) with code that differentiates hot markers:

In the `groupedMarkers.map` callback, change the inner `<div>` to handle hot:

```tsx
{groupedMarkers.map(({ best: m, count, all }) => {
  const isAi = m.matchSource === 'ai' || m.matchSource === 'ai_triage' || m.matchSource === 'semantic'
  const isHot = m.isHot
  return (
    <Marker
      key={`match-${m.matchId}`}
      longitude={m.lng}
      latitude={m.lat}
      anchor="center"
      onClick={(e: { originalEvent: MouseEvent }) => {
        e.originalEvent.stopPropagation()
        setSelectedMatch(m)
        setSelectedUf(m.uf)
        setSelectedGroup(count > 1 ? all : null)
      }}
    >
      <div className="relative" style={isHot ? { zIndex: 50 } : undefined}>
        {isHot && (
          <span
            className="absolute left-1/2 -translate-x-1/2 text-base drop-shadow-lg pointer-events-none"
            style={{ top: -16, filter: 'drop-shadow(0 0 4px rgba(255,100,0,0.8))' }}
          >
            🔥
          </span>
        )}
        <div
          className={`flex items-center justify-center rounded-full cursor-pointer shadow-lg transition-transform hover:scale-125 hover:z-50 ${
            isHot
              ? 'border-2 border-yellow-400'
              : isAi
                ? 'border-2 border-blue-400/80'
                : 'border-2 border-white/50'
          }`}
          style={{
            width: isHot ? 36 : 32,
            height: isHot ? 36 : 32,
            background: isHot
              ? 'linear-gradient(135deg, #f97316, #ef4444)'
              : getMatchColor(m.score),
            animation: isHot ? 'pulse-hot 1.5s ease-in-out infinite' : undefined,
          }}
          title={`${m.objeto} — Score: ${m.score}${isHot ? ' 🔥 SUPER QUENTE' : ''}${isAi ? ' (IA)' : ' (estimado)'}${count > 1 ? ` (+${count - 1} mais)` : ''}`}
        >
          <span className="text-white font-bold text-[11px] leading-none drop-shadow-sm">
            {m.score}
          </span>
        </div>
        {count > 1 && (
          <div className="absolute -top-1.5 -right-1.5 bg-white text-gray-800 rounded-full min-w-[18px] h-[18px] flex items-center justify-center text-[9px] font-bold shadow-md border border-gray-200 px-0.5">
            {count}
          </div>
        )}
      </div>
    </Marker>
  )
})}
```

- [ ] **Step 4: Update popup for hot matches**

In the popup section (around line 434-490), add a hot header when the selected match is hot:

After `<div className="p-3 min-w-[220px]">` (line 434), add:

```tsx
{selectedMatch.isHot && (
  <div className="mb-2 pb-2 border-b border-orange-200 bg-gradient-to-r from-orange-500 to-red-500 -m-3 mb-2 p-2 rounded-t">
    <p className="text-xs font-bold text-white">🔥 SUPER QUENTE</p>
  </div>
)}
```

- [ ] **Step 5: Update legend**

In the legend section (around line 497-523), add a hot marker legend item after the "Verificado por IA" line:

```tsx
<div className="flex items-center gap-1.5 mt-1">
  <div className="w-3 h-3 rounded-full border-2 border-yellow-400" style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }} />
  <span className="text-[9px] text-gray-300">🔥 Super Quente</span>
</div>
```

- [ ] **Step 6: Verify it builds**

Run: `cd /Users/lucasdelima/Desktop/licitagram && cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds (or check for specific errors)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/map/IntelligenceMap.tsx apps/web/src/app/globals.css
git commit -m "feat: add hot marker rendering with pulsing glow and fire icon"
```

---

### Task 10: Update Pipeline Page Query

**Files:**
- Modify: `apps/web/src/app/(dashboard)/pipeline/page.tsx`

- [ ] **Step 1: Add is_hot and data_encerramento to the select**

In `apps/web/src/app/(dashboard)/pipeline/page.tsx`, line 27, change:

```typescript
      'id, score, status, is_hot, tenders!inner(objeto, orgao_nome, uf, valor_estimado, data_abertura, data_encerramento, modalidade_id)',
```

- [ ] **Step 2: Include is_hot and data_encerramento in normalized data**

In the normalization block (lines 36-52), add:

```typescript
    return {
      id: m.id,
      score: m.score,
      status: m.status,
      isHot: (m as unknown as Record<string, unknown>).is_hot === true,
      tenders: tender
        ? {
            objeto: (tender.objeto as string) || '',
            orgao_nome: (tender.orgao_nome as string) || '',
            uf: (tender.uf as string) || '',
            valor_estimado: (tender.valor_estimado as number) || null,
            data_abertura: (tender.data_abertura as string) || null,
            data_encerramento: (tender.data_encerramento as string) || null,
          }
        : null,
    }
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/pipeline/page.tsx
git commit -m "feat: include is_hot and data_encerramento in pipeline query"
```

---

### Task 11: Hot Card Styling in Kanban

**Files:**
- Modify: `apps/web/src/app/(dashboard)/pipeline/kanban-board.tsx`

- [ ] **Step 1: Update Match interface**

Add `isHot` and `data_encerramento` to the Match interface (around line 19-30):

```typescript
interface Match {
  id: string
  score: number
  status: string
  isHot: boolean
  tenders: {
    objeto: string
    orgao_nome: string
    uf: string
    valor_estimado: number | null
    data_abertura: string | null
    data_encerramento: string | null
  } | null
}
```

- [ ] **Step 2: Add timeUntil helper**

After the `formatCurrencyShort` function (after line 44), add:

```typescript
function formatCurrencyFull(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function timeUntil(dateStr: string): { text: string; urgency: 'normal' | 'warning' | 'critical' } {
  const target = new Date(dateStr)
  const now = new Date()
  const hours = Math.max(0, (target.getTime() - now.getTime()) / (1000 * 60 * 60))
  if (hours < 1) return { text: 'Encerra em menos de 1h', urgency: 'critical' }
  if (hours < 24) return { text: `Encerra em ${Math.floor(hours)}h`, urgency: 'critical' }
  if (hours < 48) return { text: `Encerra em ${Math.floor(hours)}h`, urgency: 'warning' }
  const days = Math.floor(hours / 24)
  return { text: `Encerra em ${days} dia${days > 1 ? 's' : ''}`, urgency: 'normal' }
}
```

- [ ] **Step 3: Sort matches — hot first**

In the `grouped` building logic (lines 176-179), add sorting:

```typescript
  const grouped: Record<string, Match[]> = {}
  for (const col of COLUMNS) {
    grouped[col.key] = matches
      .filter((m) => m.status === col.key)
      .sort((a, b) => {
        if (a.isHot && !b.isHot) return -1
        if (!a.isHot && b.isHot) return 1
        return b.score - a.score
      })
  }
```

- [ ] **Step 4: Update DraggableCard for hot styling**

Replace the DraggableCard component (lines 91-136) with hot-aware version:

```tsx
function DraggableCard({ match, isDragging }: { match: Match; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: match.id,
    data: { status: match.status },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const tender = match.tenders
  const isHot = match.isHot

  const scoreColor = isHot
    ? 'bg-orange-100 text-orange-800'
    : match.score >= 70
      ? 'bg-emerald-100 text-emerald-800'
      : match.score >= 50
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'

  const countdown = tender?.data_encerramento ? timeUntil(tender.data_encerramento) : null
  const countdownColor = countdown?.urgency === 'critical'
    ? 'text-red-600 font-semibold'
    : countdown?.urgency === 'warning'
      ? 'text-amber-600'
      : 'text-gray-400'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      } ${isHot ? 'border-l-[3px] border-l-orange-500 bg-orange-50' : ''}`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <a
          href={`/opportunities/${match.id}`}
          className="text-xs font-medium text-gray-900 line-clamp-2 hover:text-brand flex-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          {truncateText(tender?.objeto || 'N/A', 70)}
        </a>
        <span className={`ml-1 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${scoreColor}`}>
          {isHot ? '🔥 ' : ''}{match.score}
        </span>
      </div>
      <p className="text-xs text-gray-400 truncate">{tender?.orgao_nome || ''}</p>
      <div className="flex justify-between mt-1.5 text-xs text-gray-400">
        <span>{tender?.uf || ''}</span>
        <span className={isHot ? 'font-bold text-gray-700' : ''}>
          {tender?.valor_estimado
            ? (isHot ? formatCurrencyFull(tender.valor_estimado) : formatCurrencyShort(tender.valor_estimado))
            : '-'}
        </span>
      </div>
      {countdown && isHot && (
        <div className={`mt-1.5 text-[10px] ${countdownColor}`}>
          ⏰ {countdown.text}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Also update CardOverlay for hot styling**

In the `CardOverlay` component (lines 138-158), add hot treatment:

```tsx
function CardOverlay({ match }: { match: Match }) {
  const tender = match.tenders
  const isHot = match.isHot
  const scoreColor = isHot
    ? 'bg-orange-100 text-orange-800'
    : match.score >= 70
      ? 'bg-emerald-100 text-emerald-800'
      : match.score >= 50
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'

  return (
    <div className={`bg-white rounded-lg border-2 border-brand p-3 shadow-xl w-[240px] rotate-2 ${isHot ? 'border-orange-500' : ''}`}>
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-xs font-medium text-gray-900 line-clamp-2 flex-1">
          {truncateText(tender?.objeto || 'N/A', 70)}
        </p>
        <span className={`ml-1 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${scoreColor}`}>
          {isHot ? '🔥 ' : ''}{match.score}
        </span>
      </div>
      <p className="text-xs text-gray-400 truncate">{tender?.orgao_nome || ''}</p>
    </div>
  )
}
```

- [ ] **Step 6: Verify it builds**

Run: `cd /Users/lucasdelima/Desktop/licitagram/apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/pipeline/kanban-board.tsx
git commit -m "feat: hot card styling with orange border, fire badge, countdown, and priority sorting"
```

---

## Chunk 4: Build, Deploy, Test

### Task 12: Build Workers and Deploy

**Files:**
- No new files — build and deploy existing changes

- [ ] **Step 1: Build workers**

Run: `cd /Users/lucasdelima/Desktop/licitagram/packages/workers && npm run build`
Expected: Build succeeds

- [ ] **Step 2: Push to main (triggers Vercel deploy for frontend)**

Run: `cd /Users/lucasdelima/Desktop/licitagram && git push origin main`
Expected: Push succeeds, Vercel deploy starts

- [ ] **Step 3: Deploy workers to VPS**

Run:
```bash
ssh root@85.31.60.53 'cd /opt/licitagram && git pull origin main && cd packages/workers && npm run build && pm2 restart worker-main'
```
Expected: Worker restarts with hot alerts processor active

- [ ] **Step 4: Apply migration to production Supabase**

Run: `cd /Users/lucasdelima/Desktop/licitagram && npx supabase db push`
Expected: Migration applied

- [ ] **Step 5: Verify hot-daily job is scheduled**

Run: `ssh root@85.31.60.53 'pm2 logs worker-main --lines 30 2>&1 | grep -i "hot\|urgency"'`
Expected: See "Hot alerts daily job scheduled" and "Urgency check job scheduled" in logs

- [ ] **Step 6: Commit deploy confirmation (no code changes)**

No commit needed — just verify everything is running.
