# Hot Alerts System — Design Spec

**Date:** 2026-03-17
**Status:** Reviewed

## Overview

System to identify, highlight, and alert users about "super hot" opportunities — the best matches of the day — across Telegram, map, and pipeline. Includes urgency alerts for opportunities approaching their deadline with financial loss messaging.

## Decisions

| Decision | Choice |
|----------|--------|
| Hot criteria | Score ≥ 80 AND top 10 of the day per company |
| Urgency tiers | 48h ("closing soon") + 24h ("last chance") |
| Financial display | Individual valor_estimado + accumulated loss on urgency alerts |
| Telegram actions | Interesse / Ver no App / Declinar (persists to DB, no realtime) |
| Map icon | Pulsing golden border + 🔥 animated icon above pin |
| In-app alerts | None for now — Telegram + map + pipeline only |
| Architecture | Dedicated `hot-alerts.processor.ts` (separate from existing notification flow) |

## 1. Data Model Changes

### Table: `matches` — new columns

```sql
ALTER TABLE matches ADD COLUMN is_hot BOOLEAN DEFAULT false;
ALTER TABLE matches ADD COLUMN hot_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN urgency_48h_sent BOOLEAN DEFAULT false;
ALTER TABLE matches ADD COLUMN urgency_24h_sent BOOLEAN DEFAULT false;

CREATE INDEX idx_matches_is_hot ON matches (is_hot) WHERE is_hot = true;
CREATE INDEX idx_matches_urgency ON matches (company_id, status)
  WHERE status IN ('new', 'notified', 'viewed', 'interested');
```

- `is_hot` — true for top-10 daily matches with score ≥ 80
- `hot_at` — timestamp of when it was marked hot (expires after 48h)
- `urgency_48h_sent` / `urgency_24h_sent` — prevents duplicate urgency alerts

## 2. Hot Alerts Processor

New file: `packages/workers/src/processors/hot-alerts.processor.ts`

### Job 1: `hot-daily` — runs daily at 7h BRT (10h UTC)

For each company with an active user (telegram_chat_id not null):

1. Query matches created in last 24h with `score >= 80` and `match_source IN ('ai', 'ai_triage', 'semantic')` — keyword matches are excluded because they have unreliable scores (not AI-verified)
2. Order by score DESC, take top 10
3. **Only for matches not already hot** (`is_hot = false`): set `is_hot = true`, `hot_at = now()`. Matches already marked hot from a previous run are skipped — no re-alert for the same match.
4. (Hot expiry runs in the hourly `urgency-check` job — see Job 2 step 2b)
5. **Deduplication with normal notifications:** Before sending, check `notified_at`. If the match was already notified by the standard `pending-notifications.processor`, skip the hot alert Telegram send (the match is still marked `is_hot` for map/pipeline display, just no duplicate message). If not yet notified, send the hot alert and set `notified_at = now()` so the standard processor skips it later.
6. For each eligible hot match: dispatch Telegram alert with new 🔥 template
7. Include valor_estimado in bold, action buttons (Interesse / Ver no App / Declinar)

### Job 2: `urgency-check` — runs every hour

For each company with an active user:

1. Query matches with `status IN ('new', 'notified', 'viewed', 'interested')` and `match_source IN ('ai', 'ai_triage', 'semantic')` (consistent with hot-daily — no keyword-only matches)
2. Filter where `data_encerramento` is within next 48h and `urgency_48h_sent = false`, OR within next 24h and `urgency_24h_sent = false`
2b. Also run `is_hot` expiry: reset `is_hot = false` for matches where `hot_at < now() - 48h` (runs hourly here instead of only at 7h to avoid timing edge cases)
3. Group by company
4. Calculate `valor_total_perdido = SUM(valor_estimado)` of closing opportunities
5. Dispatch urgency alert:
   - 48h tier: "⚠️ X oportunidades fecham em 48h — R$ Y em jogo"
   - 24h tier: "🚨 ÚLTIMA CHANCE — R$ Y em oportunidades"
6. Set `urgency_48h_sent = true` or `urgency_24h_sent = true`

### Registration in `index.ts`

```typescript
// Hot alerts - daily at 7h BRT (10h UTC)
hotAlertsQueue.add('hot-daily', {}, {
  repeat: { pattern: '0 10 * * *' }
})

// Urgency check - every hour
hotAlertsQueue.add('urgency-check', {}, {
  repeat: { every: 3_600_000 }
})
```

## 3. Telegram Message Templates

New formatters in `packages/workers/src/telegram/formatters.ts`.

### 3.1 Hot Opportunity Alert (`formatHotAlert`)

