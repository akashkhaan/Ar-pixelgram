import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import PullToRefresh from '@/components/common/PullToRefresh';
import MobileLayout from '@/components/layouts/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import useGoBack from '@/hooks/use-go-back';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { cn } from '@/lib/utils';
import { withTimeout } from '@/lib/withTimeout';
import {
  acceptFollowRequest,
  createNotification,
  followUser,
  getNotifications,
  getPendingFollowRequests,
  markNotificationsRead,
  rejectFollowRequest,
  unfollowUser,
} from '@/services/api';
import type { Notification, Profile } from '@/types/types';

const AV = [
  ['#FF8A00', '#E8175D'],
  ['#7C5CFF', '#2F8BFF'],
  ['#00B894', '#2F8BFF'],
  ['#D946EF', '#FF3D7F'],
  ['#F59E0B', '#EF4444'],
  ['#06B6D4', '#7C5CFF'],
];

const REELS = [
  ['#FF8A00', '#E8175D'],
  ['#7C5CFF', '#2F8BFF'],
  ['#00B894', '#A3E635'],
  ['#D946EF', '#FF8A00'],
  ['#2F8BFF', '#00B894'],
];

function hashUser(u: string): number {
  let h = 0;
  for (let i = 0; i < u.length; i++) {
    h += u.charCodeAt(i);
  }
  return Math.abs(h);
}

