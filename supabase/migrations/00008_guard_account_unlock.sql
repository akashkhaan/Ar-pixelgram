-- ============================================================================
--  Pixelgram — Account unlock guard (v4, final)
--  Applied to: project ojctcqahhkdehtgffzvx (arpixelgram, ap-south-1)
--
--  Problem jo fix ho rahi hai:
--    * Browser reload / tab focus / token refresh / email link click par
--      account apne aap unlock ho jaata tha (SIGNED_IN event + client-side
--      profiles.update). Yaani OTP ki zaroorat hi nahi padti thi.
--
--  Rule (database level — app ka purana bundle bhi isse nahi bach sakta):
--    account_status / is_suspended / status_reason / status_updated_at
--    sirf in teen sooraton me badal sakta hai:
--      1) service_role  (edge function / server)
--      2) admin         (profiles.is_admin = true) — sirf doosre user ke liye
--      3) khud ka account + session sach me OTP verify karke bana ho
--         (JWT amr claim: method=otp aur 15 minute ke andar)
--    is_admin badalne ke liye: sirf service_role ya admin (doosre user ka).
--    Koi bhi aur koshish => error 42501.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.account_unlock_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  method      text not null,
  actor_id    uuid,
  amr_method  text,
  unlocked_at timestamptz not null default now()
);

create index if not exists account_unlock_logs_user_idx
  on public.account_unlock_logs (user_id, unlocked_at desc);

alter table public.account_unlock_logs enable row level security;
revoke all on public.account_unlock_logs from anon, authenticated;

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
-- 2. THE GUARD (SECURITY INVOKER — DEFINER me current_user owner ban jaata
--    hai aur check bypass ho jaata hai)
-- ---------------------------------------------------------------------------
create or replace function public.guard_account_status_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  db_role         text := current_user;
  jwt_role        text := coalesce(current_setting('request.jwt.claim.role', true), '');
  claims          jsonb := '{}'::jsonb;
  amr_item        jsonb;
  amr_method      text;
  amr_ts          timestamptz;
  fresh_otp       boolean := false;
  caller          uuid := null;
  caller_is_admin boolean := false;
  status_changed  boolean;
  admin_changed   boolean;
begin
  -- (1) trusted server paths: edge function / dashboard / migration / cron
  if jwt_role = 'service_role'
     or db_role in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  status_changed := (new.account_status    is distinct from old.account_status)
                 or (new.is_suspended      is distinct from old.is_suspended)
                 or (new.status_reason     is distinct from old.status_reason)
                 or (new.status_updated_at is distinct from old.status_updated_at);

  admin_changed := (new.is_admin is distinct from old.is_admin);

  -- normal profile edit (naam, bio, photo, hello tune...) => koi rok nahi
  if not status_changed and not admin_changed then
    return new;
  end if;

  begin
    claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  exception when others then
    claims := '{}'::jsonb;
  end;

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

  -- (2) admin panel: admin doosre user ko lock/unlock/ban kar sakta hai,
  --     aur doosre user ko admin bana/haTa sakta hai. Apna hi is_admin
  --     ya apna hi status change karna is raste se nahi hoga.
  if caller_is_admin and caller is not null and caller <> old.user_id then
    perform public.log_account_unlock(old.user_id, 'admin_panel', caller, null);
    return new;
  end if;

  -- (3) user ne khud OTP verify kiya (email code / magic link / SMS code)
  if status_changed
     and fresh_otp
     and caller is not null
     and caller = old.user_id
     and new.account_status = 'active' then
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

-- purane/adhoore guard agar bane ho
drop trigger if exists trg_prevent_client_account_status_change on public.profiles;
drop function if exists public.prevent_client_account_status_change();

commit;
