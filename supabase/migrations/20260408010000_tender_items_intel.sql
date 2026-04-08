-- ============================================================
-- LICITAGRAM: TENDER ITEMS & PRICE INTELLIGENCE
-- ============================================================

-- Table for individual Tender Items (Produtos/Lotes)
CREATE TABLE IF NOT EXISTS public.tender_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE NOT NULL,
  numero_item INTEGER,
  descricao TEXT NOT NULL,
  quantidade NUMERIC(15,4),
  unidade_medida TEXT,
  valor_unitario_estimado NUMERIC(15,4),
  valor_total_estimado NUMERIC(15,4),
  situacao_id INTEGER,
  situacao_nome TEXT,
  categoria_nome TEXT,
  criterio_julgamento_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Table for Price History and Market Intelligence (Winners and Winning Prices)
CREATE TABLE IF NOT EXISTS public.price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE NOT NULL,
  tender_item_number INTEGER,
  cnpj_vencedor VARCHAR(14),
  nome_vencedor TEXT,
  valor_unitario_vencido NUMERIC(15,4),
  valor_total_vencido NUMERIC(15,4),
  data_homologacao TIMESTAMPTZ,
  marca TEXT,
  fabricante TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for performance on market research
CREATE INDEX IF NOT EXISTS idx_tender_items_tender_id ON public.tender_items(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_items_descricao_trgm ON public.tender_items USING gin(descricao gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_price_history_cnpj ON public.price_history(cnpj_vencedor);
CREATE INDEX IF NOT EXISTS idx_price_history_vencido ON public.price_history(valor_unitario_vencido);

-- Enable RLS for security
ALTER TABLE public.tender_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Readable by all authenticated users
CREATE POLICY "tender_items_select_authenticated" ON public.tender_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "price_history_select_authenticated" ON public.price_history
  FOR SELECT USING (auth.role() = 'authenticated');