function formatTimeAgo(dateStr: string): string {
  try {
    const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.floor(days / 365)}y`;
  } catch {
    return '1d';
  }
}

// Notification tag badge on avatar bottom-right corner
const TagIcon: React.FC<{ type: Notification['type'] }> = ({ type }) => {
  if (type === 'like' || type === 'reel_like' || type === 'story_like') {
    return (
      <span className="tag like" title="Like">
        <svg viewBox="0 0 24 24" className="w-[11px] h-[11px]">
          <path d="M12 21s-7-4.6-9.3-9.2C1 8.3 3 4.5 6.6 4.5c2 0 3.6 1.1 5.4 3 1.8-1.9 3.4-3 5.4-3C21 4.5 23 8.3 21.3 11.8 19 16.4 12 21 12 21z" fill="#fff" />
        </svg>
      </span>
    );
  }

  if (type === 'comment' || type === 'reel_comment' || type === 'comment_reply') {
    return (
      <span className="tag comment" title="Comment">
        <svg viewBox="0 0 24 24" className="w-[11px] h-[11px]">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (type === 'mention' || type === 'group_mention') {
    return (
      <span className="tag mention" title="Mention">
        <svg viewBox="0 0 24 24" className="w-[11px] h-[11px]">
          <circle cx="12" cy="12" r="3.5" stroke="#fff" strokeWidth="2.5" fill="none" />
          <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (type === 'follow' || type === 'follow_request' || type === 'follow_accepted') {
    return (
      <span className="tag follow" title="Follow">
        <svg viewBox="0 0 24 24" className="w-[11px] h-[11px]">
          <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  // fallback/system/default
  return (
    <span className="tag" style={{ background: '#6366F1' }} title="Alert">
      <svg viewBox="0 0 24 24" className="w-[11px] h-[11px]">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
};

const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack('/home');

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [followMap, setFollowMap] = useState<Record<string, 'accepted' | 'pending' | null>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  // Browser system push notification hook
  useBrowserNotifications(user?.id);

  // Load notifications and follow statuses
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const notifs = await withTimeout(getNotifications(user.id), 20000);
      setNotifications(notifs);

      // Fetch follow status for all actors in the notifications list
      const actorIds = Array.from(
        new Set(notifs.map(n => n.actor_id).filter(Boolean))
      ) as string[];

      if (actorIds.length > 0) {
        const { data: followRows } = await supabase
          .from('follows')
          .select('following_id, status')
          .eq('follower_id', user.id)
          .in('following_id', actorIds);

        const map: Record<string, 'accepted' | 'pending' | null> = {};
        (followRows || []).forEach((row: { following_id: string; status: 'accepted' | 'pending' }) => {
          map[row.following_id] = row.status;
        });
        setFollowMap(map);
      }

      // Mark unread notifications as read in background after viewing
      await markNotificationsRead(user.id).catch(() => {});
    } catch (e) {
      console.error('notifications load failed', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime subscription for incoming notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifs-page-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [user, load]);

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.is_read).length;
  }, [notifications]);

  // Follow back / toggle follow handler
  const handleToggleFollow = async (actor: Profile | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !actor?.user_id) return;

    const actorId = actor.user_id;
    const currentStatus = followMap[actorId];
    setFollowLoading(prev => ({ ...prev, [actorId]: true }));

    try {
      if (currentStatus === 'accepted' || currentStatus === 'pending') {
        await unfollowUser(actorId, user.id);
        setFollowMap(prev => ({ ...prev, [actorId]: null }));
        toast.success(`Unfollowed @${actor.username || 'user'}`);
      } else {
        await followUser(actorId, !!actor.is_private);
        if (actor.is_private) {
          setFollowMap(prev => ({ ...prev, [actorId]: 'pending' }));
          await createNotification(actorId, 'follow_request', user.id).catch(() => {});
          toast.success(`Follow request sent to @${actor.username || 'user'}`);
        } else {
          setFollowMap(prev => ({ ...prev, [actorId]: 'accepted' }));
          await createNotification(actorId, 'follow', user.id).catch(() => {});
          toast.success(`Started following @${actor.username || 'user'}`);
        }
      }
    } catch (err) {
      console.error('Follow action failed:', err);
      toast.error('Could not update follow status');
    } finally {
      setFollowLoading(prev => ({ ...prev, [actorId]: false }));
    }
  };

  // Follow request Accept
  const handleAcceptFollow = async (notif: Notification, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!notif.actor_id || !user) return;
    try {
      const requests = await getPendingFollowRequests(user.id);
      const req = requests.find(r => r.follower_id === notif.actor_id);
      if (req) {
        await acceptFollowRequest(req.id);
        await createNotification(notif.actor_id, 'follow_accepted', user.id).catch(() => {});
        toast.success('Follow request accepted');
        void load();
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to accept follow request');
    }
  };

  // Follow request Decline
  const handleRejectFollow = async (notif: Notification, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!notif.actor_id || !user) return;
    try {
      const requests = await getPendingFollowRequests(user.id);
      const req = requests.find(r => r.follower_id === notif.actor_id);
      if (req) {
        await rejectFollowRequest(req.id);
        toast.success('Follow request deleted');
        void load();
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject follow request');
    }
  };

  // Mark all as read manually
  const handleMarkAllRead = async () => {
    if (!user) return;
    try {
      await markNotificationsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  // Open notification target (reel, post, profile, story, chat)
  const openNotification = (notif: Notification) => {
    switch (notif.type) {
      case 'reel_like':
        if (notif.post_id) navigate(`/reels?r=${notif.post_id}`);
        else navigate('/reels');
        return;
      case 'reel_comment':
      case 'comment_reply':
        if (notif.post_id) navigate(`/reels?r=${notif.post_id}&comments=1`);
        else navigate('/reels');
        return;
      case 'story_like':
      case 'story_reply':
        if (notif.message && notif.message.toLowerCase().includes('note')) {
          navigate(`/chat?noteId=${notif.post_id || ''}`);
        } else if (notif.post_id) {
          navigate(`/stories?id=${notif.post_id}`);
        } else if (notif.actor_id) {
          navigate(`/profile/${notif.actor_id}`);
        }
        return;
      case 'message':
        if (notif.actor_id) navigate(`/chat/${notif.actor_id}`);
        return;
      case 'new_story':
        if (notif.actor_id) navigate(`/stories?u=${notif.actor_id}`);
        else navigate('/stories');
        return;
      case 'like':
      case 'comment':
      case 'new_post':
        if (notif.post_id) navigate(`/post/${notif.post_id}`);
        else if (notif.actor_id) navigate(`/profile/${notif.actor_id}`);
        return;
      case 'follow':
      case 'follow_accepted':
      case 'follow_request':
        if (notif.actor_id) navigate(`/profile/${notif.actor_id}`);
        return;
      default:
        if (notif.post_id) navigate(`/post/${notif.post_id}`);
        else if (notif.actor_id) navigate(`/profile/${notif.actor_id}`);
        return;
    }
  };

  // Open reel directly from the side reel thumbnail
  const openReel = (notif: Notification, e: React.MouseEvent) => {
    e.stopPropagation();
    if (notif.post_id) {
      const withComments = notif.type === 'reel_comment' || notif.type === 'comment_reply';
      navigate(`/reels?r=${notif.post_id}${withComments ? '&comments=1' : ''}`);
    } else {
      navigate('/reels');
    }
  };

  // Group notifications into Today, This week, and Earlier
  const grouped = useMemo(() => {
    const res: { Today: Notification[]; 'This week': Notification[]; Earlier: Notification[] } = {
      Today: [],
      'This week': [],
      Earlier: [],
    };
    notifications.forEach(notif => {
      const diffHours = (Date.now() - new Date(notif.created_at).getTime()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        res.Today.push(notif);
      } else if (diffHours < 24 * 7) {
        res['This week'].push(notif);
      } else {
        res.Earlier.push(notif);
      }
    });
    return res;
  }, [notifications]);

  // Determine whether this notification should show a reel thumbnail
  const isReelNotification = (notif: Notification) => {
    return (
      notif.type === 'reel_like' ||
      notif.type === 'reel_comment' ||
      notif.media_item?.kind === 'reel' ||
      (notif.type === 'like' && notif.media_item?.media_type === 'video') ||
      (notif.type === 'comment' && notif.media_item?.media_type === 'video')
    );
  };

  // Determine whether this notification should show a post thumbnail
  const isPostNotification = (notif: Notification) => {
    if (isReelNotification(notif)) return false;
    return !!(notif.post?.image_url || notif.media_item?.image_url || notif.media_item?.thumbnail_url);
  };

  // Render individual notification row
  const renderNotificationRow = (notif: Notification, index: number) => {
    const actor = notif.actor;
    const username = actor?.username || 'user';
    const timeAgo = formatTimeAgo(notif.created_at);
    const isUnread = !notif.is_read;
    const actorHash = hashUser(username);
    const avColors = AV[actorHash % AV.length];
    const isFollowType = notif.type === 'follow' || notif.type === 'follow_accepted';
    const isReqType = notif.type === 'follow_request';
    const reelColors = REELS[hashUser(notif.post_id || notif.id) % REELS.length];
    const hasReel = isReelNotification(notif);
    const hasPost = isPostNotification(notif);

    // Follow status
    const status = notif.actor_id ? followMap[notif.actor_id] : null;
    const isFollowing = status === 'accepted';
    const isPending = status === 'pending';
    const isActionLoading = notif.actor_id ? !!followLoading[notif.actor_id] : false;

    return (
      <div
        key={notif.id}
        onClick={() => openNotification(notif)}
        className={cn('n', isUnread && 'unread')}
        style={{ '--d': Math.min(index, 15) } as React.CSSProperties}
      >
        {/* Avatar with tag badge */}
        <div className="av">
          <div
            onClick={e => {
              e.stopPropagation();
              if (notif.actor_id) navigate(`/profile/${notif.actor_id}`);
            }}
            className="ph cursor-pointer active:scale-95 transition-transform"
          >
            {actor?.avatar_url ? (
              <img src={actor.avatar_url} alt={username} className="w-full h-full object-cover" />
            ) : (
              <svg className="p" viewBox="0 0 56 56">
                <defs>
                  <linearGradient id={`g-${notif.id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={avColors[0]} />
                    <stop offset="100%" stopColor={avColors[1]} />
                  </linearGradient>
                </defs>
                <rect width="56" height="56" fill={`url(#g-${notif.id})`} />
                <circle cx="28" cy="22" r="9.5" fill="#fff" fillOpacity="0.92" />
                <path d="M8 56c0-12 8.5-20 20-20s20 8 20 20z" fill="#fff" fillOpacity="0.92" />
              </svg>
            )}
          </div>
          <TagIcon type={notif.type} />
        </div>

        {/* Text body */}
        <div className="body">
          <b
            onClick={e => {
              e.stopPropagation();
              if (notif.actor_id) navigate(`/profile/${notif.actor_id}`);
            }}
            className="cursor-pointer hover:underline"
          >
            {username}
          </b>
          {isReqType && ' requested to follow you.'}
          {notif.type === 'follow' && ' started following you.'}
          {notif.type === 'follow_accepted' && ' accepted your follow request.'}
          {notif.type === 'reel_like' && ' liked your reel.'}
          {notif.type === 'like' && (hasReel ? ' liked your reel.' : ' liked your post.')}
          {notif.type === 'story_like' && ' liked your story.'}
          {notif.type === 'reel_comment' && ' commented:'}
          {notif.type === 'comment' && (hasReel ? ' commented:' : ' commented on your post:')}
          {notif.type === 'comment_reply' && ' replied to your comment:'}
          {notif.type === 'story_reply' && ' replied to your story:'}
          {(notif.type === 'mention' || notif.type === 'group_mention') && ' mentioned you in a comment:'}
          {notif.type === 'new_story' && ' added a new story.'}
          {notif.type === 'verified' && ' verified your account.'}
          {notif.type === 'broadcast' && `: ${notif.message || ''}`}

          <span className="t"> {timeAgo}</span>

          {/* Comment text snippet */}
          {notif.message &&
            (notif.type === 'comment' ||
              notif.type === 'reel_comment' ||
              notif.type === 'comment_reply' ||
              notif.type === 'story_reply' ||
              notif.type === 'mention' ||
              notif.type === 'group_mention') && <span className="cm">{notif.message}</span>}
        </div>

        {/* Side Actions or Media Thumbnail */}
        {/* 1. Follow Request: Confirm / Delete */}
        {isReqType && (
          <div className="acts">
            <button
              type="button"
              onClick={e => handleAcceptFollow(notif, e)}
              className="btn"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={e => handleRejectFollow(notif, e)}
              className="btn on"
            >
              Delete
            </button>
          </div>
        )}

        {/* 2. Follow: Follow back button */}
        {!isReqType && isFollowType && actor?.user_id && actor.user_id !== user?.id && (
          <button
            type="button"
            disabled={isActionLoading}
            onClick={e => handleToggleFollow(actor, e)}
            className={cn('btn', (isFollowing || isPending) && 'on')}
          >
            {isActionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mx-2" />
            ) : isFollowing ? (
              'Following'
            ) : isPending ? (
              'Requested'
            ) : (
              'Follow back'
            )}
          </button>
        )}

        {/* 3. Reel thumbnail */}
        {!isReqType && !isFollowType && hasReel && (
          <div
            onClick={e => openReel(notif, e)}
            title="Watch reel"
            className="reel cursor-pointer active:scale-95 transition-transform"
            style={
              !notif.media_item?.thumbnail_url && !notif.media_item?.image_url
                ? { background: `linear-gradient(160deg, ${reelColors[0]}, ${reelColors[1]})` }
                : undefined
            }
          >
            {(notif.media_item?.thumbnail_url || notif.media_item?.image_url) && (
              <img
                src={notif.media_item.thumbnail_url || notif.media_item.image_url || ''}
                alt="Reel"
                className="w-full h-full object-cover"
              />
            )}
            <svg viewBox="0 0 24 24">
              <path d="M6 4l14 8-14 8z" />
            </svg>
          </div>
        )}

        {/* 4. Post image thumbnail */}
        {!isReqType && !isFollowType && !hasReel && hasPost && (
          <div
            onClick={e => {
              e.stopPropagation();
              if (notif.post_id) navigate(`/post/${notif.post_id}`);
            }}
            title="View post"
            className="shrink-0 w-[46px] h-[46px] rounded-[10px] overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.14)] cursor-pointer active:scale-95 transition-transform"
          >
            <img
              src={notif.post?.image_url || notif.media_item?.image_url || notif.media_item?.thumbnail_url || ''}
              alt="Post"
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    );
  };

  const sections: ('Today' | 'This week' | 'Earlier')[] = ['Today', 'This week', 'Earlier'];

  return (
    <MobileLayout hideHeader autoHideNav>
      <style>{`
        .notifs-theme {
          --bg: #110B22;
          --s1: #1B1334;
          --s2: #281E4B;
          --ink: #F6F2FF;
          --mute: #A79FCC;
          --line: #2D2452;
          --pink: #FF3D7F;
          --blue: #38BDF8;
          background: var(--bg);
          color: var(--ink);
          font-family: "Bricolage Grotesque", system-ui, -apple-system, sans-serif;
          line-height: 1.35;
          min-height: 100vh;
        }
        .notifs-theme .wrap {
          max-width: 580px;
          margin: 0 auto;
          padding-bottom: 70px;
        }
        .notifs-theme header {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 18px 18px 14px;
          background: rgba(17, 11, 34, 0.88);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--line);
        }
        .notifs-theme h1 {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.035em;
          color: var(--ink);
        }
        .notifs-theme #count {
          min-width: 32px;
          height: 32px;
          padding: 0 10px;
          border-radius: 99px;
          background: var(--pink);
          color: #fff;
          font-weight: 800;
          font-size: 15px;
          display: grid;
          place-items: center;
          box-shadow: 0 0 0 4px rgba(255, 61, 127, 0.2);
        }
        .notifs-theme h2 {
          font-size: 14.5px;
          font-weight: 600;
          color: var(--mute);
          padding: 18px 18px 6px;
        }
        .notifs-theme .list {
          margin: 0 8px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .notifs-theme .n {
          position: relative;
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 12px 12px 12px 14px;
          border-radius: 20px;
          background: transparent;
          transition: background 0.2s;
          animation: notifIn 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
          animation-delay: calc(var(--d, 0) * 40ms);
          cursor: pointer;
        }
        .notifs-theme .n:hover {
          background: var(--s1);
        }
        .notifs-theme .n.unread {
          background: var(--s1);
        }
        .notifs-theme .n.unread::before {
          content: "";
          position: absolute;
          left: 4px;
          top: 50%;
          width: 6px;
          height: 6px;
          margin-top: -3px;
          border-radius: 50%;
          background: var(--pink);
        }
        @keyframes notifIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .notifs-theme .av {
          flex: none;
          position: relative;
          width: 52px;
          height: 52px;
        }
        .notifs-theme .av .ph {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          overflow: hidden;
          display: block;
          border: 2px solid var(--bg);
        }
        .notifs-theme .av svg.p {
          width: 100%;
          height: 100%;
          display: block;
        }
        .notifs-theme .n.unread .av .ph {
          box-shadow: 0 0 0 2px var(--pink);
        }
        .notifs-theme .tag {
          position: absolute;
          right: -3px;
          bottom: -3px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          border: 2.5px solid var(--bg);
          color: #fff;
        }
        .notifs-theme .n.unread .tag {
          border-color: var(--s1);
        }
        .notifs-theme .tag.like { background: var(--pink); }
        .notifs-theme .tag.comment { background: var(--blue); }
        .notifs-theme .tag.mention { background: #8B6CFF; }
        .notifs-theme .tag.follow { background: #10B981; }

        .notifs-theme .body {
          flex: 1;
          min-width: 0;
          font-size: 15px;
          color: var(--ink);
        }
        .notifs-theme .body b {
          font-weight: 800;
          color: #fff;
        }
        .notifs-theme .body .t {
          color: var(--mute);
          font-size: 13.5px;
          white-space: nowrap;
        }
        .notifs-theme .cm {
          display: block;
          margin-top: 3px;
          color: #D9D2F4;
          font-size: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .notifs-theme .reel {
          flex: none;
          position: relative;
          width: 46px;
          height: 62px;
          border-radius: 11px;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14);
        }
        .notifs-theme .reel::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.5), transparent 55%);
        }
        .notifs-theme .reel svg {
          position: absolute;
          z-index: 1;
          left: 5px;
          bottom: 5px;
          width: 13px;
          height: 13px;
          fill: #fff;
        }
        .notifs-theme .btn {
          flex: none;
          padding: 8px 16px;
          border-radius: 99px;
          background: var(--pink);
          color: #fff;
          font-weight: 800;
          font-size: 13.5px;
          transition: transform 0.15s, opacity 0.15s;
          border: 0;
          cursor: pointer;
        }
        .notifs-theme .btn:active {
          transform: scale(0.94);
        }
        .notifs-theme .btn.on {
          background: var(--s2);
          color: var(--ink);
          font-weight: 600;
        }
        .notifs-theme .acts {
          display: flex;
          gap: 6px;
          flex: none;
        }
        .notifs-theme .acts .btn:last-child {
          background: var(--s2);
          font-weight: 600;
        }
        .notifs-theme .empty {
          text-align: center;
          padding: 90px 24px;
          color: var(--mute);
        }
        .notifs-theme .empty p {
          font-size: 19px;
          font-weight: 800;
          color: var(--ink);
          margin-bottom: 6px;
        }
        @media (max-width: 400px) {
          .notifs-theme .acts { flex-direction: column; }
          .notifs-theme .body { font-size: 14.5px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .notifs-theme * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <PullToRefresh onRefresh={load}>
        <div className="notifs-theme">
          <div className="wrap">
            {/* Header matching HTML style */}
            <header>
              <button
                type="button"
                onClick={goBack}
                className="w-9 h-9 rounded-full hover:bg-[var(--s1)] active:scale-95 flex items-center justify-center transition-all text-[var(--ink)]"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--ink)]" />
              </button>
              <h1 className="flex-1">Notifications</h1>
              {unreadCount > 0 && <span id="count">{unreadCount}</span>}
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                  className="w-9 h-9 rounded-full hover:bg-[var(--s1)] active:scale-95 flex items-center justify-center transition-all text-[var(--mute)] hover:text-[var(--ink)]"
                >
                  <CheckCheck className="w-5 h-5" />
                </button>
              )}
            </header>

            {/* Content List */}
            {loading ? (
              <div className="list pt-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3.5 px-3 py-3 rounded-[20px] bg-[var(--s1)]/40 animate-pulse">
                    <div className="w-[52px] h-[52px] rounded-full bg-[var(--s2)] shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-44 bg-[var(--s2)] rounded-full" />
                      <div className="h-3 w-24 bg-[var(--s2)]/70 rounded-full" />
                    </div>
                    <div className="w-16 h-8 rounded-full bg-[var(--s2)] shrink-0" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="empty">
                <div className="w-16 h-16 rounded-full bg-[var(--s1)] mx-auto mb-4 flex items-center justify-center text-[var(--pink)]">
                  <Bell className="w-8 h-8" />
                </div>
                <p>No notifications yet</p>
                <span>When someone follows you, likes or comments on your reels, you'll see them here.</span>
              </div>
            ) : (
              <main>
                {sections.map(section => {
                  const items = grouped[section];
                  if (!items || items.length === 0) return null;

                  return (
                    <div key={section}>
                      <h2>{section}</h2>
                      <div className="list">
                        {items.map((notif: Notification, index: number) => renderNotificationRow(notif, index))}
                      </div>
                    </div>
                  );
                })}
              </main>
            )}
          </div>
        </div>
      </PullToRefresh>
    </MobileLayout>
  );
};

export default NotificationsPage;
