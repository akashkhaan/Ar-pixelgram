-- Group chat system: groups, members, roles/permissions, messages, reactions,
-- pins, media, invites aur group calls. Purana kuch bhi remove nahi kiya gaya.

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  avatar_url text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invite_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  can_send_messages boolean not null default true,
  can_send_media boolean not null default true,
  can_call boolean not null default true,
  can_invite boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_permissions (
  group_id uuid primary key references public.groups(id) on delete cascade,
  send_messages text not null default 'everyone' check (send_messages in ('everyone','admins')),
  add_members text not null default 'everyone' check (add_members in ('everyone','admins')),
  edit_info text not null default 'admins' check (edit_info in ('everyone','admins')),
  create_invites text not null default 'admins' check (create_invites in ('everyone','admins')),
  pin_messages text not null default 'admins' check (pin_messages in ('everyone','admins')),
  start_calls text not null default 'everyone' check (start_calls in ('everyone','admins')),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null default '',
  reply_to_id uuid references public.group_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.group_message_reactions (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.group_message_pins (
  message_id uuid primary key references public.group_messages(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz not null default now()
);

create table if not exists public.group_media (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  message_id uuid references public.group_messages(id) on delete cascade,
  uploader_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  media_type text not null default 'file' check (media_type in ('photo','video','file','voice')),
  storage_path text not null,
  public_url text not null,
  file_name text not null default '',
  mime_type text,
  file_size bigint,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists public.group_calls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  started_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'audio' check (kind in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','active','ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.group_call_participants (
  call_id uuid not null references public.group_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (call_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members(user_id);
create index if not exists group_messages_group_idx on public.group_messages(group_id, created_at desc);
create index if not exists group_media_group_idx on public.group_media(group_id, created_at desc);
create index if not exists group_calls_group_idx on public.group_calls(group_id, created_at desc);

-- ============================================================
-- 2. Helper functions (security definer -> RLS recursion se bachne ke liye)
-- ============================================================

create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = p_user_id);
$$;

create or replace function public.group_role(p_group_id uuid, p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.group_members m where m.group_id = p_group_id and m.user_id = p_user_id;
$$;

create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.group_role(p_group_id, p_user_id) in ('owner','admin');
$$;

create or replace function public.is_group_owner(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.group_role(p_group_id, p_user_id) = 'owner';
$$;

create or replace function public.group_can(p_group_id uuid, p_action text, p_user_id uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_mode text; v_role text;
begin
  select role into v_role from public.group_members where group_id = p_group_id and user_id = p_user_id;
  if v_role is null then return false; end if;
  if v_role in ('owner','admin') then return true; end if;

  select case p_action
    when 'send_messages' then send_messages
    when 'add_members' then add_members
    when 'edit_info' then edit_info
    when 'create_invites' then create_invites
    when 'pin_messages' then pin_messages
    when 'start_calls' then start_calls
    else 'admins' end
  into v_mode from public.group_permissions where group_id = p_group_id;

  if v_mode is null then v_mode := 'everyone'; end if;
  if v_mode <> 'everyone' then return false; end if;

  if p_action = 'send_messages' then
    return coalesce((select can_send_messages from public.group_members where group_id = p_group_id and user_id = p_user_id), false);
  elsif p_action = 'add_members' or p_action = 'create_invites' then
    return coalesce((select can_invite from public.group_members where group_id = p_group_id and user_id = p_user_id), false);
  elsif p_action = 'start_calls' then
    return coalesce((select can_call from public.group_members where group_id = p_group_id and user_id = p_user_id), false);
  end if;
  return true;
end $$;

create or replace function public.touch_group_updated_at()
returns trigger language plpgsql as $$
begin
  update public.groups set updated_at = now() where id = new.group_id;
  return new;
end $$;

drop trigger if exists group_messages_touch_group on public.group_messages;
create trigger group_messages_touch_group
  after insert on public.group_messages
  for each row execute function public.touch_group_updated_at();

-- ============================================================
-- 3. Grants
-- ============================================================

grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.group_permissions to authenticated;
grant select, insert, update, delete on public.group_messages to authenticated;
grant select, insert, update, delete on public.group_message_reactions to authenticated;
grant select, insert, update, delete on public.group_message_pins to authenticated;
grant select, insert, update, delete on public.group_media to authenticated;
grant select, insert, update, delete on public.group_calls to authenticated;
grant select, insert, update, delete on public.group_call_participants to authenticated;

grant all on public.groups to service_role;
grant all on public.group_members to service_role;
grant all on public.group_permissions to service_role;
grant all on public.group_messages to service_role;
grant all on public.group_message_reactions to service_role;
grant all on public.group_message_pins to service_role;
grant all on public.group_media to service_role;
grant all on public.group_calls to service_role;
grant all on public.group_call_participants to service_role;

-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_permissions enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_message_reactions enable row level security;
alter table public.group_message_pins enable row level security;
alter table public.group_media enable row level security;
alter table public.group_calls enable row level security;
alter table public.group_call_participants enable row level security;

drop policy if exists "members read group" on public.groups;
create policy "members read group" on public.groups
  for select to authenticated using (public.is_group_member(id) or owner_id = auth.uid());

drop policy if exists "user creates group" on public.groups;
create policy "user creates group" on public.groups
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "allowed members edit group" on public.groups;
create policy "allowed members edit group" on public.groups
  for update to authenticated using (public.group_can(id, 'edit_info')) with check (public.group_can(id, 'edit_info'));

drop policy if exists "owner deletes group" on public.groups;
create policy "owner deletes group" on public.groups
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members read members" on public.group_members;
create policy "members read members" on public.group_members
  for select to authenticated using (user_id = auth.uid() or public.is_group_member(group_id));

drop policy if exists "allowed members add members" on public.group_members;
create policy "allowed members add members" on public.group_members
  for insert to authenticated
  with check (
    public.group_can(group_id, 'add_members')
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

drop policy if exists "admins update members" on public.group_members;
create policy "admins update members" on public.group_members
  for update to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

drop policy if exists "admins or self remove member" on public.group_members;
create policy "admins or self remove member" on public.group_members
  for delete to authenticated using (user_id = auth.uid() or public.is_group_admin(group_id));

drop policy if exists "members read permissions" on public.group_permissions;
create policy "members read permissions" on public.group_permissions
  for select to authenticated using (public.is_group_member(group_id));

drop policy if exists "admins write permissions" on public.group_permissions;
create policy "admins write permissions" on public.group_permissions
  for insert to authenticated with check (public.is_group_admin(group_id));

drop policy if exists "admins update permissions" on public.group_permissions;
create policy "admins update permissions" on public.group_permissions
  for update to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

drop policy if exists "members read messages" on public.group_messages;
create policy "members read messages" on public.group_messages
  for select to authenticated using (public.is_group_member(group_id));

drop policy if exists "allowed members send messages" on public.group_messages;
create policy "allowed members send messages" on public.group_messages
  for insert to authenticated with check (sender_id = auth.uid() and public.group_can(group_id, 'send_messages'));

drop policy if exists "sender or admin edits message" on public.group_messages;
create policy "sender or admin edits message" on public.group_messages
  for update to authenticated using (sender_id = auth.uid() or public.is_group_admin(group_id))
  with check (sender_id = auth.uid() or public.is_group_admin(group_id));

drop policy if exists "sender or admin deletes message" on public.group_messages;
create policy "sender or admin deletes message" on public.group_messages
  for delete to authenticated using (sender_id = auth.uid() or public.is_group_admin(group_id));

drop policy if exists "members read reactions" on public.group_message_reactions;
create policy "members read reactions" on public.group_message_reactions
  for select to authenticated
  using (exists (select 1 from public.group_messages m where m.id = message_id and public.is_group_member(m.group_id)));

drop policy if exists "members react" on public.group_message_reactions;
create policy "members react" on public.group_message_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.group_messages m where m.id = message_id and public.is_group_member(m.group_id)));

drop policy if exists "members update own reaction" on public.group_message_reactions;
create policy "members update own reaction" on public.group_message_reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members remove own reaction" on public.group_message_reactions;
create policy "members remove own reaction" on public.group_message_reactions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "members read pins" on public.group_message_pins;
create policy "members read pins" on public.group_message_pins
  for select to authenticated using (public.is_group_member(group_id));

drop policy if exists "allowed members pin" on public.group_message_pins;
create policy "allowed members pin" on public.group_message_pins
  for insert to authenticated with check (pinned_by = auth.uid() and public.group_can(group_id, 'pin_messages'));

drop policy if exists "allowed members repin" on public.group_message_pins;
create policy "allowed members repin" on public.group_message_pins
  for update to authenticated using (public.group_can(group_id, 'pin_messages')) with check (public.group_can(group_id, 'pin_messages'));

drop policy if exists "allowed members unpin" on public.group_message_pins;
create policy "allowed members unpin" on public.group_message_pins
  for delete to authenticated using (public.group_can(group_id, 'pin_messages'));

drop policy if exists "members read media" on public.group_media;
create policy "members read media" on public.group_media
  for select to authenticated using (public.is_group_member(group_id));

drop policy if exists "members insert media" on public.group_media;
create policy "members insert media" on public.group_media
  for insert to authenticated with check (uploader_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists "uploader or admin deletes media" on public.group_media;
create policy "uploader or admin deletes media" on public.group_media
  for delete to authenticated using (uploader_id = auth.uid() or public.is_group_admin(group_id));

drop policy if exists "members read calls" on public.group_calls;
create policy "members read calls" on public.group_calls
  for select to authenticated using (public.is_group_member(group_id));

drop policy if exists "allowed members start calls" on public.group_calls;
create policy "allowed members start calls" on public.group_calls
  for insert to authenticated with check (started_by = auth.uid() and public.group_can(group_id, 'start_calls'));

drop policy if exists "members update calls" on public.group_calls;
create policy "members update calls" on public.group_calls
  for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists "members read call participants" on public.group_call_participants;
create policy "members read call participants" on public.group_call_participants
  for select to authenticated
  using (exists (select 1 from public.group_calls c where c.id = call_id and public.is_group_member(c.group_id)));

drop policy if exists "members join call" on public.group_call_participants;
create policy "members join call" on public.group_call_participants
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.group_calls c where c.id = call_id and public.is_group_member(c.group_id)));

drop policy if exists "members update own call row" on public.group_call_participants;
create policy "members update own call row" on public.group_call_participants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members leave call" on public.group_call_participants;
create policy "members leave call" on public.group_call_participants
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- 5. RPCs
-- ============================================================

create or replace function public.create_group(p_name text, p_description text default null, p_avatar_url text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Group ka naam zaroori hai'; end if;

  insert into public.groups (name, description, avatar_url, owner_id)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_avatar_url, '')), ''), auth.uid())
  returning id into v_id;

  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into public.group_permissions (group_id) values (v_id) on conflict (group_id) do nothing;
  return v_id;
end $$;

create or replace function public.add_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.group_can(p_group_id, 'add_members') then raise exception 'Aapko member add karne ki permission nahi hai'; end if;
  insert into public.group_members (group_id, user_id) values (p_group_id, p_user_id)
  on conflict (group_id, user_id) do nothing;
end $$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_admin(p_group_id) then raise exception 'Sirf admin member remove kar sakta hai'; end if;
  if public.group_role(p_group_id, p_user_id) = 'owner' then raise exception 'Owner ko remove nahi kar sakte'; end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end $$;

create or replace function public.set_group_admin(p_group_id uuid, p_user_id uuid, p_make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_owner(p_group_id) then raise exception 'Sirf owner admin bana sakta hai'; end if;
  update public.group_members set role = case when p_make_admin then 'admin' else 'member' end
  where group_id = p_group_id and user_id = p_user_id and role <> 'owner';
end $$;

create or replace function public.transfer_group_ownership(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_owner(p_group_id) then raise exception 'Sirf owner ownership transfer kar sakta hai'; end if;
  if not public.is_group_member(p_group_id, p_user_id) then raise exception 'Ye user group ka member nahi hai'; end if;
  update public.group_members set role = 'admin' where group_id = p_group_id and user_id = auth.uid();
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_user_id;
  update public.groups set owner_id = p_user_id, updated_at = now() where id = p_group_id;
end $$;

create or replace function public.leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_next uuid;
begin
  if public.is_group_owner(p_group_id) then
    select user_id into v_next from public.group_members
    where group_id = p_group_id and user_id <> auth.uid()
    order by case role when 'admin' then 0 else 1 end, joined_at limit 1;

    if v_next is null then
      delete from public.groups where id = p_group_id;
      return;
    end if;
    update public.group_members set role = 'owner' where group_id = p_group_id and user_id = v_next;
    update public.groups set owner_id = v_next, updated_at = now() where id = p_group_id;
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = auth.uid();
end $$;

create or replace function public.rotate_group_invite(p_group_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not public.group_can(p_group_id, 'create_invites') then raise exception 'Aapko invite link banane ki permission nahi hai'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  update public.groups set invite_token = v_token, invite_enabled = true, updated_at = now() where id = p_group_id;
  return v_token;
end $$;

create or replace function public.preview_group_by_invite(p_token text)
returns table (id uuid, name text, description text, avatar_url text, member_count bigint)
language sql security definer set search_path = public as $$
  select g.id, g.name, g.description, g.avatar_url,
         (select count(*) from public.group_members m where m.group_id = g.id)
  from public.groups g
  where g.invite_token = p_token and g.invite_enabled;
$$;

create or replace function public.join_group_by_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into v_group from public.groups where invite_token = p_token and invite_enabled;
  if v_group is null then raise exception 'Invite link invalid ya band hai'; end if;
  insert into public.group_members (group_id, user_id) values (v_group, auth.uid())
  on conflict (group_id, user_id) do nothing;
  return v_group;
end $$;

grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.group_role(uuid, uuid) to authenticated;
grant execute on function public.is_group_admin(uuid, uuid) to authenticated;
grant execute on function public.is_group_owner(uuid, uuid) to authenticated;
grant execute on function public.group_can(uuid, text, uuid) to authenticated;
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_group_admin(uuid, uuid, boolean) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.rotate_group_invite(uuid) to authenticated;
grant execute on function public.preview_group_by_invite(text) to authenticated;
grant execute on function public.join_group_by_invite(text) to authenticated;

-- ============================================================
-- 6. Storage bucket: group-media
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('group-media', 'group-media', true, 1073741824)
on conflict (id) do update set public = true, file_size_limit = 1073741824;

drop policy if exists "group media public read" on storage.objects;
create policy "group media public read" on storage.objects
  for select using (bucket_id = 'group-media');

drop policy if exists "group members upload media" on storage.objects;
create policy "group members upload media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-media'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "group media owner delete" on storage.objects;
create policy "group media owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'group-media' and owner = auth.uid());

-- ============================================================
-- 7. Realtime
-- ============================================================

do $$
begin
  begin alter publication supabase_realtime add table public.groups; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_message_reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_message_pins; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_media; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_calls; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_call_participants; exception when duplicate_object then null; end;
end $$;
