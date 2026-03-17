# Competitive Intelligence System — Design Spec

**Date:** 2026-03-17
**Status:** Reviewed

## 1. Overview

Build a competitive intelligence system that extracts competitor data from PNCP and ComprasGov APIs, materializes aggregate stats, calculates a per-match `competition_score`, and surfaces actionable insights across the platform. The goal is to put Licitagram users several steps ahead of their competitors by revealing strengths, weaknesses, and strategic opportunities.

### Key Principles
- **Real data, real names** — all competitor data comes from official government APIs (PNCP results, ComprasGov fornecedor). Show competitor names, CNPJs, and stats to build credibility.
- **Dual-score system** — every match has a `score` (relevance) and `competition_score` (competitive favorability). Hot alerts use `hot_score = (score × 0.6) + (competition_score × 0.4)`.
- **Data-first for all plans, AI insights for enterprise** — concrete analytics (win rates, geographic presence, discount patterns) available to all users. AI-generated strategic recommendations gated behind enterprise plan.

## 2. Data Model

### 2.1 New Table: `competitor_stats`

Materialized by the `competition-analysis` worker (event-driven after results-scraping, see Section 3.2). One row per unique CNPJ.

```sql
CREATE TABLE public.competitor_stats (
  cnpj TEXT PRIMARY KEY,
  nome TEXT,
  total_participations INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  win_rate NUMERIC(5,4) DEFAULT 0,          -- 0.0000 to 1.0000
  avg_valor_proposta NUMERIC(15,2),
  avg_discount_pct NUMERIC(5,4),            -- clamped to >= 0 (negative discounts excluded)
  participations_by_uf JSONB DEFAULT '{}',  -- {"SP": 45, "MG": 12}
  wins_by_uf JSONB DEFAULT '{}',            -- {"SP": 32, "MG": 3}
  participations_by_cnae JSONB DEFAULT '{}',-- {"62": 30, "63": 15} (CNAE division, 2-digit string)
  wins_by_cnae JSONB DEFAULT '{}',          -- {"62": 25, "63": 5}
  modalidades JSONB DEFAULT '{}',           -- {"6": 40, "8": 10}
  porte TEXT,                               -- MEI/ME/EPP/Médio/Grande
  uf_sede TEXT,
  municipio_sede TEXT,
  last_participation_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- B-tree indexes for direct lookups
CREATE INDEX idx_competitor_stats_uf ON competitor_stats (uf_sede);
CREATE INDEX idx_competitor_stats_porte ON competitor_stats (porte);
CREATE INDEX idx_competitor_stats_wins ON competitor_stats (total_wins DESC);

-- GIN indexes for JSONB key existence queries (? operator)
CREATE INDEX idx_competitor_stats_cnae_gin ON competitor_stats USING GIN (participations_by_cnae);
CREATE INDEX idx_competitor_stats_uf_gin ON competitor_stats USING GIN (participations_by_uf);

-- RLS: public read for authenticated users (same pattern as competitors table)
ALTER TABLE public.competitor_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY competitor_stats_select_authenticated ON public.competitor_stats
  FOR SELECT TO authenticated USING (true);
```

### 2.2 New Column on `matches`

```sql
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS competition_score INTEGER CHECK (competition_score >= 0 AND competition_score <= 100);
```

### 2.3 Existing Tables Used

- **`competitors`** — raw participation data per tender (cnpj, nome, valor_proposta, situacao, tender_id). Already populated by `results-scraping.processor.ts` and enriched by `fornecedor-enrichment.processor.ts`.
- **`competitor_watchlist`** — user's manually monitored competitors (company_id, competitor_cnpj).
- **`tenders`** — for joining UF, valor_estimado, modalidade_id.
- **`subscriptions`** — for plan-gating AI insights (enterprise only).

### 2.4 Win Condition

A competitor is considered a "winner" when `situacao` matches (case-insensitive) any of: `'Homologado'`, `'homologado'`, or any value containing the substring `'homologad'`. This matches the existing frontend pattern in `page.tsx` which uses `.toLowerCase().includes('homologad')`. The materialization SQL uses: `LOWER(c.situacao) LIKE '%homologad%'`.

### 2.5 CNAE Mapping for Tenders

