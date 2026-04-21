-- ============================================================
-- Hotfix: bulk_create_bot_sessions — portal NOT NULL
-- ============================================================
-- Bug descoberto no teste E2E: quando payload do /api/bot/sessions/bulk
-- não traz 'portal' explícito (usuário confia no portal do bot_config),
-- o INSERT falha com:
--   "null value in column portal of relation bot_sessions violates not-null constraint"
--
-- Fix: adicionar fallback na CTE — COALESCE(i.portal, bc.portal) puxa
-- o portal do bot_config quando não vem no input JSON.
-- ============================================================

DROP FUNCTION IF EXISTS public.bulk_create_bot_sessions(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.bulk_create_bot_sessions(
  p_company_id UUID,
  p_sessions JSONB
)
RETURNS TABLE (
  result_session_id UUID,
  result_pregao_id TEXT,
  result_status TEXT,
  result_error TEXT
)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH inputs AS (
    SELECT
      t.ord,
      t.item,
      NULLIF(t.item->>'config_id', '')::UUID AS config_id,
      (t.item->>'pregao_id')                  AS pregao_id,
      NULLIF(t.item->>'tender_id', '')::UUID  AS tender_id,
      NULLIF(t.item->>'portal', '')           AS portal_input,
      COALESCE(t.item->'strategy_config', '{}'::jsonb) AS strategy_config,
      NULLIF(t.item->>'min_price', '')::NUMERIC       AS min_price,
      NULLIF(t.item->>'max_bids', '')::INTEGER        AS max_bids,
      COALESCE(t.item->>'mode', 'supervisor') AS mode,
      (t.item->>'idempotency_key')            AS idempotency_key,
      NULLIF(t.item->>'scheduled_at', '')::TIMESTAMPTZ AS scheduled_at
    FROM jsonb_array_elements(p_sessions) WITH ORDINALITY AS t(item, ord)
  ),
  -- Valida config_id + resolve portal (input OU fallback do bot_configs)
  with_validation AS (
    SELECT
      i.ord,
      i.config_id,
      i.pregao_id,
      i.tender_id,
      COALESCE(i.portal_input, bc.portal) AS portal,
      i.strategy_config,
      i.min_price,
      i.max_bids,
      i.mode,
      i.idempotency_key,
      i.scheduled_at,
      (bc.id IS NOT NULL) AS config_valid
    FROM inputs i
    LEFT JOIN public.bot_configs bc
      ON bc.id = i.config_id
     AND bc.company_id = p_company_id
  ),
  -- Idempotency check
  with_dedup AS (
    SELECT
      w.*,
      bs.id AS existing_id
    FROM with_validation w
    LEFT JOIN public.bot_sessions bs
      ON bs.company_id = p_company_id
     AND bs.idempotency_key = w.idempotency_key
     AND w.idempotency_key IS NOT NULL
  ),
  -- INSERT condicional
  inserted AS (
    INSERT INTO public.bot_sessions (
      company_id, config_id, pregao_id, tender_id, portal,
      strategy_config, min_price, max_bids, mode,
      idempotency_key, scheduled_at, status
    )
    SELECT
      p_company_id,
      d.config_id,
      d.pregao_id,
      d.tender_id,
      d.portal,
      d.strategy_config,
      d.min_price,
      d.max_bids,
      d.mode,
      d.idempotency_key,
      d.scheduled_at,
      CASE
        WHEN d.scheduled_at IS NOT NULL AND d.scheduled_at > NOW()
        THEN 'scheduled'
        ELSE 'pending'
      END
    FROM with_dedup d
    WHERE d.config_valid = TRUE
      AND d.existing_id IS NULL
    RETURNING id, pregao_id, idempotency_key
  )
  -- Resultado por linha, preservando ordem do input
  SELECT
    CASE
      WHEN d.config_valid = FALSE THEN NULL
      WHEN d.existing_id IS NOT NULL THEN d.existing_id
      ELSE ins.id
    END AS result_session_id,
    d.pregao_id AS result_pregao_id,
    CASE
      WHEN d.config_valid = FALSE THEN 'error'
      WHEN d.existing_id IS NOT NULL THEN 'deduped'
      ELSE 'created'
    END AS result_status,
    CASE
      WHEN d.config_valid = FALSE THEN 'config_id inválido pra company'
      ELSE NULL
    END AS result_error
  FROM with_dedup d
  LEFT JOIN inserted ins
    ON ins.pregao_id = d.pregao_id
   AND COALESCE(ins.idempotency_key, '') = COALESCE(d.idempotency_key, '')
  ORDER BY d.ord;
$fn$;

GRANT EXECUTE ON FUNCTION public.bulk_create_bot_sessions(UUID, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_create_bot_sessions IS
  'v2: Portal agora tem fallback pro bot_configs quando não vem no input. Evita violação de NOT NULL constraint.';
