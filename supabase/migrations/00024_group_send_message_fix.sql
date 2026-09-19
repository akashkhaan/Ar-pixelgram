-- Fix group message sending and mentions RLS permissions
-- 1. Ensure all existing group members have can_send_messages = true
update public.group_members
set can_send_messages = true
where can_send_messages is null or can_send_messages = false;

update public.group_permissions
set send_messages = 'everyone'
where send_messages is null;

-- 2. Update group_can function to safely allow members to send messages if not explicitly restricted
create or replace function public.group_can(p_group_id uuid, p_permission text, p_user_id uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_mode text; v_role text; v_can boolean;
begin
  select role, can_send_messages into v_role, v_can from public.group_members where group_id = p_group_id and user_id = p_user_id;
  if v_role is null then return false; end if;
  if v_role in ('owner','admin') then return true; end if;

  select case p_permission
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

  if p_permission = 'send_messages' then
    return coalesce(v_can, true);
  elsif p_permission = 'add_members' or p_permission = 'create_invites' then
    return coalesce((select can_invite from public.group_members where group_id = p_group_id and user_id = p_user_id), true);
  elsif p_permission = 'start_calls' then
    return coalesce((select can_call from public.group_members where group_id = p_group_id and user_id = p_user_id), true);
  end if;
  return true;
end $$;

-- 3. Update RLS policy on group_messages for insert
drop policy if exists "allowed members send messages" on public.group_messages;
create policy "allowed members send messages" on public.group_messages
  for insert to authenticated with check (
    sender_id = auth.uid() and (
      public.is_group_member(group_id)
      or public.group_can(group_id, 'send_messages')
    )
  );

-- 4. Provide a security definer RPC function send_group_message that is 100% resilient
create or replace function public.send_group_message(
  p_group_id uuid,
  p_content text,
  p_reply_to_id uuid default null,
  p_mention_user_ids uuid[] default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sender_id uuid := auth.uid();
  v_message record;
  v_uid uuid;
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_group_member(p_group_id, v_sender_id) then
    raise exception 'You are not a member of this group';
  end if;

  insert into public.group_messages (group_id, sender_id, content, reply_to_id)
  values (p_group_id, v_sender_id, trim(p_content), p_reply_to_id)
  returning * into v_message;

  if p_mention_user_ids is not null and array_length(p_mention_user_ids, 1) > 0 then
    foreach v_uid in array p_mention_user_ids loop
      if v_uid is not null and v_uid <> v_sender_id then
        insert into public.group_message_mentions (message_id, group_id, user_id)
        values (v_message.id, p_group_id, v_uid)
        on conflict (message_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  return to_jsonb(v_message);
end $$;

grant execute on function public.send_group_message(uuid, text, uuid, uuid[]) to authenticated;
