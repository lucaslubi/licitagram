# ADR-0003: Drizzle ORM (isolado em `gov-core`), não Prisma, não Supabase-client puro

- **Status**: Aceito
- **Data**: 2026-04-18
- **Referências**: D-4 do master plan

## Contexto

`apps/web` atual usa `@supabase/supabase-js` direto — sem ORM. Funciona mas não dá type-safety no schema, e já vimos bugs de `column_name` inconsistente.

Para o novo schema `licitagov.*` (com ~16 tabelas e relações cruzadas) precisamos de algo mais estruturado. Opções:

1. **Prisma** — ecossistema maduro, mas generator pesado, runtime próprio, migrations divergentes de `packages/supabase/migrations/*.sql`.
2. **Drizzle** — type-safe sem runtime, schema-first em TypeScript, introspecta `schemaFilter: ['licitagov']`, SQL-like API.
3. **Supabase-client puro** — consistente com `apps/web`, mas zero tipos do schema.

## Decisão

Drizzle, isolado em `packages/gov-core`. Config em `packages/gov-core/drizzle.config.ts` com `schemaFilter: ['licitagov']` — nunca enxerga tabelas `public.*`. `apps/gov` também pode usar Drizzle via import de `@licitagram/gov-core/db`, mas mantém `@supabase/ssr` para auth (cookies, sessão). `apps/web` **não muda**.

## Consequências

**Positivas**:
- Type-safety completa no schema gov.
- Queries SQL-like legíveis (`db.select().from(orgaos).where(...)`).
- Zero impacto em `apps/web`.
- `drizzle-kit introspect` permite auditar divergência schema-vs-código.

**Negativas**:
- Duas formas de falar com o DB convivem no monorepo — desenvolvedores precisam saber qual usar por contexto.
- RLS ainda passa pelo JWT Supabase; Drizzle apenas monta SQL, auth/policies é Supabase.
- Migrations SQL permanecem em `packages/supabase/migrations/*.sql` (não `drizzle generate`) — gov-core mapeia o que a migration cria. Divergência possível se alguém altera um sem o outro; mitigação por code review e CI que roda `drizzle-kit introspect` no futuro.