Tenders do not have a direct CNAE column. The CNAE for competitive analysis is derived from:
1. **The competitor's own CNAE** (`competitors.cnae_codigo`) — enriched by `fornecedor-enrichment.processor.ts` via ComprasGov API
2. **The company's CNAE** (`companies.cnae_principal`, `companies.cnaes_secundarios`) — used to find which competitors operate in the same industry

The `participations_by_cnae` JSONB in `competitor_stats` is keyed by the competitor's own CNAE division (first 2 digits, as TEXT to preserve leading zeros). To find competitors in a tender's niche, the hot scan uses the matched company's CNAE codes to query `competitor_stats WHERE participations_by_cnae ? '<cnae_division>'`.

## 3. Worker: `competition-analysis`

### 3.1 Materialization Process

A new BullMQ queue `competition-analysis` with a single job `materialize-stats`.

**Algorithm:**

**Incremental mode (default):** Track `last_materialized_at` timestamp. On each run:
1. Find CNPJs with new data: `SELECT DISTINCT cnpj FROM competitors WHERE created_at > $last_run AND cnpj IS NOT NULL`
2. Only re-aggregate those CNPJs (plus any with 0 total_participations as a safety catch)
3. On first run (no `last_materialized_at`), process all CNPJs

**Full mode (on startup or manual trigger):** Process all CNPJs.

**Aggregation (per CNPJ batch):**

Since Supabase JS client doesn't support complex aggregations natively, use a Supabase RPC function:

```sql
CREATE OR REPLACE FUNCTION materialize_competitor_stats(p_cnpjs TEXT[])
RETURNS void AS $$
BEGIN
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
      CASE WHEN t.valor_estimado > 0 AND c.valor_proposta <= t.valor_estimado
      THEN (t.valor_estimado - c.valor_proposta) / t.valor_estimado
      ELSE NULL END
    ),
    -- participations_by_uf
    (SELECT jsonb_object_agg(uf, cnt) FROM (
      SELECT t2.uf, COUNT(*) as cnt FROM competitors c2
      JOIN tenders t2 ON c2.tender_id = t2.id
      WHERE c2.cnpj = c.cnpj AND t2.uf IS NOT NULL
      GROUP BY t2.uf
    ) sub),
    -- wins_by_uf
    (SELECT COALESCE(jsonb_object_agg(uf, cnt), '{}') FROM (
      SELECT t2.uf, COUNT(*) as cnt FROM competitors c2
      JOIN tenders t2 ON c2.tender_id = t2.id
      WHERE c2.cnpj = c.cnpj AND t2.uf IS NOT NULL
        AND LOWER(c2.situacao) LIKE '%homologad%'
      GROUP BY t2.uf
    ) sub),
    -- participations_by_cnae (2-digit division, as text)
    (SELECT COALESCE(jsonb_object_agg(cnae_div, cnt), '{}') FROM (
      SELECT LPAD(FLOOR(c2.cnae_codigo / 100)::TEXT, 2, '0') as cnae_div, COUNT(*) as cnt
      FROM competitors c2
      WHERE c2.cnpj = c.cnpj AND c2.cnae_codigo IS NOT NULL
      GROUP BY cnae_div
    ) sub),
    -- wins_by_cnae
    (SELECT COALESCE(jsonb_object_agg(cnae_div, cnt), '{}') FROM (
      SELECT LPAD(FLOOR(c2.cnae_codigo / 100)::TEXT, 2, '0') as cnae_div, COUNT(*) as cnt
      FROM competitors c2
      WHERE c2.cnpj = c.cnpj AND c2.cnae_codigo IS NOT NULL
        AND LOWER(c2.situacao) LIKE '%homologad%'
      GROUP BY cnae_div
    ) sub),
    -- modalidades
    (SELECT COALESCE(jsonb_object_agg(mod_id::TEXT, cnt), '{}') FROM (
      SELECT t2.modalidade_id as mod_id, COUNT(*) as cnt
      FROM competitors c2 JOIN tenders t2 ON c2.tender_id = t2.id
      WHERE c2.cnpj = c.cnpj AND t2.modalidade_id IS NOT NULL
      GROUP BY t2.modalidade_id
    ) sub),
    MAX(c.porte),
    MAX(c.uf_fornecedor),
    MAX(c.municipio_fornecedor),
    MAX(t.data_encerramento),
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
    updated_at = now();
END;
$$ LANGUAGE plpgsql;
```

