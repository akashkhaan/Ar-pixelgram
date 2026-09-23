import { useEffect, useRef } from 'react';
import { supabase } from '@/db/supabase';
import { notifyPhone, dismissPhoneNotification } from '@/lib/notifyPhone';

type Row = {
  id: string;
  type: string;
  actor_id: string | null;
  post_id: string | null;
  message: string | null;
  comment_id?: string | null;
};

interface GroupInfo {
  name: string;
  avatarUrl: string | null;
}

function titleFor(type: string, who: string): string {
  switch (type) {
    case 'like': return `${who} liked your post ❤️`;
    case 'reel_like': return `${who} liked your reel 🔥`;
    case 'story_like': return `${who} liked your story 💖`;
    case 'story_reply': return `${who} replied to your story 💬`;
    case 'comment': return `${who} commented on your post 💬`;
    case 'reel_comment': return `${who} commented on your reel 💬`;
    case 'comment_reply': return `${who} replied to your comment 💬`;
    case 'follow': return `${who} started following you 👤`;
    case 'follow_request': return `${who} sent you a follow request 📩`;
    case 'follow_accepted': return `${who} accepted your follow request ✅`;
    case 'message': return `${who} sent a message 💬`;
    case 'group_mention': return `🏷️ ${who} mentioned you in a group`;
    case 'group_call': return `📞 Group call from ${who}`;
    case 'group_message': return `👥 Group message from ${who}`;
    case 'new_story': return `${who} added a new story 📸`;
    case 'new_post': return `${who} shared a new post 📷`;
    case 'new_reel': return `${who} shared a new reel 🎬`;
    default: return 'Pixelgram';
  }
}

function urlFor(row: Row): string {
  if (row.type === 'message' && row.actor_id) return `/chat/${row.actor_id}`;
  if (row.type === 'group_mention' || row.type === 'group_call' || row.type === 'group_message') {
    return row.post_id ? `/group/${row.post_id}` : '/chat';
  }
  if (row.type === 'new_story' && row.actor_id) return `/stories?u=${row.actor_id}`;
  if (row.type.startsWith('reel_') || row.type === 'comment_reply') {
    return row.post_id ? `/reels?r=${row.post_id}` : '/reels';
  }
  if (row.type === 'new_post' && row.post_id) return `/post/${row.post_id}`;
  return '/notifications';
}

