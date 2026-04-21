-- ============================================================
-- Hotfix v2: bulk_create_bot_sessions — intra-batch dedup
-- ============================================================
-- Bug descoberto: quando o MESMO lote tem 2+ items com o mesmo
-- idempotency_key, o LEFT JOIN dedup só detecta duplicatas contra
-- linhas JÁ existentes em bot_sessions. Dentro do próprio batch, ambos
-- passam pelo filtro e o INSERT dispara unique constraint violation:
--   "duplicate key value violates unique constraint bot_sessions_idempotency_key_uniq"
--
-- Fix: adicionar ROW_NUMBER() OVER (PARTITION BY idempotency_key) pra
-- marcar 1ª ocorrência como válida e demais como "batch_duplicate".
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
  -- Valida config_id + resolve portal (fallback pro bot_configs)
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
  -- Dedup INTRA-BATCH: se items dentro do mesmo lote têm idempotency
  -- igual, só a 1ª ocorrência (menor ord) passa; as outras marcam
  -- batch_duplicate_rank > 1.
  with_batch_rank AS (
    SELECT
      w.*,
      CASE
        WHEN w.idempotency_key IS NULL THEN 1
        ELSE ROW_NUMBER() OVER (
          PARTITION BY w.idempotency_key
          ORDER BY w.ord
        )
      END AS batch_dup_rank
    FROM with_validation w
  ),
  -- Dedup contra bot_sessions EXISTENTES (linhas já no DB)
  with_dedup AS (
    SELECT
      b.*,
      bs.id AS existing_id
    FROM with_batch_rank b
    LEFT JOIN public.bot_sessions bs
      ON bs.company_id = p_company_id
     AND bs.idempotency_key = b.idempotency_key
     AND b.idempotency_key IS NOT NULL
  ),
  -- INSERT: só linhas válidas, sem duplicata existente, E 1ª no batch
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
      AND d.batch_dup_rank = 1
    RETURNING id, pregao_id, idempotency_key
  )
  -- Resultado preservando ordem do input
  SELECT
    CASE
      WHEN d.config_valid = FALSE THEN NULL
      WHEN d.existing_id IS NOT NULL THEN d.existing_id
      WHEN d.batch_dup_rank > 1 THEN
        -- Retorna o id da 1ª ocorrência no mesmo batch
        (SELECT ins.id FROM inserted ins
          WHERE COALESCE(ins.idempotency_key, '') = COALESCE(d.idempotency_key, '')
          LIMIT 1)
      ELSE ins.id
    END AS result_session_id,
    d.pregao_id AS result_pregao_id,
    CASE
      WHEN d.config_valid = FALSE THEN 'error'
      WHEN d.existing_id IS NOT NULL THEN 'deduped'
      WHEN d.batch_dup_rank > 1 THEN 'deduped'
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
   AND d.batch_dup_rank = 1
  ORDER BY d.ord;
$fn$;

GRANT EXECUTE ON FUNCTION public.bulk_create_bot_sessions(UUID, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_create_bot_sessions IS
  'v3: intra-batch dedup via ROW_NUMBER previne unique constraint violation quando items duplicados vêm no mesmo payload.';
