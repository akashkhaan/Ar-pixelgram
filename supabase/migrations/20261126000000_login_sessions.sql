-- ============================================================================
--  Accounts Center > "Where you're logged in" (Facebook-style login activity)
--  Har device apni hi row likhta hai (user_devices). Kisi device ko remote
--  logout karne par uski row me logged_out_at set hota hai, aur woh device
--  agle check par khud sign out ho jaata hai.
-- ============================================================================
alter table public.user_devices add column if not exists logged_in_at timestamptz default now();
alter table public.user_devices add column if not exists platform text;
alter table public.user_devices add column if not exists region text;

grant select, insert, update on public.user_devices to authenticated;

drop policy if exists "own devices insert" on public.user_devices;
create policy "own devices insert" on public.user_devices for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own devices update" on public.user_devices;
create policy "own devices update" on public.user_devices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