export function useNativeNotifications(userId: string | undefined) {
  const myGroupIdsRef = useRef<Map<string, GroupInfo>>(new Map());
  const currentUsernameRef = useRef<string>('');

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    let cancelled = false;

    // Fetch user profile username for mention detection
    void supabase
      .from('profiles')
      .select('username')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.username) {
          currentUsernameRef.current = data.username.toLowerCase();
        }
      });

    // Fetch user groups with name and avatar
    const refreshGroups = async () => {
      try {
        const { data } = await supabase
          .from('group_members')
          .select('group_id, groups(name, avatar_url)')
          .eq('user_id', userId);
        if (data && !cancelled) {
          const map = new Map<string, GroupInfo>();
          data.forEach((item: any) => {
            if (item.group_id) {
              map.set(item.group_id, {
                name: item.groups?.name || 'Group',
                avatarUrl: item.groups?.avatar_url || null,
              });
            }
          });
          myGroupIdsRef.current = map;
        }
      } catch {
        /* noop */
      }
    };
    void refreshGroups();

    // 1. Listen for new notifications in DB for this user
    const notifChannel = supabase
      .channel(`user-notif-push-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          if (cancelled) return;
          const row = payload.new as Row;
          let who = 'Someone';
          let actorAvatar: string | null = null;
          if (row.actor_id) {
            try {
              const { data } = await supabase
                .from('profiles')
                .select('username, full_name, avatar_url')
                .eq('user_id', row.actor_id)
                .maybeSingle();
              who = data?.username || data?.full_name || who;
              actorAvatar = data?.avatar_url || null;
            } catch { /* noop */ }
          }

          const isCall =
            row.type === 'group_call' ||
            (!!row.message && (row.message.startsWith('📞') || row.message.startsWith('📵')));
          const title = isCall
            ? `${who} — ${row.message?.startsWith('📵') ? 'Missed call 📵' : 'Incoming call 📞'}`
            : titleFor(row.type, who);
          const body = row.message || (row.type === 'message' ? 'New message received' : 'Pixelgram');

          notifyPhone({
            title,
            body,
            tag: isCall ? `call_${row.id}` : `notif_${row.id}`,
            url: isCall ? (row.post_id ? `/group/${row.post_id}` : '/chat') : urlFor(row),
            icon: actorAvatar || '/images/logo/logo-icon.svg',
            image: actorAvatar || undefined,
            isCall,
            actions: isCall && row.post_id ? [
              { action: 'join_call', title: '📞 Receive' },
              { action: 'decline_call', title: '❌ End' },
            ] : undefined,
          });
        },
      )
      .subscribe();

    // 2. Listen directly to incoming direct chat messages in Realtime
    const msgChannel = supabase
      .channel(`user-direct-messages-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
        async (payload) => {
          if (cancelled) return;
          const newMsg = payload.new as { sender_id: string; content: string; id: string };
          if (newMsg.content?.startsWith('📞') || newMsg.content?.startsWith('📵')) return;

          let senderName = 'Someone';
          let senderAvatar: string | null = null;
          try {
            const { data } = await supabase
              .from('profiles')
              .select('username, full_name, avatar_url')
              .eq('user_id', newMsg.sender_id)
              .maybeSingle();
            senderName = data?.username || data?.full_name || senderName;
            senderAvatar = data?.avatar_url || null;
          } catch { /* noop */ }

          notifyPhone({
            title: `${senderName} 💬`,
            body: newMsg.content || 'Sent an attachment',
            tag: `msg_${newMsg.id}`,
            url: `/chat/${newMsg.sender_id}`,
            icon: senderAvatar || '/images/logo/logo-icon.svg',
            image: senderAvatar || undefined,
          });
        },
      )
      .subscribe();

    // 3. Listen directly to group messages in Realtime for all members
    const groupMsgChannel = supabase
      .channel(`user-group-messages-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },
        async (payload) => {
          if (cancelled) return;
          const newMsg = payload.new as { id: string; group_id: string; sender_id: string; content: string };
          if (newMsg.sender_id === userId) return;

          if (!myGroupIdsRef.current.has(newMsg.group_id)) {
            await refreshGroups();
          }
          if (!myGroupIdsRef.current.has(newMsg.group_id)) return;

          const groupInfo = myGroupIdsRef.current.get(newMsg.group_id);
          const groupName = groupInfo?.name || 'Group';
          const groupAvatar = groupInfo?.avatarUrl || null;

          let senderName = 'Member';
          let senderAvatar: string | null = null;
          try {
            const { data } = await supabase
              .from('profiles')
              .select('username, full_name, avatar_url')
              .eq('user_id', newMsg.sender_id)
              .maybeSingle();
            senderName = data?.username || data?.full_name || senderName;
            senderAvatar = data?.avatar_url || null;
          } catch { /* noop */ }

          const content = newMsg.content || '';
          const myUsername = currentUsernameRef.current;
          const isMentioned = Boolean(
            myUsername && content.toLowerCase().includes(`@${myUsername}`)
          );

          notifyPhone({
            title: isMentioned ? `🏷️ ${senderName} mentioned you in ${groupName}` : `${groupName} · ${senderName} 💬`,
            body: isMentioned ? `@${senderName}: ${content}` : content || 'Sent an attachment',
            tag: `group_msg_${newMsg.id}`,
            url: `/group/${newMsg.group_id}`,
            icon: groupAvatar || senderAvatar || '/images/logo/logo-icon.svg',
            image: senderAvatar || groupAvatar || undefined,
          });
        },
      )
      .subscribe();

    // 4. Listen directly to Realtime group call invites for instant Android notification with Receive & End buttons
    const callSignalChannel = supabase
      .channel(`calls:${userId}`)
      .on('broadcast', { event: 'group-call-invite' }, (payload) => {
        if (cancelled) return;
        const data = payload.payload as {
          groupId: string;
          groupName: string;
          groupAvatarUrl?: string | null;
          callId: string;
          kind: 'audio' | 'video';
          from: string;
          fromName: string;
          fromAvatar?: string | null;
        };
        if (!data || !data.groupId || data.from === userId) return;

        notifyPhone({
          title: `📞 ${data.groupName || 'Group'} · Incoming ${data.kind === 'video' ? 'Video' : 'Audio'} Call`,
          body: `${data.fromName || 'A member'} is calling the group · Tap Receive or End`,
          tag: `group_call_${data.callId || data.groupId}`,
          url: `/group/${data.groupId}?autoJoin=1&kind=${data.kind || 'audio'}`,
          icon: data.groupAvatarUrl || data.fromAvatar || '/images/logo/logo-icon.svg',
          isCall: true,
          actions: [
            { action: 'join_call', title: '📞 Receive' },
            { action: 'decline_call', title: '❌ End' },
          ],
        });
      })
      .on('broadcast', { event: 'group-call-end' }, (payload) => {
        const endedCallId = payload.payload?.callId;
        const endedGroupId = payload.payload?.groupId;
        if (endedCallId) dismissPhoneNotification(`group_call_${endedCallId}`);
        if (endedGroupId) dismissPhoneNotification(`group_call_${endedGroupId}`);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(groupMsgChannel);
      supabase.removeChannel(callSignalChannel);
    };
  }, [userId]);
}
