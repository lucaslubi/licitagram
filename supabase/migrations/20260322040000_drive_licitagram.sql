-- Drive Licitagram - Institutional document repository
-- Supabase Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'drive',
  'drive',
  false,
  52428800, -- 50MB max
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for the drive bucket
CREATE POLICY "Users can upload to own company folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'drive' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM companies WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can view own company files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'drive' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM companies WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own company files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'drive' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM companies WHERE user_id = auth.uid()
  )
);

-- Drive files metadata table
CREATE TABLE IF NOT EXISTS public.drive_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- File info
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- pdf, image, doc, spreadsheet, other
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL, -- bytes
  storage_path TEXT NOT NULL, -- path in Supabase storage bucket

  -- Organization
  folder TEXT DEFAULT '/', -- virtual folder path
  category TEXT NOT NULL DEFAULT 'geral', -- geral, edital, certidao, proposta, contrato, analise, consultor
  tags TEXT[] DEFAULT '{}',

  -- Context (links to other entities)
  tender_id UUID REFERENCES public.tenders(id) ON DELETE SET NULL,

  -- Metadata
  description TEXT,
  source TEXT DEFAULT 'upload', -- upload, consultor_ia, certidao_auto, sistema
  is_starred BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_drive_files_company ON drive_files(company_id);
CREATE INDEX idx_drive_files_folder ON drive_files(company_id, folder);
CREATE INDEX idx_drive_files_category ON drive_files(company_id, category);
CREATE INDEX idx_drive_files_tender ON drive_files(tender_id);
CREATE INDEX idx_drive_files_search ON drive_files USING gin(to_tsvector('portuguese', coalesce(file_name, '') || ' ' || coalesce(description, '')));

-- RLS
ALTER TABLE drive_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company files"
ON drive_files FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own company files"
ON drive_files FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own company files"
ON drive_files FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own company files"
ON drive_files FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Usage stats view
CREATE OR REPLACE VIEW drive_usage AS
SELECT
  company_id,
  COUNT(*) as total_files,
  SUM(file_size) as total_bytes,
  COUNT(DISTINCT folder) as total_folders,
  COUNT(*) FILTER (WHERE category = 'edital') as editais,
  COUNT(*) FILTER (WHERE category = 'certidao') as certidoes,
  COUNT(*) FILTER (WHERE category = 'proposta') as propostas,
  COUNT(*) FILTER (WHERE category = 'analise') as analises,
  COUNT(*) FILTER (WHERE category = 'consultor') as consultor_ia,
  MAX(created_at) as last_upload
FROM drive_files
GROUP BY company_id;
