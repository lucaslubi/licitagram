-- Create the unified in-app notifications table
-- Used by the bell dropdown in the dashboard header and by all worker notification processors
-- (notification.processor.ts, whatsapp-notification.processor.ts) via lib/create-notification.ts

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  type text not null check (type in (
    'new_match',
    'hot_match',
    'urgency',
    'certidao_expiring',
    'certidao_expired',
    'proposal_generated',
    'outcome_prompt',
    'bot_session_completed',
    'impugnation_deadline',
    'weekly_report',
    'system'
  )),
  title text not null,
  body text not null,
  link text,
  metadata jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_id_read_idx
  on public.notifications (user_id, read)
  where read = false;

create index if not exists notifications_company_id_idx
  on public.notifications (company_id);

-- RLS: users can only see their own notifications
alter table public.notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

-- Service role can do anything (workers insert via service role key, bypassing RLS)
drop policy if exists "Service role full access" on public.notifications;
create policy "Service role full access"
  on public.notifications for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');
