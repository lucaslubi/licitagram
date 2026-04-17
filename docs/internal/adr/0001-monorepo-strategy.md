# ADR-0001: Monorepo pnpm compartilhado para Licitagram B2B e LicitaGram Gov

- **Status**: Aceito
- **Data**: 2026-04-18
- **Decisor**: Lucas de Lima
- **Escopo**: Fase 0 do master plan LicitaGram Gov

## Contexto

O produto atual `Licitagram` (B2B, suprindo empresas privadas) está em produção em `apps/web`, com workers BullMQ em `packages/workers` e tabelas em `public.*`. Nasce o novo produto `LicitaGram Gov` (B2G, fase interna de licitações públicas sob Lei 14.133/2021). Precisamos decidir onde o novo código vive.

Alternativas consideradas:

1. **Repo separado** — isolamento máximo, CI independente.
2. **Monorepo pnpm existente, novo app em `apps/gov`** — máxima sinergia (dados históricos PNCP, base CNAE, embeddings pgvector).

## Decisão

Manter um único monorepo. Adicionar:

- `apps/gov` — Next.js 14 do novo produto
- `packages/gov-core` — núcleo de regras, schemas Drizzle, clientes IA
- `packages/gov-workers` — BullMQ dedicado (prefixo `licitagov:`)
- Migrations gov em `packages/supabase/migrations/20260418*_gov_*.sql`

## Consequências

**Positivas**:
- Reuso direto de `@licitagram/shared` (formats, CNAE, CNPJ utils, stemmer).
- VIEWs read-only de `public.tenders` → `licitagov.v_historico_pncp` para pesquisa de preços (Fase 6).
- Um único `pnpm install`, uma única pipeline CI, uma única pnpm-lock.
- Redis compartilhado (prefixo `licitagov:` isola keys).

**Negativas**:
- Risco de contaminação: PR do Gov pode acidentalmente quebrar o Licitagram. Mitigação: CI gate `protect-licitagram-web` em `.github/workflows/ci.yml` e RI-1/RI-2 como guardrails humanos.
- Dois projetos Vercel apontando pro mesmo repo: configuração por-projeto no dashboard (Root Directory).
