-- Blindagem de integridade: CNAEs da empresa devem ser códigos numéricos de 7 dígitos
-- Contexto: o form antigo aceitava string vazia em cnae_principal e texto livre
-- em cnaes_secundarios (ex: "Eletrônicos", "EPI"), quebrando o worker de
-- competitor_relevance. Esta migration converte dados sujos e adiciona CHECK
-- constraints para bloquear novos casos.

-- 1. Normalizar strings vazias para NULL (permite CHECK com "IS NULL OR regex")
update public.companies
set cnae_principal = null
where cnae_principal is not null and cnae_principal = '';

-- 2. Limpar cnaes_secundarios removendo itens que não são códigos de 7 dígitos
update public.companies
set cnaes_secundarios = (
  select coalesce(array_agg(item), '{}')
  from unnest(cnaes_secundarios) as item
  where item ~ '^\d{7}$'
)
where cnaes_secundarios is not null
  and exists (
    select 1 from unnest(cnaes_secundarios) as item where item !~ '^\d{7}$'
  );

-- 3. CHECK: cnae_principal, quando preenchido, deve ter exatamente 7 dígitos
alter table public.companies
  drop constraint if exists companies_cnae_principal_format;
alter table public.companies
  add constraint companies_cnae_principal_format
  check (cnae_principal is null or cnae_principal ~ '^\d{7}$');

-- 4. CHECK: cada item de cnaes_secundarios deve ter exatamente 7 dígitos
alter table public.companies
  drop constraint if exists companies_cnaes_secundarios_format;
alter table public.companies
  add constraint companies_cnaes_secundarios_format
  check (
    cnaes_secundarios is null
    or array_length(cnaes_secundarios, 1) is null
    or (select bool_and(item ~ '^\d{7}$') from unnest(cnaes_secundarios) as item)
  );
