-- Site-wide settings (single-row pattern)
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1), -- always single row
  sales_mode text not null default 'implementation' check (sales_mode in ('implementation', 'self_service')),
  consultant_whatsapp text default '+5511999999999',
  consultant_message text default 'Olá! Gostaria de saber mais sobre o Licitagram.',
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

-- Insert default row
insert into public.site_settings (id, sales_mode) values (1, 'implementation')
on conflict (id) do nothing;

-- RLS
alter table public.site_settings enable row level security;

-- Anyone can read (needed for landing page)
create policy "Anyone can read site_settings" on public.site_settings
  for select using (true);

-- Only platform admins can update
create policy "Admins can update site_settings" on public.site_settings
  for update using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );
