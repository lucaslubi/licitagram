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

---

# WhatsApp Outbound — Hardening Anti-Ban

> **CRÍTICO**: o número principal do Licitagram (sessão WAHA `default`) é usado para alertas a clientes pagos. Banir esse número quebra o produto. O worker `outbound-whatsapp` foi blindado para **NUNCA** usar essa sessão. Se as env vars dedicadas não estiverem configuradas, ele simplesmente falha cada job com erro permanente — o `default` continua intocado.

## Setup do número dedicado (one-time)

1. **Comprar chip novo** (qualquer operadora). NÃO usar pessoal nem o principal do Licitagram.
2. **Ativar WhatsApp** no chip + criar perfil business com nome `Licitagram - Comercial` e foto de perfil decente.
3. **Subir nova sessão WAHA** dedicada:
   - Pode ser na mesma instância WAHA do principal, em **outra sessão** (ex.: `outbound`), OU em outra instância WAHA isolada (mais seguro). Recomendado isolar.
   - Conectar QR code do número novo nessa sessão.
4. **Setar env vars no VPS1** (`/opt/licitagram/.env`):
   ```env
   WAHA_OUTBOUND_URL=http://127.0.0.1:3001          # ou URL da instância dedicada
   WAHA_OUTBOUND_API_KEY=<api-key-da-sessao>
   WAHA_OUTBOUND_SESSION=outbound
   WHATSAPP_OUTBOUND_DAILY_CAP=15                    # ramp-up conservador
   # WHATSAPP_TEST_PHONE=5511XXXXXXXXX               # opcional: redireciona TUDO pra esse número durante setup
   ```
   Reload PM2: `pm2 reload all && pm2 logs workers --lines 50`.
5. **AQUECIMENTO 30 dias antes do primeiro cold disparo** (CRÍTICO — sem isso BAN é certo):
   - Dias 1-7: 3-5 msgs/dia para família/equipe (precisam responder e arquivar conversas).
   - Dias 8-15: 5-10 msgs/dia para parceiros + clientes warm (todos respondendo).
   - Dias 16-30: 10-15 msgs/dia, mistura warm + alguns leads que pediram contato (manual).
   - **Só depois do dia 30** roda o piloto cold.
6. **Configurar webhook** na sessão dedicada:
   - URL: `https://licitagram.com/api/webhooks/zapi` (ou `/whatsapp` — confirmar com infra).
   - Eventos: `ReceivedCallback`, `MessageStatusCallback`, `DisconnectedCallback`.

## Operação (piloto)

```bash
# 1. Dry-run pra revisar as 50 mensagens (sem enfileirar nada)
ssh vps1
cd /opt/licitagram/packages/workers
PILOT_LIMIT=50 PILOT_PRIORIDADE=HOT PILOT_PLANO=ENTERPRISE \
  npx tsx src/scripts/launch-whatsapp-pilot.ts --dry-run

# 2. Live (gera as outbound_messages com approved_by_admin=false, NADA é enviado ainda)
PILOT_LIMIT=50 PILOT_PRIORIDADE=HOT PILOT_PLANO=ENTERPRISE \
  npx tsx src/scripts/launch-whatsapp-pilot.ts

# 3. Inspecionar 5 amostras no Supabase
SELECT lead_cnpj, to_address, message_body
FROM outbound_messages
WHERE campaign_id = '<id>' AND status='queued'
LIMIT 5;

# 4. Aprovar disparo (gate humano)
UPDATE outbound_messages
SET approved_by_admin = true, approved_at = NOW(), approved_by = 'lucas'
WHERE campaign_id = '<id>' AND status = 'queued';

# 5. Acompanhar
SELECT status, COUNT(*) FROM outbound_messages
WHERE campaign_id = '<id>' GROUP BY 1;
```

## Kill switch (PAUSA EMERGÊNCIA)

```bash
# Pausar TODOS os disparos (jobs ficam delayed 60s e re-checam)
ssh root@187.77.241.93 'touch /tmp/outbound-disabled'

# Retomar
ssh root@187.77.241.93 'rm /tmp/outbound-disabled'
```

Path do flag é configurável via `OUTBOUND_KILL_SWITCH_PATH`.

## Guard-rails ativos no worker

| Camada | Mecanismo | Como ajustar |
|---|---|---|
| Sessão WAHA dedicada | Hard-fail se `WAHA_OUTBOUND_*` não setadas — **nunca** usa a sessão `default` | env vars |
| Approval gate | Worker ignora msgs com `approved_by_admin=false` (defer 5min) | UPDATE manual |
| Daily cap | Conta `sent` últimas 24h; ao atingir cap → defer pra próxima janela 9h | `WHATSAPP_OUTBOUND_DAILY_CAP` |
| Rate limit (BullMQ) | 1 msg / 60s, concurrency 1 | hard-coded (ajustar no processor) |
| Send jitter | personalize enfileira com `delay` aleatório 8-25 min | hard-coded |
| Quiet hours | 9h-18h BRT, dias úteis (sáb/dom = quiet) | hard-coded no `isQuietHours()` |
| Kill switch | `/tmp/outbound-disabled` pausa todos | `OUTBOUND_KILL_SWITCH_PATH` |
| Test redirect | `WHATSAPP_TEST_PHONE` redireciona tudo pra teu número | env var |
| Permanent-error fail-fast | `4xx`/`banned`/`blocked`/`number_invalid` → UnrecoverableError | regex no processor |

## Sinais de alerta (monitoramento manual)

| Sinal | Ação |
|---|---|
| Webhook recebendo `BlockedNumber` ou disconnects frequentes | PAUSAR (`touch /tmp/outbound-disabled`). Possível ban iminente. |
| Reply rate < 1% após 100 msgs | Mensagem ruim. Pausar e iterar pitch. |
| Reply rate > 10% | Bom. Considerar adicionar 2º número e dobrar volume. |
| `status='failed'` > 5% | Possível flag — abaixa cap, espera 24h. |
| Sessão WAHA fica `SCAN_QR_CODE` repetidamente | Ban quase certo. Investigar antes de re-conectar. |

## Plano de escalação

- **Mês 1**: 1 número aquecido, 15 msgs/dia úteis = ~330 msgs/mês.
- **Mês 2**: 2 números (chip novo + 30d aquecimento) = ~660/mês.
- **Mês 3+**: pool de 4-5 números rotativos, ~1500/mês.

Para múltiplos números: criar mais sessões WAHA (`outbound2`, `outbound3`...) e roteamento round-robin no worker (não implementado — TODO).

## Riscos residuais conhecidos

1. **Z-API não é usado pelo outbound** — todo o stack passa por WAHA. Se um dia migrar pra Z-API, refazer o hardening (env vars `ZAPI_OUTBOUND_*` em vez de `WAHA_OUTBOUND_*`).
2. **Daily cap é por banco, não por sessão** — se rodar múltiplas sessões em paralelo, o cap soma todas. OK por enquanto pq só temos 1.
3. **Quiet hours fixo em BRT** — assume servidor não tem DST surpresa (Brasil não tem desde 2019).
4. **Approval gate via SQL manual** — UI admin de revisão é TODO. Por ora, fazer no Supabase Studio.

