import { createServer } from 'node:http';
import { createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_FRONTEND_ORIGIN = 'https://ar-pixelgram.onrender.com';
const SAAVN_SEARCH_URL = 'https://www.jiosaavn.com/api.php';
const DES_KEY = Buffer.from('38346581', 'utf8');

function decodeHtml(value = '') {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function decryptSaavnMediaUrl(encryptedUrl) {
  if (!encryptedUrl) return '';
  try {
    // Triple DES with the same 8-byte key repeated three times is equivalent to DES.
    const tripleKey = Buffer.concat([DES_KEY, DES_KEY, DES_KEY]);
    const decipher = createDecipheriv('des-ede3-ecb', tripleKey, null);
    decipher.setAutoPadding(true);
    const url = Buffer.concat([
      decipher.update(Buffer.from(encryptedUrl, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return url.startsWith('http') ? url.replace('_96.', '_320.') : '';
  } catch {
    return '';
  }
}

function extractArtwork(image) {
  if (Array.isArray(image)) {
    const chosen = image.find((item) => item.quality === '500x500') || image.at(-1);
    return chosen?.link || '';
  }
  return typeof image === 'string' ? image : '';
}

function extractAudioUrl(item) {
  if (item.encrypted_media_url) {
    return decryptSaavnMediaUrl(item.encrypted_media_url);
  }

  const downloadUrls = item.downloadUrl || item.url;
  if (Array.isArray(downloadUrls)) {
    const chosen =
      downloadUrls.find((entry) => entry.quality === '320kbps') ||
      downloadUrls.find((entry) => entry.quality === '160kbps') ||
      downloadUrls.find((entry) => entry.quality === '96kbps') ||
      downloadUrls.at(-1);
    return chosen?.link || '';
  }
  return typeof downloadUrls === 'string' ? downloadUrls : '';
}

export function mapSaavnResults(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const tracks = [];

  for (const item of items) {
    if (!item) continue;
    const previewUrl = extractAudioUrl(item);
    if (!previewUrl) continue;

    const id = `saavn_${item.id || item.song || item.name}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const durationSeconds = Number.parseInt(item.duration, 10);
    tracks.push({
      id,
      title: decodeHtml(item.song || item.name || item.title || 'Untitled Track'),
      artist: decodeHtml(
        item.primary_artists || item.primaryArtists || item.artists || item.singers || 'Unknown Artist',
      ),
      album: decodeHtml(item.album?.name || item.album || ''),
      artwork: extractArtwork(item.image),
      previewUrl,
      durationMs: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1000 : 180_000,
      isFullSong: true,
    });
  }

  return tracks;
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function getAllowedOrigins() {
  return new Set([
    process.env.FRONTEND_ORIGIN || DEFAULT_FRONTEND_ORIGIN,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
}

// ---------- Link previews (WhatsApp / Facebook / Telegram photo card) ----------
// Static website crawler ko photo nahi de sakti, isliye share link yahan aata hai:
// crawler ko og:image wala HTML milta hai, aur insaan turant app par pahunch jata hai.
const DEFAULT_SUPABASE_URL = 'https://ojctcqahhkdehtgffzvx.supabase.co';
// Public (anon) key — yahi key website ke andar bhi hoti hai.
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qY3RjcWFoaGtkZWh0Z2ZmenZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzODE0MjksImV4cCI6MjEwOTk1NzQyOX0.xsne2kKDrJzYqop_x6miW1AGKztlHMTt_aeSrycNvRY';
const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_TYPES = new Set(['video', 'post', 'reel', 'profile']);

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clip(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isImageUrl(url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  return !/\.(mp4|mov|webm|m4v|3gp|mkv)(\?|$)/i.test(url);
}

// Free image converter (wsrv.nl): koi bhi photo -> 400x400 JPG (~30KB), jo WhatsApp turant dikhata hai.
export function whatsappSafeImage(url) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&h=400&fit=cover&output=jpg&q=82`;
}

export function appPathForShare(type, id) {
  if (type === 'video') return `/videos/${id}`;
  if (type === 'post') return `/post/${id}`;
  if (type === 'reel') return `/reels?r=${id}`;
  return `/profile/${id}`;
}

async function fetchRow(fetchImpl, table, filter) {
  const base = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const url = `${base}/rest/v1/${table}?${filter}&limit=1`;
  try {
    const res = await fetchImpl(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

async function getProfile(fetchImpl, userId) {
  if (!userId) return null;
  return fetchRow(fetchImpl, 'profiles', `user_id=eq.${userId}&select=user_id,username,full_name,avatar_url,bio`);
}

export async function buildSharePreview(fetchImpl, type, id, frontendOrigin) {
  const fallbackImage = `${frontendOrigin}/icon-512.png`;
  const preview = {
    title: 'Pixelgram',
    description: 'Pixelgram - Short videos, reels, calls, and chats',
    image: fallbackImage,
    ogType: 'website',
  };
  const by = (profile) => (profile?.username ? `@${profile.username}` : profile?.full_name || 'Pixelgram user');

  if (type === 'video') {
    const row = await fetchRow(fetchImpl, 'videos', `id=eq.${id}&select=id,user_id,title,description,thumbnail_url`);
    const profile = await getProfile(fetchImpl, row?.user_id);
    if (row) {
      preview.title = clip(row.title || 'Video on Pixelgram', 90);
      preview.description = clip(row.description || `Video by ${by(profile)} on Pixelgram`, 180);
      preview.image = isImageUrl(row.thumbnail_url) ? row.thumbnail_url : (isImageUrl(profile?.avatar_url) ? profile.avatar_url : fallbackImage);
      preview.ogType = 'video.other';
    }
  } else if (type === 'post') {
    const row = await fetchRow(fetchImpl, 'posts', `id=eq.${id}&select=id,user_id,image_url,caption`);
    const profile = await getProfile(fetchImpl, row?.user_id);
    if (row) {
      preview.title = `Post by ${by(profile)} on Pixelgram`;
      preview.description = clip(String(row.caption || '').replace(/<!--pixelgram_music:[\s\S]*?-->/g, '') || 'Pixelgram par ye post dekho', 180);
      preview.image = isImageUrl(row.image_url) ? row.image_url : (isImageUrl(profile?.avatar_url) ? profile.avatar_url : fallbackImage);
      preview.ogType = 'article';
    }
  } else if (type === 'reel') {
    const row = await fetchRow(fetchImpl, 'reels', `id=eq.${id}&select=id,user_id,thumbnail_url,caption`);
    const profile = await getProfile(fetchImpl, row?.user_id);
    if (row) {
      preview.title = `Reel by ${by(profile)} on Pixelgram`;
      preview.description = clip(String(row.caption || '').replace(/<!--pixelgram_music:[\s\S]*?-->/g, '') || 'Pixelgram par ye reel dekho', 180);
      preview.image = isImageUrl(row.thumbnail_url) ? row.thumbnail_url : (isImageUrl(profile?.avatar_url) ? profile.avatar_url : fallbackImage);
      preview.ogType = 'video.other';
    }
  } else if (type === 'profile') {
    const profile = await getProfile(fetchImpl, id);
    if (profile) {
      const name = profile.full_name || profile.username || 'Pixelgram user';
      preview.title = profile.username ? `${name} (@${profile.username}) • Pixelgram` : `${name} • Pixelgram`;
      preview.description = clip(profile.bio || `${name} ki Pixelgram profile dekho`, 180);
      // WhatsApp .webp aur badi (1MB+) photo nahi dikhata, isliye DP ko chhoti JPG bana ke dete hain
      preview.image = isImageUrl(profile.avatar_url) ? whatsappSafeImage(profile.avatar_url) : fallbackImage;
      preview.ogType = 'profile';
    }
  }
  return preview;
}

export function renderShareHtml(preview, targetUrl, shareUrl) {
  const t = escapeHtml(preview.title);
  const d = escapeHtml(preview.description);
  const img = escapeHtml(preview.image);
  const target = escapeHtml(targetUrl);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:site_name" content="Pixelgram">
<meta property="og:type" content="${escapeHtml(preview.ogType)}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:image:secure_url" content="${img}">
<meta property="og:image:alt" content="${t}">
<meta property="og:url" content="${escapeHtml(shareUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<link rel="canonical" href="${target}">
<meta http-equiv="refresh" content="0;url=${target}">
</head><body style="background:#0B0B0F;color:#fff;font-family:sans-serif;text-align:center;padding:40px">
<p>Opening Pixelgram…</p><p><a style="color:#e1306c" href="${target}">Tap here if it doesn't open</a></p>
<script>location.replace(${JSON.stringify(targetUrl).replace(/</g, '\\u003c')});</script>
</body></html>`;
}

async function handleShareRoute(fetchImpl, request, response, requestUrl) {
  const match = requestUrl.pathname.match(/^\/s\/([a-z]+)\/([^/]+)\/?$/i);
  if (!match) return false;
  const type = match[1].toLowerCase();
  const id = decodeURIComponent(match[2]);
  if (!SHARE_TYPES.has(type) || !SHARE_ID_PATTERN.test(id)) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end('Not found');
    return true;
  }
  const frontendOrigin = (process.env.FRONTEND_ORIGIN || DEFAULT_FRONTEND_ORIGIN).replace(/\/+$/, '');
  const targetUrl = `${frontendOrigin}${appPathForShare(type, id)}`;
  const host = request.headers['x-forwarded-host'] || request.headers.host || '';
  const shareUrl = host ? `https://${host}${requestUrl.pathname}` : targetUrl;
  const preview = await buildSharePreview(fetchImpl, type, id, frontendOrigin);
  const html = renderShareHtml(preview, targetUrl, shareUrl);
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=300');
  response.end(request.method === 'HEAD' ? undefined : html);
  return true;
}

export function createMusicApiServer(fetchImpl = globalThis.fetch) {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');

    if ((request.method === 'GET' || request.method === 'HEAD') && requestUrl.pathname.startsWith('/s/')) {
      if (await handleShareRoute(fetchImpl, request, response, requestUrl)) return;
    }
    const origin = request.headers.origin;
    const allowedOrigins = getAllowedOrigins();

    response.setHeader('Vary', 'Origin');
    if (origin && !allowedOrigins.has(origin)) {
      sendJson(response, 403, { error: 'Origin not allowed' });
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (requestUrl.pathname === '/healthz' && request.method === 'GET') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (requestUrl.pathname !== '/api/music-search') {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET, OPTIONS');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    const query = (requestUrl.searchParams.get('q') || requestUrl.searchParams.get('query') || '').trim();
    if (!query) {
      sendJson(response, 200, { results: [] });
      return;
    }
    if (query.length > 120) {
      sendJson(response, 400, { error: 'Search query is too long' });
      return;
    }

    const upstreamUrl = new URL(SAAVN_SEARCH_URL);
    upstreamUrl.search = new URLSearchParams({
      __call: 'search.getResults',
      _format: 'json',
      n: '35',
      p: '1',
      _marker: '0',
      ctx: 'android',
      q: query,
    }).toString();

    try {
      const upstream = await fetchImpl(upstreamUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!upstream.ok) {
        sendJson(response, 502, { error: 'Music search provider is unavailable', results: [] });
        return;
      }

      const data = await upstream.json();
      response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      sendJson(response, 200, { results: mapSaavnResults(data?.results) });
    } catch {
      sendJson(response, 502, { error: 'Music search provider is unavailable', results: [] });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3001;
  createMusicApiServer().listen(port, '0.0.0.0', () => {
    console.log(`Music API listening on port ${port}`);
  });
}
