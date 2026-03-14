-- WhatsApp Integration: verification table + user phone column

-- Add whatsapp_number column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
CREATE INDEX IF NOT EXISTS idx_users_whatsapp ON public.users(whatsapp_number) WHERE whatsapp_number IS NOT NULL;

-- Update notification_preferences default to include whatsapp
ALTER TABLE public.users
  ALTER COLUMN notification_preferences
  SET DEFAULT '{"email": true, "telegram": true, "whatsapp": false}'::jsonb;

-- WhatsApp verification codes table
CREATE TABLE IF NOT EXISTS public.whatsapp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_verify_user ON public.whatsapp_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_verify_expires ON public.whatsapp_verifications(expires_at);

ALTER TABLE public.whatsapp_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_verif_own" ON public.whatsapp_verifications
    FOR ALL USING (user_id = auth.uid());
