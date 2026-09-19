import { supabase } from '@/db/supabase';
import { createNotification, sendPushTo } from '@/services/api';
import type { Profile } from '@/types/types';
import type { Group, GroupMember, GroupMedia, GroupMessage, GroupMessageReaction, GroupPinnedMessage, GroupPermissions, GroupRole, GroupSummary, GroupCall } from '@/types/groups';

interface GroupMemberRow extends Omit<GroupMember, 'profile'> { profile?: Profile | null }

function throwIfError(error: { message?: string } | null) {
  if (error) throw new Error(error.message || 'Group request failed');
}

export async function createGroup(name: string, description: string, avatarUrl = ''): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name.trim(),
    p_description: description.trim() || null,
    p_avatar_url: avatarUrl.trim() || null,
  });
  throwIfError(error);
  if (!data) throw new Error('Group could not be created');
  return data as string;
}

export async function getMyGroups(userId: string): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, role, groups(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });
  throwIfError(error);
  const rows = (data || []) as Array<{ group_id: string; role: GroupRole; groups: Group | Group[] | null }>;
  const groupIds = rows.map(row => row.group_id);
  if (!groupIds.length) return [];
  const { data: counts, error: countError } = await supabase
    .from('group_members')
    .select('group_id')
    .in('group_id', groupIds);
  throwIfError(countError);
  const countMap = new Map<string, number>();
  for (const row of counts || []) countMap.set(row.group_id, (countMap.get(row.group_id) || 0) + 1);
  return rows.flatMap(row => {
    const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
    return group ? [{ group, role: row.role, member_count: countMap.get(row.group_id) || 1 }] : [];
  });
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
  throwIfError(error);
  return data as Group | null;
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('role', { ascending: true })
    .order('joined_at', { ascending: true });
  throwIfError(error);
  const members = (data || []) as GroupMemberRow[];
  const ids = members.map(member => member.user_id);
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('*').in('user_id', ids);
  throwIfError(profileError);
  const profileMap = new Map((profiles || []).map(profile => [profile.user_id, profile as Profile]));
  return members.map(member => ({ ...member, profile: profileMap.get(member.user_id) }));
}

export async function getGroupMessages(groupId: string): Promise<GroupMessage[]> {
  const { data, error } = await supabase
    .from('group_messages')
    .select('*, group_message_reactions(*)')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(300);
  throwIfError(error);
  return ((data || []) as Array<GroupMessage & { group_message_reactions?: GroupMessageReaction[] }>).map(message => ({
    ...message,
    reactions: message.group_message_reactions || [],
  }));
}

export async function getGroupPermissions(groupId: string): Promise<GroupPermissions | null> {
  const { data, error } = await supabase.from('group_permissions').select('*').eq('group_id', groupId).maybeSingle();
  throwIfError(error);
  return data as GroupPermissions | null;
}

export async function updateGroupPermissions(groupId: string, updates: Partial<Omit<GroupPermissions, 'group_id' | 'updated_at'>>): Promise<void> {
  const { error } = await supabase.from('group_permissions').update({ ...updates, updated_at: new Date().toISOString() }).eq('group_id', groupId);
  throwIfError(error);
}

export async function getGroupMedia(groupId: string): Promise<GroupMedia[]> {
  const { data, error } = await supabase.from('group_media').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(100);
  throwIfError(error);
  return (data || []) as GroupMedia[];
}

export async function getGroupPinnedMessages(groupId: string): Promise<GroupPinnedMessage[]> {
  const { data: pins, error: pinError } = await supabase.from('group_message_pins').select('*').eq('group_id', groupId).order('pinned_at', { ascending: false });
  throwIfError(pinError);
  const rows = (pins || []) as Array<Omit<GroupPinnedMessage, 'message'>>;
  if (!rows.length) return [];
  const { data: messages, error: messageError } = await supabase.from('group_messages').select('*, group_message_reactions(*)').in('id', rows.map(pin => pin.message_id)).is('deleted_at', null);
  throwIfError(messageError);
  const messageMap = new Map((messages || []).map(raw => { const message = raw as GroupMessage & { group_message_reactions?: GroupMessageReaction[] }; return [message.id, { ...message, reactions: message.group_message_reactions || [] } as GroupMessage]; }));
  return rows.flatMap(pin => { const message = messageMap.get(pin.message_id); return message ? [{ ...pin, message }] : []; });
}

