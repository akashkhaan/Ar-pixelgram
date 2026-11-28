/**
 * Instagram jaisa "reel/post/video ko story par share karo".
 *
 * Story me ek chhoti si sticker/frame dikhti hai jisme:
 *  - kaunsa content hai (Reels / Post / Video)
 *  - kiska hai (username)
 *  - gana ka naam (agar hai)
 * Aur us par tap karne se asli reel/post/video khul jaata hai.
 *
 * Metadata story ke caption me invisible HTML comment ke roop me jaata hai
 * (jaise music tag), aur `cleanDisplayCaption` use display se hata deta hai.
 */

export type SharedStoryKind = 'reel' | 'post' | 'video';

export interface SharedStoryRef {
  kind: SharedStoryKind;
  /** Reel / post / video ka id */
  id: string;
  /** Content kis user ka hai */
  ownerId?: string | null;
  ownerUsername?: string | null;
  ownerAvatarUrl?: string | null;
  /** Gana (agar hai) */
  title?: string | null;
  artist?: string | null;
  artworkUrl?: string | null;
  previewUrl?: string | null;
  trackId?: string | null;
  startMs?: number | null;
  /** Sticker me dikhne wali thumbnail */
  thumbnailUrl?: string | null;
  /** Original reel/video file — story ke andar playback ke liye */
  mediaUrl?: string | null;
  /** Post me caption ka pehla hissa */
  snippet?: string | null;
}

const TAG_RE = /<!--pixelgram_share:([\s\S]*?)-->/;

export const SHARE_LABEL: Record<SharedStoryKind, string> = {
  reel: 'Reels',
  post: 'Post',
  video: 'Video',
};

/** Content ka route — sticker tap karne par yahan jaate hain */
export function sharedStoryPath(ref: SharedStoryRef): string {
  switch (ref.kind) {
    case 'reel':
      return `/reels?r=${encodeURIComponent(ref.id)}`;
    case 'video':
      return `/videos/${encodeURIComponent(ref.id)}`;
    default:
      return `/post/${encodeURIComponent(ref.id)}`;
  }
}

export function encodeStoryShare(
  caption: string | null,
  ref: SharedStoryRef,
): string {
  const tag = `<!--pixelgram_share:${JSON.stringify(ref)}-->`;
  return caption ? `${caption}\n\n${tag}` : tag;
}

export function decodeStoryShare(rawCaption?: string | null): SharedStoryRef | null {
  const match = (rawCaption || '').match(TAG_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as SharedStoryRef;
    if (!parsed || !parsed.id || !parsed.kind) return null;
    if (!['reel', 'post', 'video'].includes(parsed.kind)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Shared story ke liye background image.
 * `stories.image_url` NOT NULL hai, isliye thumbnail na hone par ek chhota
 * gradient placeholder (inline SVG data URI) bhejte hain.
 */
export function sharedStoryImage(ref: SharedStoryRef): string {
  if (ref.thumbnailUrl) return ref.thumbnailUrl;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7C5CFF"/><stop offset="1" stop-color="#FF3D7F"/>
  </linearGradient></defs>
  <rect width="720" height="1280" fill="url(#g)"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
