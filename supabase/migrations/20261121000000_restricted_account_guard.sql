-- ============================================================================
--  Pixelgram — Restricted account (suspended/locked/disabled) guard
--  Project: ojctcqahhkdehtgffzvx
--
--  Rule (Instagram jaisa):
--    * account_status <> 'active' ya is_suspended = true  => account restricted
--    * Restricted user ko message bhejna DB level par bhi block (client bypass
--      kar bhi de to message insert nahi hoga)
--  Feed/content filtering client side hoti hai (API layer), isliye restore
--  (account_status='active') hote hi sab apne aap wapas dikhta hai.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Ek hi jagah restriction check
-- ---------------------------------------------------------------------------
create or replace function public.is_account_restricted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (coalesce(p.account_status, 'active') <> 'active') or coalesce(p.is_suspended, false)
       from public.profiles p
      where p.user_id = p_user_id),
    false
  );
$$;

revoke all on function public.is_account_restricted(uuid) from anon;
grant execute on function public.is_account_restricted(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Message guard: restricted account ko message nahi jaayega
-- ---------------------------------------------------------------------------
create or replace function public.guard_message_to_restricted()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- service role (edge functions / admin / backend) ko chhod do
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if public.is_account_restricted(new.receiver_id) then
    raise exception 'message_not_sent'
      using errcode = '42501',
            hint = 'Recipient account is suspended, locked or disabled.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_message_to_restricted on public.messages;
create trigger trg_guard_message_to_restricted
  before insert on public.messages
  for each row
  execute function public.guard_message_to_restricted();

commit;
