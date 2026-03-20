# AI Consultant System — Design Spec

## Overview

A global AI consultant integrated throughout Licitagram that acts as a real-time expert on public procurement, generates branded PDF reports, guides users through onboarding, and sends proactive strategic alerts.

## Decisions

| Decision | Choice |
|---|---|
| Chat model | B — Global floating + per-tender chat kept separate |
| PDF engine | A — `@react-pdf/renderer` server-side |
| Onboarding | C — Setup wizard + interactive tour + proactive AI |
| Alerts | B — In-app + smart Telegram/WhatsApp (max 3/day) |
| Knowledge | C — Dynamic page context + base system prompt |

## Architecture

### Components

1. **AiConsultant** — Floating chat widget on all dashboard pages
2. **ConsultantContext** — React context providing page-aware data to the chat
3. **API `/api/consultant`** — Streaming chat endpoint with context injection
4. **API `/api/consultant/pdf`** — PDF report generation endpoint
5. **OnboardingWizard** — 4-step setup wizard for first-time users
6. **OnboardingTour** — `driver.js` guided tour of the interface
7. **ProactiveInsights Worker** — BullMQ cron that sends smart alerts
8. **ProactiveAlertBanner** — In-app contextual alert banners

### Data Flow

```
User interacts with page
  → Page sets ConsultantContext (visible data, metrics, features)
  → User opens AiConsultant chat
  → Message + pageContext sent to /api/consultant
  → API builds: system_prompt_base + page_context + user_plan + conversation_history
  → Gemini 2.5 Flash streams response (fallback: DeepSeek V3)
  → If user requests PDF: API calls /api/consultant/pdf with report data
  → PDF rendered with @react-pdf/renderer, returned as download link
```

## Component Specs

### 1. AiConsultant (Floating Chat)

**Location**: Dashboard layout, bottom-right corner.

**UI States**:
- Collapsed: circular button with Licitagram AI icon + unread badge
- Expanded: 400x600px panel with header, messages, input, suggestions

**Features**:
- Streaming SSE responses with markdown rendering
- Suggested questions that change per page context
- "Generate PDF" action when AI proposes a report
- Conversation persisted in localStorage (last 50 messages)
- Clear conversation button
- Minimize/maximize

**Context injection**: Receives `pageContext` from `ConsultantContext` provider. Each message to the API includes the current page context so the AI knows what the user is looking at.

**File**: `apps/web/src/components/ai-consultant.tsx` (client component)

### 2. ConsultantContext

**Location**: Dashboard layout provider.

**Interface**:
```typescript
interface ConsultantPageContext {
  page: string                    // 'dashboard' | 'opportunities' | 'opportunity-detail' | 'competitors' | 'settings' | ...
  summary: string                 // Human-readable summary of what's on screen
  data?: Record<string, unknown>  // Page-specific structured data
  suggestedQuestions?: string[]    // Context-aware question suggestions
}
```

**Per-page context examples**:
- `/dashboard`: "Painel com 15 matches ativos, 3 licitações vencendo hoje, score médio 72"
- `/opportunities/[id]`: "Licitação: [objeto]. Órgão: [nome]. Score: 85. Prazo: 2 dias."
- `/competitors`: "Tab ranking com 28 concorrentes analisados, 5 diretos, score médio 64"

**File**: `apps/web/src/contexts/consultant-context.tsx`

### 3. API `/api/consultant` (Chat)

**Method**: POST (streaming SSE)

**Request**:
```json
{
  "messages": [{ "role": "user|assistant", "content": "..." }],
  "pageContext": { "page": "...", "summary": "...", "data": {} },
  "action": "chat" | "generate_pdf"
}
```

**System prompt structure**:
1. Base: Who you are (Licitagram AI consultant, expert in Brazilian public procurement)
2. Platform knowledge: All features, how each tab works, what data means
3. User context: Plan tier, company profile, notification preferences
4. Page context: Dynamic, injected from frontend
5. Capabilities: Can generate PDF reports, explain any feature, suggest strategies
6. Tone: Professional but approachable, always in Portuguese, proactive with suggestions

**Providers**: Gemini 2.5 Flash (primary, 1M context), DeepSeek V3 (fallback)

**Feature gate**: `chat_ia` (professional + enterprise plans)

**File**: `apps/web/src/app/api/consultant/route.ts`

### 4. API `/api/consultant/pdf` (PDF Reports)

**Method**: POST

**Request**:
```json
{
  "type": "tender_analysis" | "competitor_ranking" | "custom",
  "data": { ... },
  "title": "Relatório de Concorrentes",
  "sections": [{ "heading": "...", "content": "..." }]
}
```

**Response**: PDF binary stream with `Content-Disposition: attachment`

**PDF Template**:
- Header: Licitagram logo + report title + date
- Colors: Primary #F97316 (orange), secondary #1F2937 (dark gray)
- Font: Helvetica (built-in, no custom font files needed)
- Footer: "Gerado por Licitagram AI — licitagram.com.br" + page number
- Content: Sections with headings, paragraphs, tables, score indicators

