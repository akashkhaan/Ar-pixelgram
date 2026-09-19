-- Migration 00025: Automatically create notifications for mentioned group members in send_group_message RPC

create or replace function public.send_group_message(
  p_group_id uuid,
  p_content text,
  p_reply_to_id uuid default null,
  p_mention_user_ids uuid[] default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sender_id uuid := auth.uid();
  v_sender_name text;
  v_group_name text;
  v_message record;
  v_uid uuid;
  v_snippet text;
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_member(p_group_id, v_sender_id) then
    raise exception 'You are not a member of this group';
  end if;

  -- Insert group message
  insert into public.group_messages (group_id, sender_id, content, reply_to_id)
  values (p_group_id, v_sender_id, trim(p_content), p_reply_to_id)
  returning * into v_message;

  -- Handle mentions & in-app/push notifications
  if p_mention_user_ids is not null and array_length(p_mention_user_ids, 1) > 0 then
    select coalesce(username, full_name, 'Someone') into v_sender_name
    from public.profiles where user_id = v_sender_id;

    select coalesce(name, 'Group') into v_group_name
    from public.groups where id = p_group_id;

    v_snippet := substring(trim(p_content) from 1 for 60);

    foreach v_uid in array p_mention_user_ids loop
      if v_uid is not null and v_uid <> v_sender_id then
        -- 1. Insert into group_message_mentions
        insert into public.group_message_mentions (message_id, group_id, user_id)
        values (v_message.id, p_group_id, v_uid)
        on conflict (message_id, user_id) do nothing;

        -- 2. Insert into notifications table (triggers Realtime push to mentioned member's phone)
        insert into public.notifications (user_id, actor_id, type, message)
        values (
          v_uid,
          v_sender_id,
          'group_mention',
          coalesce(v_sender_name, 'Someone') || ' mentioned you in ' || coalesce(v_group_name, 'Group') || ': "' || v_snippet || '"'
        );
      end if;
    end loop;
  end if;

  return to_jsonb(v_message);
end $$;

grant execute on function public.send_group_message(uuid, text, uuid, uuid[]) to authenticated;
