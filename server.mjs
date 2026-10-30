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

const AI_SYSTEM_PROMPT = [
  'You are Ar Pixelgram AI, a friendly and helpful AI assistant inside the Ar Pixelgram app.',
  'You can chat, answer questions, write code, build websites and apps, explain things, and help with any task.',
  'Reply in the same language the user writes in (Hindi, Hinglish, English, etc.).',
  'If anyone asks who made you, who created you, or who your owner is, always answer: "Mere owner Akash Kumar hain." (match the user language).',
  'If anyone asks where your owner is from, always answer: "Wo Bihar se hain - Nalanda University, Bihar Sharif, Asthawan." (match the user language).',
].join(' ');

async function readJsonBody(request, limit = 200_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleAiChat(request, response, fetchImpl) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: 'AI abhi setup nahi hai (GEMINI_API_KEY missing).' });
    return;
  }
  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { error: 'Invalid request' });
    return;
  }
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-30) : [];
  const contents = messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.slice(0, 8000) }] }));
  if (!contents.length) {
    sendJson(response, 400, { error: 'Message empty hai' });
    return;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const upstream = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] }, contents }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      sendJson(response, upstream.status === 429 ? 429 : 502, { error: data?.error?.message || 'AI abhi busy hai, thodi der baad try karo.' });
      return;
    }
    const reply = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    sendJson(response, 200, { reply: reply || 'Sorry, main abhi jawab nahi de paya.' });
  } catch {
    sendJson(response, 502, { error: 'AI abhi available nahi hai, thodi der baad try karo.' });
  }
}

export function createMusicApiServer(fetchImpl = globalThis.fetch) {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    const origin = request.headers.origin;
    const allowedOrigins = getAllowedOrigins();

    response.setHeader('Vary', 'Origin');
    if (origin && !allowedOrigins.has(origin)) {
      sendJson(response, 403, { error: 'Origin not allowed' });
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

    if (requestUrl.pathname === '/api/ai-chat' && request.method === 'POST') {
      await handleAiChat(request, response, fetchImpl);
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
