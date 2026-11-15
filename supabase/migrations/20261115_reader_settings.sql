-- Fechamento do mês (print reader): each person's reader settings, e.g. the lines with no print
-- ("Sara" at Nubank) that come back every month. Same on every device, private to the owner.
create table if not exists public.reader_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.reader_settings enable row level security;
drop policy if exists "Users manage own reader settings" on public.reader_settings;
create policy "Users manage own reader settings" on public.reader_settings
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.reader_settings from anon;