```
🔥 OPORTUNIDADE #[rank] — Score [score]/100

[modalidade_nome] nº [numero]/[ano]
[orgao_nome] — [municipio]/[uf]
Objeto: [objeto truncado 200 chars]

✅ Aderência: [score]% ([breakdown[0].reason — first item from breakdown JSONB array, sorted by score DESC])

┌─────────────────────────────────┐
│ ░░ ANÁLISE ESTRATÉGICA BLOQUEADA│
│                                 │
│ Valor estimado: R$ ███████      │
│ Desconto sugerido: ██%          │
│ Estratégia recomendada: ████████│
│                                 │
│ 🏆 Quer GARANTIR que vai ganhar?│
│                                 │
│ Nosso Consultor Estratégico     │
│ analisa esta oportunidade,      │
│ monta a estratégia de preço     │
│ e acompanha até o resultado.    │
│                                 │
│ [📞 Agendar Ligação]           │
│ ou                              │
│ [⬆️ Upgrade Enterprise]   │
└─────────────────────────────────┘

💰 Esta oportunidade vale *R$ [valor_estimado]*

[Interesse] [Ver no App] [Declinar]
```

**Enterprise users:** The blocked section is replaced with real data:

```
┌─────────────────────────────────┐
│ 📊 ANÁLISE ESTRATÉGICA          │
│                                 │
│ Valor estimado: R$ 500.000,00   │
│ Desconto sugerido: 15%          │
│ Estratégia: [ai_justificativa]  │
└─────────────────────────────────┘
```

- Valor in MarkdownV2 bold
- Action buttons: inline keyboard with 3 buttons
- Upsell buttons: URL buttons pointing to configurable URLs (env vars `UPSELL_SCHEDULING_URL` and `UPSELL_PLANS_URL`)
- **Breakdown extraction:** The `breakdown` field is a JSONB array of `{category: string, score: number, reason: string}`. Sort by `score` DESC, take `breakdown[0].reason` for the aderência line. If breakdown is null/empty, use `"Match por IA"` as fallback.
- **Plan detection:** The existing plans are `'trial', 'starter', 'professional', 'enterprise'` (defined in `plans` table and CHECK constraint on `subscriptions.plan`). The upsell block is shown to all plans except `'enterprise'`. For enterprise users, show the real strategic data. Query path: join `subscriptions` via `subscriptions.company_id = users.company_id` where `subscriptions.status = 'active'` to get the user's current plan. The worker will cache this per-company to avoid repeated queries during a batch run.

### 3.2 Urgency Alert 48h (`formatUrgencyAlert48h`)

```
⚠️ ATENÇÃO — [count] oportunidades fecham em 48h!

1. [modalidade] nº [numero] — Score [score]
   [orgao] — [municipio]/[uf]
   Encerra: [data_encerramento formatted]
   Valor: *R$ [valor]*

2. ...

💸 Você está deixando *R$ [total]* na mesa.

[Ver todas no App]
```

### 3.3 Urgency Alert 24h (`formatUrgencyAlert24h`)

```
🚨 ÚLTIMA CHANCE — [count] oportunidades fecham em 24h!

1. [modalidade] nº [numero] — Score [score]
   [orgao] — [municipio]/[uf]
   ⏰ Encerra AMANHÃ às [hora]
   Valor: *R$ [valor]*

2. ...

🔴 Você vai PERDER *R$ [total]* em oportunidades se não agir AGORA.

[🔥 Ver oportunidades urgentes] [Interesse em todas]
```

### 3.4 Telegram Callbacks — new

```typescript
// Hot alert buttons — REUSE existing callback prefixes to avoid duplication
// The existing bot.ts already handles match_interested_<matchId> and match_dismiss_<matchId>
// Hot alerts use the SAME callbacks, just with the new message format:
'match_interested_<matchId>' → set status = 'interested', edit message (existing handler)
'Ver no App'                 → URL button (not callback), links directly to app opportunity page. No server round-trip needed.
'match_dismiss_<matchId>'    → set status = 'dismissed', edit message (existing handler)

// Urgency buttons
'urgency_view_all'              → reply with pipeline link (URL button, not callback)
'urgency_interest_<batchToken>' → server-side lookup: store match IDs in Redis/memory
                                  keyed by short token (8 chars) when building the message.
                                  On callback, retrieve IDs from token, set all to 'interested'.
                                  Token expires after 24h.

// Upsell buttons (URL type, not callback)
'Agendar Ligação'            → URL from env var UPSELL_SCHEDULING_URL
'Upgrade Enterprise'    → URL from env var UPSELL_PLANS_URL
```

**Note on Telegram callback_data 64-byte limit:** The `urgency_interest_all` button cannot embed multiple match IDs directly. Instead, when building the urgency message, the processor stores the list of match IDs in a short-lived key (Redis or in-memory Map) keyed by a random 8-char token. The callback data is just `urgency_interest_<token>` (well under 64 bytes). The handler retrieves the IDs from the token on click.

## 4. Map — Hot Marker Visualization

Changes to `apps/web/src/components/map/IntelligenceMap.tsx`.

### Hot marker style

Matches with `is_hot = true` render with:

- **Size:** 36x36px (vs 32px normal)
- **Background:** `linear-gradient(135deg, #f97316, #ef4444)` (orange→red)
- **Border:** 2px solid `#fbbf24` (golden)
- **Animation:** `pulse-hot` keyframes — pulsing golden glow (1.5s infinite)
- **Fire icon:** 🔥 positioned absolute, 14px above the circle center, with orange drop-shadow

```css
@keyframes pulse-hot {
  0%, 100% { box-shadow: 0 0 8px 3px rgba(255, 165, 0, 0.5); }
  50% { box-shadow: 0 0 22px 10px rgba(255, 165, 0, 0.85); }
}
```

### Z-index layering

Hot markers render after normal markers to ensure they always appear on top. Render order:
1. Normal markers (existing)
2. Hot markers (z-index higher)

### Popup for hot markers

- Header with gradient orange→red background + "🔥 SUPER QUENTE" badge
- Valor estimado displayed in bold
- 3 action buttons: Interesse | Ver Detalhes | Declinar
- Grouped hot markers: "X oportunidades super quentes nesta região"

### Query change

`map/page.tsx` select adds `is_hot`:

```typescript
.select('id, score, ..., is_hot')
```

## 5. Pipeline/Kanban — Hot Card Styling

Changes to `apps/web/src/app/(dashboard)/pipeline/kanban-board.tsx`.

### Hot card visual differences

- **Left border:** 3px solid orange-500 (`border-l-3 border-orange-500`)
- **Badge:** 🔥 replaces color emoji (🟢/🟡/🔴)
- **Value:** Full format bold (`R$ 500.000,00` instead of `R$ 500K`)
- **Countdown:** Time until `data_encerramento` with color coding:
  - `> 48h`: gray text (neutral)
  - `24h–48h`: yellow text ⚠️
  - `< 24h`: red pulsing text 🚨
- **Background:** `bg-orange-50` (light) / `bg-orange-950/20` (dark)

### Sorting

Within each kanban column, hot cards appear first, then sorted by score descending:

```typescript
const sorted = matches.sort((a, b) => {
  if (a.is_hot && !b.is_hot) return -1
  if (!a.is_hot && b.is_hot) return 1
  return b.score - a.score
})
```

### Countdown helper

```typescript
// All dates from DB (data_encerramento) are stored as TIMESTAMPTZ (UTC-aware).
// The countdown is computed against the current time in BRT (America/Sao_Paulo)
// using date-fns-tz or Intl.DateTimeFormat for display.
function timeUntil(dataEncerramento: Date): string {
  const now = new Date()
  const hours = differenceInHours(dataEncerramento, now)
  if (hours < 1) return 'Encerra em menos de 1h'
  if (hours < 24) return `Encerra em ${hours}h`
  const days = Math.floor(hours / 24)
  return `Encerra em ${days} dia${days > 1 ? 's' : ''}`
}
```

### Query change

`pipeline/page.tsx` select adds `is_hot` and ensures `tenders.data_encerramento` is included.

## 6. Spam Control

- Hot alerts: max 10 per company per day (enforced by top-10 selection)
- Urgency 48h: 1 alert per match (flag `urgency_48h_sent`)
- Urgency 24h: 1 alert per match (flag `urgency_24h_sent`)
- Rate limit: 500ms between Telegram messages (existing)
- Respects `notification_preferences.telegram` and pause state
- Skips users with `telegram_chat_id IS NULL`

## 7. End-to-End Flow

```
Tender ingested → Keyword match → AI Triage (score)
                                       ↓
                              score >= 80 + top 10 daily?
                              ↓ YES              ↓ NO
                         is_hot = true      normal notification
                              ↓
                    ┌─────────┴──────────┐
                    ↓                    ↓
             Telegram 🔥           Map (pulsing pin)
             new format            Pipeline (hot card)
                    ↓
              Urgency check (hourly)
                    ↓
            data_encerramento - 48h → ⚠️ alert
            data_encerramento - 24h → 🚨 alert
            (with accumulated R$ loss)
```

## 8. Files to Create/Modify

### New files
- `packages/workers/src/processors/hot-alerts.processor.ts` — Main processor (2 jobs)
- `supabase/migrations/YYYYMMDD_hot_alerts.sql` — Schema migration

### Modified files
- `packages/workers/src/index.ts` — Register hot-alerts queue + jobs
- `packages/workers/src/telegram/formatters.ts` — Add 3 new formatters
- `packages/workers/src/telegram/bot.ts` — Add new callback handlers
- `apps/web/src/components/map/IntelligenceMap.tsx` — Hot marker rendering + animation
- `apps/web/src/app/(dashboard)/map/page.tsx` — Add `is_hot` to query
- `apps/web/src/app/(dashboard)/pipeline/kanban-board.tsx` — Hot card styling + sorting + countdown
- `apps/web/src/app/(dashboard)/pipeline/page.tsx` — Add `is_hot` + `data_encerramento` to query

## 9. Configuration Constants

```env
# Upsell URLs (set in worker .env)
UPSELL_SCHEDULING_URL=https://calendly.com/licitagram/consultoria
UPSELL_PLANS_URL=https://app.licitagram.com/plans

# Hot alert thresholds (hardcoded, can be env vars later)
HOT_MIN_SCORE=80
HOT_TOP_N=10
HOT_EXPIRY_HOURS=48
```

## 10. Out of Scope

- Competitor analysis (concorrência) — removed from template entirely (no placeholder)
- In-app notification center (bell icon)
- Supabase Realtime for pipeline sync
- WhatsApp hot alerts (can be added later using same formatters)
