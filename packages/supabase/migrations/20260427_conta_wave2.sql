-- Wave 2 — /conta self-service: perfil columns + session helpers
-- Apply via Supabase Dashboard SQL editor.

-- 1. Profile columns on public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Storage bucket for avatars (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — users manage their own avatar under {user_id}/...
DROP POLICY IF EXISTS "avatars_read_public" ON storage.objects;
CREATE POLICY "avatars_read_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_write_own" ON storage.objects;
CREATE POLICY "avatars_write_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Sessions helper: list current user's auth.sessions
-- (auth schema is not exposed via PostgREST, so we wrap in SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.list_my_sessions()
RETURNS TABLE (
  id UUID,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  not_after TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT s.id, s.user_agent, s.ip::text, s.created_at, s.updated_at, s.not_after
  FROM auth.sessions s
  WHERE s.user_id = auth.uid()
  ORDER BY s.updated_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_sessions() TO authenticated;

-- Revoke a single session (own user only)
CREATE OR REPLACE FUNCTION public.revoke_my_session(target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  found INTEGER;
BEGIN
  DELETE FROM auth.sessions
   WHERE id = target_id
     AND user_id = auth.uid();
  GET DIAGNOSTICS found = ROW_COUNT;
  RETURN found > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_my_session(UUID) TO authenticated;

-- Revoke all OTHER sessions (keeps caller's current session)
CREATE OR REPLACE FUNCTION public.revoke_other_sessions(current_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM auth.sessions
   WHERE user_id = auth.uid()
     AND id <> current_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_other_sessions(UUID) TO authenticated;
