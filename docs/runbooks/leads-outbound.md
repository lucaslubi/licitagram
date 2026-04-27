# Lead Engine — Outbound Runbook

Sistema de outbound B2B para fornecedores que já licitaram via PNCP. Base legal: legítimo interesse B2B (LGPD Art. 7º IX) — LIA em `/docs/compliance/LIA_LEAD_ENGINE.md`.

## Tabela mãe

`admin_leads_fornecedores` em `licitagram_data` (VPS2 `85.31.60.53:5432`, db `licitagram_data`, user `postgres`).

Colunas-chave:

- **Identidade**: `cnpj`, `cnpj_raiz`, `razao_social`, `nome_fantasia`, `natureza_juridica` (código RFB), `porte`, `cnae_principal_codigo`, `uf`, `municipio`
- **Performance histórica**: `total_licitacoes_ganhas_total/_12m`, `valor_total_contratos_ganhos_total/_12m`, `ticket_medio_contratos`, `dias_desde_ultima_participacao`
- **Sanções**: `esta_limpo`, `status_ceis`, `status_cnep`, `status_cepim`, `data_ultima_verificacao_sancoes`
- **Contato**: `email_institucional_generico`/`_fonte`/`_validado`, `telefone_comercial`/`_fonte`, `whatsapp_comercial`, `site_institucional`, `linkedin_empresa`
- **Scoring**: `score_fit_licitagram` (0-100), `plano_recomendado` (`ESSENCIAL`/`PROFISSIONAL`/`ENTERPRISE`), `prioridade_outreach` (`HOT`/`WARM`/`COLD`/`NAO_DISPARAR`), `versao_score`
- **Compliance**: `opt_out`, `opt_out_data`, `opt_out_origem`, `bloqueado_disparo`, `motivo_bloqueio`
- **Outreach**: `status_outreach`, `total_emails_enviados/_abertos/_clicados`, `data_primeiro/ultimo_envio`, `data_ultima_abertura`
- **Cliente**: `ja_e_cliente_licitagram` — bloqueia outbound automaticamente

Enums: `prioridade_outreach_enum`, `plano_recomendado_enum`, `email_fonte_enum`, `telefone_fonte_enum`, `status_outreach_enum`, `porte_empresa_enum`.

## Filtros LGPD obrigatórios

Sempre incluir nos segmentos:

```sql
WHERE NOT bloqueado_disparo
  AND NOT opt_out
  AND ja_e_cliente_licitagram = false
  AND esta_limpo = true
```

Adicionalmente, **frequência**: nunca disparar para o mesmo CNPJ < 14 dias do último envio (`data_ultimo_envio + INTERVAL '14 days' < NOW()`).

## Bloqueios automáticos

Aplicados via Phase 1 (já rodado 2026-04-27):

1. **`orgao_publico_rfb`** — `natureza_juridica` em lista de códigos RFB públicos (federais, estaduais, municipais, autarquias, empresa pública, fundação pública). Lista canônica em `packages/workers/src/scripts/enrich-leads-brasilapi.ts` (`PUBLIC_RFB_CODES`).
2. **`sancao_ativa`** — `esta_limpo = false` (presença em CEIS/CNEP/CEPIM).
3. **`cnpj_inativo`** — preenchido durante enriquecimento se RFB retorna situação ≠ `ATIVA`.
4. **`cnpj_invalido_rfb`** — preenchido se BrasilAPI retorna 404.

## Scoring

Score 0-100 atualizado em batch:

```
score = LEAST(100, GREATEST(0,
    total_licitacoes_ganhas_total * 2
  + LEAST(valor_total_contratos_ganhos_total, 5_000_000) / 100_000
  + recency_bonus  -- 20 pts ≤90d, 10 pts ≤180d, 5 pts ≤365d, 0
))
```

Plano recomendado por ticket médio (com fallback `valor_total / vitorias` se `ticket_medio_contratos = 0`):

- `ENTERPRISE` ≥ R$ 500k
- `PROFISSIONAL` ≥ R$ 100k
- `ESSENCIAL` < R$ 100k

Prioridade:

- `HOT` — `total_licitacoes_ganhas_12m ≥ 5`
- `WARM` — `total_licitacoes_ganhas_total ≥ 3`
- `COLD` — demais não-bloqueados
- `NAO_DISPARAR` — `bloqueado_disparo = true`

