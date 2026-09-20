-- Native (APK) push: Firebase Cloud Messaging device tokens.
-- Web Push subscriptions stay in public.push_subscriptions; this table is
-- additive and only stores FCM registration tokens coming from the Android app,
-- so the send-call-push function can reach a phone even when the app is closed.

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  device_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create index if not exists device_tokens_user_id_idx on public.device_tokens(user_id);

grant select, insert, update, delete on public.device_tokens to authenticated;
grant all on public.device_tokens to service_role;

alter table public.device_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'device_tokens'
      and policyname = 'Users manage their own device tokens'
  ) then
    create policy "Users manage their own device tokens"
      on public.device_tokens
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
