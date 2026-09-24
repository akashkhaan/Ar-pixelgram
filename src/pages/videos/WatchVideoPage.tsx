import useGoBack from '@/hooks/use-go-back';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Share2,
  Trash2,
  Eye,
  Loader2,
  Lock,
  Send,
  Download,
  Bookmark,
  BookmarkCheck,
  BellRing,
  X,
  ChevronDown,
  MoreVertical,
  Play,
  Scissors,
  Flag,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  getVideoById,
  getVideosFeed,
  getVideoComments,
  addVideoComment,
  toggleVideoLike,
  recordVideoView,
  deleteVideo,
  formatVideoViews,
  formatDuration,
  timeAgoHi,
  type AppVideo,
  type AppVideoComment,
} from '@/services/videos';
import {
  followUser,
  unfollowUser,
  getFollowStatus,
  getFollowersCount,
} from '@/services/api';
import { firstFrameSrc } from '@/lib/mediaUrl';
import InstagramShareSheet from '@/components/common/InstagramShareSheet';

const SAVED_VIDEOS_STORAGE = 'pixelgram_saved_videos';

function isVideoSavedLocal(id: string): boolean {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(SAVED_VIDEOS_STORAGE) || '[]');
    return list.includes(id);
  } catch {
    return false;
  }
}

function toggleSaveVideoLocal(id: string): boolean {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(SAVED_VIDEOS_STORAGE) || '[]');
    const exists = list.includes(id);
    const next = exists ? list.filter((x) => x !== id) : [...list, id];
    localStorage.setItem(SAVED_VIDEOS_STORAGE, JSON.stringify(next));
    return !exists;
  } catch {
    return false;
  }
}

/**
 * YouTube-style Watch Page — Complete with:
 * - Video Player with Autoplay next
 * - YouTube channel row with Subscribe / Follow toggle & live subscriber count
 * - Action Bar: Like / Dislike, Share (InstagramShareSheet), Download, Save, Remix, Report
 * - YouTube-style Description drawer with view count, date, hashtags
 * - YouTube-style Comments preview & full Comments Bottom Sheet
 * - YouTube-style Up Next / Recommended videos feed with category chips and instant play
 */
