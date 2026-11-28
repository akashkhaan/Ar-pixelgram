const VIDEO_URL_RE = /\.(mp4|mov|webm|avi|m4v)(?:[?#].*)?$/i;

/** Post URLs can be photos or videos; reels and long videos are always video. */
export function isSharedVideoUrl(url) {
  return typeof url === 'string' && VIDEO_URL_RE.test(url.trim());
}

/** Return only a genuinely playable URL, never a photo thumbnail. */
export function getSharedStoryVideoUrl(ref) {
  if (!ref || typeof ref.mediaUrl !== 'string' || !ref.mediaUrl.trim()) return null;
  if (ref.kind === 'post' && !isSharedVideoUrl(ref.mediaUrl)) return null;
  return ref.mediaUrl;
}

/**
 * Refresh old/incomplete share metadata from the original reel/post/video.
 * Stored values remain as fallbacks when the original cannot be loaded.
 */
export function mergeSharedStoryMedia(ref, source) {
  if (!source) return ref;
  const profile = source.profile || null;
  const mediaUrl = source.video_url || (ref.kind === 'post' ? source.image_url : null);
  return {
    ...ref,
    ownerId: source.user_id || ref.ownerId || null,
    ownerUsername: profile?.username || ref.ownerUsername || null,
    ownerAvatarUrl: profile?.avatar_url || ref.ownerAvatarUrl || null,
    thumbnailUrl: source.thumbnail_url || ref.thumbnailUrl || (ref.kind === 'post' && !isSharedVideoUrl(source.image_url) ? source.image_url : null) || null,
    mediaUrl: mediaUrl || ref.mediaUrl || null,
  };
}
