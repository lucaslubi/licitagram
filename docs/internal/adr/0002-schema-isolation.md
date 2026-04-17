# ADR-0002: Isolamento por schema Postgres `licitagov.*`

- **Status**: Aceito
- **Data**: 2026-04-18
- **Decisor**: Lucas de Lima
- **Referências**: D-3, RI-3, RI-4 do master plan

## Contexto

LicitaGram Gov precisa de suas próprias tabelas (órgãos, setores, PCA, processos, artefatos, riscos, preços). Três opções:

1. **Projeto Supabase separado** — zero risco, mas perde sinergia de dados com o Licitagram atual (histórico PNCP, embeddings).
2. **Schema dedicado `licitagov.*` no mesmo Supabase** — isolamento lógico, uma `DATABASE_URL`, VIEWs cross-schema read-only permitidas.
3. **Mesmas tabelas em `public.*`** — descartado (risco óbvio de regressão).

## Decisão

Opção 2. Todas tabelas novas vivem em `licitagov.*`. VIEWs read-only em `licitagov.v_*` podem referenciar `public.*` — sem nenhum `INSERT/UPDATE/DELETE` em `public.*` a partir do novo código (RI-4).

Primeira VIEW criada: `licitagov.v_historico_pncp` sobre `public.tenders` (editais analisados), consumida pelo Basket Builder da Fase 6.

`v_cnpj_publico` (base RFB) está prevista no master plan, mas a tabela `public.cnpj_rfb` ainda não existe neste repo — adiada para quando o pipeline de ingestão RFB existir.

## Consequências

**Positivas**:
- Gov consome dados do Licitagram sem risco de regressão.
- Usuário único (`service_role`) tem permissão em ambos schemas.
- Migrations convivem em `packages/supabase/migrations/`, ordenadas por timestamp.
- Audit log (`licitagov.audit_log`) via trigger genérico em todas tabelas de negócio (RI-9).

**Negativas**:
- RLS policies precisam ser escritas explicitamente para cada tabela gov (trabalho repetitivo, feito nas fases seguintes).
- Ferramentas (`supabase db reset`) afetam os dois schemas juntos — não há granularidade por-produto.
- Migração eventual para DB separado exige export/import planejado.
