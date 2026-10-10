alter table public.profiles
  add column if not exists hello_tune_track_id text,
  add column if not exists hello_tune_url text,
  add column if not exists hello_tune_path text,
  add column if not exists hello_tune_title text,
  add column if not exists hello_tune_artist text,
  add column if not exists hello_tune_start_seconds double precision not null default 0,
  add column if not exists hello_tune_duration_seconds integer not null default 20,
  add column if not exists hello_tune_expires_at timestamptz;

create index if not exists profiles_hello_tune_expiry_idx
  on public.profiles (hello_tune_expires_at)
  where hello_tune_expires_at is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hello-tunes',
  'hello-tunes',
  true,
  20971520,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/opus', 'audio/webm']
)
on conflict (id) do update
set public = true,
    file_size_limit = 20971520,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public hello tunes read" on storage.objects;
create policy "Public hello tunes read" on storage.objects
  for select using (bucket_id = 'hello-tunes');

drop policy if exists "Users upload their own hello tunes" on storage.objects;
create policy "Users upload their own hello tunes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hello-tunes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete their own hello tunes" on storage.objects;
create policy "Users delete their own hello tunes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hello-tunes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create or replace function public.expire_hello_tunes()
returns void
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
begin
  update public.profiles
  set hello_tune_track_id = null,
      hello_tune_url = null,
      hello_tune_title = null,
      hello_tune_artist = null,
      hello_tune_start_seconds = 0,
      hello_tune_duration_seconds = 20,
      hello_tune_expires_at = null
  where hello_tune_expires_at <= now();
end;
$$;

revoke all on function public.expire_hello_tunes() from public, anon, authenticated;
grant execute on function public.expire_hello_tunes() to service_role;

do $$
begin
  begin
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    if to_regnamespace('cron') is not null then
      execute 'select cron.unschedule(jobid) from cron.job where jobname = ''hello-tune-expiry''';
      execute 'select cron.schedule(''hello-tune-expiry'', ''0 * * * *'', ''select public.expire_hello_tunes();'')';
    end if;
  exception when others then
    raise notice 'pg_cron is unavailable; expired tunes are still ignored by the app and removed when the owner opens Hello Tune';
  end;
end;
$$;
