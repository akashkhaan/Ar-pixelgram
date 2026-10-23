import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye, Heart, Trash2, Share2, X, Send, ChevronLeft, ChevronRight,
  Music2, Clock, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Story, Profile } from '@/types/types';
import {
  StoryViewer, getStoryViewers, recordStoryView,
  toggleStoryLike, isStoryLiked, sendMessage, createNotification
} from '@/services/api';

interface PixelgramStoryViewerProps {
  groups: Record<string, { profile: Profile; stories: Story[] }>;
  groupKeys: string[];
  activeUserId: string;
  initialIndex?: number;
  currentUser: { id: string; username?: string; avatar_url?: string } | null;
  onClose: () => void;
  onDeleteStory: (storyId: string) => Promise<void> | void;
  onOpenProfile: (userId: string) => void;
  onStoryLiked?: (storyId: string, liked: boolean, newCount: number) => void;
}

const DUR = 5000;
const GR: [string, string][] = [
  ['#7b5cff', '#ff4d8d'],
  ['#00c6ff', '#0072ff'],
  ['#f7971e', '#ff3b5c'],
  ['#11998e', '#38ef7d'],
  ['#b24592', '#f15f79'],
  ['#4776e6', '#8e54e9'],
];

function gradFor(username: string): [string, string] {
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = (h * 31 + username.charCodeAt(i)) % GR.length;
  }
  return GR[h];
}

