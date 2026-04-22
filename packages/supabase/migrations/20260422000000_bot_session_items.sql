-- ============================================================
-- Bot Session Items — piso e flag "ativo" por ITEM de pregão
-- ============================================================
-- Motivação: um pregão pode ter N itens (canetas, computadores, papel,
-- etc) e cada um tem seu valor de mercado próprio. Usar o mesmo piso pra
-- todos não faz sentido na vida real — o robô precisa saber pra cada item:
--   - Qual o piso mínimo?
--   - Devo operar nesse item ou pular?
--
-- Fluxo:
--   1. User escolhe o pregão na UI
--   2. Front chama /api/bot/pregao-preview → lista de itens do Compras
--   3. User preenche piso de cada item (ou desmarca itens que não quer)
--   4. Submit cria bot_session + bot_session_items (um por item configurado)
--   5. Runner carrega o mapa e aplica piso específico no evaluateBid
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  item_numero INTEGER NOT NULL,
  piso NUMERIC(14, 4),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  descricao TEXT,
  valor_estimado NUMERIC(14, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, item_numero)
);

CREATE INDEX IF NOT EXISTS idx_bot_session_items_session
  ON public.bot_session_items (session_id);

-- RLS: só própria empresa via session join
ALTER TABLE public.bot_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_session_items_own" ON public.bot_session_items;
CREATE POLICY "bot_session_items_own" ON public.bot_session_items
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.bot_sessions
       WHERE company_id IN (
         SELECT company_id FROM public.users WHERE id = auth.uid()
       )
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.bot_sessions
       WHERE company_id IN (
         SELECT company_id FROM public.users WHERE id = auth.uid()
       )
    )
  );

DROP POLICY IF EXISTS "bot_session_items_service_role" ON public.bot_session_items;
CREATE POLICY "bot_session_items_service_role" ON public.bot_session_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.bot_session_items IS
  'Configuração de piso e ativo por ITEM de um pregão. Se uma sessão não tem linhas aqui, o runner usa o session.min_price pra todos os itens (fallback legacy).';
