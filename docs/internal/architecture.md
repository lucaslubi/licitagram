# LicitaGram — Arquitetura (Fase 0)

Este documento reflete o estado do monorepo após Fase 0 do master plan do LicitaGram Gov. Atualize a cada fase concluída.

## Visão geral do monorepo

```
licitagram/
├── apps/
│   ├── web/                # Licitagram B2B (produção, intocável — RI-1)
│   └── gov/                # LicitaGram Gov (novo, Fase 0+)
├── packages/
│   ├── shared/             # tipos, utils, constantes (compartilhado)
│   ├── workers/            # BullMQ Licitagram B2B (produção — RI-2)
│   ├── supabase/           # migrations SQL (ambos produtos)
│   ├── price-history/      # features de preços B2B
│   ├── proposal-engine/    # gerador de propostas B2B
│   ├── gov-core/           # núcleo agêntico e Drizzle do Gov
│   └── gov-workers/        # BullMQ do Gov (prefixo licitagov:)
├── docs/
│   └── internal/
│       ├── architecture.md       (este arquivo)
│       ├── adr/                   decisões arquiteturais
│       └── runbooks/              operação em produção
└── .github/workflows/ci.yml       CI com gate RI-8
```

## Diagrama de serviços

```mermaid
graph LR
  subgraph Vercel
    WEB[apps/web<br/>licitagram.com]
    GOV[apps/gov<br/>gov.licitagram.com]
  end

  subgraph Hostinger VPS
    WWORKERS[packages/workers<br/>Licitagram B2B jobs]
    GWORKERS[packages/gov-workers<br/>LicitaGram Gov jobs]
  end

  subgraph Supabase
    DB[(Postgres<br/>public.* + licitagov.*)]
    AUTH[Auth/JWT]
    STORAGE[Storage]
  end

  subgraph Redis
    REDIS[(Redis<br/>Upstash / self-hosted)]
  end

  subgraph APIs externas
    PNCP[PNCP v2.3]
    COMPRAS[Compras.gov.br]
    ANTHROPIC[Claude Opus 4.7<br/>Haiku 4.5]
    STRIPE[Stripe]
    RESEND[Resend]
  end

  WEB <-->|SSR auth cookies| AUTH
  WEB -->|SQL público| DB
  GOV <-->|SSR auth cookies| AUTH
  GOV -->|Drizzle, schema licitagov.*| DB
  GOV -.->|VIEW read-only v_historico_pncp| DB

  WEB -->|enqueue| REDIS
  WWORKERS <-->|consume sem prefixo| REDIS
  WWORKERS -->|SQL público| DB

  GOV -->|enqueue prefix=licitagov:| REDIS
  GWORKERS <-->|consume prefix=licitagov:| REDIS
  GWORKERS -->|Drizzle| DB

  GOV --> ANTHROPIC
  GOV --> STRIPE
  GOV --> RESEND
  GWORKERS --> PNCP
  GWORKERS --> COMPRAS
```

## Isolamento dos produtos

| Recurso | Licitagram B2B | LicitaGram Gov |
|---|---|---|
| Frontend | `apps/web` (Vercel project 1, `licitagram.com`) | `apps/gov` (Vercel project 2, `gov.licitagram.com`) |
| Workers | `packages/workers` (Hostinger, sem prefixo Redis) | `packages/gov-workers` (Hostinger, prefixo `licitagov:`) |
| Schema Postgres | `public.*` | `licitagov.*` (SEM escrita em `public.*`, RI-4) |
| Tema Tailwind | laranja `hsl(18 95% 55%)` | azul `hsl(217 91% 60%)` |
| Billing | Stripe (conta única, produtos separados) | idem, produtos `gov_*` |
| Env vars | `apps/web/.env.*` | `apps/gov/.env.*` |

## Supabase — schema e VIEWs

