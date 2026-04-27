# Conta — Self-Service Design

**Data**: 2026-04-27
**Status**: Spec — aguardando revisão do owner antes do plano de execução
**Autor**: brainstorming session, decisions captured

## Contexto e motivação

Clientes do Licitagram hoje **não conseguem**:
- Editar dados básicos do próprio perfil
- Mudar a senha
- Cancelar assinatura sem falar com suporte
- Deletar conta (LGPD)
- Configurar preferências de notificação (canais, horários, threshold)
- Encerrar sessões em outros dispositivos
- Exportar os próprios dados (LGPD direito de portabilidade)

Resultado: tickets de suporte para tarefas triviais, churn silencioso (não conseguem cancelar → cobrança continua → reclamação), exposição legal LGPD. Plataformas top-tier (Linear, Stripe, Vercel, Notion) tratam isso como hygiene mínimo.

Esta entrega resolve o gap construindo `/conta` com seis sub-rotas (Perfil, Senha, Assinatura, Notificações, Sessões, Privacidade), com UX no padrão das referências citadas.

Em paralelo, esta entrega também inclui melhorias de matching (backfill on signup, profile dedup já feito, tender enrichment já feito, daily digest) que afetam diretamente a qualidade do que `/conta/notificacoes` controla — sem essas melhorias, o cliente tunaria controles em cima de um pipeline com chão baixo de qualidade.

## Decisões arquiteturais (registradas no brainstorm)

| # | Tópico | Decisão |
|---|---|---|
| 1 | Estrutura de rotas | Rotas separadas: `/conta` (overview) + `/conta/perfil` + `/conta/senha` + `/conta/notificacoes` + `/conta/assinatura` + `/conta/sessoes` + `/conta/privacidade`. `/billing` redireciona pra `/conta/assinatura`. `/settings` antigo é deletado. |
| 2 | Cancelamento de assinatura | Híbrido: nossa UI com retention modal customizado + Stripe Customer Portal pra cartão/faturas. **Cancel-at-period-end** (cliente continua com acesso até fim do ciclo pago). |
| 3 | Deletar conta | Soft-delete com **14 dias de grace period**. Login bloqueado durante grace; banner permite reverter. Email de confirmação + link de cancelar deleção. Worker faz cleanup definitivo no dia 14. Stripe cancela imediato. |
| 4 | Notificações — UX | **Presets** (Só altíssima qualidade / Equilibrado / Tudo) + **controles avançados**: slider de score mínimo, toggle por source, range de valor, multiselect UFs, limite diário, multiselect canais, janela horário, palavras de exclusão. |
| 5 | LGPD export | Self-service assíncrono. Botão enfileira job; worker gera ZIP em até 24h; email com URL signada (7 dias TTL). Cooldown 24h entre exports. |
| 6 | Sessões | Lista de sessões Supabase auth + revoke individual + "Encerrar todas as outras". |
| 7 | Score formula | **Mantido como GREATEST** dos `score_by_*` (decisão explícita do owner). |
| 8 | Match quality | Qualidade alta nas notificações (controle do cliente), quantidade total no mapa/lista (cliente explora). |

## Architecture

### Camadas

```
┌─────────────────────────────────────────────────────────┐
│  Frontend Next.js 14 App Router                         │
│  apps/web/src/app/(dashboard)/conta/                    │
│   ├── page.tsx                  hub overview            │
│   ├── perfil/page.tsx                                   │
│   ├── senha/page.tsx                                    │
│   ├── notificacoes/page.tsx                             │
│   ├── assinatura/page.tsx                               │
│   ├── sessoes/page.tsx                                  │
│   └── privacidade/page.tsx                              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Server Actions (apps/web/src/actions/conta/)           │
│   ├── update-profile.ts                                 │
│   ├── change-password.ts                                │
│   ├── update-notif-prefs.ts                             │
│   ├── cancel-subscription.ts                            │
│   ├── open-stripe-portal.ts                             │
│   ├── revoke-session.ts                                 │
│   ├── revoke-all-sessions.ts                            │
│   ├── request-data-export.ts                            │
│   └── delete-account.ts                                 │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
┌──────────────┐  ┌────────────────┐  ┌──────────────┐
│   Supabase   │  │     Stripe     │  │   BullMQ     │
│ Auth + DB    │  │   API          │  │   Workers    │
│              │  │                │  │              │
│ users        │  │ subscription   │  │ data-export  │
│ companies    │  │ cancel/        │  │ delete-      │
│ bot_configs  │  │ create_portal  │  │   account    │
│ auth.sessions│  │ session        │  │ wow-batch    │
└──────────────┘  └────────────────┘  └──────────────┘
```

