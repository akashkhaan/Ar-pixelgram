-- Blue tick 30 din baad apne aap hat jaye (server side, sab users ke liye).
-- Pehle tick sirf tab hatta tha jab user khud Settings kholta tha.

alter table public.profiles add column if not exists verified_at timestamptz;

-- Purane verified users: approve hone ki date (ya account banne ki date) se gino.
update public.profiles p
set verified_at = coalesce(
  (select v.reviewed_at from public.verification_requests v
    where v.user_id = p.user_id and v.status = 'approved'),
  p.created_at
)
where p.is_verified and p.verified_at is null;

-- Tick milte hi verified_at = abhi; tick hatte hi null.
create or replace function public.set_profile_verified_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_verified then
    if tg_op = 'INSERT' or old.is_verified is distinct from true or new.verified_at is null then
      new.verified_at := now();
    end if;
  else
    new.verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_verified_at on public.profiles;
create trigger trg_profile_verified_at
  before insert or update of is_verified on public.profiles
  for each row execute function public.set_profile_verified_at();

-- Naya status: 'expired' (tick khatam, user dobara request kar sakta hai)
alter table public.verification_requests drop constraint if exists verification_requests_status_check;
alter table public.verification_requests
  add constraint verification_requests_status_check
  check (status in ('pending','approved','rejected','expired'));

-- User rejected / expired / 30 din purani approved request ko dobara pending kar sake (Renew Tick)
drop policy if exists "verif_update_own_rejected" on public.verification_requests;
create policy "verif_update_own_rejected" on public.verification_requests
  for update to authenticated
  using (
    user_id = auth.uid() and (
      status in ('rejected','expired')
      or (status = 'approved' and reviewed_at <= now() - interval '30 days')
    )
  )
  with check (user_id = auth.uid() and status = 'pending');

create or replace function public.expire_blue_ticks()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
  set is_verified = false
  where is_verified and verified_at <= now() - interval '30 days';

  update public.verification_requests v
  set status = 'expired'
  where v.status = 'approved'
    and not exists (
      select 1 from public.profiles p where p.user_id = v.user_id and p.is_verified
    );
end;
$$;

revoke all on function public.expire_blue_ticks() from public, anon, authenticated;
grant execute on function public.expire_blue_ticks() to service_role;

select public.expire_blue_ticks();

do $$
begin
  begin
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    if to_regnamespace('cron') is not null then
      execute 'select cron.unschedule(jobid) from cron.job where jobname = ''blue-tick-expiry''';
      execute 'select cron.schedule(''blue-tick-expiry'', ''*/5 * * * *'', ''select public.expire_blue_ticks();'')';
    end if;
  exception when others then
    raise notice 'pg_cron unavailable';
  end;
end;
$$;