const WatchVideoPage: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const goBack = useGoBack('/videos');
  const { user } = useAuth();

  const [video, setVideo] = useState<AppVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<AppVideo[]>([]);
  const [activeChip, setActiveChip] = useState<'all' | 'channel' | 'related'>('all');
  const [comments, setComments] = useState<AppVideoComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentsSort, setCommentsSort] = useState<'top' | 'newest'>('newest');

  // Engagement states
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Channel & follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [togglingFollow, setTogglingFollow] = useState(false);

  // Sheets & modals
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [descSheetOpen, setDescSheetOpen] = useState(false);
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false);
  const [autoplayNext, setAutoplayNext] = useState(true);

  // 3-dots action menu for recommended video
  const [recommendedMenuVideo, setRecommendedMenuVideo] = useState<AppVideo | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewCountedRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);
    try {
      const v = await getVideoById(videoId);
      setVideo(v);
      if (v) {
        setLiked(!!v.is_liked);
        setLikesCount(v.likes_count || 0);
        setIsSaved(isVideoSavedLocal(v.id));

        // Load comments, channel subscriber count, follow status, and related feed
        const [cs, feed, followersCount, followStatus] = await Promise.all([
          getVideoComments(v.id),
          getVideosFeed(35, 0),
          getFollowersCount(v.user_id).catch(() => 0),
          user ? getFollowStatus(user.id, v.user_id).catch(() => null) : Promise.resolve(null),
        ]);

        setComments(cs);
        setRelated(feed.filter((r) => r.id !== v.id));
        setSubscribersCount(followersCount);
        setIsFollowing(followStatus === 'accepted');
      }
    } catch (e) {
      console.error('watch load failed', e);
    } finally {
      setLoading(false);
    }
  }, [videoId, user]);

  useEffect(() => {
    load();
    // Scroll container to top when switching videos
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [load]);

  // View count once after brief watching
  useEffect(() => {
    if (!video || viewCountedRef.current === video.id) return;
    const t = setTimeout(() => {
      viewCountedRef.current = video.id;
      setVideo((prev) => (prev ? { ...prev, views_count: prev.views_count + 1 } : prev));
      recordVideoView(video.id).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [video]);

  // Like button handling
  const handleLike = async () => {
    if (!user || !video) {
      toast.error('Like karne ke liye login karein');
      return;
    }
    const was = liked;
    setLiked(!was);
    if (disliked) setDisliked(false);
    setLikesCount((c) => (was ? Math.max(0, c - 1) : c + 1));
    try {
      await toggleVideoLike(video.id, user.id, was);
    } catch {
      setLiked(was);
      setLikesCount((c) => (was ? c + 1 : Math.max(0, c - 1)));
      toast.error('Like save nahi hua');
    }
  };

  const handleDislike = () => {
    if (!user) {
      toast.error('Login karein');
      return;
    }
    if (!disliked && liked) {
      handleLike();
    }
    setDisliked((d) => !d);
  };

  // Follow / Subscribe channel toggle
  const handleFollowToggle = async () => {
    if (!user || !video) {
      toast.error('Channel subscribe karne ke liye login karein');
      return;
    }
    if (user.id === video.user_id) {
      toast.info('Yeh aapka hi channel hai');
      return;
    }

    setTogglingFollow(true);
    const willFollow = !isFollowing;
    setIsFollowing(willFollow);
    setSubscribersCount((c) => (willFollow ? c + 1 : Math.max(0, c - 1)));

    try {
      if (willFollow) {
        await followUser(video.user_id, false);
        toast.success(`Subscribed to @${video.profile?.username || 'user'}`);
      } else {
        await unfollowUser(video.user_id, user.id);
        toast.info(`Unsubscribed from @${video.profile?.username || 'user'}`);
      }
    } catch {
      setIsFollowing(!willFollow);
      setSubscribersCount((c) => (willFollow ? Math.max(0, c - 1) : c + 1));
      toast.error('Action failed, please try again');
    } finally {
      setTogglingFollow(false);
    }
  };

  // Video download
  const handleDownload = async () => {
    if (!video) return;
    setDownloading(true);
    toast.info('Video download shuru ho raha hai...');
    try {
      const cleanTitle = (video.title || 'video').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30);
      const res = await fetch(video.video_url);
      if (!res.ok) throw new Error('Fetch failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${cleanTitle}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success('Video device me download ho gaya! 📥');
    } catch {
      // Fallback direct link download
      const a = document.createElement('a');
      a.href = video.video_url;
      a.target = '_blank';
      a.download = 'video.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Download link open ho gaya');
    } finally {
      setDownloading(false);
    }
  };

  // Save to Watch Later
  const handleSaveToggle = () => {
    if (!video) return;
    const nowSaved = toggleSaveVideoLocal(video.id);
    setIsSaved(nowSaved);
    if (nowSaved) {
      toast.success('Saved to Watch Later playlist 📁');
    } else {
      toast.info('Removed from Watch Later');
    }
  };

  // Comment submission
  const handleComment = async () => {
    if (!video || !commentText.trim()) return;
    if (!user) {
      toast.error('Comment karne ke liye login karein');
      return;
    }
    setPosting(true);
    try {
      await addVideoComment(video.id, commentText.trim());
      setCommentText('');
      const updated = await getVideoComments(video.id);
      setComments(updated);
      toast.success('Comment post ho gaya!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Comment post nahi hua');
    } finally {
      setPosting(false);
    }
  };

  // Autoplay next video when current video ends
  const handleVideoEnded = () => {
    if (autoplayNext && related.length > 0) {
      const nextVideo = related[0];
      toast.info(`Next: "${nextVideo.title.slice(0, 25)}..." play ho raha hai`, { duration: 2500 });
      navigate(`/videos/${nextVideo.id}`);
    }
  };

  const handleDelete = async () => {
    if (!video) return;
    try {
      await deleteVideo(video.id);
      toast.success('Video delete ho gaya');
      navigate('/videos', { replace: true });
    } catch {
      toast.error('Delete nahi hua');
    }
  };

  // Filtered recommended videos based on chip
  const displayedRelated = useMemo(() => {
    if (activeChip === 'channel' && video) {
      const fromChannel = related.filter((r) => r.user_id === video.user_id);
      return fromChannel.length > 0 ? fromChannel : related;
    }
    return related;
  }, [activeChip, related, video]);

  // Sorted comments
  const displayedComments = useMemo(() => {
    if (commentsSort === 'top') {
      return [...comments];
    }
    return [...comments];
  }, [comments, commentsSort]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground font-medium">Video load ho raha hai…</span>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-3 px-6 text-center">
        <Lock className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">यह video उपलब्ध नहीं है या private है।</p>
        <button onClick={goBack} className="text-xs font-bold text-primary hover:underline">
          वीडियो पर वापस जाएं
        </button>
      </div>
    );
  }

  const isOwner = user?.id === video.user_id;
  const authorName = video.profile?.username || 'user';
  const authorFullName = video.profile?.full_name || authorName;
  const authorAvatar = video.profile?.avatar_url;
  const topComment = comments[0];

  return (
    <div className="fixed inset-0 bg-background flex flex-col select-none overflow-hidden">
      {/* 1. YOUTUBE VIDEO PLAYER */}
      <div className="relative w-full bg-black shrink-0 z-30 shadow-md" style={{ aspectRatio: '16 / 9' }}>
        <video
          ref={videoRef}
          key={video.id}
          src={video.video_url}
          poster={video.thumbnail_url || undefined}
          className="w-full h-full object-contain"
          controls
          autoPlay
          playsInline
          preload="auto"
          onEnded={handleVideoEnded}
        />
        {/* Top Floating Controls */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-20">
          <button
            onClick={goBack}
            className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white pointer-events-auto hover:bg-black/80 active:scale-95 transition-all"
            aria-label="वापस"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => {
                setAutoplayNext((prev) => {
                  const n = !prev;
                  toast.info(n ? 'Autoplay ON' : 'Autoplay OFF', { duration: 1500 });
                  return n;
                });
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md flex items-center gap-1 transition-all ${
                autoplayNext ? 'bg-white text-black shadow' : 'bg-black/60 text-white/80'
              }`}
            >
              <span>Autoplay</span>
              <span className={`w-2 h-2 rounded-full ${autoplayNext ? 'bg-red-600' : 'bg-white/40'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. SCROLLABLE DETAILS & UP NEXT FEED */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5">
        {/* Title */}
        <div>
          <h1 className="text-base font-bold text-foreground leading-snug tracking-tight">
            {video.title}
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <Eye className="w-3.5 h-3.5" />
            <span>{formatVideoViews(video.views_count)} views</span>
            <span>•</span>
            <span>{timeAgoHi(video.created_at)}</span>
            {video.duration_sec && (
              <>
                <span>•</span>
                <span>{formatDuration(video.duration_sec)}</span>
              </>
            )}
            {video.visibility === 'private' && (
              <span className="text-destructive font-semibold">• Private</span>
            )}
          </p>
        </div>

        {/* 3. YOUTUBE CHANNEL / CREATOR ROW */}
        <div className="flex items-center justify-between gap-3 py-1">
          <Link to={`/profile/${video.user_id}`} className="flex items-center gap-2.5 min-w-0">
            <Avatar className="w-10 h-10 border border-border">
              <AvatarImage src={authorAvatar || undefined} />
              <AvatarFallback className="font-bold text-sm bg-primary/20 text-primary">
                {authorName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate leading-tight">
                {authorFullName}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                @{authorName}
                {subscribersCount > 0 && ` • ${formatVideoViews(subscribersCount)} subscribers`}
              </p>
            </div>
          </Link>

          {!isOwner ? (
            <button
              onClick={handleFollowToggle}
              disabled={togglingFollow}
              className={`shrink-0 text-xs font-bold px-4 py-2 rounded-full transition-transform active:scale-95 flex items-center gap-1.5 ${
                isFollowing
                  ? 'bg-muted text-foreground hover:bg-muted/80'
                  : 'bg-foreground text-background hover:opacity-90 shadow-sm'
              }`}
            >
              {isFollowing ? (
                <>
                  <BellRing className="w-3.5 h-3.5 fill-current" />
                  <span>Subscribed</span>
                </>
              ) : (
                <span>Subscribe</span>
              )}
            </button>
          ) : (
            <button
              onClick={handleDelete}
              className="shrink-0 p-2 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-bold"
              title="Delete video"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 4. YOUTUBE HORIZONTAL ACTION BAR */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {/* Like / Dislike Split Pill */}
          <div className="flex items-center rounded-full bg-muted/80 text-foreground border border-border/40 shrink-0">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-l-full transition-colors ${
                liked ? 'text-primary' : 'hover:bg-muted'
              }`}
            >
              <ThumbsUp className={`w-4 h-4 ${liked ? 'fill-primary' : ''}`} />
              <span>{likesCount > 0 ? likesCount : 'Like'}</span>
            </button>
            <div className="w-[1px] h-4 bg-border/60" />
            <button
              onClick={handleDislike}
              className={`px-3 py-1.5 text-xs font-bold rounded-r-full transition-colors ${
                disliked ? 'text-destructive' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              <ThumbsDown className={`w-4 h-4 ${disliked ? 'fill-destructive' : ''}`} />
            </button>
          </div>

          {/* Share Button (Opens InstagramShareSheet) */}
          <button
            onClick={() => setShareSheetOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-muted/80 hover:bg-muted text-foreground text-xs font-bold border border-border/40 shrink-0 active:scale-95 transition-transform"
          >
            <Share2 className="w-4 h-4 text-foreground" />
            <span>Share</span>
          </button>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-muted/80 hover:bg-muted text-foreground text-xs font-bold border border-border/40 shrink-0 active:scale-95 transition-transform"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Download className="w-4 h-4 text-foreground" />
            )}
            <span>{downloading ? 'Downloading...' : 'Download'}</span>
          </button>

          {/* Save / Watch Later Button */}
          <button
            onClick={handleSaveToggle}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border border-border/40 shrink-0 active:scale-95 transition-transform ${
              isSaved ? 'bg-primary/15 text-primary border-primary/40' : 'bg-muted/80 text-foreground hover:bg-muted'
            }`}
          >
            {isSaved ? <BookmarkCheck className="w-4 h-4 fill-primary" /> : <Bookmark className="w-4 h-4" />}
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>

          {/* Remix button */}
          <button
            onClick={() => {
              navigate('/upload-video');
              toast.info('Audio remix / naya video create karein');
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-muted/80 hover:bg-muted text-foreground text-xs font-bold border border-border/40 shrink-0 active:scale-95 transition-transform"
          >
            <Scissors className="w-4 h-4 text-foreground" />
            <span>Remix</span>
          </button>

          {/* Report */}
          <button
            onClick={() => toast.success('Video report ho gaya. Review team ise check karegi.')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground text-xs font-bold border border-border/40 shrink-0 active:scale-95 transition-transform"
          >
            <Flag className="w-3.5 h-3.5" />
            <span>Report</span>
          </button>
        </div>

        {/* 5. YOUTUBE-STYLE DESCRIPTION CARD */}
        <div
          onClick={() => setDescSheetOpen(true)}
          className="rounded-2xl bg-muted/60 hover:bg-muted/80 p-3 cursor-pointer transition-colors border border-border/30 text-left"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <span>{formatVideoViews(video.views_count)} views</span>
            <span>{timeAgoHi(video.created_at)}</span>
            <span className="text-primary font-medium">#Pixelgram #Video</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {video.description || 'No description provided. Click for more details.'}
          </p>
          <span className="text-xs font-bold text-foreground mt-1 inline-block">
            ...more
          </span>
        </div>

        {/* 6. YOUTUBE-STYLE COMMENTS PREVIEW BOX */}
        <div
          onClick={() => setCommentsSheetOpen(true)}
          className="rounded-2xl bg-muted/60 hover:bg-muted/80 p-3 cursor-pointer transition-colors border border-border/30 space-y-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-foreground">
              Comments <span className="font-normal text-muted-foreground ml-1">{comments.length}</span>
            </p>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>

          {topComment ? (
            <div className="flex items-center gap-2 pt-0.5">
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={topComment.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-[10px]">
                  {(topComment.profile?.username || '?').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs text-foreground line-clamp-1 flex-1 min-w-0">
                <span className="font-semibold text-muted-foreground mr-1">@{topComment.profile?.username}:</span>
                {topComment.content}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageCircle className="w-4 h-4 text-muted-foreground" />
              <span>Add a comment…</span>
            </div>
          )}
        </div>

        {/* 7. YOUTUBE-STYLE "UP NEXT" / RECOMMENDED VIDEOS FEED */}
        <div className="pt-2 space-y-3 pb-8">
          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setActiveChip('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeChip === 'all'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/70 text-foreground hover:bg-muted'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveChip('channel')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeChip === 'channel'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/70 text-foreground hover:bg-muted'
              }`}
            >
              From @{authorName}
            </button>
            <button
              onClick={() => setActiveChip('related')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeChip === 'related'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/70 text-foreground hover:bg-muted'
              }`}
            >
              Related
            </button>
          </div>

          {/* Recommended Videos List */}
          {displayedRelated.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Aur video upload hone par yahan show honge
            </div>
          ) : (
            <div className="space-y-4">
              {displayedRelated.map((r) => (
                <div key={r.id} className="group flex flex-col gap-2">
                  {/* Thumbnail */}
                  <div
                    onClick={() => navigate(`/videos/${r.id}`)}
                    className="relative w-full rounded-2xl overflow-hidden bg-muted cursor-pointer active:scale-[0.99] transition-transform"
                    style={{ aspectRatio: '16 / 9' }}
                  >
                    {r.thumbnail_url ? (
                      <img
                        src={r.thumbnail_url}
                        alt={r.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                      />
                    ) : (
                      <video
                        src={firstFrameSrc(r.video_url)}
                        className="w-full h-full object-cover pointer-events-none"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}
                    {/* Duration Badge */}
                    {r.duration_sec && (
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/85 text-white text-[10px] font-semibold">
                        {formatDuration(r.duration_sec)}
                      </span>
                    )}
                    {r.visibility === 'private' && (
                      <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-semibold">
                        <Lock className="w-3 h-3" /> Private
                      </span>
                    )}
                  </div>

                  {/* Info Row */}
                  <div className="flex gap-2.5 px-0.5">
                    <Link
                      to={`/profile/${r.user_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 pt-0.5"
                    >
                      <Avatar className="w-9 h-9 border border-border/50">
                        <AvatarImage src={r.profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs font-bold">
                          {(r.profile?.username || '?').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>

                    <div
                      onClick={() => navigate(`/videos/${r.id}`)}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                        {r.title}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {r.profile?.full_name || r.profile?.username || 'user'} • {formatVideoViews(r.views_count)} views • {timeAgoHi(r.created_at)}
                      </p>
                    </div>

                    {/* 3-dots Menu Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecommendedMenuVideo(r);
                      }}
                      className="shrink-0 p-1 text-muted-foreground hover:text-foreground active:scale-95"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 8. YOUTUBE-STYLE DESCRIPTION BOTTOM DRAWER */}
      {descSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[80vh] bg-background border-t border-border rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom"
          >
            {/* Header */}
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-10 h-1 rounded-full bg-muted-foreground/30 absolute left-1/2 -translate-x-1/2 top-2" />
                <h2 className="text-base font-bold text-foreground">Description</h2>
              </div>
              <button
                onClick={() => setDescSheetOpen(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-foreground hover:bg-muted/80"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Description Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <h3 className="text-sm font-bold text-foreground">{video.title}</h3>

              {/* YouTube-style Stats Cards */}
              <div className="grid grid-cols-3 gap-2 py-2">
                <div className="bg-muted/60 p-2.5 rounded-xl text-center">
                  <p className="text-xs font-bold text-foreground">{formatVideoViews(video.views_count)}</p>
                  <p className="text-[10px] text-muted-foreground">Views</p>
                </div>
                <div className="bg-muted/60 p-2.5 rounded-xl text-center">
                  <p className="text-xs font-bold text-foreground">{formatVideoViews(likesCount)}</p>
                  <p className="text-[10px] text-muted-foreground">Likes</p>
                </div>
                <div className="bg-muted/60 p-2.5 rounded-xl text-center">
                  <p className="text-xs font-bold text-foreground">
                    {new Date(video.created_at).toLocaleDateString('hi-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(video.created_at).getFullYear()}
                  </p>
                </div>
              </div>

              {/* Text content */}
              <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 p-3 rounded-2xl border border-border/30">
                {video.description || 'No description provided.'}
              </div>

              {/* Creator info */}
              <Link
                to={`/profile/${video.user_id}`}
                onClick={() => setDescSheetOpen(false)}
                className="flex items-center gap-3 p-3 bg-muted/40 rounded-2xl border border-border/40"
              >
                <Avatar className="w-10 h-10">
                  <AvatarImage src={authorAvatar || undefined} />
                  <AvatarFallback>{authorName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">{authorFullName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    @{authorName} • {formatVideoViews(subscribersCount)} subscribers
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 9. YOUTUBE-STYLE COMMENTS BOTTOM SHEET */}
      {commentsSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-[75vh] max-h-[85vh] bg-background border-t border-border rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom"
          >
            {/* Header */}
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <span className="w-10 h-1 rounded-full bg-muted-foreground/30 absolute left-1/2 -translate-x-1/2 top-2" />
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Comments</h2>
                <span className="text-xs text-muted-foreground font-semibold">
                  {comments.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCommentsSort((s) => (s === 'newest' ? 'top' : 'newest'))}
                  className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-foreground"
                >
                  {commentsSort === 'newest' ? 'Newest' : 'Top'}
                </button>
                <button
                  onClick={() => setCommentsSheetOpen(false)}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-foreground hover:bg-muted/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {displayedComments.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <MessageCircle className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
                  <p className="text-xs text-muted-foreground font-medium">
                    अभी कोई comment नहीं है। पहला comment लिखें!
                  </p>
                </div>
              ) : (
                displayedComments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                      <AvatarImage src={c.profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs font-bold">
                        {(c.profile?.username || '?').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs font-bold text-foreground">
                        @{c.profile?.username || 'user'}{' '}
                        <span className="font-normal text-[11px] text-muted-foreground ml-1">
                          {timeAgoHi(c.created_at)}
                        </span>
                      </p>
                      <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
                        {c.content}
                      </p>
                      <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                        <button
                          onClick={() => toast.success('Liked comment')}
                          className="flex items-center gap-1 hover:text-foreground"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setCommentText(`@${c.profile?.username} `)}
                          className="hover:text-foreground font-semibold"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pinned Bottom Input Bar */}
            <div className="p-3 border-t border-border/60 bg-background/95 backdrop-blur-md space-y-2">
              {/* Quick emojis */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {['❤️', '🔥', '👏', '😂', '😍', '🙌', '💯'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setCommentText((prev) => prev + emoji)}
                    className="px-2 py-1 rounded-full bg-muted/60 hover:bg-muted text-xs shrink-0 active:scale-90 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage src={user?.user_metadata?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs font-bold">
                    {(user?.email || 'ME').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment…"
                  className="h-10 text-xs rounded-full bg-muted/60 border-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleComment();
                  }}
                />
                <button
                  onClick={handleComment}
                  disabled={posting || !commentText.trim()}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40 shrink-0 bg-primary active:scale-95 transition-transform"
                  aria-label="Send comment"
                >
                  {posting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. RECOMMENDED VIDEO 3-DOTS MENU MODAL */}
      {recommendedMenuVideo && (
        <div
          onClick={() => setRecommendedMenuVideo(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-background rounded-t-3xl p-4 space-y-2 border-t border-border shadow-2xl animate-in slide-in-from-bottom"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border/50">
              <p className="text-xs font-bold text-foreground truncate max-w-[80%]">
                {recommendedMenuVideo.title}
              </p>
              <button onClick={() => setRecommendedMenuVideo(null)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <button
              onClick={() => {
                navigate(`/videos/${recommendedMenuVideo.id}`);
                setRecommendedMenuVideo(null);
              }}
              className="w-full flex items-center gap-3 p-3 text-xs font-semibold text-foreground hover:bg-muted rounded-xl text-left"
            >
              <Play className="w-4 h-4 text-primary fill-primary" />
              <span>Play video</span>
            </button>
            <button
              onClick={() => {
                setRecommendedMenuVideo(null);
                setShareSheetOpen(true);
              }}
              className="w-full flex items-center gap-3 p-3 text-xs font-semibold text-foreground hover:bg-muted rounded-xl text-left"
            >
              <Share2 className="w-4 h-4 text-foreground" />
              <span>Share video</span>
            </button>
            <button
              onClick={() => {
                toggleSaveVideoLocal(recommendedMenuVideo.id);
                toast.success('Saved to Watch Later');
                setRecommendedMenuVideo(null);
              }}
              className="w-full flex items-center gap-3 p-3 text-xs font-semibold text-foreground hover:bg-muted rounded-xl text-left"
            >
              <Bookmark className="w-4 h-4 text-foreground" />
              <span>Save to Watch Later</span>
            </button>
          </div>
        </div>
      )}

      {/* 11. REELS-STYLE INSTAGRAM SHARE SHEET (for Videos!) */}
      <InstagramShareSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        url={`${window.location.origin}/videos/${video.id}`}
        title={`Video by @${authorName} on Pixelgram: ${video.title}`}
        mediaType="video"
        thumbnailUrl={video.thumbnail_url || undefined}
      />
    </div>
  );
};

export default WatchVideoPage;
