import { useEffect } from 'react';
import { supabase } from '@/db/supabase';
import { notifyPhone } from '@/lib/notifyPhone';

type Row = {
  id: string;
  type: string;
  actor_id: string | null;
  post_id: string | null;
  message: string | null;
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
    case 'message': return `${who} sent you a message 💬`;
    case 'new_story': return `${who} added a new story 📸`;
    default: return 'AR Pixelgram';
  }
}

function urlFor(row: Row): string {
  if (row.type === 'message' && row.actor_id) return `/chat/${row.actor_id}`;
  if (row.type === 'new_story' && row.actor_id) return `/stories?u=${row.actor_id}`;
  if (row.type.startsWith('reel_') || row.type === 'comment_reply') {
    return row.post_id ? `/reels?r=${row.post_id}` : '/reels';
  }
  return '/notifications';
}

export function useNativeNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    let cancelled = false;

    const channel = supabase
      .channel(`user-push-notifs-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          if (cancelled) return;
          const row = payload.new as Row;
          let who = 'Someone';
          if (row.actor_id) {
            const { data } = await supabase
              .from('profiles')
              .select('username, full_name')
              .eq('user_id', row.actor_id)
              .maybeSingle();
            who = data?.username || data?.full_name || who;
          }

          const isCall = !!row.message && (row.message.startsWith('📞') || row.message.startsWith('📵'));
          const title = isCall
            ? `${who} — ${row.message?.startsWith('📞') ? 'Incoming call 📞' : 'Missed call 📵'}`
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

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
