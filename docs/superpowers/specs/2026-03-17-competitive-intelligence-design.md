# Competitive Intelligence System — Design Spec

**Date:** 2026-03-17
**Status:** Draft

## 1. Overview

Build a competitive intelligence system that extracts competitor data from PNCP and ComprasGov APIs, materializes aggregate stats, calculates a per-match `competition_score`, and surfaces actionable insights across the platform. The goal is to put Licitagram users several steps ahead of their competitors by revealing strengths, weaknesses, and strategic opportunities.

### Key Principles
- **Real data, real names** — all competitor data comes from official government APIs (PNCP results, ComprasGov fornecedor). Show competitor names, CNPJs, and stats to build credibility.
- **Dual-score system** — every match has a `score` (relevance) and `competition_score` (competitive favorability). Hot alerts use `hot_score = (score × 0.6) + (competition_score × 0.4)`.
- **Data-first for all plans, AI insights for enterprise** — concrete analytics (win rates, geographic presence, discount patterns) available to all users. AI-generated strategic recommendations gated behind enterprise plan.

## 2. Data Model

### 2.1 New Table: `competitor_stats`

Materialized every 6 hours by the `competition-analysis` worker. One row per unique CNPJ.

```sql
CREATE TABLE public.competitor_stats (
  cnpj TEXT PRIMARY KEY,
  nome TEXT,
  total_participations INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  win_rate NUMERIC(5,4) DEFAULT 0,          -- 0.0000 to 1.0000
  avg_valor_proposta NUMERIC(15,2),
  avg_discount_pct NUMERIC(5,4),            -- avg of (valor_estimado - valor_proposta) / valor_estimado
  participations_by_uf JSONB DEFAULT '{}',  -- {"SP": 45, "MG": 12}
  wins_by_uf JSONB DEFAULT '{}',            -- {"SP": 32, "MG": 3}
  participations_by_cnae JSONB DEFAULT '{}',-- {"6201": 30, "6202": 15}
  wins_by_cnae JSONB DEFAULT '{}',          -- {"6201": 25, "6202": 5}
  modalidades JSONB DEFAULT '{}',           -- {"6": 40, "8": 10}
  porte TEXT,                               -- MEI/ME/EPP/Médio/Grande
  uf_sede TEXT,
  municipio_sede TEXT,
  last_participation_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_competitor_stats_uf ON competitor_stats (uf_sede);
CREATE INDEX idx_competitor_stats_porte ON competitor_stats (porte);
CREATE INDEX idx_competitor_stats_wins ON competitor_stats (total_wins DESC);
```

### 2.2 New Column on `matches`

```sql
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS competition_score INTEGER;
```

This column stores the competition favorability score (0-100) calculated on-the-fly during the hot scan.

### 2.3 Existing Tables Used

- **`competitors`** — raw participation data per tender (cnpj, nome, valor_proposta, situacao, tender_id). Already populated by `results-scraping.processor.ts` and enriched by `fornecedor-enrichment.processor.ts`.
- **`competitor_watchlist`** — user's manually monitored competitors (company_id, competitor_cnpj).
- **`tenders`** — for joining UF, CNAE, valor_estimado, modalidade_id.
- **`subscriptions`** — for plan-gating AI insights (enterprise only).

## 3. Worker: `competition-analysis` (every 6h)

### 3.1 Materialization Process

A new BullMQ queue `competition-analysis` with a single job `materialize-stats`.

