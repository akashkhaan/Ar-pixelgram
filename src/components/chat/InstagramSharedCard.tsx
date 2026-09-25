import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Film, BadgeCheck, ExternalLink, User, Loader2, Tv } from 'lucide-react';
import { getReelById, getProfile, type Reel, type Profile } from '@/services/api';
import { resolveFacebookIdToUserId } from '@/lib/facebookProfileUrl';
import { supabase } from '@/db/supabase';
import {
  getVideoById,
  formatDuration,
  formatVideoViews,
  timeAgoHi,
  type AppVideo,
} from '@/services/videos';

// In-memory caches to prevent repetitive fetching across messages
const reelCache = new Map<string, Reel>();
const profileCache = new Map<string, Profile>();
const postCache = new Map<string, any>();
const videoCache = new Map<string, AppVideo>();

export interface ParsedShareInfo {
  isShare: boolean;
  type: 'reel' | 'profile' | 'post' | 'video';
  id: string;
  isNumericProfileId?: boolean;
  customText?: string;
  rawUrl: string;
}

/**
 * Parses message content to detect shared Reel, Profile, or Post URLs
 */
export function parseSharedContent(content: string): ParsedShareInfo | null {
  if (!content || typeof content !== 'string') return null;

  // 1. Reel URL: /reels?r=UUID or /reels/UUID
  const reelMatch = content.match(/(?:https?:\/\/[^\s/]+)?\/reels(?:\?r=|\/)([a-zA-Z0-9_\-]+)/i);
  if (reelMatch) {
    const rawUrl = reelMatch[0];
    const reelId = reelMatch[1];
    let cleanText = content.replace(rawUrl, '').trim();
    cleanText = cleanText.replace(/Check out this (reel|video) on [^:\n]+:?/gi, '').trim();
    return {
      isShare: true,
      type: 'reel',
      id: reelId,
      customText: cleanText || undefined,
      rawUrl,
    };
  }

  // 2. Facebook-style numeric profile: /profile.php?id=61582269994535
  const fbProfileMatch = content.match(/(?:https?:\/\/[^\s/]+)?\/profile\.php\?id=(\d+)/i);
  if (fbProfileMatch) {
    const rawUrl = fbProfileMatch[0];
    const numericId = fbProfileMatch[1];
    let cleanText = content.replace(rawUrl, '').trim();
    cleanText = cleanText.replace(/Check out [^'\n]+'s profile on [^:\n]+:?/gi, '').trim();
    return {
      isShare: true,
      type: 'profile',
      id: numericId,
      isNumericProfileId: true,
      customText: cleanText || undefined,
      rawUrl,
    };
  }

  // 3. Standard profile: /profile/UUID or /profile/username
  const profileMatch = content.match(/(?:https?:\/\/[^\s/]+)?\/profile\/([a-zA-Z0-9_\-]+)/i);
  if (profileMatch) {
    const rawUrl = profileMatch[0];
    const profileId = profileMatch[1];
    let cleanText = content.replace(rawUrl, '').trim();
    cleanText = cleanText.replace(/Check out [^'\n]+'s profile on [^:\n]+:?/gi, '').trim();
    return {
      isShare: true,
      type: 'profile',
      id: profileId,
      isNumericProfileId: false,
      customText: cleanText || undefined,
      rawUrl,
    };
  }

  // 4. Post URL: /post/UUID or /home?post=UUID
  const postMatch = content.match(/(?:https?:\/\/[^\s/]+)?\/(?:post\/|home\?post=)([a-zA-Z0-9_\-]+)/i);
  if (postMatch) {
    const rawUrl = postMatch[0];
    const postId = postMatch[1];
    let cleanText = content.replace(rawUrl, '').trim();
    cleanText = cleanText.replace(/Check out this post on [^:\n]+:?/gi, '').trim();
    return {
      isShare: true,
      type: 'post',
      id: postId,
      customText: cleanText || undefined,
      rawUrl,
    };
  }

  // 5. Video URL: /videos/UUID or /videos?v=UUID or /video/UUID
  const videoMatch = content.match(/(?:https?:\/\/[^\s/]+)?\/(?:videos(?:\?v=|\/)|video\/)([a-zA-Z0-9_\-]+)/i);
  if (videoMatch) {
    const rawUrl = videoMatch[0];
    const videoId = videoMatch[1];
    let cleanText = content.replace(rawUrl, '').trim();
    cleanText = cleanText.replace(/Check out this (video|reel) on [^:\n]+:?/gi, '').trim();
    return {
      isShare: true,
      type: 'video',
      id: videoId,
      customText: cleanText || undefined,
      rawUrl,
    };
  }

  return null;
}

interface InstagramSharedCardProps {
  shareInfo: ParsedShareInfo;
  isMe?: boolean;
}

export const InstagramSharedCard: React.FC<InstagramSharedCardProps> = ({
  shareInfo,
  isMe = false,
}) => {
  const navigate = useNavigate();

  const [reel, setReel] = useState<Reel | null>(() => {
    return shareInfo.type === 'reel' ? reelCache.get(shareInfo.id) || null : null;
  });
  const [profile, setProfile] = useState<Profile | null>(() => {
    return shareInfo.type === 'profile' ? profileCache.get(shareInfo.id) || null : null;
  });
  const [post, setPost] = useState<any | null>(() => {
    return shareInfo.type === 'post' ? postCache.get(shareInfo.id) || null : null;
  });
  const [video, setVideo] = useState<AppVideo | null>(() => {
    return shareInfo.type === 'video' ? videoCache.get(shareInfo.id) || null : null;
  });

  const [loading, setLoading] = useState(!reel && !profile && !post && !video);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      if (shareInfo.type === 'reel') {
        if (reelCache.has(shareInfo.id)) {
          setReel(reelCache.get(shareInfo.id)!);
          setLoading(false);
          return;
        }
        try {
          setLoading(true);
          const data = await getReelById(shareInfo.id);
          if (isCancelled) return;
          if (data) {
            reelCache.set(shareInfo.id, data);
            setReel(data);
          } else {
            setLoadError(true);
          }
        } catch {
          if (!isCancelled) setLoadError(true);
        } finally {
          if (!isCancelled) setLoading(false);
        }
      } else if (shareInfo.type === 'profile') {
        if (profileCache.has(shareInfo.id)) {
          setProfile(profileCache.get(shareInfo.id)!);
          setLoading(false);
          return;
        }
        try {
          setLoading(true);
          let targetId = shareInfo.id;
          if (shareInfo.isNumericProfileId) {
            const resolved = await resolveFacebookIdToUserId(shareInfo.id);
            if (resolved) targetId = resolved;
          }
          const data = await getProfile(targetId);
          if (isCancelled) return;
          if (data) {
            profileCache.set(shareInfo.id, data);
            setProfile(data);
          } else {
            setLoadError(true);
          }
        } catch {
          if (!isCancelled) setLoadError(true);
        } finally {
          if (!isCancelled) setLoading(false);
        }
      } else if (shareInfo.type === 'post') {
        if (postCache.has(shareInfo.id)) {
          setPost(postCache.get(shareInfo.id)!);
          setLoading(false);
          return;
        }
        try {
          setLoading(true);
          const { data } = await supabase
            .from('posts')
            .select('*, profile:profiles(*)')
            .eq('id', shareInfo.id)
            .maybeSingle();
          if (isCancelled) return;
          if (data) {
            postCache.set(shareInfo.id, data);
            setPost(data);
          } else {
            setLoadError(true);
          }
        } catch {
          if (!isCancelled) setLoadError(true);
        } finally {
          if (!isCancelled) setLoading(false);
        }
      } else if (shareInfo.type === 'video') {
        if (videoCache.has(shareInfo.id)) {
          setVideo(videoCache.get(shareInfo.id)!);
          setLoading(false);
          return;
        }
        try {
          setLoading(true);
          const data = await getVideoById(shareInfo.id);
          if (isCancelled) return;
          if (data) {
            videoCache.set(shareInfo.id, data);
            setVideo(data);
          } else {
            setLoadError(true);
          }
        } catch {
          if (!isCancelled) setLoadError(true);
        } finally {
          if (!isCancelled) setLoading(false);
        }
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, [shareInfo.id, shareInfo.type, shareInfo.isNumericProfileId]);

  if (loadError) {
    return (
      <div className="space-y-1">
        {shareInfo.customText && <p className="break-words">{shareInfo.customText}</p>}
        <a
          href={shareInfo.rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline break-all opacity-85 hover:opacity-100 flex items-center gap-1"
        >
          <span>{shareInfo.rawUrl}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      </div>
    );
  }

  // ==========================================
  // 1. REEL PREVIEW CARD (Instagram DM Style)
  // ==========================================
  if (shareInfo.type === 'reel') {
    const author = reel?.profile;
    const authorName = author?.username || 'user';
    const authorAvatar = author?.avatar_url;
    const authorVerified = author?.is_verified;

    const handleReelClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate(`/reels?r=${shareInfo.id}`);
    };

    return (
      <div className="space-y-1.5">
        {shareInfo.customText && (
          <p className="break-words text-sm font-medium px-1">{shareInfo.customText}</p>
        )}

        <div
          onClick={handleReelClick}
          className="group relative w-60 sm:w-64 rounded-2xl overflow-hidden bg-black text-white shadow-lg border border-white/10 cursor-pointer select-none transition-transform active:scale-[0.98]"
        >
          {/* Top creator bar */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-b from-black/85 via-black/40 to-transparent absolute top-0 inset-x-0 z-20">
            <div className="flex items-center gap-2 min-w-0">
              {authorAvatar ? (
                <img
                  src={authorAvatar}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover border border-white/40 shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {authorName[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs font-semibold truncate text-white drop-shadow">
                @{authorName}
              </span>
              {authorVerified && (
                <BadgeCheck className="w-3.5 h-3.5 text-sky-400 shrink-0 fill-sky-400/20" />
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-white/90 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full">
              <Film className="w-3 h-3" />
              <span>Reel</span>
            </div>
          </div>

          {/* Media / Video Container */}
          <div className="relative w-full h-80 bg-zinc-950 flex items-center justify-center overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 text-white/60">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
                <span className="text-xs">Loading reel...</span>
              </div>
            ) : reel?.thumbnail_url ? (
              <img
                src={reel.thumbnail_url}
                alt={reel.caption || 'Reel'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : reel?.video_url ? (
              <video
                src={reel.video_url}
                preload="metadata"
                muted
                playsInline
                className="w-full h-full object-cover pointer-events-none"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-white/50">
                <Film className="w-10 h-10" />
                <span className="text-xs font-medium">Reel Preview</span>
              </div>
            )}

            {/* Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none z-10" />

            {/* Instagram Central Play Button */}
            {!loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-2xl transition-all duration-200 group-hover:scale-110 group-active:scale-95 group-hover:bg-black/70">
                  <Play className="w-7 h-7 ml-0.5 fill-white text-white drop-shadow-md" />
                </div>
              </div>
            )}

            {/* Bottom Caption & Music Bar */}
            <div className="absolute bottom-0 inset-x-0 p-3 z-20 space-y-1">
              {reel?.caption && (
                <p className="text-xs font-medium text-white line-clamp-2 drop-shadow-md leading-relaxed">
                  {reel.caption}
                </p>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-white/80 font-normal truncate">
                <span className="text-xs">♪</span>
                <span className="truncate">
                  {reel?.music_title
                    ? `${reel.music_title} · ${reel.music_artist || authorName}`
                    : `Original audio · @${authorName}`}
                </span>
              </div>
            </div>
          </div>

          {/* Action Bar (Watch on Reels) */}
          <div className="px-3 py-2 bg-zinc-900/90 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-white/90">
            <span className="text-[11px] tracking-wide text-white/75">Watch on Reels</span>
            <div className="flex items-center gap-1 text-sky-400 text-[11px]">
              <span>Play</span>
              <Play className="w-3 h-3 fill-current" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. PROFILE PREVIEW CARD (Instagram DM Style)
  // ==========================================
  if (shareInfo.type === 'profile') {
    const handleProfileClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (profile?.user_id) {
        navigate(`/profile/${profile.user_id}`);
      } else if (shareInfo.isNumericProfileId) {
        navigate(`/profile.php?id=${shareInfo.id}`);
      } else {
        navigate(`/profile/${shareInfo.id}`);
      }
    };

    const displayName = profile?.full_name || profile?.username || 'Pixelgram User';
    const username = profile?.username || 'user';
    const avatarUrl = profile?.avatar_url;

    return (
      <div className="space-y-1.5">
        {shareInfo.customText && (
          <p className="break-words text-sm font-medium px-1">{shareInfo.customText}</p>
        )}

        <div
          onClick={handleProfileClick}
          className="group w-60 sm:w-64 rounded-2xl bg-card border border-border/80 shadow-md p-4 flex flex-col items-center text-center text-foreground cursor-pointer select-none transition-transform active:scale-[0.98] hover:border-primary/40"
        >
          {loading ? (
            <div className="py-6 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">Loading profile...</span>
            </div>
          ) : (
            <>
              {/* Instagram Story Gradient Ring */}
              <div className="p-[2.5px] rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shadow-sm shrink-0 transition-transform group-hover:scale-105 duration-200">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-16 h-16 rounded-full object-cover bg-muted border-2 border-background"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary/15 text-primary border-2 border-background flex items-center justify-center font-bold text-xl">
                    {displayName[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>

              {/* Name & Username */}
              <div className="mt-2.5 max-w-full">
                <div className="flex items-center justify-center gap-1 max-w-full">
                  <h4 className="font-bold text-sm text-foreground truncate">{displayName}</h4>
                  {profile?.is_verified && (
                    <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0 fill-sky-500/20" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">@{username}</p>
              </div>

              {/* Bio snippet */}
              {profile?.bio && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1.5 px-1 leading-relaxed">
                  {profile.bio}
                </p>
              )}

              {/* View Profile Action Button */}
              <button
                type="button"
                onClick={handleProfileClick}
                className="w-full mt-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <User className="w-3.5 h-3.5" />
                <span>View profile</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // 3. POST PREVIEW CARD
  // ==========================================
  if (shareInfo.type === 'post') {
    const handlePostClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate(`/post/${shareInfo.id}`);
    };

    const author = post?.profile;
    const authorName = author?.username || 'user';
    const authorAvatar = author?.avatar_url;

    return (
      <div className="space-y-1.5">
        {shareInfo.customText && (
          <p className="break-words text-sm font-medium px-1">{shareInfo.customText}</p>
        )}

        <div
          onClick={handlePostClick}
          className="group w-60 sm:w-64 rounded-2xl overflow-hidden bg-card border border-border/80 shadow-md text-foreground cursor-pointer select-none transition-transform active:scale-[0.98]"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
            {authorAvatar ? (
              <img src={authorAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                {authorName[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-xs font-semibold truncate">@{authorName}</span>
          </div>

          {/* Media preview */}
          {post?.image_url && (
            <div className="w-full h-56 bg-muted overflow-hidden flex items-center justify-center">
              {post.image_url.match(/\.(mp4|mov|webm|avi|m4v)(\?|$)/i) ? (
                <video
                  src={post.image_url}
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={post.image_url}
                  alt=""
                  className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                />
              )}
            </div>
          )}

          {/* Caption */}
          {post?.caption && (
            <div className="p-3">
              <p className="text-xs text-foreground line-clamp-2">{post.caption}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-3 py-2 bg-muted/40 border-t border-border/60 flex items-center justify-between text-xs font-semibold text-primary">
            <span>View post</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 4. VIDEO PREVIEW CARD (YouTube / Video Style)
  // ==========================================
  if (shareInfo.type === 'video') {
    const handleVideoClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate(`/videos/${shareInfo.id}`);
    };

    const author = video?.profile;
    const authorName = author?.username || 'user';
    const authorAvatar = author?.avatar_url;
    const authorVerified = author?.is_verified;

    return (
      <div className="space-y-1.5">
        {shareInfo.customText && (
          <p className="break-words text-sm font-medium px-1">{shareInfo.customText}</p>
        )}

        <div
          onClick={handleVideoClick}
          className="group relative w-64 sm:w-72 rounded-2xl overflow-hidden bg-card border border-border/80 shadow-md text-foreground cursor-pointer select-none transition-transform active:scale-[0.98] hover:border-primary/50"
        >
          {/* Top creator bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/40">
            <div className="flex items-center gap-2 min-w-0">
              {authorAvatar ? (
                <img
                  src={authorAvatar}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                  {authorName[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs font-semibold truncate text-foreground">
                @{authorName}
              </span>
              {authorVerified && (
                <BadgeCheck className="w-3.5 h-3.5 text-sky-500 shrink-0 fill-sky-500/20" />
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
              <Tv className="w-3 h-3" />
              <span>Video</span>
            </div>
          </div>

          {/* 16:9 Thumbnail / Preview */}
          <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Loading video...</span>
              </div>
            ) : video?.thumbnail_url ? (
              <img
                src={video.thumbnail_url}
                alt={video.title || 'Video'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : video?.video_url ? (
              <video
                src={video.video_url}
                preload="metadata"
                muted
                playsInline
                className="w-full h-full object-cover pointer-events-none"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Tv className="w-8 h-8 text-muted-foreground/60" />
                <span className="text-xs font-medium">Video</span>
              </div>
            )}

            {/* Play Button Overlay */}
            {!loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-black/25">
                <div className="w-12 h-12 rounded-full bg-red-600/95 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                  <Play className="w-6 h-6 ml-0.5 fill-white text-white drop-shadow" />
                </div>
              </div>
            )}

            {/* Duration badge */}
            {video?.duration_sec && (
              <span className="absolute bottom-2 right-2 z-20 px-1.5 py-0.5 rounded bg-black/85 text-white text-[10px] font-semibold">
                {formatDuration(video.duration_sec)}
              </span>
            )}
          </div>

          {/* Video Title & Meta */}
          <div className="p-3 space-y-1">
            <h4 className="text-xs font-bold text-foreground line-clamp-2 leading-snug">
              {video?.title || 'Pixelgram Video'}
            </h4>
            <p className="text-[11px] text-muted-foreground">
              {video?.views_count != null && `${formatVideoViews(video.views_count)} views · `}
              {video?.created_at && timeAgoHi(video.created_at)}
            </p>
          </div>

          {/* Footer Action */}
          <div className="px-3 py-2 bg-muted/40 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Watch on Pixelgram</span>
            <div className="flex items-center gap-1">
              <span>Play</span>
              <Play className="w-3 h-3 fill-current" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default InstagramSharedCard;
