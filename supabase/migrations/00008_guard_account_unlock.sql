-- ============================================================================
--  Pixelgram — Account Unlock Security Fix (v3)
--  Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--  (idempotent: dobara chalao to error nahi aayega)
--
--  KYUN v3:
--   * pichhla frontend "fix" adhoora tha — usme auth event (SIGNED_IN /
--     USER_UPDATED / #access_token) par auto-unlock wala code baaki tha,
--     isliye account bina OTP hi khul jaata tha.
--   * unlock ka faisla browser kar raha tha (client se profiles.update),
--     yaani console se bhi unlock ho sakta tha.
--   * saath me ye bhi mila: koi bhi logged-in user khud ko admin bana sakta
--     tha (profiles.update { is_admin: true }).
--
--  v3 ka rule (database level, app bundle purana ho tab bhi lagu):
--    account_status / is_suspended / status_reason / status_updated_at badalne ke liye
--      1) service_role (edge function / server), YA
--      2) admin (profiles.is_admin = true), YA
--      3) khud ka account + session sach me "OTP verify" karke bana ho
--         (JWT ke amr claim me method=otp aur 15 minute ke andar)
--    is_admin badalne ke liye: sirf service_role ya admin (aur wo bhi doosre ka).
--    Baaki koi bhi koshish => error 42501.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. OTP table (server-side verify ke liye; plaintext code kabhi store nahi,
--    sirf sha256 hash)
-- ---------------------------------------------------------------------------
create table if not exists public.unlock_otp_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  channel         text not null check (channel in ('email', 'phone')),
  destination     text not null,
  code_hash       text not null,
  attempts        int  not null default 0,
  max_attempts    int  not null default 5,
  last_attempt_at timestamptz,
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists unlock_otp_requests_user_idx
  on public.unlock_otp_requests (user_id, created_at desc);

alter table public.unlock_otp_requests enable row level security;
revoke all on public.unlock_otp_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.account_unlock_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  method      text not null,
  actor_id    uuid,
  amr_method  text,
  unlocked_at timestamptz not null default now()
);

alter table public.account_unlock_logs enable row level security;
revoke all on public.account_unlock_logs from anon, authenticated;

-- logging helper (definer, taaki trigger se insert ho sake)
create or replace function public.log_account_unlock(
  p_user_id uuid, p_method text, p_actor uuid, p_amr text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.account_unlock_logs (user_id, method, actor_id, amr_method)
  values (p_user_id, p_method, p_actor, p_amr);
$$;

revoke all on function public.log_account_unlock(uuid, text, uuid, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. THE GUARD  (SECURITY INVOKER zaroori hai — DEFINER me current_user
--    function owner ban jaata hai aur check bypass ho jaata hai)
-- ---------------------------------------------------------------------------
create or replace function public.guard_account_status_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  db_role          text := current_user;
  jwt_role         text := coalesce(current_setting('request.jwt.claim.role', true), '');
  claims           jsonb := '{}'::jsonb;
  amr_item         jsonb;
  amr_method       text;
  amr_ts           timestamptz;
  fresh_otp        boolean := false;
  caller           uuid := null;
  caller_is_admin  boolean := false;
  status_changed   boolean;
  admin_changed    boolean;
begin
  -- (1) trusted server paths: edge function / dashboard / migration
  if jwt_role = 'service_role'
     or db_role in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  status_changed := (new.account_status    is distinct from old.account_status)
                 or (new.is_suspended      is distinct from old.is_suspended)
                 or (new.status_reason     is distinct from old.status_reason)
                 or (new.status_updated_at is distinct from old.status_updated_at);

  admin_changed := (new.is_admin is distinct from old.is_admin);

  -- kuch sensitive change nahi (bio, avatar, name...) => allowed
  if not status_changed and not admin_changed then
    return new;
  end if;

  begin
    claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  exception when others then
    claims := '{}'::jsonb;
  end;

  -- caller id: auth.uid() ki jagah claims se (auth schema dependency se bachne ke liye)
  begin
    caller := nullif(claims ->> 'sub', '')::uuid;
  exception when others then
    caller := null;
  end;

  for amr_item in
    select value from jsonb_array_elements(coalesce(claims -> 'amr', '[]'::jsonb))
  loop
    if coalesce(amr_item ->> 'method', '') in ('otp', 'email_otp', 'sms_otp') then
      begin
        amr_ts := to_timestamp(coalesce((amr_item ->> 'timestamp')::bigint, 0));
      exception when others then
        amr_ts := null;
      end;
      if amr_ts is not null and amr_ts > now() - interval '15 minutes' then
        fresh_otp := true;
        amr_method := amr_item ->> 'method';
      end if;
    end if;
  end loop;

  select coalesce(p.is_admin, false) into caller_is_admin
  from public.profiles p where p.user_id = caller;

  -- (2) admin panel se lock/unlock/page
  if status_changed and caller_is_admin and caller is not null then
    perform public.log_account_unlock(old.user_id, 'admin_panel', caller, null);
    return new;
  end if;

  -- (3) user ne khud OTP verify kiya (email code / email link / SMS code)
  if status_changed
     and fresh_otp
     and new.account_status = 'active'
     and (claims ->> 'sub')::uuid = old.user_id then
    perform public.log_account_unlock(old.user_id, 'otp_verified_session', caller, amr_method);
    return new;
  end if;

  if admin_changed then
    raise exception 'Admin role sirf doosre admin ya server badal sakta hai.'
      using errcode = '42501';
  end if;

  raise exception 'Account status sirf OTP verify ke baad badal sakta hai. Bina OTP unlock nahi hoga.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_guard_account_status on public.profiles;
create trigger trg_guard_account_status
  before update on public.profiles
  for each row
  execute function public.guard_account_status_change();

-- purana v1 ka guard (agar bana tha)
drop trigger if exists trg_prevent_client_account_status_change on public.profiles;
drop function if exists public.prevent_client_account_status_change();

-- ---------------------------------------------------------------------------
-- 4. cleanup (7 din purane OTP rows)
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_unlock_otp_requests()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.unlock_otp_requests
  where created_at < now() - interval '7 days';
$$;

revoke all on function public.cleanup_unlock_otp_requests() from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'pixelgram_cleanup_unlock_otp') then
      perform cron.unschedule('pixelgram_cleanup_unlock_otp');
    end if;
    perform cron.schedule('pixelgram_cleanup_unlock_otp', '15 3 * * *',
      'select public.cleanup_unlock_otp_requests();');
    raise notice 'pg_cron: pixelgram_cleanup_unlock_otp set';
  else
    raise notice 'pg_cron nahi hai — cleanup manual: select public.cleanup_unlock_otp_requests();';
  end if;
exception when others then
  raise notice 'cron skip: %', sqlerrm;
end $$;

commit;

-- ============================================================================
--  VERIFY
-- ============================================================================
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('unlock_otp_requests','account_unlock_logs');

select tgname, tgenabled from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;

select account_status, count(*) from public.profiles group by account_status;

-- asli test (Error aana chahiye: "Bina OTP unlock nahi hoga"):
-- update public.profiles set account_status='active' where user_id='<locked-user-uuid>';