export async function sendGroupMessage(groupId: string, content: string, replyToId?: string | null, mentionUserIds: string[] = []): Promise<GroupMessage> {
  const { data: auth } = await supabase.auth.getUser();
  const sender = auth.user;
  if (!sender) throw new Error('Not authenticated');

  const cleanContent = content.trim();
  const mentionedIds = [...new Set(mentionUserIds)].filter(id => id && id !== sender.id);

  let message: GroupMessage | null = null;

  // 1. Try secure RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('send_group_message', {
      p_group_id: groupId,
      p_content: cleanContent,
      p_reply_to_id: replyToId || null,
      p_mention_user_ids: mentionedIds,
    });
    if (!rpcError && rpcData) {
      message = rpcData as GroupMessage;
    }
  } catch (rpcErr) {
    console.warn('send_group_message RPC not available, using direct insert', rpcErr);
  }

  // 2. Direct insert fallback with explicit sender_id
  if (!message) {
    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: sender.id,
        content: cleanContent,
        reply_to_id: replyToId || null,
      })
      .select('*')
      .single();
    throwIfError(error);
    message = data as GroupMessage;

    if (mentionedIds.length) {
      try {
        await supabase.from('group_message_mentions').upsert(
          mentionedIds.map(userId => ({ message_id: message!.id, group_id: groupId, user_id: userId })),
          { onConflict: 'message_id,user_id' },
        );
      } catch (mentionError) {
        console.warn('Group mention record failed', mentionError);
      }
    }
  }

  // 3. Trigger notifications for group members & mentioned users
  if (message) {
    void (async () => {
      try {
        const { data: grpMembers } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId);

        const otherMemberIds = (grpMembers || [])
          .map(m => m.user_id)
          .filter(uid => uid && uid !== sender.id);

        const { data: grp } = await supabase
          .from('groups')
          .select('name')
          .eq('id', groupId)
          .maybeSingle();
        const groupTitle = grp?.name || 'Group';
        const senderName = (sender.user_metadata?.username as string | undefined) || 'Member';
        const snippet = cleanContent.length > 80 ? cleanContent.slice(0, 77) + '...' : cleanContent;

        for (const uid of otherMemberIds) {
          const isMention = mentionedIds.includes(uid);
          void createNotification(
            uid,
            isMention ? 'group_mention' : 'group_message',
            sender.id,
            groupId,
            undefined,
            isMention ? `You were mentioned in ${groupTitle}` : `${senderName}: ${snippet}`,
          );
          void sendPushTo(
            uid,
            isMention ? `🏷️ Mentioned in ${groupTitle}` : `${groupTitle} · ${senderName} 💬`,
            isMention ? `@${senderName}: ${cleanContent}` : snippet,
            `/group/${groupId}`,
            `group-msg-${message!.id}`,
          );
        }
      } catch (err) {
        console.warn('Group notification broadcast error', err);
      }
    })();
  }

  return message;
}

export async function editGroupMessage(messageId: string, content: string): Promise<void> {
  const { error } = await supabase.from('group_messages').update({ content: content.trim(), edited_at: new Date().toISOString() }).eq('id', messageId);
  throwIfError(error);
}

export async function deleteGroupMessage(messageId: string): Promise<void> {
  const { error } = await supabase.from('group_messages').update({ deleted_at: new Date().toISOString(), content: 'Message deleted' }).eq('id', messageId);
  throwIfError(error);
}

