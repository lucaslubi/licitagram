-- Move per-company settings from users to companies table
-- min_score, ufs_interesse, palavras_chave_filtro are company-specific
-- notification_preferences, telegram_chat_id stay on users (personal)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS min_score INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS ufs_interesse TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS palavras_chave_filtro TEXT[] DEFAULT '{}';

-- Migrate existing data: copy settings from the user who owns each company
UPDATE public.companies c
SET
  min_score = COALESCE(u.min_score, 50),
  ufs_interesse = COALESCE(u.ufs_interesse, '{}'),
  palavras_chave_filtro = COALESCE(u.palavras_chave_filtro, '{}')
FROM public.users u
WHERE u.company_id = c.id;

-- Also migrate from user_companies junction table
UPDATE public.companies c
SET
  min_score = COALESCE(sub.min_score, c.min_score, 50),
  ufs_interesse = CASE WHEN c.ufs_interesse = '{}' THEN COALESCE(sub.ufs_interesse, '{}') ELSE c.ufs_interesse END,
  palavras_chave_filtro = CASE WHEN c.palavras_chave_filtro = '{}' THEN COALESCE(sub.palavras_chave_filtro, '{}') ELSE c.palavras_chave_filtro END
FROM (
  SELECT uc.company_id, u.min_score, u.ufs_interesse, u.palavras_chave_filtro
  FROM public.user_companies uc
  JOIN public.users u ON u.id = uc.user_id
) sub
WHERE sub.company_id = c.id
  AND (c.min_score IS NULL OR c.min_score = 50);
