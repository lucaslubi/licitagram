# Auditoria de Match Scoring & Pipeline de Notificações

**Data:** 2026-04-24 · **Modo:** read-only · **Foco:** entender qualidade e propor tuning

## 1. Como funciona o scoring hoje

Existem **dois engines ativos em paralelo** (não há "switch", ambos gravam matches):

**`pgvector_rules`** (engine principal desde 21/abr — `pgvector-matcher.processor.ts` + RPC `match_companies_for_tender` em `20260421000000_pgvector_matching_engine.sql`). Determinístico, ~50–300ms/tender. Score composto em escala 0–1, multiplicado por 100 antes de gravar:

```
score = 0.40·semantic + 0.20·cnae + 0.15·keyword + 0.10·valor + 0.10·modalidade(=0.5 fixo) + 0.05·uf
tier  = >=0.70 auto_high | 0.45–0.70 borderline | <0.45 dropado
```

- `semantic`: cosine similarity embedding empresa↔tender (TEI multilingual-e5-large, 1024d).
- `cnae`: 1.0 se algum CNAE da empresa (2 dígitos) bate com `cnae_classificados` do tender; senão fallback semântico via `cnae_catalog`.
- `keyword`: contagem de `palavras_chave` da empresa que aparecem em `objeto`, dividido por total · 3, capped 1.0.
- `valor`: razão `valor_estimado / faturamento_anual` em buckets (1.0/0.8/0.5/0.2). Default 0.5 se faltar dado.
- `modalidade`: **hardcoded 0.5** (não tem lógica) — peso 10% queimado.
- `uf`: 1.0 mesma UF, 0.4 diferente, 0.5 sem dado.

**`keyword`** (engine legado, `keyword-matcher.ts`). Phrase-based, dois modos:
- **Modo A (CNAE-gated)**: hard gate de overlap CNAE; `score = 0.30·kw + 0.50·cnae + 0.20·desc`, cap 90, min 40.
- **Modo B (keyword-only)**: sem CNAE no tender, exige ≥4 phrase matches; `score = 0.60·kw + 0.40·desc`, cap 65, min 60.

`pending-notifications.processor.ts` filtra duplicatas com gate de CNAE (linha 264-280) e respeita `min_score`/`min_valor`/`max_valor`/`ufs_interesse` por empresa.

## 2. Métricas observadas (24h e 7d)

| source | total 24h | total 7d | avg | p50 | p90 | max | auto_high | conv |
|---|---|---|---|---|---|---|---|---|
| pgvector_rules | 14.907 | 34.238 | 51 | 51 | 56 | **84** | **0** | 0% |
| keyword | 2.923 | 48.198 | 55 | 54 | 61 | 79 | 0 | 0% |
| ai_triage (legado) | — | — | — | — | — | 100 | sim | — |

Outros sinais (totais histórico):
- 21 empresas, 11 active + 2 trialing + 8 expired/canceled/inactive. **9 empresas em "trial" plan**, 12 enterprise.
- 21/21 companies têm embedding · 271k/286k tenders têm embedding (95%).
- Status: 161k `new`, 82k `dismissed`, **29 applied + 32 won + 45 interested** = 106 conversões totais sobre 292k matches (0,036%).
- **403 notificações enviadas em 7 dias** (notified_at) sobre 82k matches criados → 0,5% notify rate.
- `bid_outcomes` existe e tem dados (loop de feedback possível).
- min_score: 11 empresas no default 50, outras em 25/65/75/85/100. **2/21 têm `ufs_interesse`, 0/21 têm valor configurado**.

## 3. Quality gates (do match → envio)

1. `pgvector-matcher` dropa `match_tier='auto_low'` (<0.45).
2. `keyword-matcher` aplica hard gate de CNAE (Modo A) e sector-conflict gate (`detectSectorConflict`).
3. `pending-notifications` (5 min cron):
   - Subscription ativa/trialing-não-vencido — senão `blockedCompanies` skip.
   - Tender não-expirado, modalidade ≠ 9/12/14 (inexigibilidade), score ≥ `min_score` da empresa.
   - Filtro CNAE no breakdown de keyword (recusa `cnae score=0`).
   - Filtro `min_valor`/`max_valor`/`ufs_interesse`.
   - `MAX_NOTIFICATIONS_PER_USER = 50`, batch por plano (1–15/ciclo), `MIN_DAILY_BY_PLAN` força mínimo após 18h BRT.
4. `purgeNonCompetitiveMatches` roda a cada ciclo.
5. Dedup: unique `(company_id, tender_id)` na tabela `matches`.

## 4. Pontos fracos identificados

