-- Add columns for riscos, acoes_necessarias, and recomendacao to matches table
-- These fields are already returned by the AI matcher but were being discarded

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS riscos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS acoes_necessarias JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recomendacao TEXT;
