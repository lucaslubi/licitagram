-- Add PNCP and ComprasGov as valid portal options
-- Also add 'bec' to bot_configs and 'auto' to bot_sessions

ALTER TABLE public.bot_configs DROP CONSTRAINT IF EXISTS bot_configs_portal_check;
ALTER TABLE public.bot_configs ADD CONSTRAINT bot_configs_portal_check
  CHECK (portal IN ('comprasnet','bll','portal_compras','licitacoes_e','pncp','comprasgov','bec'));

ALTER TABLE public.bot_sessions DROP CONSTRAINT IF EXISTS bot_sessions_portal_check;
ALTER TABLE public.bot_sessions ADD CONSTRAINT bot_sessions_portal_check
  CHECK (portal IN ('comprasnet','bll','portal_compras','licitacoes_e','pncp','comprasgov','bec','auto'));

-- Expand action_type to include new types used by the worker
ALTER TABLE public.bot_actions DROP CONSTRAINT IF EXISTS bot_actions_action_type_check;
ALTER TABLE public.bot_actions ADD CONSTRAINT bot_actions_action_type_check
  CHECK (action_type IN (
    'login','login_attempt','login_success','search','bid','message','error','completed',
    'session_start','session_completed','session_failed','session_stopped',
    'strategy_configured','price_fetch_failed','price_error','bid_calc_error',
    'bid_below_min','skip_round'
  ));
