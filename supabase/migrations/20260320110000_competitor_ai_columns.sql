ALTER TABLE competitor_stats ADD COLUMN IF NOT EXISTS segmento_ia TEXT;
ALTER TABLE competitor_stats ADD COLUMN IF NOT EXISTS nivel_ameaca TEXT CHECK (nivel_ameaca IN ('alto', 'medio', 'baixo'));
CREATE INDEX IF NOT EXISTS idx_competitor_stats_segmento ON competitor_stats(segmento_ia);
