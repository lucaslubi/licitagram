-- Price History Phase 3: Performance indexes for price search queries
-- These indexes optimize the full-text search and filtering on tenders + competitors tables.

-- GIN index on tenders.objeto for full-text search (Portuguese config)
CREATE INDEX IF NOT EXISTS idx_tenders_objeto_fts
  ON tenders USING GIN (to_tsvector('portuguese', objeto));

-- Index on tenders.data_encerramento DESC for sorting by most recent
CREATE INDEX IF NOT EXISTS idx_tenders_data_encerramento_desc
  ON tenders (data_encerramento DESC NULLS LAST);

-- Composite index for common filter combinations (UF + modalidade + date)
CREATE INDEX IF NOT EXISTS idx_tenders_uf_modalidade_data
  ON tenders (uf, modalidade_nome, data_encerramento DESC NULLS LAST);

-- Index on competitors.tender_id for join performance
CREATE INDEX IF NOT EXISTS idx_competitors_tender_id
  ON competitors (tender_id);

-- Index on competitors.valor_proposta for price-based queries
CREATE INDEX IF NOT EXISTS idx_competitors_valor_proposta
  ON competitors (valor_proposta);
