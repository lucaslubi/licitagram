-- ============================================================
-- PRICE REFERENCES: Multi-source price intelligence
--
-- Stores price data from multiple external sources for
-- cross-validation and government-grade confidence scoring.
--
-- Sources: PNCP items, Dados Abertos, Painel de Preços, BPS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.price_references (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- What was purchased
  descricao TEXT NOT NULL,
  catmat_catser TEXT,               -- CATMAT/CATSER code if available
  unidade_medida TEXT,
  quantidade NUMERIC(15,4),

  -- Price data
  valor_unitario NUMERIC(15,4) NOT NULL,
  valor_total NUMERIC(15,4),

  -- Source info
  fonte TEXT NOT NULL CHECK (fonte IN (
    'pncp', 'pncp_item', 'dados_abertos', 'painel_precos',
    'bps_saude', 'comprasnet', 'manual'
  )),
  fonte_id TEXT,                    -- ID in the source system
  fonte_url TEXT,                   -- URL to verify in source

  -- Supplier
  cnpj_fornecedor TEXT,
  nome_fornecedor TEXT,
  porte_fornecedor TEXT,

  -- Context
  orgao_nome TEXT,
  orgao_uf CHAR(2),
  modalidade TEXT,
  data_referencia TIMESTAMPTZ NOT NULL, -- When this price was practiced
  data_captura TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Quality
  confiabilidade NUMERIC(3,2) DEFAULT 1.0 CHECK (confiabilidade BETWEEN 0 AND 1),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for search
CREATE INDEX IF NOT EXISTS idx_price_ref_descricao_fts
  ON public.price_references USING gin(to_tsvector('portuguese', descricao));
CREATE INDEX IF NOT EXISTS idx_price_ref_catmat
  ON public.price_references(catmat_catser) WHERE catmat_catser IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_ref_fonte
  ON public.price_references(fonte);
CREATE INDEX IF NOT EXISTS idx_price_ref_data
  ON public.price_references(data_referencia DESC);
CREATE INDEX IF NOT EXISTS idx_price_ref_valor
  ON public.price_references(valor_unitario);

-- RLS: readable by all authenticated users
ALTER TABLE public.price_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_ref_select_authenticated" ON public.price_references
  FOR SELECT USING (auth.role() = 'authenticated');
