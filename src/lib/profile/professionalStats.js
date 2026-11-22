// Professional dashboard ke asli numbers — reels, videos aur posts se.
// Browser-safe pure module (node --test se check hota hai).

const DAY_MS = 24 * 60 * 60 * 1000;

function count(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function sum(list, key) {
  return list.reduce((s, item) => s + count(item && item[key]), 0);
}

/**
 * @param {{ reels?: any[], videos?: any[], posts?: any[], now?: number }} input
 */
export function summarizeProfessionalStats({ reels = [], videos = [], posts = [], now = Date.now() } = {}) {
  const reelViews = sum(reels, 'views_count');
  const videoViews = sum(videos, 'views_count');
  const cutoff = now - 30 * DAY_MS;
  const isRecent = (item) => {
    const t = Date.parse(item && item.created_at);
    return Number.isFinite(t) && t >= cutoff;
  };
  const recentViews = sum(reels.filter(isRecent), 'views_count') + sum(videos.filter(isRecent), 'views_count');
  const totalLikes = sum(posts, 'likes_count') + sum(reels, 'likes_count') + sum(videos, 'likes_count');

  const top = [
    ...reels.map((r) => ({
      kind: 'reel',
      id: r.id,
      title: (r.caption || '').trim() || 'Reel',
      thumbnail: r.thumbnail_url || null,
      views: count(r.views_count),
    })),
    ...videos.map((v) => ({
      kind: 'video',
      id: v.id,
      title: (v.title || '').trim() || 'Video',
      thumbnail: v.thumbnail_url || null,
      views: count(v.views_count),
    })),
  ]
    .filter((x) => x.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  return {
    totalViews: reelViews + videoViews,
    reelViews,
    videoViews,
    recentViews,
    totalLikes,
    contentCount: posts.length + reels.length + videos.length,
    top,
  };
}

/** 950 -> "950", 4100 -> "4.1k", 2500000 -> "2.5M" */
export function formatCompact(value) {
  const n = count(value);
  if (n < 1000) return String(n);
  if (n < 1000000) return `${trim(n / 1000)}k`;
  return `${trim(n / 1000000)}M`;
}

function trim(x) {
  const fixed = x >= 100 ? Math.floor(x).toString() : (Math.floor(x * 10) / 10).toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}
