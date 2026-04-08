-- Add missing 'origem' column to company_documents
-- Values: 'upload' (PDF upload with AI extraction), 'manual' (manual form), 'api' (auto-fetched)
ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'manual';