**Report types**:
- **Tender Analysis**: Objeto, score breakdown, risks, action items, competitor landscape, win tactics
- **Competitor Ranking**: Top N competitors with scores, strengths/weaknesses, strategy to beat each
- **Custom**: AI-generated sections from conversation context

**Feature gate**: `enterprise` plan only

**Files**:
- `apps/web/src/app/api/consultant/pdf/route.ts`
- `apps/web/src/lib/pdf/templates.tsx` (React PDF components)
- `apps/web/src/lib/pdf/styles.ts` (shared styles)

### 5. OnboardingWizard

**Trigger**: First login when `onboarding_completed` is false/null on user record.

**Steps**:
1. **Welcome**: "Bem-vindo ao Licitagram" — brief overview, company name confirmation
2. **Keywords & UFs**: Configure palavras-chave and UFs de interesse (pre-filled if company has data)
3. **Notifications**: Connect Telegram and/or WhatsApp (existing flows reused)
4. **Ready**: Summary of configuration + "Start tour" or "Skip tour" button

**Storage**: `onboarding_completed: boolean` and `onboarding_step: number` on users table.

**File**: `apps/web/src/components/onboarding-wizard.tsx`

### 6. OnboardingTour

**Library**: `driver.js` (~4KB gzipped, zero dependencies)

**Steps** (6-8 highlights):
1. Dashboard overview card
2. Opportunities list / filters
3. Match score meaning
4. Competitors tab
5. AI consultant button
6. Settings / notifications
7. Billing (if not enterprise)

**Trigger**: After wizard completion, or manually via "Refazer tour" in profile menu.

**File**: `apps/web/src/components/onboarding-tour.tsx`

### 7. ProactiveInsights Worker

**Queue**: `proactive-insights`
**Cron**: Every 4 hours
**Max messages per user per day**: 3

**Insight triggers** (checked per company):
- Tenders with score 85+ matching in the last 4h
- Tenders closing within 24h that user hasn't viewed
- Direct competitor won a tender this week
- User inactive for 3+ days (gentle nudge)
- New high-relevance competitor detected

**Delivery**:
- Check user's `notification_preferences`
- Send via connected channel (Telegram and/or WhatsApp)
- Track in `proactive_insights_sent` table to enforce daily limit
- Never send between 22:00-07:00 BRT

**File**: `packages/workers/src/processors/proactive-insights.processor.ts`

### 8. ProactiveAlertBanner (In-app)

**Location**: Top of dashboard pages, dismissible.

**Data source**: Server-side query on page load checking for actionable items:
- Tenders closing today
- Unread high-score matches
- New competitor insights

**UI**: Colored banner with icon, message, and action button ("Ver agora").

**Implementation**: Part of dashboard layout, queries on each page load.

## Database Changes

```sql
-- Users table additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- Proactive insights tracking
CREATE TABLE IF NOT EXISTS proactive_insights_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  insight_type TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT NOT NULL, -- 'telegram', 'whatsapp', 'in_app'
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_proactive_insights_user_date ON proactive_insights_sent(user_id, sent_at DESC);
```

## Feature Gating

| Feature | Trial | Starter | Professional | Enterprise |
|---|---|---|---|---|
| Onboarding wizard + tour | Yes | Yes | Yes | Yes |
| AI consultant chat | No | No | Yes | Yes |
| PDF report generation | No | No | No | Yes |
| Proactive alerts (in-app) | No | No | Yes | Yes |
| Proactive alerts (Telegram/WA) | No | No | No | Yes |

## Dependencies to Add

- `@react-pdf/renderer` — PDF generation
- `driver.js` — Guided tour

## File Structure

```
apps/web/src/
  components/
    ai-consultant.tsx          # Floating chat widget
    onboarding-wizard.tsx      # 4-step setup wizard
    onboarding-tour.tsx        # driver.js guided tour
    proactive-alert-banner.tsx # In-app alert banners
  contexts/
    consultant-context.tsx     # Page context provider
  lib/
    pdf/
      templates.tsx            # React PDF report templates
      styles.ts                # Shared PDF styles
    consultant-prompts.ts      # System prompts + knowledge base
  app/
    api/
      consultant/
        route.ts               # Chat streaming endpoint
        pdf/
          route.ts             # PDF generation endpoint
    (dashboard)/
      layout.tsx               # Add ConsultantContext + AiConsultant + AlertBanner

packages/workers/src/
  processors/
    proactive-insights.processor.ts
  queues/
    proactive-insights.queue.ts
```

## Implementation Priority

1. ConsultantContext + AiConsultant (chat global) — core value
2. API `/api/consultant` with system prompt + context injection
3. PDF templates + `/api/consultant/pdf`
4. OnboardingWizard + OnboardingTour
5. ProactiveInsights worker + AlertBanner
6. Context injection in each dashboard page
