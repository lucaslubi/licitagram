-- Add `bidding_bot_supreme` to every plan's features JSONB so the feature
-- check lights up for enterprise tiers and stays off for lower ones.
--
-- Naming: bidding_bot_supreme is STRICTLY superior to bidding_bot. The old
-- key stays for backward compatibility.

-- Default: off for trial / starter.
UPDATE public.plans
SET features = features || '{"bidding_bot_supreme": false}'::jsonb
WHERE slug IN ('trial', 'starter');

-- On for professional / enterprise (if they already have bidding_bot).
UPDATE public.plans
SET features = features || '{"bidding_bot_supreme": true}'::jsonb
WHERE slug IN ('professional', 'enterprise');

NOTIFY pgrst, 'reload schema';
