import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye, Heart, Trash2, Share2, X, Send, ChevronLeft, ChevronRight,
  Music2, Clock, Loader2, Sparkles, MessageCircle
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
  const [storyIndex, setStoryIndex] = useState(initialIndex);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'liked' | 'nolike'>('all');

  // Real viewers & like states
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [viewsCount, setViewsCount] = useState(0);

  // Story Reply state
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Timer & progress
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Audio & video refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const activeGroup = groups[currentUserId] || groups[propActiveUserId];
  const stories = activeGroup?.stories || [];
  const authorProfile = activeGroup?.profile;
  const currentStory: Story | undefined = stories[storyIndex];
  const isOwnStory = !!currentUser && !!currentStory && currentStory.user_id === currentUser.id;

  // Sync prop changes
  useEffect(() => {
    setCurrentUserId(propActiveUserId);
    setStoryIndex(initialIndex);
  }, [propActiveUserId, initialIndex]);

  // Load story data: viewers, likes, views count
  useEffect(() => {
    if (!currentStory) return;
    setLikesCount(currentStory.likes_count || 0);
    setViewsCount(currentStory.views_count || 0);
    setProgress(0);
    setShowReplyInput(false);
    setReplyText('');

    if (currentUser) {
      recordStoryView(currentStory.id, currentUser.id).catch(() => {});
      isStoryLiked(currentStory.id, currentUser.id).then(setIsLiked).catch(() => {});
    }

    if (isOwnStory) {
      setLoadingViewers(true);
      getStoryViewers(currentStory.id)
        .then(vList => {
          setViewers(vList);
          if (vList.length > (currentStory.views_count || 0)) {
            setViewsCount(vList.length);
          }
        })
        .catch(() => setViewers([]))
        .finally(() => setLoadingViewers(false));
    } else {
      setViewers([]);
    }
  }, [currentStory?.id, isOwnStory, currentUser?.id]);

  // Handle music track audio
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

  // Switch between stories or groups
  const goToStory = useCallback((index: number, smoothThumb = true) => {
    if (!stories.length) return;
    if (index >= 0 && index < stories.length) {
      setStoryIndex(index);
      setProgress(0);
      centerThumb(index, smoothThumb);
    } else if (index >= stories.length) {
      // Go to next user's story if available
      const currentGroupIdx = groupKeys.indexOf(currentUserId);
      if (currentGroupIdx !== -1 && currentGroupIdx < groupKeys.length - 1) {
        setCurrentUserId(groupKeys[currentGroupIdx + 1]);
        setStoryIndex(0);
        setProgress(0);
      } else {
        // All stories finished
        setIsClosed(true);
        setTimeout(onClose, 250);
      }
    } else if (index < 0) {
      // Go to previous user's story
      const currentGroupIdx = groupKeys.indexOf(currentUserId);
      if (currentGroupIdx > 0) {
        const prevUid = groupKeys[currentGroupIdx - 1];
        const prevGroup = groups[prevUid];
        setCurrentUserId(prevUid);
        setStoryIndex(prevGroup ? Math.max(0, prevGroup.stories.length - 1) : 0);
        setProgress(0);
      }
    }
  }, [stories.length, groupKeys, currentUserId, groups, onClose]);

  // Timer loop
  useEffect(() => {
    if (isPaused || isSheetOpen || isClosed || !currentStory) return;

    let rafId: number;
    let lastTime = performance.now();
    let currentElapsed = 0;

    const frame = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      currentElapsed += dt;
      const pct = Math.min(100, (currentElapsed / DUR) * 100);
      setProgress(pct);

      if (currentElapsed >= DUR) {
        goToStory(storyIndex + 1);
      } else {
        rafId = requestAnimationFrame(frame);
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [storyIndex, isPaused, isSheetOpen, isClosed, currentStory?.id, goToStory]);

  // Center thumbnail in carousel strip
  const centerThumb = (idx: number, smooth: boolean) => {
    const st = stripRef.current;
    if (!st) return;
    const items = st.children;
    const t = items[idx] as HTMLElement;
    if (!t) return;
    st.scrollTo({
      left: t.offsetLeft - (st.clientWidth - t.offsetWidth) / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setTimeout(scaleStrip, 120);
  };

  // Dynamic scale calculation for carousel capsules
  const scaleStrip = useCallback(() => {
    const st = stripRef.current;
    if (!st) return 0;
    const mid = st.scrollLeft + st.clientWidth / 2;
    let best = 0;
    let minDiff = 1e9;
    const all = Array.from(st.children) as HTMLElement[];
    all.forEach((t, i) => {
      const d = (t.offsetLeft + t.offsetWidth / 2 - mid) / 72;
      const a = Math.abs(d);
      const scale = Math.max(0.68, 1.26 - 0.3 * a);
      t.style.transform = `scale(${scale.toFixed(3)})`;
      t.style.zIndex = String(10 - Math.min(9, Math.round(a)));
      if (a < minDiff) {
        minDiff = a;
        best = i;
      }
    });
    return best;
  }, []);

  // Update strip on mount or story change
  useEffect(() => {
    setTimeout(() => {
      centerThumb(storyIndex, false);
      scaleStrip();
    }, 50);
  }, [storyIndex, scaleStrip]);

  // Handle Strip Scroll snap and real-time selection
  const handleStripScroll = () => {
    const best = scaleStrip();
    if (best >= 0 && best < stories.length && best !== storyIndex) {
      setStoryIndex(best);
    }
  };

  // Handle like toggle
  const handleLikeToggle = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser || !currentStory) return;
    const prev = isLiked;
    const next = !prev;
    setIsLiked(next);
    const newCount = Math.max(0, likesCount + (next ? 1 : -1));
    setLikesCount(newCount);

    if (onStoryLiked) {
      onStoryLiked(currentStory.id, next, newCount);
    }

    try {
      await toggleStoryLike(currentStory.id, currentUser.id, prev);
      if (next && currentStory.user_id !== currentUser.id) {
        createNotification(currentStory.user_id, 'story_like', currentUser.id, currentStory.id).catch(() => {});
      }
    } catch {
      setIsLiked(prev);
      setLikesCount(likesCount);
    }
  };

  // Handle Send Reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !currentUser || !currentStory) return;
    setSendingReply(true);
    try {
      await sendMessage(currentStory.user_id, `↩️ Story reply: ${replyText.trim()}`);
      if (currentStory.user_id !== currentUser.id) {
        createNotification(
          currentStory.user_id,
          'story_reply',
          currentUser.id,
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

  // Handle Delete
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentStory) return;
    try {
      await onDeleteStory(currentStory.id);
    } catch {}
  };

  // Handle Share
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

  // Stage swipe down to close or swipe left/right
  const touchState = useRef<{ x: number; y: number; m: 'v' | 'h' | null; dx: number; dy: number } | null>(null);

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
      stage.classList.add('drag');
      stage.style.transform = `translateY(${d}px) scale(${1 - d / 2500})`;
      stage.style.opacity = `${1 - d / 800}`;
      stage.style.borderRadius = '24px';
    }
  };

  const handleStageTouchEnd = () => {
    const s = touchState.current;
    const stage = stageRef.current;
    touchState.current = null;
    if (!s || !stage) return;

    stage.classList.remove('drag');
    stage.style.transform = '';
    stage.style.opacity = '';
    stage.style.borderRadius = '';

    if (s.m === 'v' && s.dy > 110) {
      setIsClosed(true);
      setTimeout(onClose, 250);
    } else if (s.m === 'h' && Math.abs(s.dx) > 60) {
      goToStory(storyIndex + (s.dx < 0 ? 1 : -1));
    }
  };

  // Sheet drag down to close
  const sheetTouchState = useRef<{ y: number; dy: number; canDrag: boolean } | null>(null);

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
    const sheet = sheetRef.current;
    sheetTouchState.current = null;
    if (!sheet) return;
    sheet.classList.remove('drag');
    sheet.style.transform = '';
    if (st && st.dy > 110) {
      setIsSheetOpen(false);
    }
  };

  if (!currentStory || !authorProfile) return null;

  const currentIsVideo = (
    (currentStory as Story & { media_type?: string }).media_type === 'video' ||
    currentStory.image_url?.match(/\.(mp4|mov|webm|avi)(\?|$)/i)
  );

  const likedViewers = viewers.filter(v => v.liked);
  const unlikedViewers = viewers.filter(v => !v.liked);
  const filteredViewers = filter === 'liked' ? likedViewers : filter === 'nolike' ? unlikedViewers : viewers;

  const authorGrad = gradFor(authorProfile.username || 'user');

  return createPortal(
    <div className={`pixelgram-story-root ${isClosed ? 'closed' : ''}`}>
      <style>{`
        .pixelgram-story-root {
          position: fixed; inset: 0; z-index: 9999; background: #000;
          color: #f4f5fb; font-family: Roboto, system-ui, -apple-system, sans-serif;
          overscroll-behavior: none; overflow: hidden; user-select: none;
        }
        .pixelgram-story-root .phone {
          position: relative; height: 100dvh; max-width: 480px; margin: 0 auto;
          background: #0b0c12; overflow: hidden;
        }
        /* Story Stage */
        .pixelgram-story-root .stage {
          position: absolute; inset: 0; overflow: hidden; background: #000;
          touch-action: none; will-change: transform;
          transition: transform .32s cubic-bezier(.2,.8,.2,1), opacity .32s;
        }
        .pixelgram-story-root .stage.drag { transition: none !important; }
        .pixelgram-story-root.closed .stage {
          transform: translateY(100%); opacity: 0; pointer-events: none;
        }
        /* Bars */
        .pixelgram-story-root .bars {
          position: absolute; top: calc(10px + env(safe-area-inset-top, 0px));
          left: 10px; right: 10px; display: flex; gap: 4px; z-index: 15;
        }
        .pixelgram-story-root .bar {
          flex: 1; height: 3px; border-radius: 3px; background: rgba(255,255,255,.28); overflow: hidden;
        }
        .pixelgram-story-root .bar i {
          display: block; height: 100%; width: 0; background: #fff;
        }
        /* Head */
        .pixelgram-story-root .head {
          position: absolute; top: calc(22px + env(safe-area-inset-top, 0px));
          left: 10px; right: 10px; display: flex; align-items: center; gap: 8px; z-index: 15;
        }
        .pixelgram-story-root .av {
          width: 38px; height: 38px; border-radius: 50%; flex: none; display: grid; place-items: center;
          font-weight: 700; font-size: 14px; color: #fff; border: 2px solid #fff; overflow: hidden;
        }
        .pixelgram-story-root .av img { width: 100%; height: 100%; object-fit: cover; }
        .pixelgram-story-root .who { min-width: 0; text-align: left; }
        .pixelgram-story-root .who b {
          font-size: 14.5px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: #fff;
        }
        .pixelgram-story-root .who b span {
          font-weight: 500; font-size: 12px; color: #e2e4f0; display: inline-flex; align-items: center; gap: 3px;
        }
        .pixelgram-story-root .who em {
          font-style: normal; font-size: 11.5px; color: #d3d6e6; display: flex; gap: 8px; align-items: center;
        }
        .pixelgram-story-root .sp { flex: 1; }
        .pixelgram-story-root .ib {
          width: 34px; height: 34px; border-radius: 50%; background: rgba(40,40,48,.7);
          display: grid; place-items: center; flex: none; color: #fff; cursor: pointer; border: 0;
          transition: background .2s;
        }
        .pixelgram-story-root .ib:active { background: rgba(80,80,95,.85); }
        .pixelgram-story-root .ib svg { width: 16px; height: 16px; stroke-width: 2; }

        /* Media display */
        .pixelgram-story-root .media-wrap {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          background: #000;
        }
        .pixelgram-story-root .media-wrap img,
        .pixelgram-story-root .media-wrap video {
          width: 100%; height: 100%; object-fit: contain; pointer-events: none;
        }

        /* Tap zones */
        .pixelgram-story-root .tap {
          position: absolute; top: 80px; bottom: 90px; width: 34%; z-index: 5;
        }
        .pixelgram-story-root .tap.l { left: 0; }
        .pixelgram-story-root .tap.r { right: 0; }

        /* Caption */
        .pixelgram-story-root .caption-pill {
          position: absolute; bottom: 84px; left: 16px; right: 16px; z-index: 6; text-align: center;
          pointer-events: none;
        }
        .pixelgram-story-root .caption-pill span {
          display: inline-block; background: rgba(0,0,0,.6); backdrop-filter: blur(8px);
          color: #fff; font-size: 13.5px; font-weight: 500; padding: 6px 14px; border-radius: 12px;
          max-width: 90%; word-break: break-word;
        }

        /* Bottom Pill (Own Story) */
        .pixelgram-story-root .pill {
          position: absolute; left: 14px; right: 14px;
          bottom: calc(14px + env(safe-area-inset-bottom, 0px));
          height: 46px; border-radius: 24px; z-index: 12;
          display: flex; align-items: center; justify-content: space-between; padding: 0 16px;
          background: rgba(20,20,26,.72); backdrop-filter: blur(14px);
          border: 1px solid rgba(255,255,255,.14); font-weight: 600; font-size: 15px; color: #fff;
          cursor: pointer; transition: opacity .25s, transform .3s;
        }
        .pixelgram-story-root .pill span { display: flex; align-items: center; gap: 9px; }
        .pixelgram-story-root .pill .h { color: #ff3b5c; fill: #ff3b5c; }
        .pixelgram-story-root.open .pill,
        .pixelgram-story-root.closed .pill {
          opacity: 0; transform: translateY(20px); pointer-events: none;
        }

        /* Other's story bottom bar (Reply + Like) */
        .pixelgram-story-root .other-bar {
          position: absolute; left: 14px; right: 14px;
          bottom: calc(14px + env(safe-area-inset-bottom, 0px));
          z-index: 12; display: flex; align-items: center; gap: 10px;
        }

        /* Viewers Sheet */
        .pixelgram-story-root .sheet {
          position: absolute; left: 0; right: 0; bottom: 0; height: 100%;
          padding-top: calc(12px + env(safe-area-inset-top, 0px));
          background: #14172b; border-radius: 26px 26px 0 0; z-index: 25;
          display: flex; flex-direction: column; transform: translateY(105%);
          transition: transform .38s cubic-bezier(.2,.8,.2,1);
          box-shadow: 0 -14px 40px rgba(0,0,0,.5);
        }
        .pixelgram-story-root.open .sheet { transform: none; }
        .pixelgram-story-root .sheet.drag { transition: none !important; }
        .pixelgram-story-root .grab {
          width: 38px; height: 4px; border-radius: 4px; background: rgba(255,255,255,.22);
          margin: 9px auto 0; flex: none; cursor: grab;
        }
        .pixelgram-story-root .sh-top {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 18px 6px; flex: none; color: #fff;
        }
        .pixelgram-story-root .sh-top h2 {
          font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px;
        }

        /* Strip Carousel */
        .pixelgram-story-root .strip-wrap {
          flex: none; position: relative; background: #18191f;
          border-top: 1px solid rgba(255,255,255,.08); border-bottom: 1px solid rgba(255,255,255,.08);
          margin-top: 4px;
        }
        .pixelgram-story-root .strip-wrap::after {
          content: ""; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
          border: 6px solid transparent; border-bottom-color: #14172b;
        }
        .pixelgram-story-root .strip {
          display: flex; align-items: center; gap: 8px; height: 158px;
          overflow-x: auto; overflow-y: hidden; padding: 0 calc(50% - 32px);
          scrollbar-width: none; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch; touch-action: pan-x; cursor: grab;
        }
        .pixelgram-story-root .strip::-webkit-scrollbar { display: none; }
        .pixelgram-story-root .th {
          flex: none; width: 64px; height: 108px; border-radius: 40px; position: relative;
          scroll-snap-align: center; scroll-snap-stop: always; overflow: hidden;
          border: 2px solid rgba(255,255,255,.72); will-change: transform;
          transition: border-color .2s, box-shadow .2s;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          color: #fff; cursor: pointer; background-size: cover; background-position: center;
        }
        .pixelgram-story-root .th.on {
          border-color: #fff; box-shadow: 0 4px 18px rgba(0,0,0,.55);
        }
        .pixelgram-story-root .th::before {
          content: ""; position: absolute; inset: auto 0 0 0; height: 46%;
          background: linear-gradient(transparent, rgba(0,0,0,.65));
        }
        .pixelgram-story-root .th .cnt {
          position: absolute; bottom: 10px; left: 0; right: 0;
          display: flex; align-items: center; justify-content: center; gap: 4px;
          font-size: 13.5px; font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,.6);
        }

        /* Tabs */
        .pixelgram-story-root .tabs {
          position: relative; display: grid; grid-template-columns: repeat(3, 1fr);
          flex: none; margin: 14px 16px 6px; padding: 4px; border-radius: 20px;
          background: #0d1020; border: 1px solid rgba(255,255,255,.08);
          box-shadow: inset 0 2px 8px rgba(0,0,0,.35);
        }
        .pixelgram-story-root .tabs::before {
          content: ""; position: absolute; top: 4px; bottom: 4px; left: 4px;
          width: calc((100% - 8px) / 3); border-radius: 16px;
          background: linear-gradient(135deg, #6c7bff, #c24bff 55%, #ff4d8d);
          box-shadow: 0 6px 18px rgba(140, 90, 255, .45);
          transform: translateX(calc(var(--tab-idx, 0) * 100%));
          transition: transform .35s cubic-bezier(.3, 1.2, .4, 1);
        }
        .pixelgram-story-root .tab {
          position: relative; z-index: 1; height: 40px; border-radius: 16px;
          font-size: 13px; font-weight: 600; color: #9aa0bd;
          display: flex; gap: 6px; align-items: center; justify-content: center;
          transition: color .25s; cursor: pointer; border: 0; background: none;
        }
        .pixelgram-story-root .tab.on { color: #fff; }
        .pixelgram-story-root .tab .n {
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
          background: rgba(255,255,255,.09); font-size: 11.5px; font-weight: 700;
          display: grid; place-items: center; transition: .25s;
        }
        .pixelgram-story-root .tab.on .n { background: rgba(255,255,255,.25); }
        .pixelgram-story-root .tab .hh { color: #ff3b5c; fill: #ff3b5c; stroke: none; }
        .pixelgram-story-root .tab.on .hh { color: #fff; fill: #fff; }

        /* Viewers List */
        .pixelgram-story-root .list {
          flex: 1; overflow-y: auto; overscroll-behavior: contain;
          padding: 2px 0 calc(14px + env(safe-area-inset-bottom, 0px)); min-height: 0;
        }
        .pixelgram-story-root .row {
          display: flex; align-items: center; gap: 12px; margin: 0 12px; padding: 10px 8px;
          border-radius: 16px; transition: background .2s; cursor: pointer;
        }
        .pixelgram-story-root .row:active { background: rgba(255,255,255,.06); }
        .pixelgram-story-root .row .pa {
          width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
          font-weight: 700; color: #fff; font-size: 15px; flex: none; position: relative;
          box-shadow: 0 0 0 2px #14172b, 0 0 0 4px rgba(255,255,255,.14); overflow: hidden;
        }
        .pixelgram-story-root .row.lkd .pa {
          box-shadow: 0 0 0 2px #14172b, 0 0 0 4px #ff3b5c;
        }
        .pixelgram-story-root .row .pa img { width: 100%; height: 100%; object-fit: cover; }
        .pixelgram-story-root .row .mid { flex: 1; min-width: 0; text-align: left; }
        .pixelgram-story-root .row .mid b {
          display: block; font-size: 14.5px; white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis; color: #fff;
        }
        .pixelgram-story-root .row .mid span { font-size: 12.5px; color: #9aa0bd; }
        .pixelgram-story-root .chip {
          display: flex; align-items: center; gap: 5px; padding: 6px 11px;
          border-radius: 14px; font-size: 12px; font-weight: 600; color: #9aa0bd;
          background: rgba(255,255,255,.06); white-space: nowrap;
        }
        .pixelgram-story-root .chip.lk { color: #ff6a85; background: rgba(255,59,92,.14); }
        .pixelgram-story-root .chip.lk svg { fill: #ff3b5c; stroke: none; }
        .pixelgram-story-root .empty {
          text-align: center; color: #9aa0bd; padding: 36px 24px; font-size: 14px;
        }
        .pixelgram-story-root .empty svg { width: 34px; height: 34px; margin-bottom: 10px; opacity: .6; }
      `}</style>

      <div className={`phone ${isSheetOpen ? 'open' : ''}`}>
        {/* Story Stage */}
        <div
          ref={stageRef}
          className="stage"
          onTouchStart={handleStageTouchStart}
          onTouchMove={handleStageTouchMove}
          onTouchEnd={handleStageTouchEnd}
          onTouchCancel={handleStageTouchEnd}
        >
          {/* Top Progress Bars */}
          <div className="bars">
            {stories.map((_, i) => (
              <div key={i} className="bar">
                <i
                  style={{
                    width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="head" onClick={e => e.stopPropagation()}>
            <button
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
            </button>

            <div className="who">
              <b>
                <button
                  onClick={() => {
                    onClose();
                    onOpenProfile(authorProfile.user_id);
                  }}
                  className="font-bold text-white hover:underline truncate max-w-[150px]"
                >
                  {authorProfile.username}
                </button>
                {isOwnStory && (
                  <>
                    <span>
                      <Eye style={{ width: 12, height: 12 }} />
                      <i style={{ fontStyle: 'normal' }}>{viewsCount}</i>
                    </span>
                    <span>
                      <Heart style={{ width: 12, height: 12, fill: likesCount > 0 ? '#ff3b5c' : 'none', color: likesCount > 0 ? '#ff3b5c' : 'currentColor' }} />
                      <i style={{ fontStyle: 'normal' }}>{likesCount}</i>
                    </span>
                  </>
                )}
              </b>
              <em>
                <span>{formatClockTime(currentStory.created_at)}</span>
                <span>· {formatTimeAgo(currentStory.created_at)} pehle</span>
                {currentStory.music_title && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/90 bg-white/10 px-1.5 py-0.5 rounded-full ml-1">
                    <Music2 className="w-2.5 h-2.5 text-primary animate-pulse" />
                    <span className="truncate max-w-[100px]">{currentStory.music_title}</span>
                  </span>
                )}
              </em>
            </div>

            <div className="sp" />

            {/* Author buttons: Delete, Share, Close */}
            {isOwnStory && (
              <button className="ib" onClick={handleDelete} aria-label="Delete story" title="Delete">
                <Trash2 />
              </button>
            )}
            <button className="ib" onClick={handleShare} aria-label="Share story" title="Share">
              <Share2 />
            </button>
            <button className="ib" onClick={onClose} aria-label="Close story" title="Close">
              <X />
            </button>
          </div>

          {/* Media Player */}
          <div className="media-wrap">
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

          {/* Background Audio */}
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

          {/* Story Caption */}
          {currentStory.caption && (
            <div className="caption-pill">
              <span>{currentStory.caption}</span>
            </div>
          )}

          {/* Left / Right Tap zones (with hold-to-pause) */}
          <div
            className="tap l"
            onClick={e => {
              e.stopPropagation();
              goToStory(storyIndex - 1);
            }}
            onPointerDown={() => setIsPaused(true)}
            onPointerUp={() => setIsPaused(false)}
            onPointerLeave={() => setIsPaused(false)}
            onPointerCancel={() => setIsPaused(false)}
          />
          <div
            className="tap r"
            onClick={e => {
              e.stopPropagation();
              goToStory(storyIndex + 1);
            }}
            onPointerDown={() => setIsPaused(true)}
            onPointerUp={() => setIsPaused(false)}
            onPointerLeave={() => setIsPaused(false)}
            onPointerCancel={() => setIsPaused(false)}
          />
        </div>

        {/* Own story bottom pill: "{views} ने देखा" + likes */}
        {isOwnStory && (
          <button className="pill" onClick={() => setIsSheetOpen(true)}>
            <span>
              <Eye style={{ width: 17, height: 17 }} />
              <i style={{ fontStyle: 'normal' }}>{viewsCount} ने देखा</i>
            </span>
            <span>
              <Heart className="h" style={{ width: 17, height: 17 }} />
              <i style={{ fontStyle: 'normal' }}>{likesCount}</i>
            </span>
          </button>
        )}

        {/* Other user's story: Reply + Like Bar */}
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

        {/* Viewers Sheet (Slides up for own story) */}
        {isOwnStory && (
          <section
            ref={sheetRef}
            className="sheet"
            aria-label="Viewers"
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
            onTouchCancel={handleSheetTouchEnd}
          >
            <div className="grab" />
            <div className="sh-top">
              <h2>
                <Eye style={{ width: 19, height: 19 }} />
                <span>Viewers ({viewsCount})</span>
              </h2>
              <button
                className="ib"
                onClick={() => setIsSheetOpen(false)}
                aria-label="Close viewers sheet"
              >
                <X />
              </button>
            </div>

            {/* Strip: Capsule Carousel */}
            <div className="strip-wrap">
              <div
                ref={stripRef}
                className="strip"
                onScroll={handleStripScroll}
              >
                {stories.map((st, i) => {
                  const isActive = i === storyIndex;
                  return (
                    <button
                      key={st.id}
                      className={`th ${isActive ? 'on' : ''}`}
                      style={{
                        backgroundImage: `url(${st.image_url})`,
                      }}
                      onClick={() => {
                        setStoryIndex(i);
                        centerThumb(i, true);
                      }}
                    >
                      <span className="cnt">
                        <Eye style={{ width: 13, height: 13 }} />
                        <i style={{ fontStyle: 'normal' }}>{st.views_count || 0}</i>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Segmented Tabs with Sliding Indicator */}
            <div
              className="tabs"
              style={{
                ['--tab-idx' as string]: filter === 'all' ? 0 : filter === 'liked' ? 1 : 2,
              }}
            >
              <button
                className={`tab ${filter === 'all' ? 'on' : ''}`}
                onClick={() => setFilter('all')}
              >
                Sab <span className="n">{viewers.length}</span>
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
            <div ref={listRef} className="list">
              {loadingViewers ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                </div>
              ) : filteredViewers.length === 0 ? (
                <div className="empty">
                  <Eye />
                  <br />
                  {viewers.length ? 'Is list me koi nahi' : 'Abhi tak kisi ne ye story nahi dekhi'}
                </div>
              ) : (
                filteredViewers.map((v, i) => {
                  const g = gradFor(v.profile.username || 'user');
                  return (
                    <div
                      key={v.profile.user_id}
                      className={`row ${v.liked ? 'lkd' : ''}`}
                      onClick={() => {
                        setIsSheetOpen(false);
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
        )}
      </div>
    </div>,
    document.body
  );
};

export default PixelgramStoryViewer;