### Data model — novas tabelas / colunas

```sql
-- 1. Soft delete em users (deletion_* colunas — IF NOT EXISTS é safe se já existirem)
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- 2. Notification preferences em bot_configs (extensão)
ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS notification_preset VARCHAR(20)
    DEFAULT 'equilibrado'
    CHECK (notification_preset IN ('alta_qualidade','equilibrado','tudo','custom')),
  ADD COLUMN IF NOT EXISTS min_score_notify INTEGER DEFAULT 55,
  ADD COLUMN IF NOT EXISTS max_notifs_per_day INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS notif_quiet_start TIME,           -- ex: 22:00
  ADD COLUMN IF NOT EXISTS notif_quiet_end TIME,             -- ex: 07:00
  ADD COLUMN IF NOT EXISTS notif_channels TEXT[]
    DEFAULT ARRAY['email']::TEXT[],                          -- email,whatsapp,telegram,push
  ADD COLUMN IF NOT EXISTS notif_excluded_terms TEXT[],      -- palavras de exclusão
  ADD COLUMN IF NOT EXISTS daily_digest_enabled BOOLEAN DEFAULT true;

-- 3. Subscription cancellation feedback (anti-churn intel)
CREATE TABLE IF NOT EXISTS public.cancellation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,         -- 'caro','nao_usei','faltou_feature','concorrente','outro'
  reason_detail TEXT,
  retention_offered TEXT,        -- 'pause','discount','none'
  retention_accepted BOOLEAN,
  cancelled_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Data export jobs
CREATE TABLE IF NOT EXISTS public.data_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','expired')),
  storage_path TEXT,             -- supabase storage path
  signed_url_expires_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_export_jobs_user ON public.data_export_jobs(user_id, requested_at DESC);

-- 5. Account deletion log (audit)
CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID,
  scheduled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  reason TEXT,
  metadata JSONB
);
```

### BullMQ queues novas

```typescript
// packages/workers/src/queues/data-export.queue.ts
export const dataExportQueue = new Queue<{ jobId: string }>('data-export', { connection })

// packages/workers/src/queues/account-deletion.queue.ts
// (cron: roda diariamente, processa quem passou do grace)
export const accountDeletionQueue = new Queue('account-deletion', { connection })

// packages/workers/src/queues/wow-batch.queue.ts
// (disparado on-signup, varre últimos 60d de tenders contra empresa nova)
export const wowBatchQueue = new Queue<{ companyId: string }>('wow-batch', { connection })
```

## Components — sub-rotas

### `/conta` — Overview hub

- Card grid 2x3 (mobile: stack) com link pra cada subseção
- Cada card: ícone + título + 1 linha de status atual (ex: "Plano: Trial — 7 dias restantes")
- Topo: avatar + nome + email do user
- Visual: minimalista no estilo Linear/Notion, espaço generoso, hover sutil

### `/conta/perfil`

**Campos editáveis**:
- Avatar (upload pra Supabase Storage bucket `avatars`)
- Nome completo
- Email (atual read-only + botão "Alterar email" → fluxo Supabase auth com confirmation link)
- Telefone (validador BR `+55 (DDD) NNNNN-NNNN`)
- Empresa principal (read-only — gerenciada em `/empresa`, link "Editar empresa" abre lá)
- Idioma (select pt-BR / en — placeholder, default pt-BR)
- Fuso horário (auto-detect via `Intl.DateTimeFormat().resolvedOptions().timeZone`, override manual)

**Server action**: `updateProfile(formData)` valida + grava em `users` + revalida path.

