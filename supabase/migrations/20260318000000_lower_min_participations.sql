-- NOTE: The production competitor_stats table uses Portuguese column names
-- (total_participacoes, razao_social, etc.) which differ from the column names
-- in 20260317100000_competitive_intelligence.sql (English names). The production
-- schema was created separately and the materialize_competitor_stats function
-- already uses HAVING COUNT(*) >= 1 in production.
--
-- This migration is kept as a no-op safety net. If the production function
-- ever gets reset to >= 3, re-apply the correct function below.
--
-- Production column mapping:
--   cnpj, razao_social, porte, cnae_divisao, uf,
--   total_participacoes, total_vitorias, win_rate,
--   valor_total_ganho, desconto_medio,
--   modalidades, ufs_atuacao, orgaos_frequentes,
--   ultima_participacao, updated_at

-- No-op: production already has HAVING >= 1
SELECT 1;