**Discount handling:** Negative discounts (where `valor_proposta > valor_estimado`) are excluded from the average (`CASE WHEN c.valor_proposta <= t.valor_estimado`). The `avg_discount_pct` is always >= 0.

### 3.2 Schedule

- **Event-driven (primary):** Triggered after `results-scraping` batch completes via BullMQ job chaining. The results-scraping processor adds a `competition-analysis` job at the end of its batch.
- **Fallback:** Every 12 hours via BullMQ repeatable job (catches missed events, ensures freshness)
- **Startup:** Triggered once on worker startup (non-blocking, full mode)
- Job ID: `competition-analysis-repeat`

## 4. Competition Score Calculation (on-the-fly in hot scan)

### 4.1 When

During the hot scan (every 3h), after fetching the top matches for a company, calculate `competition_score` for each match.

### 4.2 Algorithm

For each match, the system needs to find "who would likely compete for this tender" by looking at competitors who have historically participated in similar tenders.

**Step 1: Find similar competitors**
Get the matched company's CNAE division(s) from `companies.cnae_principal` (first 2 digits). Query `competitor_stats` for CNPJs where:
- `participations_by_cnae ? '<cnae_division>'` (GIN-indexed, fast)
- AND `participations_by_uf ? '<tender_uf>'` (GIN-indexed, fast)

This gives us competitors who have historically participated in the same industry AND geographic region.

**Step 2: Calculate 4 factors**

| Factor | Weight | Logic | Score Range |
|--------|--------|-------|-------------|
| **Competition density** | 30% | `n` = count of known competitors in this niche. 0 competitors → 100, 1-3 → 80, 4-7 → 60, 8-15 → 40, 16+ → 20 | 20-100 |
| **Competitor strength** | 30% | Average win_rate of competitors in this niche. avg < 0.2 → 90, 0.2-0.4 → 70, 0.4-0.6 → 50, 0.6-0.8 → 30, >0.8 → 10 | 10-90 |
| **Geographic advantage** | 20% | For each competitor, check their win_rate in THIS specific UF. If most competitors are weak here → high score. Uses `wins_by_uf[uf] / participations_by_uf[uf]` per competitor, then averages. | 10-100 |
| **Discount pattern** | 20% | Average discount competitors practice (`avg_discount_pct`). Low avg discount (<5%) → 90, 5-10% → 75, 10-15% → 60, 15-20% → 45, >20% → 30. | 30-90 |

**Step 3: Combine**
```
competition_score = round(
  density_score * 0.30 +
  strength_score * 0.30 +
  geo_score * 0.20 +
  discount_score * 0.20
)
```

**Step 4: Save**
Update `matches.competition_score` for each match.

**Step 5: Collect top competitor names**
For the Telegram alert and UI, collect the top 3 competitors by win_rate in this niche, with their names, win rates, and porte. These are passed in the notification job data.

### 4.3 Hot Score

The hot scan now ranks matches by:
```
hot_score = (match.score * 0.6) + (match.competition_score * 0.4)
```

**Minimum relevance floor:** The pre-filter on `score` is lowered from `>= 80` to `>= 70`. This allows matches with good-but-not-great relevance to surface if they have exceptional competitive favorability. A match needs at minimum `score >= 70` to be considered for hot alerts, regardless of competition_score. This prevents low-relevance matches from becoming hot purely due to low competition.

The `HOT_TOP_N` (10) limit then selects the top 10 by `hot_score`.

### 4.4 Fallback

If no competitor data exists for a tender's niche (new CNAE, new UF, etc.), `competition_score` defaults to 50 (neutral). The hot_score then depends primarily on the relevance score.

## 5. Frontend: Competitors Page Redesign

### 5.1 Tab 1: Watchlist (enhanced)

**Current state:** Simple list with CNPJ, name, participation count, wins.