### `/conta/senha`

- Campo "Senha atual" (validar via `supabase.auth.signInWithPassword`)
- Campo "Nova senha" + confirmação
- Indicador de força via `zxcvbn-ts` (4 níveis)
- Validação client + server: 8+ chars, 1 maiúscula, 1 número, 1 especial
- **Pós-update**: invalida outras sessões automaticamente, mantém atual logada
- Email "Sua senha foi alterada — Não foi você? Clique aqui pra recuperar" via Supabase template ou Resend

### `/conta/notificacoes` (mais densa, ver mocks no Figma)

**Estrutura visual**:
```
┌─ PRESETS ──────────────────────────────────────┐
│  ○ Só altíssima qualidade   (score ≥ 70, top 10/dia)
│  ● Equilibrado               (score ≥ 55, top 30/dia)
│  ○ Tudo                      (score ≥ 40, sem cap)
│  ○ Personalizado
└────────────────────────────────────────────────┘

┌─ Score mínimo ─────────────────────────────────┐
│  [——————●——————] 55                            │
│  Qualidade média esperada: ~⭐⭐⭐⭐ (4 estrelas) │
└────────────────────────────────────────────────┘

┌─ Engines de matching ──────────────────────────┐
│  ☑ Semântico (pgvector_rules) — recomendado    │
│  ☑ Palavras-chave (keyword)                    │
│  ☐ Legacy (semantic, ai)                       │
└────────────────────────────────────────────────┘

┌─ Faixa de valor ───────────────────────────────┐
│  Mínimo: R$ [_______]  Máximo: R$ [_______]    │
│  ☐ Sem limite                                  │
└────────────────────────────────────────────────┘

┌─ UFs de interesse ─────────────────────────────┐
│  [+] Adicionar UF   [SP×] [RJ×] [MG×]           │
│  ☐ Todas as UFs                                │
└────────────────────────────────────────────────┘

┌─ Limite diário ────────────────────────────────┐
│  [____30____] notificações por dia             │
└────────────────────────────────────────────────┘

┌─ Canais ───────────────────────────────────────┐
│  ☑ 📧 Email     [seu@email.com] ✓ confirmado    │
│  ☑ 💬 WhatsApp  [+55 11 9...] ✓ conectado       │
│  ☐ ✈ Telegram  [Conectar Telegram]              │
│  ☐ 🔔 Push (em breve)                          │
└────────────────────────────────────────────────┘

┌─ Janela de horário ────────────────────────────┐
│  ☑ Não me notificar entre [22:00] e [07:00]    │
└────────────────────────────────────────────────┘

┌─ Daily digest ─────────────────────────────────┐
│  ☑ Receber resumo diário das melhores 10       │
│     [Horário: 08:00]                           │
└────────────────────────────────────────────────┘

┌─ Palavras de exclusão ─────────────────────────┐
│  Não me envie matches que contenham:           │
│  [textarea]                                    │
└────────────────────────────────────────────────┘

[Restaurar preset]   [Salvar alterações]
```

**Server action**: `updateNotifPrefs(formData)` valida e grava em `bot_configs` da empresa. Se mudou preset, recalcula campos relacionados.

**Backend impact**: workers `pending-notifications.processor.ts`, `hot-alerts.processor.ts` e `daily-digest.processor.ts` (novo) leem essas colunas pra decidir disparo.

### `/conta/assinatura`

**Layout**:
```
┌─ Plano atual ──────────────────────────────────┐
│  PRO MENSAL                                    │
│  R$ 199/mês                                    │
│  Renovação: 15/05/2026                         │
│  Status: ativo                                 │
│                                                │
│  [Mudar plano]   [Gerenciar pagamento]         │
│                                                │
│  Recursos inclusos:                            │
│  ✓ Matches ilimitados                          │
│  ✓ Bot automático                              │
│  ✓ ... (lista do plano)                        │
└────────────────────────────────────────────────┘

┌─ Histórico de cobranças ───────────────────────┐
│  Data       Plano    Valor    Fatura          │
│  15/04/26   PRO      R$ 199   [PDF]           │
│  15/03/26   PRO      R$ 199   [PDF]           │
└────────────────────────────────────────────────┘

[Cancelar assinatura]    (botão sutil, vermelho)
```

