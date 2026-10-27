import React, { useState, useRef, useEffect, useCallback } from 'react';
import StoryRing from '@/components/common/StoryRing';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Heart, MessageCircle, Share2, MoreHorizontal, Camera, Trash2, VideoOff, UserCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getReelsFeed, getReelById, recordReelView, toggleReelLike, deleteReel, createNotification, getReelCommentsCount, getFollowStatus, followUser, unfollowUser, cleanDisplayCaption, type Reel } from '@/services/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { withTimeout } from '@/lib/withTimeout';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ReelCommentsSheet from '@/components/common/ReelCommentsSheet';
import InstagramShareSheet from '@/components/common/InstagramShareSheet';
import BottomNav from '@/components/layouts/BottomNav';
import { audioPlayerService } from '@/services/audioPlayerService';
import { retryMediaOnError, isLegacyMediaUrl } from '@/lib/mediaUrl';

// Only render video for active ± 1 reels — prevents loading all videos at once
const RENDER_WINDOW = 3;

const ReelCard: React.FC<{
  reel: Reel;
  isActive: boolean;
  isNear: boolean; // within render window — mount video element
  onDelete: (id: string) => void;
  autoOpenComments?: boolean;
  highlightCommentId?: string | null;
}> = ({ reel, isActive, isNear, onDelete, autoOpenComments, highlightCommentId }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasMusic = !!reel.music_preview_url;
  const isOriginalAudio = !reel.music_track_id || reel.music_track_id.startsWith('original__');
  const musicStart = (reel.music_start_ms || 0) / 1000;
  const muteOriginal = hasMusic && !!reel.mute_original;
  const [liked, setLiked] = useState(reel.is_liked || false);
  const [likesCount, setLikesCount] = useState(reel.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(reel.comments_count || 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const isOwner = user?.id === reel.user_id;
  const [followStatus, setFollowStatus] = useState<'accepted' | 'pending' | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [isBufferingSlow, setIsBufferingSlow] = useState(false);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const bufferTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkConn = () => {
      if (!navigator.onLine) {
        setIsSlowConnection(true);
        return;
      }
      const navConn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
      if (navConn) {
        const is2g = navConn.effectiveType === 'slow-2g' || navConn.effectiveType === '2g';
        const isHighPing = typeof navConn.rtt === 'number' && navConn.rtt > 800;
        const isLowBandwidth = typeof navConn.downlink === 'number' && navConn.downlink < 0.9;
        if (is2g || (isHighPing && isLowBandwidth)) {
          setIsSlowConnection(true);
          return;
        }
      }
      setIsSlowConnection(false);
    };

    checkConn();
    window.addEventListener('online', checkConn);
    window.addEventListener('offline', checkConn);

    const navConn = (navigator as unknown as { connection?: { addEventListener?: (e: string, cb: () => void) => void; removeEventListener?: (e: string, cb: () => void) => void } }).connection;
    if (navConn?.addEventListener) {
      navConn.addEventListener('change', checkConn);
    }

    return () => {
      window.removeEventListener('online', checkConn);
      window.removeEventListener('offline', checkConn);
      if (navConn?.removeEventListener) {
        navConn.removeEventListener('change', checkConn);
      }
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!user || isOwner) {
      setFollowStatus(null);
      return () => { alive = false; };
    }
    getFollowStatus(user.id, reel.user_id)
      .then(status => { if (alive) setFollowStatus(status); })
      .catch(() => { if (alive) setFollowStatus(null); });
    return () => { alive = false; };
  }, [user?.id, reel.user_id, isOwner]);

  const [audioOwner, setAudioOwner] = useState<Reel['profile']>(reel.profile);

  // Reused original audio ka owner source reel se live profile ke saath lao,
  // taaki creator apni profile photo badle to yahan bhi nayi photo dikhe.
  useEffect(() => {
    let alive = true;
    const sourceId = reel.music_track_id?.startsWith('original__')
      ? reel.music_track_id.slice('original__'.length)
      : null;
    if (!sourceId) {
      setAudioOwner(reel.profile);
      return () => { alive = false; };
    }
    getReelById(sourceId)
      .then(source => { if (alive) setAudioOwner(source?.profile || reel.profile); })
      .catch(() => { if (alive) setAudioOwner(reel.profile); });
    return () => { alive = false; };
  }, [reel.id, reel.music_track_id, reel.profile?.user_id]);

  // Deep-link from a notification: "reel X, open comments"
  useEffect(() => {
    if (autoOpenComments) setCommentsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenComments, reel.id]);

  useEffect(() => {
    let alive = true;
    getReelCommentsCount(reel.id).then(c => { if (alive) setCommentsCount(c); });
    return () => { alive = false; };
  }, [reel.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive) {
      let isCancelled = false;
      const tryPlay = () => {
        if (isCancelled) return;
        const p = v.play();
        if (p !== undefined) {
          p.catch(() => {
            if (!v.muted) {
              v.muted = true;
              v.play().catch(() => {});
            }
          });
        }
      };
      tryPlay();
      v.addEventListener('canplay', tryPlay, { once: true });
      v.addEventListener('loadeddata', tryPlay, { once: true });
      return () => {
        isCancelled = true;
        v.removeEventListener('canplay', tryPlay);
        v.removeEventListener('loadeddata', tryPlay);
        try { v.pause(); } catch {}
      };
    } else {
      try { v.pause(); } catch {}
    }
  }, [isActive]);

  // Reel ka gana — strictly synchronized: ONLY plays when video is actually rendered & playing
  useEffect(() => {
    const a = audioRef.current;
    const v = videoRef.current;
    if (!a || !hasMusic) return;
    if (isActive && videoReady) {
      let isCancelled = false;
      try {
        if (Math.abs(a.currentTime - musicStart) > 1) {
          a.currentTime = musicStart;
        }
      } catch {}
      a.play().catch(() => {});

      const syncAudioOnVideoLoop = () => {
        if (isCancelled || !isActive) return;
        if (v && v.currentTime < 0.35 && a.currentTime > musicStart + 1) {
          try { a.currentTime = musicStart; } catch {}
          a.play().catch(() => {});
        }
      };
      const onVideoPlay = () => {
        if (isCancelled || !isActive) return;
        if (a.paused && videoReady) {
          a.play().catch(() => {});
        }
      };
      const onVideoPause = () => {
        try { a.pause(); } catch {}
      };

      if (v) {
        v.addEventListener('timeupdate', syncAudioOnVideoLoop);
        v.addEventListener('play', onVideoPlay);
        v.addEventListener('pause', onVideoPause);
      }
      return () => {
        isCancelled = true;
        if (v) {
          v.removeEventListener('timeupdate', syncAudioOnVideoLoop);
          v.removeEventListener('play', onVideoPlay);
          v.removeEventListener('pause', onVideoPause);
        }
        try {
          a.pause();
          a.currentTime = musicStart;
        } catch {}
      };
    } else {
      try {
        a.pause();
        a.currentTime = musicStart;
      } catch {}
    }
  }, [isActive, videoReady, hasMusic, musicStart]);

  // Ensure video and audio always pause when ReelCard unmounts
  useEffect(() => {
    return () => {
      try { videoRef.current?.pause(); } catch {}
      try { audioRef.current?.pause(); } catch {}
    };
  }, []);

  // Count a view once this reel has actually been watched for a moment
  // (avoids counting a quick scroll-past as a "view").
  const viewRecordedRef = useRef(false);
  useEffect(() => {
    if (!isActive || viewRecordedRef.current) return;
    const t = setTimeout(() => {
      viewRecordedRef.current = true;
      recordReelView(reel.id).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [isActive, reel.id]);

  const handleLike = async () => {
    if (!user) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount(prev => wasLiked ? prev - 1 : prev + 1);
    try {
      await toggleReelLike(reel.id, user.id, wasLiked);
      // notify reel owner when we newly like
      if (!wasLiked && reel.user_id !== user.id) {
        createNotification(reel.user_id, 'reel_like', user.id, reel.id).catch(() => {});
      }
    } catch {
      setLiked(wasLiked);
      setLikesCount(prev => wasLiked ? prev + 1 : prev - 1);
    }
  };

  const handleFollow = async () => {
    if (!user || !profile || followLoading) return;
    setFollowLoading(true);
    try {
      const isAlreadyFollowing = followStatus === 'accepted' || followStatus === 'pending';
      if (isAlreadyFollowing) {
        await unfollowUser(profile.user_id, user.id);
        setFollowStatus(null);
        toast.success('Unfollowed @' + profile.username);
      } else {
        await followUser(profile.user_id, !!profile.is_private);
        const nextStatus = profile.is_private ? 'pending' : 'accepted';
        setFollowStatus(nextStatus);
        await createNotification(
          profile.user_id,
          profile.is_private ? 'follow_request' : 'follow',
          user.id,
        ).catch(() => {});
        toast.success(profile.is_private ? 'Follow request sent' : 'Following @' + profile.username);
      }
    } catch {
      toast.error('Follow status update nahi ho paaya');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleShare = () => {
    setShareSheetOpen(true);
  };

  const handleDelete = async () => {
    try {
      await deleteReel(reel.id);
      toast.success('Reel deleted');
      onDelete(reel.id);
    } catch {
      toast.error('Failed to delete reel');
    }
  };

  const profile = reel.profile as { username: string; full_name: string | null; avatar_url: string | null; is_verified: boolean; is_private: boolean; user_id: string } | undefined;

  return (
    <div className="relative mx-auto h-full w-full max-w-[430px] overflow-hidden bg-black select-none">
      {/* Purane (band ho chuke) server ka video kabhi chalega nahi */}
      {isLegacyMediaUrl(reel.video_url) ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#12111d] text-white/70 px-8 text-center">
          <VideoOff className="w-10 h-10" />
          <p className="text-sm">Yeh reel purane server par thi, video ab available nahi hai.</p>
        </div>
      ) : isNear ? (
        <>
        {/* Instant Poster & Shimmer Placeholder (Never solid black) */}
        <div
          className={
            "absolute inset-0 z-10 transition-opacity duration-300 pointer-events-none " +
            (videoReady ? "opacity-0" : "opacity-100")
          }
        >
          {reel.thumbnail_url ? (
            <img
              src={reel.thumbnail_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-purple-950/70 via-zinc-900 to-indigo-950/70 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
                <span className="text-2xl">🎬</span>
              </div>
            </div>
          )}
        </div>

        <video
          ref={videoRef}
          src={reel.video_url}
          className={
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300 z-0 " +
            (videoReady ? "opacity-100" : "opacity-0")
          }
          muted={muteOriginal}
          autoPlay={isActive}
          loop
          playsInline
          poster={reel.thumbnail_url || undefined}
          preload="auto"
          onLoadedData={() => setVideoReady(true)}
          onPlaying={() => {
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            setIsBufferingSlow(false);
            setVideoReady(true);
            if (isActive && hasMusic && audioRef.current) {
              try {
                if (Math.abs(audioRef.current.currentTime - musicStart) > 1) {
                  audioRef.current.currentTime = musicStart;
                }
                audioRef.current.play().catch(() => {});
              } catch {}
            }
          }}
          onPause={() => {
            audioRef.current?.pause();
          }}
          onSeeked={() => {
            if (audioRef.current && videoRef.current) {
              audioRef.current.currentTime = musicStart + videoRef.current.currentTime;
            }
          }}
          onWaiting={() => {
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            bufferTimerRef.current = setTimeout(() => {
              setIsBufferingSlow(true);
            }, 1400);
          }}
          onStalled={() => {
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            bufferTimerRef.current = setTimeout(() => {
              setIsBufferingSlow(true);
            }, 1800);
          }}
          onError={(e) => retryMediaOnError(e.currentTarget, reel.video_url)}
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            const a = audioRef.current;
            if (v.paused) {
              v.play().catch(() => {});
              a?.play().catch(() => {});
            } else {
              v.pause();
              a?.pause();
            }
          }}
        />
        </>
      ) : (
        // Placeholder for far-away reels — thumbnail dikhate hain taki
        // scroll karte waqt kaala/khali frame na dikhe.
        <div
          className="absolute inset-0 bg-black bg-cover bg-center"
          style={reel.thumbnail_url ? { backgroundImage: `url(${reel.thumbnail_url})` } : undefined}
        />
      )}

      {/* Reel ka gana */}
      {isNear && hasMusic && (
        <audio
          ref={audioRef}
          src={reel.music_preview_url || undefined}
          preload="auto"
          playsInline
          onEnded={(e) => {
            if (isActive && videoReady) {
              try { e.currentTarget.currentTime = musicStart; } catch {}
              e.currentTarget.play().catch(() => {});
            } else {
              e.currentTarget.pause();
            }
          }}
        />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg,rgba(0,0,0,.45) 0,transparent 18%,transparent 55%,rgba(0,0,0,.72) 100%)" }} />

      {/* Slow-network feedback uses the compact reel toast style */}
      {(isBufferingSlow || isSlowConnection) && (
        <div className="absolute left-1/2 bottom-[120px] z-50 -translate-x-1/2 rounded-full bg-[rgba(30,30,30,.9)] px-3.5 py-2 text-[13px] text-white shadow-lg whitespace-nowrap">
          Your network is slow, please check network
        </div>
      )}

      {/* Header: exact HTML layout with Reels next to back and camera on the right */}
      <div
        className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-4 pb-2.5"
        style={{ paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))' }}
      >
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex items-center gap-1.5 text-[19px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
          aria-label="Back to profile"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
          {t('reels')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/create-reel')}
          className="flex items-center justify-center text-white"
          aria-label="Open reel camera"
        >
          <Camera className="w-[26px] h-[26px]" strokeWidth={1.9} />
        </button>
      </div>

      {/* Right-side actions from the supplied Reels HTML, wired to existing app handlers */}
      <div className="absolute right-2.5 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-[22px]">
        <button
          type="button"
          onClick={handleLike}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          aria-label={liked ? 'Unlike reel' : 'Like reel'}
        >
          <Heart
            className={"w-[30px] h-[30px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] transition-transform " + (liked ? "fill-[#ff2d55] text-[#ff2d55] scale-110" : "fill-transparent text-white")}
            strokeWidth={1.9}
          />
          <span className="text-white text-xs font-bold tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
            {likesCount > 999 ? (likesCount / 1000).toFixed(1) + 'k' : likesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          aria-label="Comments"
        >
          <MessageCircle className="w-[30px] h-[30px] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]" strokeWidth={1.9} />
          <span className="text-white text-xs font-bold tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
            {commentsCount > 999 ? (commentsCount / 1000).toFixed(1) + 'k' : commentsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          aria-label="Share"
        >
          <Share2 className="w-[30px] h-[30px] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]" strokeWidth={1.9} />
          <span className="text-white text-xs font-bold tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">{t('share')}</span>
        </button>

        {isOwner ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center justify-center active:scale-90 transition-transform" aria-label="More reel options">
                <MoreHorizontal className="w-6 h-6 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]" strokeWidth={2.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDelete} className="text-destructive gap-2">
                <Trash2 className="w-4 h-4" /> {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button type="button" onClick={() => toast('More')} className="flex items-center justify-center active:scale-90 transition-transform" aria-label="More">
            <MoreHorizontal className="w-6 h-6 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Bottom info: live creator, caption, and audio in the supplied HTML positions */}
      <div className="absolute left-0 right-16 bottom-0 z-20 px-[14px] pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-[9px] text-white">
          <button onClick={() => navigate('/profile/' + profile?.user_id)} className="flex min-w-0 items-center gap-[9px] group" aria-label="Open creator profile">
            <div className="relative shrink-0 rounded-full bg-gradient-to-br from-orange-400 via-pink-600 to-violet-700 p-[2px]">
              <StoryRing userId={profile?.user_id}>
                <Avatar className="w-[34px] h-[34px] rounded-full border border-white/90 bg-black">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-orange-400 via-pink-600 to-violet-700 text-white text-[12px] font-bold">
                    {profile?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </StoryRing>
            </div>
            <span className="truncate text-[14.5px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">@{profile?.username}</span>
          </button>
          {!isOwner && (
            <button
              type="button"
              onClick={handleFollow}
              disabled={followLoading}
              className={"ml-1 flex h-7 shrink-0 items-center gap-1.5 rounded-lg border bg-black/20 px-[13px] text-[13px] font-semibold text-white transition active:scale-95 disabled:opacity-50 " + (followStatus ? "border-white/55 text-white/85" : "border-white/90")}
            >
              {followStatus === 'accepted' ? (
                <><UserCheck className="w-3.5 h-3.5" /><span>Following</span></>
              ) : followStatus === 'pending' ? (
                <span>Requested</span>
              ) : (
                <span>Follow</span>
              )}
            </button>
          )}
        </div>
        {(() => {
          const cleanCap = cleanDisplayCaption(reel.caption);
          if (!cleanCap) return null;
          return (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setCaptionExpanded(prev => !prev);
              }}
              className="mt-[10px] max-w-[85%] cursor-pointer select-none active:opacity-90"
              title="Tap to expand full caption"
            >
              <p className={"text-[13.5px] leading-[1.38] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-all " + (captionExpanded ? "max-h-48 overflow-y-auto pr-2" : "line-clamp-2")}>
                {cleanCap}
              </p>
              {cleanCap.length > 50 && (
                <span className="mt-0.5 inline-block text-[11px] font-semibold text-white/70">
                  {captionExpanded ? '...less' : '...more'}
                </span>
              )}
            </div>
          );
        })()}
        <button
          type="button"
          onClick={() => navigate('/song/' + (reel.music_track_id || 'original__' + reel.id))}
          className="mt-[11px] flex max-w-full items-center gap-2 overflow-hidden whitespace-nowrap text-[13px] text-white"
          aria-label="Open reel audio"
        >
          {isOriginalAudio ? (
            <Avatar className="w-6 h-6 shrink-0 border border-white/50">
              <AvatarImage src={(audioOwner || profile)?.avatar_url || undefined} />
              <AvatarFallback className="bg-white/20 text-[9px] font-bold text-white">{(audioOwner || profile)?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          ) : reel.music_artwork_url ? (
            <img src={reel.music_artwork_url} alt={reel.music_title || 'song'} className="w-6 h-6 shrink-0 rounded-full border border-white/40 object-cover" />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-base">♪</span>
          )}
          <span className="truncate text-white/90">
            {isOriginalAudio
              ? 'Original audio · @' + ((audioOwner || profile)?.username || 'user')
              : reel.music_title + ' · ' + reel.music_artist}
          </span>
        </button>
      </div>

      <ReelCommentsSheet
        reelId={reel.id}
        reelOwnerId={reel.user_id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={setCommentsCount}
        highlightCommentId={highlightCommentId}
      />
      <InstagramShareSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        url={`${window.location.origin}/reels?r=${reel.id}`}
        title={`Reel by @${profile?.username || 'user'} on Pixelgram`}
        mediaType="reel"
        thumbnailUrl={reel.thumbnail_url || undefined}
      />
    </div>
  );
};

const ReelsPage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reels, setReels] = useState<Reel[]>(() => {
    try {
      const cached = localStorage.getItem('pixelgram_cached_reels') || sessionStorage.getItem('pixelgram_cached_reels');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('pixelgram_cached_reels') || sessionStorage.getItem('pixelgram_cached_reels');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch {}
    return true;
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);
  const [highlightCommentFor, setHighlightCommentFor] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const reelsCountRef = useRef(0);
  const activeIndexRef = useRef(0);
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollTopRef = useRef(0);

  const activateReel = useCallback((index: number) => {
    activeIndexRef.current = index;
    const container = containerRef.current;
    if (container) {
      const activeItem = container.querySelector(`[data-reel-index="${index}"]`);
      container.querySelectorAll<HTMLAudioElement | HTMLVideoElement>('audio, video').forEach((media) => {
        if (!activeItem || !activeItem.contains(media)) {
          try {
            media.pause();
            if (media.tagName === 'AUDIO') media.currentTime = 0;
          } catch {}
        }
      });
    }
    setActiveIndex((current) => (current === index ? current : index));
  }, []);

  const loadReels = useCallback(async () => {
    try {
      const targetId = searchParams.get('r');
      const wantsComments = searchParams.get('comments') === '1';
      const commentIdParam = searchParams.get('c');
      let data = await withTimeout(getReelsFeed(10), 10000);

      // Deep link from a notification/share link — if that reel isn't in the
      // first page, fetch it directly and pin it to the front.
      if (targetId && !data.some(r => r.id === targetId)) {
        const target = await withTimeout(getReelById(targetId), 10000).catch(() => null);
        if (target) data = [target, ...data];
      }

      setReels(data);
      try {
        if (data && data.length > 0) {
          localStorage.setItem('pixelgram_cached_reels', JSON.stringify(data.slice(0, 15)));
          sessionStorage.setItem('pixelgram_cached_reels', JSON.stringify(data.slice(0, 15)));
        }
      } catch {}
      reelsCountRef.current = data.length;

      if (targetId) {
        const idx = data.findIndex(r => r.id === targetId);
        if (idx >= 0) {
          activateReel(idx);
          if (wantsComments || commentIdParam) {
            setOpenCommentsFor(targetId);
            if (commentIdParam) setHighlightCommentFor(commentIdParam);
          }
          requestAnimationFrame(() => {
            const el = containerRef.current;
            if (el) el.scrollTo({ top: idx * el.clientHeight });
          });
        }
        setSearchParams({}, { replace: true });
      }
    } catch {
      toast.error('Failed to load reels');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activateReel]);

  useEffect(() => { loadReels(); }, [loadReels]);

  // Instagram-style IntersectionObserver: Active reel detection runs completely
  // off the main thread without re-rendering while swiping.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || reels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idxStr = entry.target.getAttribute('data-reel-index');
            if (idxStr !== null) {
              const idx = parseInt(idxStr, 10);
              if (!isNaN(idx)) {
                activateReel(idx);
              }
            }
          }
        });
      },
      {
        root: el,
        threshold: 0.6,
      }
    );

    const items = el.querySelectorAll('[data-reel-index]');
    items.forEach(item => observer.observe(item));

    return () => observer.disconnect();
  }, [activateReel, reels.length]);

  // Immediate active reel index calculation on scroll + bottom nav visibility
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const current = el.scrollTop;
    const h = el.clientHeight;
    if (h > 0) {
      const newIndex = Math.round(current / h);
      if (newIndex >= 0 && newIndex < reelsCountRef.current && newIndex !== activeIndexRef.current) {
        activateReel(newIndex);
      }
    }
    const delta = current - lastScrollTopRef.current;
    if (current <= 40) {
      setNavHidden(false);
    } else if (delta > 15) {
      setNavHidden(true);
    } else if (delta < -15) {
      setNavHidden(false);
    }
    lastScrollTopRef.current = current;
  }, [activateReel]);

  // Catch late media play events from a reel that became inactive during a swipe.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stopInactiveMedia = (event: Event) => {
      const media = event.target;
      if (!(media instanceof HTMLMediaElement)) return;
      const reelItem = media.closest('[data-reel-index]');
      const reelIndex = Number(reelItem?.getAttribute('data-reel-index'));
      if (!reelItem || reelIndex !== activeIndexRef.current) {
        media.pause();
        return;
      }

      container.querySelectorAll<HTMLAudioElement | HTMLVideoElement>('audio, video').forEach((otherMedia) => {
        if (otherMedia === media) return;
        const otherItem = otherMedia.closest('[data-reel-index]');
        if (Number(otherItem?.getAttribute('data-reel-index')) !== activeIndexRef.current) {
          otherMedia.pause();
        }
      });
    };

    container.addEventListener('play', stopInactiveMedia, true);
    return () => container.removeEventListener('play', stopInactiveMedia, true);
  }, [reels.length]);

  // Enforce single active reel audio/video — pause all other reels immediately
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const allAudios = el.querySelectorAll('audio');
    const allVideos = el.querySelectorAll('video');
    const activeItem = el.querySelector(`[data-reel-index="${activeIndex}"]`);

    allAudios.forEach((audio) => {
      if (!activeItem || !activeItem.contains(audio)) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {}
      }
    });

    allVideos.forEach((video) => {
      if (!activeItem || !activeItem.contains(video)) {
        try {
          video.pause();
        } catch {}
      }
    });
  }, [activeIndex]);

  // Stop external background music completely on entering Reels, and pause all reel media on unmount / navigation
  useEffect(() => {
    audioPlayerService.stop();
    return () => {
      const el = containerRef.current;
      if (!el) return;
      el.querySelectorAll('audio').forEach((a) => {
        try {
          a.pause();
          a.currentTime = 0;
          a.removeAttribute('src');
          a.load();
        } catch {}
      });
      el.querySelectorAll('video').forEach((v) => {
        try {
          v.pause();
          v.currentTime = 0;
          v.removeAttribute('src');
          v.load();
        } catch {}
      });
    };
  }, []);

  // Auto pause all reels immediately when screen turns off, phone is locked, or app is minimized / back pressed
  useEffect(() => {
    const pauseAllMedia = () => {
      try { audioPlayerService.stop(); } catch {}
      const el = containerRef.current;
      if (el) {
        el.querySelectorAll('audio').forEach((a) => {
          try { a.pause(); } catch {}
        });
        el.querySelectorAll('video').forEach((v) => {
          try { v.pause(); } catch {}
        });
      }
      document.querySelectorAll('audio, video').forEach((m) => {
        try { (m as HTMLMediaElement).pause(); } catch {}
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        pauseAllMedia();
      } else if (document.visibilityState === 'visible') {
        const el = containerRef.current;
        if (!el) return;
        const activeItem = el.querySelector(`[data-reel-index="${activeIndexRef.current}"]`);
        if (activeItem) {
          const v = activeItem.querySelector('video');
          const a = activeItem.querySelector('audio');
          try { v?.play().catch(() => {}); } catch {}
          try { a?.play().catch(() => {}); } catch {}
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', pauseAllMedia);
    window.addEventListener('blur', pauseAllMedia);
    window.addEventListener('beforeunload', pauseAllMedia);

    return () => {
      pauseAllMedia();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', pauseAllMedia);
      window.removeEventListener('blur', pauseAllMedia);
      window.removeEventListener('beforeunload', pauseAllMedia);
    };
  }, []);

  // Keyboard support for desktop
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (e.key === 'ArrowDown') el.scrollBy({ top: el.clientHeight, behavior: 'smooth' });
      if (e.key === 'ArrowUp') el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleDelete = (id: string) => {
    setReels(prev => {
      const next = prev.filter(r => r.id !== id);
      reelsCountRef.current = next.length;
      setActiveIndex(i => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  };

  // No blocking "reels loading" screen any more: the fetch above is hard
  // capped by withTimeout, and we only paint a plain backdrop for the few
  // hundred ms it takes, so nobody can get stuck on a spinner.
  if (loading) {
    return (
      <div className="h-[100dvh] w-full bg-[#0B0B0F] relative flex flex-col justify-between overflow-hidden select-none">
        <div
          className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-4 pb-2.5"
          style={{ paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))' }}
        >
          <button type="button" onClick={() => navigate('/profile')} className="flex items-center gap-1.5 text-[19px] font-bold text-white" aria-label="Back to profile">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
            {t('reels')}
          </button>
          <button type="button" onClick={() => navigate('/create-reel')} className="flex items-center justify-center text-white" aria-label="Open reel camera">
            <Camera className="w-[26px] h-[26px]" strokeWidth={1.9} />
          </button>
        </div>
        <div className="flex-1 w-full flex items-center justify-center relative">
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/85" />
          <div className="w-14 h-14 rounded-full bg-white/5 animate-pulse flex items-center justify-center">
            <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white/20 border-b-[8px] border-b-transparent ml-1" />
          </div>
        </div>
        <div className="absolute right-3.5 bottom-24 z-20 flex flex-col items-center gap-5">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" />
            <div className="w-5 h-2 rounded bg-white/10" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" />
            <div className="w-5 h-2 rounded bg-white/10" />
          </div>
          <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" />
        </div>
        <div className="absolute left-4 bottom-20 z-20 max-w-[75%] space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-white/15 animate-pulse" />
            <div className="w-28 h-3.5 rounded bg-white/15 animate-pulse" />
          </div>
          <div className="w-48 h-3 rounded bg-white/10" />
          <div className="w-36 h-5 rounded-full bg-white/10" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!reels.length) {
    return (
      <div className="h-[100dvh] bg-black flex flex-col items-center justify-center gap-6 px-8">
        <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center">
          <span className="text-4xl">🎬</span>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-white text-xl font-bold">{t('noReelsYet')}</h2>
          <p className="text-white/50 text-sm">Be the first to create a reel!</p>
        </div>
        <button
          onClick={() => navigate('/create-reel')}
          className="flex items-center gap-2 rounded-lg border border-white/90 bg-black/25 px-6 py-3 font-semibold text-white"
        >
          <Camera className="h-5 w-5" /> {t('newReel')}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 h-full w-full bg-black overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
        }}
      >
        {reels.map((reel, idx) => {
          const isActive = idx === activeIndex;
          const isNear = Math.abs(idx - activeIndex) <= RENDER_WINDOW;
          return (
            <div
              key={reel.id}
              data-reel-index={idx}
              className="relative mx-auto h-full w-full max-w-[430px] snap-start snap-always shrink-0"
              style={{
                height: '100%',
                minHeight: '100%',
                maxHeight: '100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              <ReelCard
                reel={reel}
                isActive={isActive}
                isNear={isNear}
                onDelete={handleDelete}
                autoOpenComments={openCommentsFor === reel.id}
                highlightCommentId={openCommentsFor === reel.id ? highlightCommentFor : null}
              />
            </div>
          );
        })}
      </div>
      <BottomNav overlay hidden={navHidden} />
    </div>
  );
};

export default ReelsPage;