export async function toggleGroupReaction(messageId: string, reaction: string, existing?: GroupMessageReaction): Promise<void> {
  if (existing?.reaction === reaction) {
    const { error } = await supabase.from('group_message_reactions').delete().eq('message_id', messageId).eq('user_id', existing.user_id);
    throwIfError(error);
    return;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not authenticated');
  const { error } = await supabase.from('group_message_reactions').upsert({ message_id: messageId, user_id: auth.user.id, reaction }, { onConflict: 'message_id,user_id' });
  throwIfError(error);
}

export async function pinGroupMessage(groupId: string, messageId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not authenticated');
  const { error } = await supabase.from('group_message_pins').upsert({ group_id: groupId, message_id: messageId, pinned_by: auth.user.id });
  throwIfError(error);
}

export async function unpinGroupMessage(messageId: string): Promise<void> {
  const { error } = await supabase.from('group_message_pins').delete().eq('message_id', messageId);
  throwIfError(error);
}

export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('add_group_member', { p_group_id: groupId, p_user_id: userId });
  throwIfError(error);
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_group_member', { p_group_id: groupId, p_user_id: userId });
  throwIfError(error);
}

export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  throwIfError(error);
}

export async function updateGroup(groupId: string, updates: Partial<Pick<Group, 'name' | 'description' | 'avatar_url'>>): Promise<void> {
  const payload: Record<string, any> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.description !== undefined) payload.description = updates.description ? updates.description.trim() : null;
  if (updates.avatar_url !== undefined) payload.avatar_url = updates.avatar_url;
  const { error } = await supabase.from('groups').update(payload).eq('id', groupId);
  throwIfError(error);
}