**Botão "Gerenciar pagamento"** → server action `openStripePortal()` chama `stripe.billingPortal.sessions.create({ customer, return_url })` e redireciona pra URL retornada. Cliente edita cartão/endereço/etc no Stripe e volta pra `/conta/assinatura`.

**Botão "Cancelar assinatura"** → modal nosso:
```
1. "Por que está cancelando?" (radio + outro)
   - Caro demais
   - Não usei o suficiente
   - Faltou a feature X (textfield se selecionado)
   - Achei um concorrente
   - Outro

2. Retention offer:
   - Se "caro": "Aceita 50% off no próximo mês?"
   - Se "não usei": "Aceita pausar 30 dias?"
   - Senão: pula direto pro confirm

3. Confirm: "Sua assinatura será cancelada ao fim do
   ciclo pago em DD/MM. Você continuará tendo acesso
   até lá. Quer continuar?"
   [Voltar]   [Confirmar cancelamento]
```

**Server action `cancelSubscription`**:
1. Grava `cancellation_feedback` (motivo, retention_offered, retention_accepted)
2. Se retention aceito (pause/discount): aplica via Stripe API e fecha modal "Combinado!"
3. Se confirmou cancel: `stripe.subscriptions.update(id, { cancel_at_period_end: true })`
4. Webhook Stripe atualiza `subscriptions.status = 'pending_cancellation'` na nossa DB

### `/conta/sessoes`

```
┌─ Sessões ativas ───────────────────────────────┐
│  💻 Mac · Chrome 122 · São Paulo, BR (atual)   │
│     Ativa agora · Login em 24/04/26            │
│                                                │
│  📱 iPhone 14 · Safari · Brasília, BR          │
│     Última atividade: há 2h · Login 20/04/26   │
│     [Encerrar sessão]                          │
│                                                │
│  💻 Windows · Edge · Rio de Janeiro, BR        │
│     Última atividade: há 5d · Login 15/04/26   │
│     [Encerrar sessão]                          │
└────────────────────────────────────────────────┘

[Encerrar todas as outras sessões]
```

Server action `revokeSession(sessionId)` chama `supabase.auth.admin.signOut(sessionId)`. `revokeAllOtherSessions()` itera todas exceto a current.

User-agent parsing via lib `ua-parser-js`. Geo via cabeçalho do Vercel (CDN-Loop / x-vercel-ip-country) ou MaxMind GeoIP-lite.

### `/conta/privacidade`

```
┌─ Exportar meus dados (LGPD) ───────────────────┐
│  Você pode pedir uma cópia de todos os seus    │
│  dados em formato JSON. Vamos preparar e enviar│
│  por email em até 24h.                         │
│                                                │
│  [Solicitar exportação]                        │
│                                                │
│  Última exportação: 10/04/26 (expirou)        │
└────────────────────────────────────────────────┘

┌─ Deletar minha conta ──────────────────────────┐
│  Ação permanente. Após 14 dias de carência,    │
│  todos os seus dados serão apagados conforme   │
│  LGPD. Você pode reverter durante esse período.│
│                                                │
│  [Deletar minha conta]                         │
└────────────────────────────────────────────────┘
```

**Modal de delete**:
```
ATENÇÃO — Ação permanente

O que vai acontecer:
- Você terá 14 dias para reverter (login bloqueado)
- Após 14 dias, todos os dados são apagados
- Sua assinatura será cancelada imediatamente
- Você não receberá mais cobranças

Para confirmar, digite DELETAR e seu email:

  Texto: [_______]
  Email: [_______]

  [Cancelar]   [Confirmar exclusão]
```

**Server action `deleteAccount`**:
1. Valida texto = "DELETAR" + email = user.email
2. Atualiza `auth.users.deletion_scheduled_at = now() + 14 days`
3. Cancela subscription Stripe imediatamente (`cancel_at_period_end: false`)
4. Insere em `account_deletion_log` (audit)
5. Envia email "Sua conta foi agendada pra deletar em DD/MM. Cancelar deleção: [link]"
6. Logout do user → cliente vê tela "Conta agendada pra deletar em N dias. [Cancelar deleção]"