**New design:** Rich cards with:
- **Header:** Nome, CNPJ (masked: XX.XXX.XXX/XXXX-XX), Porte badge, CNAE tag, UF sede
- **Metrics row:** Win rate (circular gauge or bold percentage), Total participações, Ticket médio (formatted BRL)
- **Geographic presence:** Top 5 UFs as horizontal bars showing participation count, with win rate percentage overlay
- **Activity trend:** "Ativo" (participated in last 30 days), "Moderado" (last 90 days), "Inativo" (>90 days) — based on `last_participation_at`
- **Overlap alert:** Count of open tenders where this competitor has historically participated in similar niches AND the user has active matches. Shows as: "⚠️ Competindo com você em X licitações abertas"

Data source: `competitor_stats` table joined with `competitor_watchlist`. Replaces the current on-the-fly aggregation in `page.tsx` (lines 42-63, 85-105) with simple reads from the materialized table.

### 5.2 Tab 2: Panorama de Mercado (replaces Ranking)

Market overview for the user's CNAE/niche:
- **Top 10 concorrentes mais frequentes:** Table with columns: Posição, Nome, Participações, Vitórias, Win Rate, Porte, UF Sede. Sorted by participation count in the user's CNAE division. Competitor names are real, from `competitor_stats`.
- **Competição por estado:** Horizontal bar chart or table showing, for each UF where the user has matches: number of known competitors, avg win rate, avg discount. Highlights UFs with LOW competition in green ("Janela de oportunidade").
- **Desconto médio por modalidade:** Simple table: Modalidade | Desconto Médio | Participantes Médios. Helps users calibrate their pricing.
- **Janelas de oportunidade:** Highlighted cards for UF+CNAE combinations where competition_score would be high (few competitors, low win rates). "Poucas empresas disputam licitações de TI no Nordeste — considere expandir sua atuação."

Data source: `competitor_stats` filtered by the user's company CNAE codes (from `companies.cnae_principal` and `companies.cnaes_secundarios`).

### 5.3 Tab 3: Análise Comparativa — Você vs. Concorrente (enterprise)

