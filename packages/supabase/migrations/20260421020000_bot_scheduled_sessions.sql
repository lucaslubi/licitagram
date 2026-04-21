-- ============================================================
-- Bot Supreme: agendamento de sessões de lance
-- ============================================================
-- Permite criar sessões de lance em lote com horário de início específico
-- (scheduled_at). Watchdog detecta sessões com scheduled_at <= now() e
-- status='scheduled' → promove pra 'pending' + enfileira execução.
-- ============================================================

-- 1. Coluna scheduled_at — quando a sessão deve começar.
ALTER TABLE public.bot_sessions
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- 2. Expandir CHECK constraint do status pra incluir 'scheduled'.
DO $$
DECLARE _cname TEXT;
BEGIN
  FOR _cname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.bot_sessions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.bot_sessions DROP CONSTRAINT IF EXISTS %I', _cname);
  END LOOP;
END $$;

ALTER TABLE public.bot_sessions
  ADD CONSTRAINT bot_sessions_status_check
  CHECK (status IN (
    'scheduled', 'pending', 'active', 'paused',
    'completed', 'failed', 'cancelled'
  ));

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_bot_sessions_scheduled_due
  ON public.bot_sessions (scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_bot_sessions_company_status
  ON public.bot_sessions (company_id, status, scheduled_at DESC);

-- 4. RPC: bulk_create_bot_sessions
--    Implementação 100% LANGUAGE sql (sem PL/pgSQL) usando CTEs.
--    Evita o bug do parser do Supabase que trata variáveis locais como
--    nomes de relação em SELECT INTO (v_* E _* falham).
--
--    Estratégia:
--    1. Decompõe input JSONB em linhas via jsonb_array_elements WITH ORDINALITY
--    2. Valida config_id pertence à company (LEFT JOIN)
--    3. Checa idempotency existente (LEFT JOIN com bot_sessions)
--    4. INSERT condicional via INSERT ... SELECT ... WHERE
--    5. UNION dos 3 casos (error / deduped / created) pro retorno
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
      (t.item->>'portal')                     AS portal,
      COALESCE(t.item->'strategy_config', '{}'::jsonb) AS strategy_config,
      NULLIF(t.item->>'min_price', '')::NUMERIC       AS min_price,
      NULLIF(t.item->>'max_bids', '')::INTEGER        AS max_bids,
      COALESCE(t.item->>'mode', 'supervisor') AS mode,
      (t.item->>'idempotency_key')            AS idempotency_key,
      NULLIF(t.item->>'scheduled_at', '')::TIMESTAMPTZ AS scheduled_at
    FROM jsonb_array_elements(p_sessions) WITH ORDINALITY AS t(item, ord)
  ),
  -- Valida que config_id existe e pertence à company
  with_validation AS (
    SELECT
      i.*,
      (bc.id IS NOT NULL) AS config_valid
    FROM inputs i
    LEFT JOIN public.bot_configs bc
      ON bc.id = i.config_id
     AND bc.company_id = p_company_id
  ),
  -- Verifica sessão existente por idempotency
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
  -- INSERT condicional: só linhas com config válido E sem duplicata
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
  -- Compõe resultado: errors + deduped + created, preservando ordem
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
  'Cria múltiplas bot_sessions em transação (LANGUAGE sql puro pra evitar bug do parser PL/pgSQL do Supabase). Decide status automaticamente entre scheduled/pending baseado em scheduled_at. Retorna status por item (created/deduped/error).';