1. **Score teto ~84 no pgvector_rules — ZERO `auto_high`**. Pesos somam 1.0, mas componentes reais (`valor=0.5` default, `modalidade=0.5` fixo, `uf=0.4` quando UF diferente) **garantem teto ~0.84 mesmo no caso ideal** (semantic=1, cnae=1, kw=1). p90=56 → 90% dos matches estão abaixo do `min_score=60` default sugerido. Os tiers `auto_high>=0.70` viraram letra-morta.
2. **Componente `modalidade` é hardcoded 0.5** — peso de 10% sem sinal. Lixo.
3. **`score_keyword` quase sempre 0–0.10** (até nos top scores). Fórmula `count/total*3` com 20+ phrases vira ~0.05. O cap de 1.0 nunca acontece pra empresas com keywords ricos.
4. **Semantic similarity baixíssimo na prática** (p90=0.41, ideal seria >0.65). Suspeita: embedding de empresa enxuto demais, ou tenders curtos.
5. **Notificações: 0,5% (403/82k 7d)**. Combinação de `min_score=50` razoável + scores baixos + 8/21 empresas com sub bloqueada = a maior parte do funil morre antes do envio.
6. **Conversion tracking quebrado nas RPCs**: `matching_engine_stats` retorna `conversion_rate=0` mesmo com 106 outcomes (`bid_outcomes.outcome='won'` não é populado em `matches.status`).
7. **Valor / UF / faturamento**: 0/21 empresas configuraram `min_valor`/`max_valor`. UF default=0.4 penaliza arbitrariamente. `faturamento_anual` provavelmente vazio na maioria (default 0.5).
8. **Sem fallback se empresa fica zerada**: 6 empresas no top 25 do 7d têm 0 matches ≥60, mas o sistema não tem "rampa" pra reduzir threshold dinamicamente.
9. **Dedup intra-source ausente**: o mesmo tender pode ter match `keyword` e `pgvector_rules` separadamente; não vi join/preferência (`upsert` com `onConflict` mantém last-write).

## 5. Recomendações priorizadas

| # | Mudança | Onde | Esforço | Impacto |
|---|---|---|---|---|
| 1 | **Recalibrar pesos pgvector**: derrubar `modalidade` (0%→0), redistribuir 10pp para `semantic` (0.50). Ou normalizar score por máximo teórico para o tier `auto_high` voltar a fazer sentido. | `match_companies_for_tender` SQL | S | Alto |
| 2 | **Score boosting**: aplicar `score_normalized = score / max_theorical_score` (≈0.84) antes de comparar com tier — ou mudar tier cuts para 0.55/0.40 enquanto pesos não são corrigidos. | RPC + `pgvector-matcher.processor.ts:28-29` | S | Alto |
| 3 | **Fix `score_keyword`**: trocar `count/total*3` por `min(1.0, count*0.25)` (cada match vale 25%, satura em 4 matches). Top scores subiriam de ~84 para ~88-90. | RPC linha 213-220 | S | Médio |
| 4 | **Backfill `matches.status` a partir de `bid_outcomes`** (lost/won/applied) p/ destravar `conversion_rate` em `matching_engine_stats` e abrir loop de retreino. | Trigger SQL ou job diário | M | Alto (longo prazo) |
| 5 | **Default `min_score` = 55** em vez de 50 (p50 atual). Pra trial: 45 (mais volume → "WOW batch", per memory feedback). Configurável em `/conta/notificacoes`. | `companies.min_score` default + UX | S | Médio |
| 6 | **Dedup cross-source**: quando `pgvector_rules` e `keyword` matcham mesmo tender, manter o de score mais alto e enriquecer breakdown. Evita notificar 2x. | `pgvector-matcher` + `keyword-matcher` upsert | M | Médio |
| 7 | **Auto-rampa de threshold por empresa**: se nas últimas 48h a empresa recebeu <X matches acima do min_score, baixar dinamicamente em -5 (até floor 35) e marcar como "modo permissivo" no UI. | Novo job daily | M | Alto (UX) |
| 8 | **Coletar feedback explícito**: adicionar botão 👍/👎 nas notificações (Telegram/WA/Email) e popular `matches.user_feedback`. Sem dado, threshold tuning é chute. | UX + tabela | M | Alto |
| 9 | **Guard pra empresas sem `palavras_chave`/`capacidades`**: forçar onboarding rico antes de habilitar matching, ou cair pra "discovery" (aleatório CNAE-only) com flag clara. | Onboarding + matcher | S | Médio |
| 10 | **Trackear "match aberto"**: hoje só sabemos `notified_at`. Adicionar `opened_at` (link tracking no email/wa) pra calcular CTR real e separar false-positive (notificou, ignorou) de não-engajamento (notificou, nem viu). | notification processors + DB | L | Alto |

## 6. Sugestão para `/conta/notificacoes`

Controles que fazem sentido expor ao cliente:

1. **Preset de qualidade** (radio): "Só altíssima qualidade" (min_score=70) | "Boas oportunidades" (default, 55) | "Tudo que pode interessar" (40) | "Avançado" (slider numérico). Mapa direto pra `companies.min_score`.
2. **Faixa de valor** (range slider R$ 10k – R$ 50M, "qualquer" como default): grava `min_valor`/`max_valor`. **Hoje 0/21 empresas usam isso** — provavelmente porque não há UI.
3. **UFs de interesse** (multi-select com "todas" como default): grava `ufs_interesse`. Particularmente relevante pra empresas regionais (penalidade UF de 0.4 hoje é cega).
4. **Limite diário** (toggle "Sem limite" / slider 1–50): hoje fixo `MAX_NOTIFICATIONS_PER_USER=50` no código. Cliente devia poder reduzir se 50 for spam.
5. **Canais & horários** (Telegram/WhatsApp/Email + janela "só comercial 8–18h BRT"): hoje há `notification_preferences` por canal mas sem janela horária — útil pra Enterprise.
6. **(Opcional) Palavras de exclusão** (textarea): ex. "limpeza, vigilância" — empresa de TI cansada de receber facilities. Hoje só existe `detectSectorConflict` baseado em CNAE, granularidade fina falta.

---

**Observação crítica não-fix**: a calibração de score do `pgvector_rules` (item #1+#2) é o maior bloqueio de qualidade hoje. **Nenhum match em 34k atinge `auto_high`** — o tier é decorativo. Recomendo priorizar essa correção antes de construir UX em cima de scores que estão sistematicamente comprimidos.