**Worker `account-deletion`**:
- Roda diário às 03:00 UTC
- Pega rows com `deletion_scheduled_at < now()`
- Para cada: deleta dados (cascade já cuida da maioria), apaga `auth.users` row, marca `executed_at`
- Empresa: se user é único — deleta empresa + cascata (matches, bot_sessions, etc). Se compartilhada — só remove o user de `company_users`.

**Server action `cancelDeletion`** (a partir do email link ou banner): marca `cancelled_at`, zera `deletion_scheduled_at`, manda email "Conta restaurada".

## Phases F7-F10 — match quality (incluídas neste design)

Estas fases não são UX de `/conta` mas afetam diretamente a qualidade do que `/conta/notificacoes` controla:

### F7 — Backfill on signup (WOW batch)

**Trigger**: empresa nova cria perfil em `companies` E gera embedding.

**Worker**: `wow-batch.processor.ts` (queue `wow-batch`).

**Lógica**:
1. Pega tenders dos últimos 60d com `data_abertura >= NOW()` (ainda abertos)
2. Roda pgvector matching contra essa empresa
3. Pega top 50 com score_final ≥ 50
4. Insere em `matches` com `match_source='wow_batch'`
5. Manda email único: "Bem-vindo! Já encontramos 50 oportunidades pra você"
6. Popula imediatamente `/map` e `/oportunidades`

### F8 — Profile dedup (JÁ APLICADO em 2026-04-26)

`buildExpandedProfile` em `company-profiler.ts` deduplica divisões CNAE, cap 1500 chars. 21/21 empresas reembedded. Redução média 70%.

### F9 — Tender enrichment (CÓDIGO APLICADO; backfill PENDENTE)

`enrichTenderText` chama LLM via PDFs do edital pra preencher `resumo` + `requisitos`. Hot-path lazy. Backfill agendado pra off-peak (UTC midnight quando rate limits resetam).

**Operação**: rodar `node packages/workers/dist/scripts/reembed-tenders.js --limit=998` em janela 02-06 UTC.

### F10 — Reembed massivo cancelado

F8 alarmou falsamente sobre corrupção. F10 verificou: embeddings íntegros (cos(stored, fresh) = 1.0000). Não precisa reembedar.

### F11 — Daily digest mode

**Worker**: `daily-digest.processor.ts` (cron: diário às 08:00 BRT por empresa, respeitando fuso).

**Lógica**:
1. Pega top 10 matches do dia (score_final desc, deduped por tender)
2. Renderiza template HTML resumo (logo, top 3 destacados, links)
3. Manda email único
4. Marca `notified_at` nos matches incluídos pra evitar duplicar nas notifs ativas

Cliente desativa em `/conta/notificacoes`.

## Error handling

| Falha | Comportamento |
|---|---|
| Server action falha por validação | Toast vermelho com mensagem específica, form mantém valores |
| Stripe API down | Mostra "Serviço de pagamento temporariamente indisponível, tente em alguns minutos." Log Sentry. |
| Worker `data-export` falha | Job marca `failed`, email "Tivemos problema gerando seu export, tente novamente em 1h". Reschedule manual via admin. |
| Worker `account-deletion` falha em uma row | Marca `executed_at = NULL`, log Sentry, retry no próximo cron. Não bloqueia outras rows. |
| Cliente cancela mas Stripe webhook não chega | Reconcilia diariamente: cron roda `reconcile-stripe-subs.processor.ts` que compara DB com Stripe API |
| Cliente clica "Confirmar exclusão" 2x | Server action é idempotente (UPDATE WHERE deletion_scheduled_at IS NULL) |
| Email de export expira (>7d) | Cliente vê "Link expirado, solicite novamente" no `/conta/privacidade`. Cooldown de 24h ainda vale. |

## Testing strategy

### Unit (vitest)
- Cada server action: input validation, happy path, edge cases (idempotência, race), erro de Stripe
- Worker processors: lógica de filtro, geração de ZIP (data export), cleanup cascata (deletion)

