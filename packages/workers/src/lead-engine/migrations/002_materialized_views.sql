-- ============================================================
-- LICITAGRAM LEAD ENGINE — Migration 002
-- Views Materializadas para Analytics Admin
-- Banco: licitagram_data (VPS2)
-- Refresh: cron diário às 04:00 (BRT)
-- ============================================================

-- 1. Top 1000 HOT leads (score >= 80, não bloqueados)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leads_top_1000_hot AS
  SELECT
    cnpj, razao_social, uf, municipio, segmento_vertical,
    score_fit_licitagram, plano_recomendado, prioridade_outreach,
    total_licitacoes_participadas_12m, total_licitacoes_ganhas_12m,
    ticket_medio_contratos, valor_total_contratos_ganhos_12m,
    licitacoes_perdidas_por_pouco, ultima_participacao_data,
    email_institucional_generico, site_institucional,
    status_outreach, motivo_qualificacao
  FROM admin_leads_fornecedores
  WHERE score_fit_licitagram >= 80
    AND bloqueado_disparo = false
    AND opt_out = false
  ORDER BY score_fit_licitagram DESC
  LIMIT 1000
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hot_cnpj ON mv_leads_top_1000_hot (cnpj);

-- 2. Contagem e score médio por UF
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leads_por_uf AS
  SELECT
    uf,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE bloqueado_disparo = false AND opt_out = false) as total_disponivel,
    AVG(score_fit_licitagram) as score_medio,
    COUNT(*) FILTER (WHERE score_fit_licitagram >= 80) as hot,
    COUNT(*) FILTER (WHERE score_fit_licitagram >= 50 AND score_fit_licitagram < 80) as warm,
    COUNT(*) FILTER (WHERE email_institucional_generico IS NOT NULL) as com_email,
    AVG(ticket_medio_contratos) as ticket_medio
  FROM admin_leads_fornecedores
  WHERE uf IS NOT NULL
  GROUP BY uf
  ORDER BY total DESC
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_uf ON mv_leads_por_uf (uf);

-- 3. Contagem e ticket médio por segmento vertical
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leads_por_segmento AS
  SELECT
    segmento_vertical,
    COUNT(*) as total,
    AVG(score_fit_licitagram) as score_medio,
    AVG(ticket_medio_contratos) as ticket_medio,
    SUM(valor_total_contratos_ganhos_12m) as valor_total_12m,
    COUNT(*) FILTER (WHERE score_fit_licitagram >= 80) as hot,
    COUNT(*) FILTER (WHERE email_institucional_generico IS NOT NULL) as com_email
  FROM admin_leads_fornecedores
  WHERE segmento_vertical IS NOT NULL
  GROUP BY segmento_vertical
  ORDER BY total DESC
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_segmento ON mv_leads_por_segmento (segmento_vertical);

-- 4. Segmento ouro: empresas que perderam 3+ licitações por margem < 5%
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leads_perderam_por_pouco AS
  SELECT
    cnpj, razao_social, uf, segmento_vertical,
    score_fit_licitagram, plano_recomendado,
    licitacoes_perdidas_por_pouco,
    total_licitacoes_participadas_12m, total_licitacoes_ganhas_12m,
    ticket_medio_contratos, email_institucional_generico,
    motivo_qualificacao
  FROM admin_leads_fornecedores
  WHERE licitacoes_perdidas_por_pouco >= 3
    AND bloqueado_disparo = false
    AND opt_out = false
  ORDER BY licitacoes_perdidas_por_pouco DESC, score_fit_licitagram DESC
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_perdas_cnpj ON mv_leads_perderam_por_pouco (cnpj);

-- 5. Fornecedores premium: ticket > R$500K, 10+ vitórias, plano ENTERPRISE
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leads_fornecedores_premium AS
  SELECT
    cnpj, razao_social, uf, municipio, segmento_vertical,
    score_fit_licitagram, ticket_medio_contratos, maior_contrato_valor,
    total_licitacoes_ganhas_total, valor_total_contratos_ganhos_total,
    orgaos_compradores_distintos_12m, email_institucional_generico,
    site_institucional, motivo_qualificacao
  FROM admin_leads_fornecedores
  WHERE ticket_medio_contratos > 500000
    AND total_licitacoes_ganhas_total >= 10
    AND plano_recomendado = 'ENTERPRISE'
    AND bloqueado_disparo = false
    AND opt_out = false
  ORDER BY valor_total_contratos_ganhos_total DESC
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_premium_cnpj ON mv_leads_fornecedores_premium (cnpj);


-- ============================================================
-- Função para refresh de todas as views
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_lead_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leads_top_1000_hot;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leads_por_uf;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leads_por_segmento;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leads_perderam_por_pouco;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leads_fornecedores_premium;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_lead_materialized_views() IS 'Refresh diário das 5 views materializadas do Lead Engine. Chamar via cron/worker às 04:00 BRT.';