## Enriquecimento (BrasilAPI)

Script standalone em VPS2: `/opt/enrich-leads-brasilapi.cjs` (espelho versionado em `packages/workers/src/scripts/enrich-leads-brasilapi.ts`).

```bash
ssh root@85.31.60.53
cd /opt

# dry-run smoke
node enrich-leads-brasilapi.cjs --limit=20 --priority=HOT --dry-run

# real, em ondas
node enrich-leads-brasilapi.cjs --limit=500  --priority=HOT
node enrich-leads-brasilapi.cjs --limit=4000 --priority=WARM
node enrich-leads-brasilapi.cjs --limit=15000 --priority=COLD
```

Rate-limit interno: ~0.9 req/s (1100ms sleep). Backfill completo ≈ 5-6h para os 18.5k leads.

**O que enriquece**:

- `email_institucional_generico` — em geral **vazio** pós-LGPD; RFB não expõe email mais
- `telefone_comercial` — preenchido na maioria dos casos
- `natureza_juridica` — preenche os ~8k leads sem natureza, e dispara bloqueio se for código público
- `situacao_cadastral` — bloqueia se inativa
- Marca `bloqueado_disparo = true` para CNPJ inativo, órgão público (descoberto pós-enrich) ou 404

**Email**: BrasilAPI não retorna emails desde a vigência da LGPD. Para email, usar Findymail / Hunter.io / scraping de site institucional como Phase 3 (não implementado ainda).

## Re-scoring pós-enrichment

Depois de uma onda de enriquecimento, rodar bloqueio re-aplicado para naturezas recém-descobertas:

```sql
UPDATE admin_leads_fornecedores SET
  bloqueado_disparo = true,
  motivo_bloqueio = 'orgao_publico_rfb',
  prioridade_outreach = 'NAO_DISPARAR'::prioridade_outreach_enum
WHERE natureza_juridica IN (
  '1015','1023','1031','1040','1058','1066','1074','1082','1104','1112','1120','1139',
  '1147','1155','1163','1171','1180','1198','1201','1210','1228','1236','1244','1252',
  '1260','1279','1287','1295','1325','1333','1341','1368','1376','1384','1392','1406',
  '1414','1422','1430','1449','1457','1465','1473','1481','2011','3034'
)
AND NOT bloqueado_disparo;
```

(O script de enriquecimento já aplica isso inline; este SQL é defensivo.)

## Compor segmentos para campanha

Exemplo — top 200 HOT com email, ENTERPRISE, sudeste:

```sql
SELECT cnpj, razao_social, email_institucional_generico, telefone_comercial,
       score_fit_licitagram, plano_recomendado
FROM admin_leads_fornecedores
WHERE NOT bloqueado_disparo AND NOT opt_out AND NOT ja_e_cliente_licitagram
  AND esta_limpo = true
  AND prioridade_outreach = 'HOT'
  AND plano_recomendado = 'ENTERPRISE'
  AND uf IN ('SP','RJ','MG','ES')
  AND email_institucional_generico ~ '@'
  AND (data_ultimo_envio IS NULL OR data_ultimo_envio < NOW() - INTERVAL '14 days')
ORDER BY score_fit_licitagram DESC
LIMIT 200;
```

## Próximos passos

1. **Findymail upgrade** — para os 18k leads sem email, plug Findymail API (ou Hunter) para encontrar email do decisor por domínio + nome
2. **Smartlead config** — campanha drip com 4 toques, opt-out claro, base_legal_lgpd no rodapé, pixel de tracking ligado a `total_emails_abertos/_clicados`
3. **Painel admin no Licitagram** — view sobre `admin_leads_fornecedores` filtrável por prioridade/plano/UF/score, com botão "exportar segmento CSV"
4. **Webhook opt-out** — endpoint `POST /api/leads/opt-out` (token signed) que seta `opt_out=true, opt_out_data=NOW(), opt_out_origem='email_unsubscribe'` e cancela campanhas no Smartlead
5. **Scrape de site institucional** — para leads sem email RFB, baixar site (`site_institucional` quando preenchido) e regex `[a-z]+@dominio` para extrair contato comercial
6. **Re-scoring incremental** — workflow noturno que recalcula `score_fit_licitagram` quando `total_licitacoes_ganhas_*` muda, mantendo `versao_score` versionado
