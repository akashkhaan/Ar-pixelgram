-- Access token feature (Facebook-style): tokens, devices, OTPs, admin config
alter table public.profiles add column if not exists country text;

create table if not exists public.user_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  device_id text not null,
  device_name text,
  country text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz
);
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text,
  user_agent text,
  ip text,
  country text,
  city text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logged_out_at timestamptz,
  unique (user_id, device_id)
);
create table if not exists public.access_token_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  device_id text not null,
  device_name text,
  country text,
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);
create table if not exists public.app_token_config (
  id int primary key default 1 check (id = 1),
  current_token text,
  generated_by uuid,
  generated_at timestamptz
);
insert into public.app_token_config (id) values (1) on conflict do nothing;

grant select on public.user_access_tokens to authenticated;
grant select on public.user_devices to authenticated;
grant all on public.user_access_tokens, public.user_devices, public.access_token_otps, public.app_token_config to service_role;

alter table public.user_access_tokens enable row level security;
alter table public.user_devices enable row level security;
alter table public.access_token_otps enable row level security;
alter table public.app_token_config enable row level security;

create policy "own tokens read" on public.user_access_tokens for select to authenticated using (auth.uid() = user_id);
create policy "own devices read" on public.user_devices for select to authenticated using (auth.uid() = user_id);
-- access_token_otps and app_token_config: service role only (no policies)
