// WhatsApp / Facebook / Telegram par photo ke saath link preview ke liye
// share link hamare chhote server (music API) par jata hai. Wo crawler ko
// og:image deta hai aur insaan ko turant app ke page par bhej deta hai.
const DEFAULT_SHARE_BASE = 'https://ar-pixelgram-music-api.onrender.com';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function getShareBase(): string {
  const fromEnv = (import.meta.env.VITE_MUSIC_API_URL || '').replace(/\/+$/, '');
  return fromEnv || DEFAULT_SHARE_BASE;
}

export type ShareKind = 'video' | 'post' | 'reel' | 'profile';

export function previewShareUrl(kind: ShareKind, id: string): string {
  return `${getShareBase()}/s/${kind}/${id}`;
}

/**
 * App ka link (/videos/:id, /post/:id, /reels?r=:id, /profile/:id) ko
 * photo-preview wale share link me badalta hai. Pehchan na ho to wahi link.
 */
export function toPreviewShareUrl(appUrl: string): string {
  try {
    const u = new URL(appUrl, 'https://app.local');
    const path = u.pathname;
    let m = path.match(new RegExp(`^/videos?/(${UUID})`, 'i'));
    if (m) return previewShareUrl('video', m[1]);
    m = path.match(new RegExp(`^/posts?/(${UUID})`, 'i'));
    if (m) return previewShareUrl('post', m[1]);
    if (/^\/reels?/i.test(path)) {
      const r = u.searchParams.get('r') || path.split('/')[2] || '';
      if (new RegExp(`^${UUID}$`, 'i').test(r)) return previewShareUrl('reel', r);
    }
    m = path.match(new RegExp(`^/profile/(${UUID})`, 'i'));
    if (m) return previewShareUrl('profile', m[1]);
  } catch {
    /* ignore */
  }
  return appUrl;
}

let lastWarm = 0;
/** Free server so jata hai; share sheet khulte hi jaga dete hain taaki preview jaldi aaye. */
export function warmShareServer(): void {
  const now = Date.now();
  if (now - lastWarm < 60_000) return;
  lastWarm = now;
  try {
    void fetch(`${getShareBase()}/healthz`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  } catch {
    /* ignore */
  }
}