```
public.*
 ├── companies, users, tenders, subscriptions, ...   (Licitagram B2B)
 └── (imutável para o novo código — RI-4)

licitagov.*                                              (Fase 0 migration)
 ├── orgaos, usuarios, setores                          núcleo de tenancy
 ├── campanhas_pca, respostas_setor, itens_pca          PCA Collector (Fase 3)
 ├── historico_compras, perfis_regulatorios             referências
 ├── processos, artefatos                               licitação em andamento
 ├── riscos_identificados                               Mapa/Matriz (Fase 5)
 ├── precos_pesquisa, precos_estimativa                 Cesta de preços (Fase 6)
 ├── publicacoes_pncp                                   rastreamento publicação
 ├── catalogo_normalizado                               CATMAT/CATSER + pgvector
 ├── audit_log                                          trigger em todas tabelas (RI-9)
 └── v_historico_pncp                                   VIEW read-only sobre public.tenders
```

Todas tabelas têm RLS habilitado; policies básicas (filtro por `orgao_id` do usuário logado) foram criadas na migration inicial e serão refinadas nas fases seguintes.

## Fluxo de geração de artefato (exemplo: ETP, Fase 4)

```mermaid
sequenceDiagram
  participant U as Usuário
  participant APP as apps/gov (Next.js)
  participant Q as Redis (licitagov: prefix)
  participant W as gov-workers
  participant DB as Postgres
  participant C as Claude API (Opus 4.7)

  U->>APP: clica "Gerar ETP"
  APP->>DB: INSERT artefatos (status='gerando')
  APP->>Q: enqueue 'generate-artifact'
  Q->>W: job picked up
  W->>DB: SELECT processo + ETP + pesquisa_precos
  W->>C: stream completion (system prompt + context)
  C-->>W: stream deltas
  W->>DB: UPDATE artefatos (conteudo_markdown += delta)
  DB-->>APP: Supabase Realtime event
  APP-->>U: UI mostra streaming do ETP
  W->>DB: UPDATE artefatos (status='gerado', tokens_*, tempo_*)
```

## Observability

- **Sentry** (`@sentry/nextjs`): errors frontend + backend, source maps, release tracking. DSN em `SENTRY_DSN`. Init em `apps/gov/instrumentation.ts`.
- **Pino** (`pino`): logs estruturados JSON, redação automática de PII (`cpf`, `cnpj`, `email`, `senha`). RI-14 compliance.
- **PostHog** (`posthog-js`): funnels de onboarding, session recording com `maskAllInputs: true`. Init em `apps/gov/lib/analytics.ts`.
- **Vercel Analytics**: Core Web Vitals via plataforma.

## CI/CD

`.github/workflows/ci.yml` roda em PRs e pushes:

- `quality` — lint + type-check gov-core/gov-workers/gov.
- `test-gov` — Vitest para gov-core e gov-workers.
- `build-gov` — `next build` do app gov.
- `protect-licitagram-web` — **gate RI-8**: ativado apenas quando o PR mexe em `apps/web`, `packages/workers`, `packages/shared` ou migrations antigas. Bloqueia merge se `pnpm --filter web build` falhar.
- `ri6-queue-prefix` — **gate RI-6**: grep em `packages/gov-workers/src` para garantir que nenhuma `new Queue(` ou `new Worker(` escape do wrapper `createGovQueue/createGovWorker` (prefixo `licitagov:`).

## Arquivos críticos

| Arquivo | Propósito |
|---|---|
| [`packages/supabase/migrations/20260418000000_gov_schema_init.sql`](../../packages/supabase/migrations/20260418000000_gov_schema_init.sql) | Schema `licitagov.*` completo, VIEW histórico, audit trigger, RLS baseline |
| [`packages/gov-core/src/db/schema/index.ts`](../../packages/gov-core/src/db/schema/index.ts) | Drizzle schemas (orgaos/usuarios/setores na Fase 0; restante virá nas fases seguintes) |
| [`packages/gov-core/src/ai/claude.ts`](../../packages/gov-core/src/ai/claude.ts) | Wrapper SDK Anthropic; `CLAUDE_MODELS` constante com IDs Opus/Haiku |
| [`packages/gov-workers/src/queues.ts`](../../packages/gov-workers/src/queues.ts) | `createGovQueue`/`createGovWorker` com prefixo `licitagov:` (RI-6) |
| [`apps/gov/middleware.ts`](../../apps/gov/middleware.ts) | Supabase session refresh (Fase 0 stub; gates de plano vêm na Fase 1) |
| [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | CI com gates RI-6 e RI-8 |