Select a competitor from the watchlist, then see:
- **Side-by-side bars:** Win rate comparison. The user's own stats come from `competitor_stats` if the company's CNPJ exists in the table (when they've participated in government tenders). If no data exists, show "Sem dados históricos" and focus on the competitor's profile only.
- **Geographic overlap:** Which UFs both compete in, and where each is stronger
- **Pricing comparison:** Average discount practiced by each
- **Strengths:** "Domina pregão eletrônico em SP (win rate 73%)"
- **Weaknesses:** "Pouca presença no Nordeste", "Desconto baixo em concorrência pública"
- **AI recommendation (enterprise only):** Gemini-generated strategic text based on the comparison data.

**Plan gating:**
- Trial/Starter/Professional: tabs 1, 2, 4 fully accessible. Tab 3 shows a preview with blurred data and upsell CTA.
- Enterprise: full access to all tabs including AI insights.

### 5.4 Tab 4: Buscar (enhanced)

Search by CNPJ or name. Results now show the rich card format (same as watchlist cards) with full stats from `competitor_stats`. Button to add to watchlist.

## 6. Hot Alert Integration

### 6.1 Telegram Template Update

The hot alert Telegram message (in `formatHotAlert`) adds a competitive analysis section:

```
🔥 OPORTUNIDADE #1 — Score 85 | Competitividade 92

📋 Pregão Eletrônico Nº 045/2026
🏛 Prefeitura Municipal de Campinas - SP
💰 R$ 1.234.567,00

📊 Análise Competitiva:
├ 3 concorrentes neste nicho:
│  • ABC Tecnologia LTDA (win rate 68%)
│  • DEF Soluções ME (win rate 45%)
│  • GHI Serviços EPP (win rate 23%)
├ Win rate médio: 45%
└ Baixa competição neste UF ✅
```

For non-enterprise users, the competitive analysis section shows:
```
📊 Análise Competitiva:
├ 3 concorrentes neste nicho
├ Competitividade: ██████████ 92/100
└ 🔒 Nomes e detalhes no plano Enterprise
```

### 6.2 Notification Job Data

The `NotificationJobData` for hot alerts extends to include:
```typescript
{
  matchId: string
  telegramChatId: number
  type: 'hot'
  rank: number
  plan: string
  competitionScore: number
  topCompetitors: Array<{
    nome: string
    winRate: number
    porte: string
  }>
}
```

### 6.3 Match Cards (Map Sidebar + Pipeline)

Both the map sidebar list and the pipeline kanban cards show:
- **Dual badge:** `85 | 92` (score | competition_score) with independent color coding
- **Competition tag:** Below the title, one of:
  - 🟢 "Baixa competição" (competition_score ≥ 75)
  - 🟡 "Competição moderada" (50-74)
  - 🔴 "Mercado disputado" (< 50)
- **Tooltip/expand:** On hover/click, shows top 3 competitor names with win rates

### 6.4 Opportunity Detail Page (`/opportunities/[id]`)

New section "Análise Competitiva" below the existing match details:
- **Competition score gauge:** Visual circular gauge showing 0-100
- **Factor breakdown:** 4 bars showing density, strength, geographic advantage, discount pattern
- **Known competitors table:** Name, CNPJ (masked), Win Rate, Porte, UF, Avg Discount. Data from `competitor_stats` filtered to this tender's CNAE+UF niche.
- **Enterprise insight:** AI-generated recommendation (gated)

## 7. AI Strategic Analysis (Enterprise Only)

### 7.1 When Generated

- On-demand when an enterprise user views the "Análise Comparativa" tab or the opportunity detail page
- NOT pre-generated — called via Gemini API when requested
- Cached for 24h to avoid redundant API calls

### 7.2 Prompt Structure

```
You are a Brazilian government procurement strategy advisor.

Company profile: {company CNAE, porte, UF, historical win rate}
Competitor profile: {competitor stats from competitor_stats}
Context: {tender details if on opportunity page}

Analyze this competitor's strengths and weaknesses relative to the company.
Provide 2-3 actionable strategic recommendations in Portuguese.
Focus on: geographic expansion, pricing strategy, modalidade selection.
Keep it under 200 words.

IMPORTANT: Only reference data provided above. Do not invent statistics or make claims not supported by the data.
```

### 7.3 Cost Control

- Only enterprise users can trigger (small user base initially)
- Cached per competitor CNPJ per company, invalidated when `competitor_stats.updated_at` changes for that CNPJ
- Uses Gemini Flash (cheapest model) for text generation
- Rate limited: max 10 analyses per company per day

## 8. Data Flow Summary

```
PNCP Results API ──→ results-scraping.processor
                            ↓
                     competitors table (raw)
                            ↓
ComprasGov Fornecedor API ──→ fornecedor-enrichment.processor
                            ↓
                     competitors table (enriched: CNAE, porte, UF)
                            ↓
                     competition-analysis.processor (event-driven + 12h fallback)
                            ↓
                     competitor_stats table (materialized)
                            ↓
              ┌─────────────┼──────────────────┐
              ↓             ↓                  ↓
      hot-alerts scan   Frontend pages    Telegram alerts
   (competition_score)  (competitors,     (competitor names,
                         map, pipeline,    win rates)
                         opportunities)
```

## 9. Performance Considerations

- **Materialization:** Uses Supabase RPC function for efficient server-side aggregation. Incremental mode (default) only re-processes CNPJs with new data since last run. Full mode on startup. Expected runtime: <30s for current data volume.
- **JSONB queries:** The `?` (key exists) operator on `participations_by_cnae` and `participations_by_uf` is accelerated by GIN indexes. This is the primary query pattern for finding niche competitors.
- **Hot scan competition_score:** For each match, one query to `competitor_stats` using GIN-indexed JSONB. With ~10 matches per company, this adds ~10 lightweight queries per company to the hot scan cycle.
- **Frontend:** All queries read from `competitor_stats` (small table, one row per CNPJ). Replaces the current on-the-fly aggregation pattern, making the competitors page faster.

## 10. Migration Plan

```sql
-- 1. Create competitor_stats table with indexes and RLS
-- (see Section 2.1 for full DDL)

-- 2. Add competition_score to matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS competition_score INTEGER
  CHECK (competition_score >= 0 AND competition_score <= 100);

-- 3. Create materialization RPC function
-- (see Section 3.1 for full function)

-- 4. Backfill competitor_stats on first worker run (full mode)
```
