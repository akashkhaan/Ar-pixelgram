-- ============================================================================
--  Pixelgram — visitor_sessions (geo + device tracking)
--
--  App ka code (src/services/visitorTracking.ts) pehle se is table me log
--  karta tha, par table hi nahi thi — isliye Admin > Visitors & Devices khaali
--  tha aur "kis desh se online aaya" kabhi capture nahi hota tha.
--
--  Admin Online Users page isi table se country/city/device dikhata hai.
--  Agar koi row na ho to page phir bhi chalta hai (sirf "—" dikhta hai).
-- ============================================================================

begin;

create table if not exists public.visitor_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  username     text,
  ip           text,
  country      text,
  country_code text,
  region       text,
  city         text,
  timezone     text,
  device_name  text,
  device_type  text,
  os           text,
  browser      text,
  is_pwa       boolean default false,
  path         text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists visitor_sessions_created_idx on public.visitor_sessions (created_at desc);
create index if not exists visitor_sessions_user_idx on public.visitor_sessions (user_id, created_at desc);

alter table public.visitor_sessions enable row level security;

-- koi bhi (guest bhi) apni visit log kar sake — sirf insert
drop policy if exists "anyone can log a visit" on public.visitor_sessions;
create policy "anyone can log a visit" on public.visitor_sessions
  for insert to anon, authenticated
  with check (true);

-- padhna/delete sirf admin
drop policy if exists "admins can read visits" on public.visitor_sessions;
create policy "admins can read visits" on public.visitor_sessions
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins can delete visits" on public.visitor_sessions;
create policy "admins can delete visits" on public.visitor_sessions
  for delete to authenticated
  using (public.is_admin());

-- purane visits (60 din) saaf karne ka helper
create or replace function public.cleanup_visitor_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.visitor_sessions where created_at < now() - interval '60 days';
$$;

revoke all on function public.cleanup_visitor_sessions() from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'pixelgram_cleanup_visitor_sessions') then
      perform cron.unschedule('pixelgram_cleanup_visitor_sessions');
    end if;
    perform cron.schedule('pixelgram_cleanup_visitor_sessions', '40 3 * * *',
      'select public.cleanup_visitor_sessions();');
  end if;
exception when others then
  null;
end $$;

commit;
