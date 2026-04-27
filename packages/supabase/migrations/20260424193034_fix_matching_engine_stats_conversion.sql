-- ============================================================
-- FIX: conversion_rate em matching_engine_stats
--
-- Sintoma: dashboard mostrava 0% conversão mesmo com >100 conversões
-- reais (won + applied + interested em matches.status). Causa: divisor
-- era total de matches (~292k), incluindo matches que NUNCA foram
-- notificados ao cliente. Conversão deve ser sobre o universo notificado.
--
-- Denominador novo: COUNT(*) com notified_at IS NOT NULL.
-- Numerador novo: status IN ('interested','applied','won') -- mantém
-- mesmo conjunto de "outcomes positivos" do dashboard atual.
--
-- Status enum (do schema inicial): new | notified | viewed | interested
--   | applied | won | lost | dismissed.
--
-- Mudança quebra o tipo de retorno (nova coluna notified_count), por isso
-- DROP antes de CREATE.
-- ============================================================

DROP FUNCTION IF EXISTS public.matching_engine_stats(INTEGER);

CREATE OR REPLACE FUNCTION public.matching_engine_stats(
  p_days_back INTEGER DEFAULT 7
) RETURNS TABLE (
  match_source TEXT,
  total_matches BIGINT,
  avg_score NUMERIC,
  p50_score NUMERIC,
  p90_score NUMERIC,
  auto_high_count BIGINT,
  borderline_count BIGINT,
  notified_count BIGINT,
  interested_count BIGINT,
  applied_count BIGINT,
  conversion_rate NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(m.match_source, 'unknown') AS match_source,
    COUNT(*) AS total_matches,
    ROUND(AVG(m.score)::NUMERIC, 2) AS avg_score,
    ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY m.score)::NUMERIC, 2) AS p50_score,
    ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY m.score)::NUMERIC, 2) AS p90_score,
    COUNT(*) FILTER (WHERE m.match_tier = 'auto_high') AS auto_high_count,
    COUNT(*) FILTER (WHERE m.match_tier = 'borderline') AS borderline_count,
    COUNT(*) FILTER (WHERE m.notified_at IS NOT NULL) AS notified_count,
    COUNT(*) FILTER (WHERE m.status IN ('interested', 'applied', 'won')) AS interested_count,
    COUNT(*) FILTER (WHERE m.status IN ('applied', 'won')) AS applied_count,
    ROUND(
      (COUNT(*) FILTER (WHERE m.status IN ('interested', 'applied', 'won'))::NUMERIC
       / NULLIF(COUNT(*) FILTER (WHERE m.notified_at IS NOT NULL), 0)) * 100, 2
    ) AS conversion_rate
  FROM public.matches m
  WHERE m.created_at >= (CURRENT_DATE - (p_days_back || ' days')::INTERVAL)
  GROUP BY m.match_source
  ORDER BY total_matches DESC;
$$;

GRANT EXECUTE ON FUNCTION public.matching_engine_stats(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.matching_engine_stats IS
  'Telemetria — conversion_rate v2: numerador=interested+applied+won, denominador=notified_at IS NOT NULL.';