**Algorithm:**
1. Run a single aggregated SQL query joining `competitors` with `tenders`:
   ```sql
   SELECT
     c.cnpj,
     MAX(c.nome) as nome,
     COUNT(*) as total_participations,
     COUNT(*) FILTER (WHERE c.situacao = 'Homologado') as total_wins,
     AVG(c.valor_proposta) as avg_valor_proposta,
     AVG(
       CASE WHEN t.valor_estimado > 0
       THEN (t.valor_estimado - c.valor_proposta) / t.valor_estimado
       ELSE NULL END
     ) as avg_discount_pct,
     jsonb_object_agg_by_uf_participations,
     jsonb_object_agg_by_uf_wins,
     jsonb_object_agg_by_cnae_participations,
     jsonb_object_agg_by_cnae_wins,
     jsonb_object_agg_by_modalidade,
     MAX(c.porte) as porte,
     MAX(c.uf_fornecedor) as uf_sede,
     MAX(c.municipio_fornecedor) as municipio_sede,
     MAX(t.data_encerramento) as last_participation_at
   FROM competitors c
   JOIN tenders t ON c.tender_id = t.id
   WHERE c.cnpj IS NOT NULL
   GROUP BY c.cnpj
   HAVING COUNT(*) >= 3
   ```
   (The actual implementation will use Supabase RPC or multiple targeted queries since Supabase JS client doesn't support this level of aggregation natively.)

2. For the JSONB breakdown fields, run separate grouped queries:
   - `participations_by_uf`: `SELECT cnpj, t.uf, COUNT(*) FROM competitors c JOIN tenders t ... GROUP BY cnpj, t.uf`
   - `wins_by_uf`: same but with `WHERE c.situacao = 'Homologado'`
   - Same pattern for `_by_cnae` and `modalidades`

3. Upsert all results into `competitor_stats` using `ON CONFLICT (cnpj) DO UPDATE`.

4. Log stats: total CNPJs processed, time taken.

**Performance:** The query operates on the `competitors` table which has indexes on `cnpj`, `tender_id`, and `cnpj_cnae`. With the join on `tenders(id)`, this should be efficient. Expected runtime: <30s for ~50k competitor rows.

### 3.2 Schedule

- Every 6 hours via BullMQ repeatable job
- Also triggered on startup (non-blocking)
- Job ID: `competition-analysis-6h-repeat`

## 4. Competition Score Calculation (on-the-fly in hot scan)

### 4.1 When

During the hot scan (every 3h), after fetching the top matches for a company, calculate `competition_score` for each match.

### 4.2 Algorithm

For each match, the system needs to find "who would likely compete for this tender" by looking at competitors who have historically participated in similar tenders.

**Step 1: Find similar competitors**
Query `competitor_stats` for CNPJs that have participated in:
- Same CNAE as the tender (using `participations_by_cnae` JSONB)
- Same UF as the tender (using `participations_by_uf` JSONB)
- Filter to those with `total_participations >= 3` (already ensured by materialization)

**Step 2: Calculate 4 factors**

| Factor | Weight | Logic | Score Range |
|--------|--------|-------|-------------|
| **Competition density** | 30% | `n` = count of known competitors in this niche. 0 competitors → 100, 1-3 → 80, 4-7 → 60, 8-15 → 40, 16+ → 20 | 20-100 |
| **Competitor strength** | 30% | Average win_rate of competitors in this niche. avg < 0.2 → 90, 0.2-0.4 → 70, 0.4-0.6 → 50, 0.6-0.8 → 30, >0.8 → 10 | 10-90 |
| **Geographic advantage** | 20% | For each competitor, check their win_rate in THIS specific UF. If most competitors are weak here → high score. Uses `wins_by_uf[uf] / participations_by_uf[uf]` | 10-100 |
| **Discount pattern** | 20% | Average discount competitors practice. Low avg discount (<5%) → 90 (they don't fight hard on price), high (>20%) → 30 (aggressive price competition) | 30-90 |

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
For the Telegram alert and UI, collect the top 3 competitors by win_rate in this niche, with their names and stats. These are passed in the notification job data.

### 4.3 Hot Score

The hot scan now ranks matches by:
```
hot_score = (match.score * 0.6) + (match.competition_score * 0.4)
```
instead of just `match.score`. The `HOT_TOP_N` (10) limit uses this combined score.

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

Data source: `competitor_stats` table joined with `competitor_watchlist`.

### 5.2 Tab 2: Panorama de Mercado (replaces Ranking)

Market overview for the user's CNAE/niche:
- **Top 10 concorrentes mais frequentes:** Table with columns: Posição, Nome, Participações, Vitórias, Win Rate, Porte, UF Sede. Sorted by participation count in tenders matching the user's company CNAE. Competitor names are real, linked from `competitor_stats`.
- **Competição por estado:** Horizontal bar chart or table showing, for each UF where the user has matches: number of known competitors, avg win rate, avg discount. Highlights UFs with LOW competition in green ("Janela de oportunidade").
- **Desconto médio por modalidade:** Simple table: Modalidade | Desconto Médio | Participantes Médios. Helps users calibrate their pricing.
- **Janelas de oportunidade:** Highlighted cards for UF+CNAE combinations where competition_score would be high (few competitors, low win rates). "Poucas empresas disputam licitações de TI no Nordeste — considere expandir sua atuação."

Data source: `competitor_stats` aggregated by the user's company CNAE codes (from `companies.cnaes`).

### 5.3 Tab 3: Análise Comparativa — Você vs. Concorrente (enterprise)

Select a competitor from the watchlist, then see:
- **Side-by-side bars:** Win rate comparison (user's company historical vs. competitor)
- **Geographic overlap:** Which UFs both compete in, and where each is stronger
- **Pricing comparison:** Average discount practiced by each
- **Strengths:** "Domina pregão eletrônico em SP (win rate 73%)"
- **Weaknesses:** "Pouca presença no Nordeste", "Desconto baixo em concorrência pública"
- **AI recommendation (enterprise only):** Gemini-generated strategic text based on the comparison data. "Este concorrente domina licitações de TI no Sudeste com desconto médio de 15%. Recomendação: foque em licitações no Nordeste onde ele não participa, ou compita em preço oferecendo descontos acima de 18%."

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
```

### 7.3 Cost Control

- Only enterprise users can trigger (small user base initially)
- Cached 24h per competitor CNPJ per company
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
                     competition-analysis.processor (every 6h)
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

- **Materialization query:** Single aggregated SQL with GROUP BY — should complete in <30s for current data volume. As `competitors` grows, consider partitioning or incremental updates (only re-process CNPJs with new data since last run).
- **Hot scan competition_score:** For each match, queries `competitor_stats` by CNAE+UF. With indexes on `participations_by_cnae` and `participations_by_uf` (GIN indexes on JSONB), this should be fast. If slow, pre-filter to only calculate for top candidates (score ≥ 80).
- **Frontend:** All queries hit `competitor_stats` (small table, one row per CNPJ) — fast reads. No complex aggregation on the frontend.

## 10. Migration Plan

- Add `competitor_stats` table
- Add `competition_score` column to `matches`
- Add GIN indexes on JSONB columns in `competitor_stats`
- Backfill `competitor_stats` on first worker run