### Integration (Playwright contra DB de teste)
- Fluxo completo de cancelamento: criar user → criar sub Stripe → cancelar → verificar webhook → verificar UI
- Fluxo de delete account: agendar → cancelar deleção → verificar email
- Fluxo de export: solicitar → worker processar → email link → download ZIP → conferir conteúdo
- Notif preferences: salvar preset → verificar que `pending-notifications.processor.ts` respeita

### Smoke (manual em staging antes de prod)
- Login → editar perfil → confirmar mudança no banco
- Mudar senha → tentar logar com nova → confirma OK
- Conectar telegram → mandar match → confirma chega
- Sessões: logar de outro device → ver na lista → revoke → confirmar logout

## Migration plan

1. **Phase 0** (uma vez, antes de tudo): aplicar migrations SQL (cancellation_feedback, data_export_jobs, account_deletion_log, alter bot_configs, alter auth.users)
2. **Phase 1** (paralelo): scaffolding `/conta` rotas + layout + nav update
3. **Phase 2** (paralelo): perfil + senha + sessões (UX simples, baixo risco)
4. **Phase 3** (paralelo): assinatura (Stripe Portal + retention modal) + workers F7 (wow-batch), F11 (daily digest)
5. **Phase 4**: notificações (a maior das UI, depende de bot_configs migration estar viva)
6. **Phase 5**: privacidade (delete + LGPD export) + worker `account-deletion` + worker `data-export`
7. **Phase 6**: F9 backfill (off-peak), `/billing` redirect, `/settings` cleanup
8. **Phase 7**: testes e2e + smoke prod + sync com suporte (FAQ atualizado)

## Risk register

| Risco | Mitigação |
|---|---|
| Stripe webhook race com server action | Server action escreve estado intermediário (`pending_cancellation`); webhook confirma. Reconcile job diário pega divergência. |
| Cliente acha que cancel-at-period-end "não cancelou" | Toast pós-cancel + email confirmação claros: "Cancelado. Você continua com acesso até DD/MM" |
| Deleção dispara cascata grande (matches, sessions, bot data) | Migration cuida do `ON DELETE CASCADE`. Worker testa em staging com user clone primeiro. |
| LGPD export expõe dado de outro usuário em company compartilhada | Filter rigoroso por `user_id` em todas as queries. Code review crítico nessa parte. |
| Notif preferences mal calibrada esvazia notificações | Mostrar contagem prevista no preview antes de salvar ("Com essa config, você receberia ~12 notifs/semana"). Reset fácil pro Equilibrado. |
| F9 backfill esgota quota LLM e quebra outros workers | Gating env `ENRICH_TENDERS=true` desligado fora da janela. Rodar com `--concurrency=2` em horário 02-06 UTC. |

## Out of scope (não faz parte desta entrega)

- Multi-fator (TOTP / SMS) em /conta/senha — futuro
- Convidar membros pra company / RBAC granular — já existe parcial em `/empresa`
- Histórico de auditoria pro próprio user (quem viu meu perfil etc) — não há use case
- Substituir Stripe Customer Portal por UI 100% nossa — não vale o investimento
- Reescrever scoring formula (`GREATEST` decisão explícita do owner)
- Dashboard de admin pra ver cancellation_feedback — vira BI separado depois

## Success criteria

1. Cliente consegue cancelar assinatura sem ticket de suporte (acompanhar contagem de tickets antes/depois — esperado -80%)
2. Cliente consegue mudar senha sem suporte
3. LGPD export disponível em < 24h
4. Delete account com 14d grace funciona (testar em staging com clone real)
5. Notif preferences reduz reclamação de "spam de email" (esperado -60%) sem aumentar churn
6. WOW batch on signup: 100% das novas trials recebem ≥ 30 matches relevantes em < 5 min após cadastro
7. Conversion rate (interested+applied+won / notified) sobe para > 5% nas próximas 4 semanas pós-deploy (vs 0.10-1% atual)
8. Zero data leak entre users (LGPD audit clean)
