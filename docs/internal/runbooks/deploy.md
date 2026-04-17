# Runbook — Deploy LicitaGram Gov (Fase 0)

Este runbook cobre o setup inicial do LicitaGram Gov em produção (`gov.licitagram.com`). Operações recorrentes de deploy ficam automatizadas pelo Vercel via Git.

## Pré-requisitos

- Acesso admin à conta Vercel que hospeda `apps/web`.
- Acesso admin ao projeto Supabase onde está `public.*` (Licitagram).
- Acesso admin ao DNS do `licitagram.com`.
- Conta Anthropic com chave válida para Claude Opus 4.7 + Haiku 4.5.
- Redis acessível via `REDIS_URL` (mesma instância do Licitagram B2B ou Upstash dedicado).

## Primeiro deploy do gov (one-time)

### 1. Aplicar migration `licitagov`

```bash
# De dentro do repo, conectado à `DATABASE_URL` do projeto Supabase:
pnpm --filter @licitagram/supabase db:push
# ou manualmente:
psql "$DATABASE_URL" -f packages/supabase/migrations/20260418000000_gov_schema_init.sql
```

Validar:

```sql
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'licitagov';
SELECT table_name FROM information_schema.tables WHERE table_schema = 'licitagov';
-- deve retornar: orgaos, usuarios, setores, campanhas_pca, respostas_setor,
--                itens_pca, historico_compras, perfis_regulatorios, processos,
--                artefatos, riscos_identificados, precos_pesquisa,
--                precos_estimativa, publicacoes_pncp, catalogo_normalizado,
--                audit_log (16 tabelas + 1 VIEW v_historico_pncp)
```

Se `CREATE EXTENSION "vector"` falhar por falta de privilégio: habilitar via dashboard Supabase (Database → Extensions → `vector`) e rodar a migration de novo.

### 2. Criar projeto Vercel `licitagram-gov`

No dashboard Vercel:

1. **Add New → Project**.
2. Importar o repo `licitagram` (mesmo do projeto `licitagram-web`).
3. **Framework preset**: Next.js.
4. **Root Directory**: `apps/gov`.
5. **Build Command**: `cd ../.. && pnpm --filter @licitagram/shared build && pnpm --filter @licitagram/gov-core build && pnpm --filter @licitagram/gov build`.
6. **Output Directory**: `.next` (default).
7. **Install Command**: `cd ../.. && pnpm install --frozen-lockfile`.
8. **Node Version**: 20.
9. Em **Environment Variables**, preencher as entradas listadas em `apps/gov/.env.example` (Preview e Production separadamente).

### 3. Configurar domínio `gov.licitagram.com`

No painel DNS do `licitagram.com`:

```
Type:  CNAME
Name:  gov
Value: cname.vercel-dns.com
TTL:   3600
```

No projeto Vercel `licitagram-gov`: **Settings → Domains → Add** `gov.licitagram.com`. Aguardar propagação DNS + provisionamento TLS.

### 4. Primeiro deploy manual

```bash
# Na raiz do repo, branch main atualizada
vercel --project licitagram-gov --prod
```

Ou empurrar para `main` — Vercel builda automático.

Validar:

```bash
curl -I https://gov.licitagram.com/
# Esperado: HTTP/2 200 + Strict-Transport-Security header
```

Abrir no browser: landing stub aparece com tema claro/escuro responsivo (DS-8).

### 5. Configurar Sentry

1. Criar projeto Sentry `licitagram-gov` (plataforma: Next.js).
2. Copiar DSN → variável `SENTRY_DSN` no Vercel (Preview + Production).
3. Gerar Sentry auth token → `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` para uploads de source map.
4. Primeiro deploy pós-Sentry: disparar erro controlado em `/api/health` e verificar em Sentry.

### 6. Configurar PostHog

1. Criar projeto PostHog `licitagram-gov`.
2. Copiar project key → `NEXT_PUBLIC_POSTHOG_KEY` no Vercel.
3. Session recording: habilitar com `maskAllInputs: true` (já configurado no código — RI-14).

## Deploy subsequente

Toda alteração merged em `main`:

1. GitHub Actions roda `.github/workflows/ci.yml`:
   - `quality` + `test-gov` + `build-gov` obrigatórios.
   - `protect-licitagram-web` se o PR tocou `apps/web`, `packages/workers` ou `packages/shared`.
   - `ri6-queue-prefix` se o PR tocou `packages/gov-workers`.
2. Se CI passar, Vercel builda automaticamente.
3. Preview URL gerada em PRs; Production em merge para `main`.

## Rollback

Vercel **Deployments → Promote** o deploy anterior. Leva ~5 segundos.

Migration irreversível? Nunca aplicar `DROP SCHEMA licitagov`. Para reverter mudanças de schema, escrever migration seguinte que desfaz (compensatory migration). Backups diários do Supabase permitem point-in-time recovery se algo der muito errado.

## Health checks

Até Fase 1 não temos endpoint `/api/health` formal. Validação manual:

```bash
curl -sf https://gov.licitagram.com/ > /dev/null && echo "gov up" || echo "gov DOWN"
curl -sf https://licitagram.com/ > /dev/null && echo "web up" || echo "web DOWN"
```

Formalização do health check entra na Fase 9 (observability).