export async function uploadGroupAvatar(groupId: string, file: File): Promise<string> {
  const auth = (await supabase.auth.getUser()).data.user;
  if (!auth) throw new Error('Not authenticated');
  if (!file.type.startsWith('image/')) throw new Error('Group photo must be an image');
  const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
  const fileName = `${auth.id}-${Date.now()}.${extension}`;

  const candidateBuckets = ['avatars', 'posts', 'group-media'];
  let publicUrl = '';
  let lastError: any = null;

  for (const bucket of candidateBuckets) {
    try {
      const storagePath = `groups/${groupId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
        contentType: file.type,
        upsert: true,
      });
      if (uploadError) {
        lastError = uploadError;
        continue;
      }
      const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      if (data?.publicUrl) {
        publicUrl = data.publicUrl;
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!publicUrl) {
    throw lastError || new Error('Group photo upload failed');
  }

  const { error: updateError } = await supabase.from('groups').update({ avatar_url: publicUrl }).eq('id', groupId);
  throwIfError(updateError);
  return publicUrl;
}

export async function rotateGroupInvite(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_group_invite', { p_group_id: groupId });
  throwIfError(error);
  return data as string;
}

export async function searchGroupUsers(query: string, existingIds: string[]): Promise<Profile[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(
      'username.ilike.%' + query.trim().replace(/[%_,]/g, '') + '%,full_name.ilike.%' + query.trim().replace(/[%_,]/g, '') + '%',
    )
    .order('username')
    .limit(12);
  throwIfError(error);
  return ((data || []) as Profile[]).filter(profile => !existingIds.includes(profile.user_id));
}

export async function joinGroupByInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group_by_invite', { p_token: token });
  throwIfError(error);
  if (!data) throw new Error('Invite link is invalid');
  return data as string;
}

export async function sendGroupFileMessage(groupId: string, file: File): Promise<GroupMessage> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not authenticated');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${auth.user.id}-${Date.now()}-${safeName}`;
  const isImage = file.type.startsWith('image/');
  const candidateBuckets = isImage ? ['posts', 'avatars', 'group-media'] : ['posts', 'group-media', 'stories'];
  let publicUrl = '';
  let storagePath = '';
  let lastError: any = null;

  for (const bucket of candidateBuckets) {
    try {
      const path = `groups/${groupId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });
      if (uploadError) {
        lastError = uploadError;
        continue;
      }
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      if (urlData?.publicUrl) {
        publicUrl = urlData.publicUrl;
        storagePath = path;
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!publicUrl) {
    throw lastError || new Error('File upload failed');
  }

  const mediaType = file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'file';
  const { data: message, error: messageError } = await supabase.from('group_messages').insert({ group_id: groupId, sender_id: auth.user.id, content: '📎 ' + file.name + '\n' + publicUrl }).select('*').single();
  throwIfError(messageError);
  try {
    await supabase.from('group_media').insert({ group_id: groupId, message_id: message.id, uploader_id: auth.user.id, media_type: mediaType, storage_path: storagePath, public_url: publicUrl, file_name: file.name, mime_type: file.type || null, file_size: file.size });
  } catch { /* optional */ }
  return message as GroupMessage;
}

export async function getActiveGroupCall(groupId: string): Promise<GroupCall | null> {
  const { data, error } = await supabase
    .from('group_calls')
    .select('*')
    .eq('group_id', groupId)
    .in('status', ['ringing', 'active'])
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const startedTime = new Date(data.created_at || data.started_at).getTime();
  if (Date.now() - startedTime > 2 * 60 * 60 * 1000) {
    return null;
  }
  return data as GroupCall;
}

export async function getActiveGroupCallsForUser(groupIds: string[]): Promise<Record<string, GroupCall>> {
  if (!groupIds.length) return {};
  const { data, error } = await supabase
    .from('group_calls')
    .select('*')
    .in('group_id', groupIds)
    .in('status', ['ringing', 'active'])
    .is('ended_at', null)
    .order('created_at', { ascending: false });
  if (error || !data) return {};
  const result: Record<string, GroupCall> = {};
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const call of data as GroupCall[]) {
    const started = new Date(call.created_at || call.started_at).getTime();
    if (started >= twoHoursAgo && !result[call.group_id]) {
      result[call.group_id] = call;
    }
  }
  return result;
}

export async function createGroupCall(groupId: string, kind: 'audio' | 'video'): Promise<string> {
  const auth = (await supabase.auth.getUser()).data.user;
  if (!auth) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('group_calls')
    .insert({ group_id: groupId, started_by: auth.id, kind, status: 'ringing' })
    .select('id')
    .single();
  throwIfError(error);
  if (!data?.id) throw new Error('Call could not be started');
  return data.id as string;
}

export async function startOrJoinGroupCall(
  groupId: string,
  kind: 'audio' | 'video',
): Promise<{ id: string; isNew: boolean; kind: 'audio' | 'video' }> {
  const existing = await getActiveGroupCall(groupId);
  if (existing) {
    return { id: existing.id, isNew: false, kind: existing.kind };
  }
  const id = await createGroupCall(groupId, kind);
  return { id, isNew: true, kind };
}

export async function joinGroupCall(callId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('group_call_participants')
    .upsert({ call_id: callId, user_id: auth.user.id, left_at: null });
  throwIfError(error);
  await supabase
    .from('group_calls')
    .update({ status: 'active' })
    .eq('id', callId)
    .eq('status', 'ringing');
}

export async function leaveGroupCall(callId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('group_call_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('call_id', callId)
    .eq('user_id', auth.user.id);
  throwIfError(error);

  try {
    const { data: remaining } = await supabase
      .from('group_call_participants')
      .select('user_id')
      .eq('call_id', callId)
      .is('left_at', null);
    if (!remaining || remaining.length === 0) {
      await endGroupCall(callId);
    }
  } catch {
    /* ignore */
  }
}

export async function endGroupCall(callId: string): Promise<void> {
  const { error } = await supabase
    .from('group_calls')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', callId);
  throwIfError(error);
}