function getInitials(nameOrUser: string): string {
  const parts = nameOrUser.split(/[ ._]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (nameOrUser[0] || 'U').toUpperCase();
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'abhi';
  if (m < 60) return `${m}m`;
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(diff / 86400000);
  return `${d}d`;
}

function formatClockTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export const PixelgramStoryViewer: React.FC<PixelgramStoryViewerProps> = ({
  groups,
  groupKeys,
  activeUserId: propActiveUserId,
  initialIndex = 0,
  currentUser,
  onClose,
  onDeleteStory,
  onOpenProfile,
  onStoryLiked,
}) => {
  const [currentUserId, setCurrentUserId] = useState(propActiveUserId);
  const [cur, setCur] = useState(initialIndex);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'liked' | 'nolike'>('all');

  // Real viewers & like states
  const [viewersMap, setViewersMap] = useState<Record<string, StoryViewer[]>>({});
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [viewsCount, setViewsCount] = useState(0);

  // Story Reply state
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // High performance timer refs (no re-render during tick!)
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const curRef = useRef(cur);
  curRef.current = cur;
  const isSheetOpenRef = useRef(isSheetOpen);
  isSheetOpenRef.current = isSheetOpen;
  const isClosedRef = useRef(isClosed);
  isClosedRef.current = isClosed;

  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const elapsedRef = useRef(0);
  const t0Ref = useRef(performance.now());
  const rafRef = useRef<number>(0);

  // Audio, video, and DOM refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Scroll synchronization flag
  const progScrollRef = useRef(false);
  const progTimerRef = useRef<any>(null);
  const srafRef = useRef<number>(0);

  const activeGroup = groups[currentUserId] || groups[propActiveUserId];
  const stories = activeGroup?.stories || [];
  const authorProfile = activeGroup?.profile;
  const currentStory: Story | undefined = stories[cur];

  const loggedInId = currentUser?.id || '';
  const isOwnStory = !!loggedInId && (
    (currentStory && currentStory.user_id === loggedInId) ||
    (authorProfile && authorProfile.user_id === loggedInId) ||
    currentUserId === loggedInId
  );

  // Sync prop changes
  useEffect(() => {
    setCurrentUserId(propActiveUserId);
    setCur(initialIndex);
  }, [propActiveUserId, initialIndex]);

  // Center thumbnail in capsule strip
  const centerThumb = useCallback((idx: number, smooth: boolean) => {
    const st = stripRef.current;
    if (!st) return;
    const items = st.children;
    const t = items[idx] as HTMLElement;
    if (!t) return;
    progScrollRef.current = true;
    st.scrollTo({
      left: t.offsetLeft - (st.clientWidth - t.offsetWidth) / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
    clearTimeout(progTimerRef.current);
    progTimerRef.current = setTimeout(() => {
      progScrollRef.current = false;
      scaleStrip();
    }, 450);
  }, []);

  // Scale strip items dynamically
  const scaleStrip = useCallback(() => {
    const st = stripRef.current;
    if (!st || st.clientWidth === 0) return 0;
    const mid = st.scrollLeft + st.clientWidth / 2;
    let best = 0;
    let bd = 1e9;
    const all = Array.from(st.children) as HTMLElement[];
    all.forEach((t, i) => {
      const d = (t.offsetLeft + t.offsetWidth / 2 - mid) / 72;
      const a = Math.abs(d);
      t.style.transform = `scale(${Math.max(0.68, 1.26 - 0.3 * a).toFixed(3)})`;
      t.style.zIndex = String(10 - Math.min(9, Math.round(a)));
      if (a < bd) {
        bd = a;
        best = i;
      }
    });
    return best;
  }, []);

  // Navigation function
  const go = useCallback((targetIdx: number, fromScroll = false) => {
    if (!stories.length) return;

    if (targetIdx < 0) {
      // Previous user's stories
      const cIdx = groupKeys.indexOf(currentUserId);
      if (cIdx > 0) {
        const prevUid = groupKeys[cIdx - 1];
        const prevGroup = groups[prevUid];
        setCurrentUserId(prevUid);
        setCur(prevGroup ? Math.max(0, prevGroup.stories.length - 1) : 0);
        elapsedRef.current = 0;
        t0Ref.current = performance.now();
      }
      return;
    }

    if (targetIdx >= stories.length) {
      if (isSheetOpenRef.current) {
        elapsedRef.current = DUR;
        if (barRefs.current[curRef.current]) {
          barRefs.current[curRef.current]!.style.width = '100%';
        }
        return;
      }
      // Next user's stories
      const cIdx = groupKeys.indexOf(currentUserId);
      if (cIdx !== -1 && cIdx < groupKeys.length - 1) {
        setCurrentUserId(groupKeys[cIdx + 1]);
        setCur(0);
        elapsedRef.current = 0;
        t0Ref.current = performance.now();
      } else {
        setIsClosed(true);
        setTimeout(onClose, 250);
      }
      return;
    }

    setCur(targetIdx);
    elapsedRef.current = 0;
    t0Ref.current = performance.now();

    // Reset progress bars directly in DOM
    barRefs.current.forEach((b, i) => {
      if (!b) return;
      if (i < targetIdx) b.style.width = '100%';
      else if (i > targetIdx) b.style.width = '0%';
    });

    if (!fromScroll) {
      centerThumb(targetIdx, true);
    }
  }, [stories.length, groupKeys, currentUserId, groups, onClose, centerThumb]);

  // High performance RAF tick (pure DOM, no React re-render per frame!)
  useEffect(() => {
    let active = true;

    const tick = (now: number) => {
      if (!active) return;
      const index = curRef.current;
      const bar = barRefs.current[index];

      if (!pausedRef.current && !draggingRef.current && !isSheetOpenRef.current && !isClosedRef.current) {
        elapsedRef.current += now - t0Ref.current;
        if (elapsedRef.current >= DUR) {
          if (index < stories.length - 1) {
            go(index + 1);
          } else {
            const cIdx = groupKeys.indexOf(currentUserId);
            if (cIdx !== -1 && cIdx < groupKeys.length - 1) {
              go(stories.length);
            } else {
              elapsedRef.current = DUR;
              if (bar) bar.style.width = '100%';
              setIsClosed(true);
              setTimeout(onClose, 250);
            }
          }
        } else if (bar) {
          bar.style.width = `${(elapsedRef.current / DUR) * 100}%`;
        }
      }
      t0Ref.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    t0Ref.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [stories.length, groupKeys, currentUserId, go, onClose]);

  // Load real viewers & likes for current story
  useEffect(() => {
    if (!currentStory) return;

    setLikesCount(currentStory.likes_count || 0);
    setViewsCount(currentStory.views_count || 0);
    setShowReplyInput(false);
    setReplyText('');

    if (loggedInId) {
      recordStoryView(currentStory.id, loggedInId).catch(() => {});
      isStoryLiked(currentStory.id, loggedInId).then(setIsLiked).catch(() => {});
    }

    // Load real viewers for this story if not already cached
    const sid = currentStory.id;
    if (viewersMap[sid]) {
      const cached = viewersMap[sid];
      setViewsCount(Math.max(currentStory.views_count || 0, cached.length));
    } else {
      setLoadingViewers(true);
      getStoryViewers(sid)
        .then(vList => {
          setViewersMap(prev => ({ ...prev, [sid]: vList }));
          setViewsCount(Math.max(currentStory.views_count || 0, vList.length));
        })
        .catch(() => {})
        .finally(() => setLoadingViewers(false));
    }
  }, [currentStory?.id, loggedInId]);

  // Audio track playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentStory?.music_preview_url && !isClosed) {
      const startSec = (currentStory.music_start_ms || 0) / 1000;
      try {
        audio.currentTime = startSec;
      } catch {}
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [currentStory?.id, currentStory?.music_preview_url, isClosed]);

  // Open & Close Viewers Sheet
  const openSheet = useCallback(() => {
    setIsSheetOpen(true);
    if (listRef.current) listRef.current.scrollTop = 0;
    setTimeout(() => {
      centerThumb(cur, false);
      scaleStrip();
    }, 50);
  }, [cur, centerThumb, scaleStrip]);

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  const closeStory = useCallback(() => {
    setIsClosed(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  // Strip Scroll Listener with debounce/RAF
  const handleStripScroll = () => {
    cancelAnimationFrame(srafRef.current);
    srafRef.current = requestAnimationFrame(() => {
      const best = scaleStrip();
      if (progScrollRef.current || best >= stories.length) return;
      if (best !== cur) {
        go(best, true);
      }
    });
  };

  // Toggle Like on Story
  const handleLikeToggle = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!loggedInId || !currentStory) return;
    const prev = isLiked;
    const next = !prev;
    setIsLiked(next);
    const newCount = Math.max(0, likesCount + (next ? 1 : -1));
    setLikesCount(newCount);

    if (onStoryLiked) {
      onStoryLiked(currentStory.id, next, newCount);
    }

    try {
      await toggleStoryLike(currentStory.id, loggedInId, prev);
      if (next && currentStory.user_id !== loggedInId) {
        createNotification(currentStory.user_id, 'story_like', loggedInId, currentStory.id).catch(() => {});
      }
    } catch {
      setIsLiked(prev);
      setLikesCount(likesCount);
    }
  };

  // Send Reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !loggedInId || !currentStory) return;
    setSendingReply(true);
    try {
      await sendMessage(currentStory.user_id, `↩️ Story reply: ${replyText.trim()}`);
      if (currentStory.user_id !== loggedInId) {
        createNotification(
          currentStory.user_id,
          'story_reply',
          loggedInId,
          currentStory.id,
          undefined,
          replyText.trim().slice(0, 120)
        ).catch(() => {});
      }
      toast.success('Reply भेजा गया!');
      setReplyText('');
      setShowReplyInput(false);
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  // Delete Story
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentStory) return;
    try {
      await onDeleteStory(currentStory.id);
    } catch {}
  };

  // Share Story
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = window.location.origin;
    if (navigator.share) {
      navigator.share({ title: 'Pixelgram Story', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url)
        .then(() => toast.success('Link copied!'))
        .catch(() => {});
    }
  };

  // Stage gestures: Touch Down, Swipe Down to close, Swipe Up to open viewers, Left/Right navigation
  const touchState = useRef<{ x: number; y: number; m: 'v' | 'h' | null; dx: number; dy: number } | null>(null);

  const resetStage = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.classList.remove('drag');
    stage.style.transform = '';
    stage.style.opacity = '';
    stage.style.borderRadius = '';
    draggingRef.current = false;
  };

  const handleStageTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchState.current = { x: t.clientX, y: t.clientY, m: null, dx: 0, dy: 0 };
  };

  const handleStageTouchMove = (e: React.TouchEvent) => {
    const s = touchState.current;
    const stage = stageRef.current;
    if (!s || !stage) return;
    const t = e.touches[0];
    s.dx = t.clientX - s.x;
    s.dy = t.clientY - s.y;

    if (!s.m && (Math.abs(s.dx) > 8 || Math.abs(s.dy) > 8)) {
      s.m = Math.abs(s.dy) > Math.abs(s.dx) && s.dy > 0 ? 'v' : 'h';
    }

    if (s.m === 'v') {
      const d = Math.min(s.dy, 500);
      draggingRef.current = true;
      stage.classList.add('drag');
      stage.style.transform = `translateY(${d}px) scale(${1 - d / 2500})`;
      stage.style.opacity = `${1 - d / 800}`;
      stage.style.borderRadius = '24px';
    }
  };

  const handleStageTouchEnd = () => {
    const s = touchState.current;
    touchState.current = null;
    if (!s) return;
    const { m, dx, dy } = s;

    if (m === 'v') {
      resetStage();
      if (dy > 110) {
        closeStory();
      }
    } else if (m === 'h' && Math.abs(dx) > 60) {
      go(cur + (dx < 0 ? 1 : -1));
    } else if (dy < -50 && isOwnStory) {
      // Swiping up opens Viewers Sheet (Instagram standard gesture)
      openSheet();
    }
  };

  // Viewers sheet touch down drag gesture
  const sheetTouchState = useRef<{ y: number; dy: number; canDrag: boolean } | null>(null);

  const resetSheet = () => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.classList.remove('drag');
    sheet.style.transform = '';
  };

  const handleSheetTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const list = listRef.current;
    const isAtTop = !list || list.scrollTop <= 0;
    sheetTouchState.current = { y: t.clientY, dy: 0, canDrag: isAtTop };
  };

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    const st = sheetTouchState.current;
    const sheet = sheetRef.current;
    if (!st || !st.canDrag || !sheet) return;
    const t = e.touches[0];
    const dy = t.clientY - st.y;
    st.dy = dy;
    if (dy > 0) {
      sheet.classList.add('drag');
      sheet.style.transform = `translateY(${dy}px)`;
    }
  };

  const handleSheetTouchEnd = () => {
    const st = sheetTouchState.current;
    sheetTouchState.current = null;
    if (!st) return;
    resetSheet();
    if (st.dy > 110) {
      closeSheet();
    }
  };

  if (!currentStory || !authorProfile) return null;

  const currentIsVideo = (
    (currentStory as Story & { media_type?: string }).media_type === 'video' ||
    currentStory.image_url?.match(/\.(mp4|mov|webm|avi)(\?|$)/i)
  );

  const currentViewers = viewersMap[currentStory.id] || [];
  const likedViewers = currentViewers.filter(v => v.liked);
  const unlikedViewers = currentViewers.filter(v => !v.liked);
  const filteredViewers = filter === 'liked' ? likedViewers : filter === 'nolike' ? unlikedViewers : currentViewers;

  const authorGrad = gradFor(authorProfile.username || 'user');

  return createPortal(
    <div className={`phone ${isSheetOpen ? 'open' : ''} ${isClosed ? 'closed' : ''}`}>
      <style>{`
        .phone {
          position: fixed; inset: 0; z-index: 9999;
          height: 100dvh; width: 100vw; max-width: 440px; margin: 0 auto;
          background: #0b0c12; color: #f4f5fb;
          font-family: Roboto, system-ui, -apple-system, sans-serif;
          overflow: hidden; overscroll-behavior: none; user-select: none;
        }

        /* ---------- story stage ---------- */
        .stage {
          position: absolute; inset: 0; overflow: hidden; background: #000;
          touch-action: none; will-change: transform;
          transition: transform .32s cubic-bezier(.2,.8,.2,1), opacity .32s;
        }
        .stage.drag { transition: none !important; }
        .phone.closed .stage {
          transform: translateY(100%); opacity: 0; pointer-events: none;
        }

        .bars {
          position: absolute; top: calc(10px + env(safe-area-inset-top, 0px));
          left: 10px; right: 10px; display: flex; gap: 4px; z-index: 10;
        }
        .bar {
          flex: 1; height: 3px; border-radius: 3px; background: rgba(255,255,255,.28); overflow: hidden;
        }
        .bar i {
          display: block; height: 100%; width: 0; background: #fff;
        }

        .head {
          position: absolute; top: calc(22px + env(safe-area-inset-top, 0px));
          left: 10px; right: 10px; display: flex; align-items: center; gap: 8px; z-index: 10;
        }
        .av {
          width: 38px; height: 38px; border-radius: 50%; flex: none; display: grid; place-items: center;
          font-weight: 700; font-size: 14px; color: #fff; border: 2px solid #fff; overflow: hidden;
        }
        .av img { width: 100%; height: 100%; object-fit: cover; }
        .who { min-width: 0; }
        .who b {
          font-size: 15px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: #fff;
        }
        .who b .stat-btn {
          font-weight: 500; font-size: 12px; color: #e2e4f0;
          display: inline-flex; align-items: center; gap: 3px;
          background: none; border: 0; padding: 0; cursor: pointer;
        }
        .who em {
          font-style: normal; font-size: 11.5px; color: #d3d6e6; display: flex; gap: 8px; align-items: center;
        }
        .sp { flex: 1; }
        .ib {
          width: 34px; height: 34px; border-radius: 50%; background: rgba(40,40,48,.7);
          display: grid; place-items: center; flex: none; color: #fff; border: 0; cursor: pointer;
        }
        .ib:active { background: rgba(70,70,85,.85); }
        .ib svg { width: 16px; height: 16px; }

        .slide-media {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          background: #000;
        }
        .slide-media img, .slide-media video {
          width: 100%; height: 100%; object-fit: contain; pointer-events: none;
        }

        .tap {
          position: absolute; top: 80px; bottom: 90px; width: 34%; z-index: 6;
        }
        .tap.l { left: 0; }
        .tap.r { right: 0; }

        /* Story caption */
        .caption-box {
          position: absolute; bottom: 84px; left: 16px; right: 16px; z-index: 8; text-align: center;
          pointer-events: none;
        }
        .caption-box span {
          display: inline-block; background: rgba(0,0,0,.65); backdrop-filter: blur(8px);
          color: #fff; font-size: 14px; font-weight: 500; padding: 7px 16px; border-radius: 14px;
          max-width: 90%; word-break: break-word;
        }

        /* ---------- bottom pill ---------- */
        .pill {
          position: absolute; left: 14px; right: 14px;
          bottom: calc(14px + env(safe-area-inset-bottom, 0px));
          height: 46px; border-radius: 24px; z-index: 9;
          display: flex; align-items: center; justify-content: space-between; padding: 0 16px;
          background: rgba(20,20,26,.72); backdrop-filter: blur(14px);
          border: 1px solid rgba(255,255,255,.14); font-weight: 600; font-size: 15px; color: #fff;
          cursor: pointer; transition: opacity .25s, transform .3s;
        }
        .pill span { display: flex; align-items: center; gap: 9px; }
        .pill .h { color: #ff3b5c; fill: #ff3b5c; }
        .phone.open .pill, .phone.closed .pill {
          opacity: 0; transform: translateY(20px); pointer-events: none;
        }

        /* Other's story bottom bar */
        .other-bar {
          position: absolute; left: 14px; right: 14px;
          bottom: calc(14px + env(safe-area-inset-bottom, 0px));
          z-index: 9; display: flex; align-items: center; gap: 10px;
        }
        .phone.open .other-bar, .phone.closed .other-bar {
          opacity: 0; transform: translateY(20px); pointer-events: none;
        }

        /* ---------- viewers sheet ---------- */
        .sheet {
          position: absolute; left: 0; right: 0; bottom: 0; height: 100%;
          padding-top: calc(12px + env(safe-area-inset-top, 0px));
          background: #14172b; border-radius: 26px 26px 0 0; z-index: 20;
          display: flex; flex-direction: column; transform: translateY(105%);
          transition: transform .38s cubic-bezier(.2,.8,.2,1);
          box-shadow: 0 -14px 40px rgba(0,0,0,.5);
        }
        .phone.open .sheet { transform: none; }
        .sheet.drag { transition: none !important; }
        .grab {
          width: 38px; height: 4px; border-radius: 4px; background: rgba(255,255,255,.22);
          margin: 9px auto 0; flex: none; cursor: grab;
        }
        .sh-top {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 18px 6px; flex: none;
        }
        .sh-top h2 {
          font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: #fff;
        }

        /* story strip (capsule carousel) */
        .strip-wrap {
          flex: none; position: relative; background: #18191f;
          border-top: 1px solid rgba(255,255,255,.08); border-bottom: 1px solid rgba(255,255,255,.08);
          margin-top: 4px;
        }
        .strip-wrap::after {
          content: ""; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
          border: 6px solid transparent; border-bottom-color: #14172b;
        }
        .strip {
          display: flex; align-items: center; gap: 8px; height: 158px;
          overflow-x: auto; overflow-y: hidden; padding: 0 calc(50% - 32px);
          scrollbar-width: none; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch; touch-action: pan-x; cursor: grab;
        }
        .strip::-webkit-scrollbar { display: none; }
        .th {
          flex: none; width: 64px; height: 108px; border-radius: 40px; position: relative;
          scroll-snap-align: center; scroll-snap-stop: always; overflow: hidden;
          border: 2px solid rgba(255,255,255,.72); will-change: transform;
          transition: border-color .2s, box-shadow .2s;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          color: #fff; cursor: pointer; background-size: cover; background-position: center;
        }
        .th.on {
          border-color: #fff; box-shadow: 0 4px 18px rgba(0,0,0,.55);
        }
        .th::before {
          content: ""; position: absolute; inset: auto 0 0 0; height: 46%;
          background: linear-gradient(transparent, rgba(0,0,0,.55));
        }
        .th .cnt {
          position: absolute; bottom: 11px; left: 0; right: 0;
          display: flex; align-items: center; justify-content: center; gap: 4px;
          font-size: 14px; font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,.6);
        }

        /* tabs: segmented control + sliding indicator */
        .tabs {
          position: relative; display: grid; grid-template-columns: repeat(3, 1fr);
          flex: none; margin: 14px 16px 6px; padding: 4px; border-radius: 20px;
          background: #0d1020; border: 1px solid rgba(255,255,255,.08);
          box-shadow: inset 0 2px 8px rgba(0,0,0,.35);
        }
        .tabs::before {
          content: ""; position: absolute; top: 4px; bottom: 4px; left: 4px;
          width: calc((100% - 8px) / 3); border-radius: 16px;
          background: linear-gradient(135deg, #6c7bff, #c24bff 55%, #ff4d8d);
          box-shadow: 0 6px 18px rgba(140, 90, 255, .45);
          transform: translateX(calc(var(--tab-i, 0) * 100%));
          transition: transform .35s cubic-bezier(.3, 1.2, .4, 1);
        }
        .tab {
          position: relative; z-index: 1; height: 40px; border-radius: 16px;
          font-size: 13px; font-weight: 600; color: #9aa0bd;
          display: flex; gap: 6px; align-items: center; justify-content: center;
          transition: color .25s; cursor: pointer; border: 0; background: none;
        }
        .tab.on { color: #fff; }
        .tab .n {
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
          background: rgba(255,255,255,.09); font-size: 11.5px; font-weight: 700;
          display: grid; place-items: center; transition: .25s;
        }
        .tab.on .n { background: rgba(255,255,255,.25); }
        .tab .hh { color: #ff3b5c; fill: #ff3b5c; stroke: none; transition: .25s; }
        .tab.on .hh { color: #fff; fill: #fff; }

        .list {
          flex: 1; overflow-y: auto; overscroll-behavior: contain;
          padding: 2px 0 calc(14px + env(safe-area-inset-bottom, 0px)); min-height: 0;
        }
        .row {
          display: flex; align-items: center; gap: 12px; margin: 0 12px; padding: 10px 8px;
          border-radius: 16px; animation: in .3s both; transition: background .2s; cursor: pointer;
        }
        .row:active { background: rgba(255,255,255,.05); }
        @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .row .pa {
          width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
          font-weight: 700; color: #fff; font-size: 15px; flex: none; position: relative;
          box-shadow: 0 0 0 2px #14172b, 0 0 0 4px rgba(255,255,255,.14); overflow: hidden;
        }
        .row.lkd .pa {
          box-shadow: 0 0 0 2px #14172b, 0 0 0 4px #ff3b5c;
        }
        .row .pa img { width: 100%; height: 100%; object-fit: cover; }
        .row .mid { flex: 1; min-width: 0; text-align: left; }
        .row .mid b {
          display: block; font-size: 14.5px; white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis; color: #fff;
        }
        .row .mid span { font-size: 12.5px; color: #9aa0bd; }
        .chip {
          display: flex; align-items: center; gap: 5px; padding: 6px 11px;
          border-radius: 14px; font-size: 12px; font-weight: 600; color: #9aa0bd;
          background: rgba(255,255,255,.06); white-space: nowrap;
        }
        .chip.lk { color: #ff6a85; background: rgba(255,59,92,.14); }
        .chip.lk svg { fill: #ff3b5c; stroke: none; }
        .empty {
          text-align: center; color: #9aa0bd; padding: 36px 24px; font-size: 14px;
        }
        .empty svg { width: 34px; height: 34px; margin-bottom: 10px; opacity: .6; }
      `}</style>

      {/* ---------- story stage ---------- */}
      <div
        ref={stageRef}
        className="stage"
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageTouchEnd}
        onTouchCancel={handleStageTouchEnd}
      >
        {/* Progress Bars */}
        <div className="bars">
          {stories.map((_, i) => (
            <div key={i} className="bar">
              <i
                ref={el => { barRefs.current[i] = el; }}
                style={{ width: i < cur ? '100%' : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="head" onClick={e => e.stopPropagation()}>
          <div
            className="av"
            style={{
              background: authorProfile.avatar_url
                ? undefined
                : `linear-gradient(135deg, ${authorGrad[0]}, ${authorGrad[1]})`,
            }}
            onClick={() => {
              onClose();
              onOpenProfile(authorProfile.user_id);
            }}
          >
            {authorProfile.avatar_url ? (
              <img src={authorProfile.avatar_url} alt="" />
            ) : (
              getInitials(authorProfile.full_name || authorProfile.username)
            )}
          </div>

          <div className="who">
            <b>
              <span
                onClick={() => {
                  onClose();
                  onOpenProfile(authorProfile.user_id);
                }}
                className="cursor-pointer hover:underline truncate max-w-[150px]"
              >
                {authorProfile.username}
              </span>

              {/* Viewers & Likes Buttons in Header (clickable!) */}
              <button
                type="button"
                className="stat-btn"
                onClick={openSheet}
                title="Viewers"
              >
                <Eye style={{ width: 13, height: 13 }} />
                <i style={{ fontStyle: 'normal' }}>{viewsCount}</i>
              </button>
              <button
                type="button"
                className="stat-btn"
                onClick={() => {
                  setFilter('liked');
                  openSheet();
                }}
                title="Likes"
              >
                <Heart
                  style={{
                    width: 13,
                    height: 13,
                    fill: likesCount > 0 ? '#ff3b5c' : 'none',
                    color: likesCount > 0 ? '#ff3b5c' : '#e2e4f0'
                  }}
                />
                <i style={{ fontStyle: 'normal' }}>{likesCount}</i>
              </button>
            </b>
            <em>
              <span>{formatClockTime(currentStory.created_at)}</span>
              <span>· {formatTimeAgo(currentStory.created_at)}</span>
              {currentStory.music_title && (
                <span className="inline-flex items-center gap-1 text-[11px] text-white/90 bg-white/10 px-1.5 py-0.5 rounded-full ml-1">
                  <Music2 className="w-2.5 h-2.5 text-primary animate-pulse" />
                  <span className="truncate max-w-[100px]">{currentStory.music_title}</span>
                </span>
              )}
            </em>
          </div>

          <div className="sp" />

          {/* Delete (for author) */}
          {isOwnStory && (
            <button className="ib" onClick={handleDelete} aria-label="Delete story" title="Delete">
              <Trash2 />
            </button>
          )}

          {/* Share */}
          <button className="ib" onClick={handleShare} aria-label="Share story" title="Share">
            <Share2 />
          </button>

          {/* Close */}
          <button className="ib" onClick={onClose} aria-label="Close story" title="Close">
            <X />
          </button>
        </div>

        {/* Media content */}
        <div className="slide-media">
          {currentIsVideo ? (
            <video
              ref={videoRef}
              src={currentStory.image_url}
              autoPlay
              loop
              playsInline
              muted={!!currentStory.music_preview_url && !!currentStory.mute_original}
            />
          ) : (
            <img src={currentStory.image_url} alt="" />
          )}
        </div>

        {/* Audio element for background music */}
        {currentStory.music_preview_url && (
          <audio
            ref={audioRef}
            src={currentStory.music_preview_url}
            autoPlay
            loop
            preload="auto"
            playsInline
            onLoadedMetadata={e => {
              const s = (currentStory.music_start_ms || 0) / 1000;
              try { e.currentTarget.currentTime = s; } catch {}
              e.currentTarget.play().catch(() => {});
            }}
          />
        )}

        {/* Caption */}
        {currentStory.caption && (
          <div className="caption-box">
            <span>{currentStory.caption}</span>
          </div>
        )}

        {/* Left / Right Tap zones (with hold-to-pause) */}
        <div
          className="tap l"
          onClick={e => {
            e.stopPropagation();
            go(cur - 1);
          }}
          onPointerDown={() => { pausedRef.current = true; }}
          onPointerUp={() => { pausedRef.current = false; }}
          onPointerLeave={() => { pausedRef.current = false; }}
          onPointerCancel={() => { pausedRef.current = false; }}
        />
        <div
          className="tap r"
          onClick={e => {
            e.stopPropagation();
            go(cur + 1);
          }}
          onPointerDown={() => { pausedRef.current = true; }}
          onPointerUp={() => { pausedRef.current = false; }}
          onPointerLeave={() => { pausedRef.current = false; }}
          onPointerCancel={() => { pausedRef.current = false; }}
        />
      </div>

      {/* ---------- bottom pill (Own Story) ---------- */}
      {isOwnStory && (
        <button
          type="button"
          className="pill"
          id="pill"
          onClick={e => {
            e.stopPropagation();
            openSheet();
          }}
        >
          <span>
            <Eye style={{ width: 18, height: 18 }} />
            <i style={{ fontStyle: 'normal' }}>{viewsCount} ने देखा</i>
          </span>
          <span>
            <Heart className="h" style={{ width: 18, height: 18 }} />
            <i style={{ fontStyle: 'normal' }}>{likesCount}</i>
          </span>
        </button>
      )}

      {/* ---------- other's story bottom bar (Reply + Like) ---------- */}
      {!isOwnStory && (
        <div className="other-bar" onClick={e => e.stopPropagation()}>
          {showReplyInput ? (
            <form onSubmit={handleSendReply} className="flex-1 flex items-center gap-2">
              <input
                type="text"
                placeholder="Reply भेजें…"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                className="flex-1 h-10 px-4 bg-white/10 border border-white/20 text-white placeholder:text-white/60 rounded-full text-sm outline-none backdrop-blur-md"
                autoFocus
              />
              <button
                type="submit"
                disabled={!replyText.trim() || sendingReply}
                className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-white disabled:opacity-50"
              >
                {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setShowReplyInput(false)}
                className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <>
              <button
                onClick={() => setShowReplyInput(true)}
                className="flex-1 h-11 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-white/80 text-sm flex items-center px-4 gap-2 transition-colors hover:bg-white/15"
              >
                <Send className="w-4 h-4" />
                <span>Reply भेजें…</span>
              </button>
              <button
                onClick={handleLikeToggle}
                className="h-11 px-4 rounded-full bg-white/10 border border-white/20 backdrop-blur-md flex items-center gap-2 text-white transition-colors hover:bg-white/15"
              >
                <Heart
                  className={`w-5 h-5 transition-transform ${isLiked ? 'fill-[#ff3b5c] text-[#ff3b5c] scale-110' : 'text-white'}`}
                />
                <span className="text-xs font-bold">{likesCount}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* ---------- viewers sheet ---------- */}
      <section
        ref={sheetRef}
        className="sheet"
        id="sheet"
        aria-label="Viewers"
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
        onTouchCancel={handleSheetTouchEnd}
      >
        <div className="grab" onClick={closeSheet} />
        <div className="sh-top">
          <h2>
            <Eye style={{ width: 19, height: 19 }} />
            <span>Viewers ({viewsCount})</span>
          </h2>
          <button className="ib" onClick={closeSheet} aria-label="Close sheet">
            <X />
          </button>
        </div>

        {/* Capsule Carousel Strip */}
        <div className="strip-wrap">
          <div
            ref={stripRef}
            className="strip"
            id="strip"
            onScroll={handleStripScroll}
          >
            {stories.map((st, i) => {
              const isActive = i === cur;
              const stViews = (viewersMap[st.id]?.length) ?? (st.views_count || 0);
              return (
                <button
                  key={st.id}
                  className={`th ${isActive ? 'on' : ''}`}
                  style={{
                    backgroundImage: `url(${st.image_url})`,
                  }}
                  onClick={() => go(i)}
                >
                  <span className="cnt">
                    <Eye style={{ width: 13, height: 13 }} />
                    <i style={{ fontStyle: 'normal' }}>{stViews}</i>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Segmented Tabs with Sliding Indicator */}
        <div
          className="tabs"
          id="tabs"
          style={{
            ['--tab-i' as string]: filter === 'all' ? 0 : filter === 'liked' ? 1 : 2,
          }}
        >
          <button
            className={`tab ${filter === 'all' ? 'on' : ''}`}
            onClick={() => setFilter('all')}
          >
            Sab <span className="n">{currentViewers.length}</span>
          </button>
          <button
            className={`tab ${filter === 'liked' ? 'on' : ''}`}
            onClick={() => setFilter('liked')}
          >
            <Heart className="hh" style={{ width: 14, height: 14 }} />
            Like <span className="n">{likedViewers.length}</span>
          </button>
          <button
            className={`tab ${filter === 'nolike' ? 'on' : ''}`}
            onClick={() => setFilter('nolike')}
          >
            Bina like <span className="n">{unlikedViewers.length}</span>
          </button>
        </div>

        {/* Viewers List */}
        <div ref={listRef} className="list" id="list">
          {loadingViewers && currentViewers.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-white/50" />
            </div>
          ) : filteredViewers.length === 0 ? (
            <div className="empty">
              <Eye />
              <br />
              {currentViewers.length ? 'Is list me koi nahi' : 'Abhi tak kisi ne ye story nahi dekhi'}
            </div>
          ) : (
            filteredViewers.map((v, i) => {
              const g = gradFor(v.profile.username || 'user');
              return (
                <div
                  key={v.profile.user_id}
                  className={`row ${v.liked ? 'lkd' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  onClick={() => {
                    closeSheet();
                    onClose();
                    onOpenProfile(v.profile.user_id);
                  }}
                >
                  <div
                    className="pa"
                    style={{
                      background: v.profile.avatar_url
                        ? undefined
                        : `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
                    }}
                  >
                    {v.profile.avatar_url ? (
                      <img src={v.profile.avatar_url} alt="" />
                    ) : (
                      getInitials(v.profile.full_name || v.profile.username)
                    )}
                  </div>
                  <div className="mid">
                    <b>{v.profile.username}</b>
                    <span>{v.profile.full_name || v.profile.username}</span>
                  </div>
                  {v.liked ? (
                    <div className="chip lk">
                      <Heart style={{ width: 13, height: 13 }} />
                      Like kiya
                    </div>
                  ) : (
                    <div className="chip">
                      {formatTimeAgo(v.viewed_at)} pehle
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>,
    document.body
  );
};

export default PixelgramStoryViewer;
