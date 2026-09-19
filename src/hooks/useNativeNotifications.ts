import { useEffect, useRef } from 'react';
import { supabase } from '@/db/supabase';
import { notifyPhone } from '@/lib/notifyPhone';

type Row = {
  id: string;
  type: string;
  actor_id: string | null;
  post_id: string | null;
  message: string | null;
  comment_id?: string | null;
};

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
    default: return 'AR Pixelgram';
  }
}

function urlFor(row: Row): string {
  if (row.type === 'message' && row.actor_id) return `/chat/${row.actor_id}`;
  if (row.type === 'group_mention' || row.type === 'group_call' || row.type === 'group_message') return row.post_id ? `/group/${row.post_id}` : '/chat';
  if (row.type === 'new_story' && row.actor_id) return `/stories?u=${row.actor_id}`;
  if (row.type.startsWith('reel_') || row.type === 'comment_reply') {
    return row.post_id ? `/reels?r=${row.post_id}` : '/reels';
  }
  if (row.type === 'new_post' && row.post_id) return `/post/${row.post_id}`;
  return '/notifications';
}

export function useNativeNotifications(userId: string | undefined) {
  const myGroupIdsRef = useRef<Map<string, string>>(new Map());
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

    // Fetch user groups to filter realtime group messages
    const refreshGroups = async () => {
      try {
        const { data } = await supabase
          .from('group_members')
          .select('group_id, groups(name)')
          .eq('user_id', userId);
        if (data && !cancelled) {
          const map = new Map<string, string>();
          data.forEach((item: any) => {
            if (item.group_id) {
              map.set(item.group_id, item.groups?.name || 'Group');
            }
          });
          myGroupIdsRef.current = map;
        }
      } catch {
        /* noop */
      }
    };
    void refreshGroups();

    // 1. Listen for new notifications for this user (likes, mentions, calls)
    const notifChannel = supabase
      .channel(`user-notif-push-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          if (cancelled) return;
          const row = payload.new as Row;
          let who = 'Someone';
          if (row.actor_id) {
            try {
              const { data } = await supabase
                .from('profiles')
                .select('username, full_name')
                .eq('user_id', row.actor_id)
                .maybeSingle();
              who = data?.username || data?.full_name || who;
            } catch { /* noop */ }
          }

          const isCall =
            row.type === 'group_call' ||
            (!!row.message && (row.message.startsWith('📞') || row.message.startsWith('📵')));

          const title = isCall
            ? `${who} — ${row.message?.startsWith('📵') ? 'Missed call 📵' : 'Incoming call 📞'}`
            : titleFor(row.type, who);
          const body = row.message || (row.type === 'message' ? 'New message received' : 'AR Pixelgram');

          notifyPhone({
            title,
            body,
            tag: isCall ? 'call_notif' : `notif_${row.id}`,
            url: isCall ? '/chat' : urlFor(row),
            isCall,
          });
        },
      )
      .subscribe();

    // 2. Listen directly to incoming direct chat messages in Realtime!
    const msgChannel = supabase
      .channel(`user-direct-messages-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
        async (payload) => {
          if (cancelled) return;
          const newMsg = payload.new as { sender_id: string; content: string; id: string };
          // Don't duplicate if call marker
          if (newMsg.content?.startsWith('📞') || newMsg.content?.startsWith('📵')) return;
          let senderName = 'Someone';
          try {
            const { data } = await supabase
              .from('profiles')
              .select('username, full_name')
              .eq('user_id', newMsg.sender_id)
              .maybeSingle();
            senderName = data?.username || data?.full_name || senderName;
          } catch { /* noop */ }

          notifyPhone({
            title: `${senderName} 💬`,
            body: newMsg.content || 'Sent a photo/attachment',
            tag: `msg_${newMsg.id}`,
            url: `/chat/${newMsg.sender_id}`,
          });
        },
      )
      .subscribe();

    // 3. Listen directly to group messages in Realtime for instant phone notification & mentions!
    const groupMsgChannel = supabase
      .channel(`user-group-messages-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },
        async (payload) => {
          if (cancelled) return;
          const newMsg = payload.new as { id: string; group_id: string; sender_id: string; content: string };
          if (newMsg.sender_id === userId) return;

          // If cache doesn't have it, refresh
          if (!myGroupIdsRef.current.has(newMsg.group_id)) {
            await refreshGroups();
          }
          if (!myGroupIdsRef.current.has(newMsg.group_id)) return;

          const groupName = myGroupIdsRef.current.get(newMsg.group_id) || 'Group';

          let senderName = 'Member';
          try {
            const { data } = await supabase
              .from('profiles')
              .select('username, full_name')
              .eq('user_id', newMsg.sender_id)
              .maybeSingle();
            senderName = data?.username || data?.full_name || senderName;
          } catch { /* noop */ }

          const content = newMsg.content || '';
          const myUsername = currentUsernameRef.current;
          const isMentioned = Boolean(
            myUsername && content.toLowerCase().includes(`@${myUsername}`)
          );

          notifyPhone({
            title: isMentioned ? `🏷️ Mentioned in ${groupName}` : `${groupName} · ${senderName} 💬`,
            body: isMentioned ? `@${senderName}: ${content}` : content || 'Sent an attachment',
            tag: `group_msg_${newMsg.id}`,
            url: `/group/${newMsg.group_id}`,
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(groupMsgChannel);
    };
  }, [userId]);
}
