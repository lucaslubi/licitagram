# ADR-0007: Workers em `packages/gov-workers`, não `workers/gov-workers`

- **Status**: Aceito
- **Data**: 2026-04-18
- **Referências**: RI-6 do master plan; descoberta de Fase 0

## Contexto

O master plan originalmente propunha `workers/gov-workers/` (diretório de primeiro nível paralelo a `apps/` e `packages/`). Inspeção do repo revelou que:

- `pnpm-workspace.yaml` usa **apenas** os globs `apps/*` e `packages/*`.
- Os workers do Licitagram atual vivem em `packages/workers/` (não `workers/licitagram-workers/` como o master plan presumia).
- Não há diretório `workers/` no monorepo.

Adicionar um glob `workers/*` ao workspace funcionaria, mas quebraria a convenção existente sem benefício funcional.

## Decisão

Seguir a convenção do repo: `packages/gov-workers/`. RI-6 continua válida — todas queues usam `prefix: 'licitagov:'` para isolar keys Redis do `packages/workers` atual (que não tem prefixo global).

Redis é compartilhado (uma `REDIS_URL`), prefixo é o isolador.

## Consequências

**Positivas**:
- Zero alteração em `pnpm-workspace.yaml` ou `turbo.json`.
- Convenção uniforme — todos workspaces viram em `apps/` ou `packages/`.
- CI reconhece `@licitagram/gov-workers` automaticamente.

**Negativas**:
- Divergência do master plan que precisa ser comunicada em docs/internal/architecture.md.
- Se no futuro quisermos separar fisicamente workers (VPS dedicada), precisamos de script de build/start que selecione só `packages/gov-workers` — já é o caso com filter do pnpm (`pnpm --filter @licitagram/gov-workers start`).

## Sanity check em CI

Job `ri6-queue-prefix` em `.github/workflows/ci.yml` faz grep `grep -RnE "new (Queue|Worker)\(" packages/gov-workers/src` e falha se houver instanciação fora de `createGovQueue`/`createGovWorker`.
