import CryptoJS from 'crypto-js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from '@/db/supabase';
// ===================== MUSIC (Songs for Stories, Reels & Posts) =====================
// Full-length Saavn tracks plus short iTunes previews for catalog fallback.
// The Render music API proxies Saavn because the upstream endpoint does not allow browser CORS.
// Personalized by Earth location (State, Region, Country) with unlimited A-Z search.

export interface MusicTrack {
  isFullSong?: boolean;
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  previewUrl: string;
  durationMs: number;
  reelsCount?: string;
  isOriginalAudio?: boolean;
}

export interface MusicLocale {
  countryCode: string;
  countryName: string;
  regionName?: string;
  city?: string;
  localTerms: string[];
  source: 'ip' | 'location' | 'browser' | 'manual';
}


export function decryptSaavnMediaUrl(encUrl: string): string {
  if (!encUrl) return '';
  try {
    const key = CryptoJS.enc.Utf8.parse('38346581');
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encUrl) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    const dec = decrypted.toString(CryptoJS.enc.Utf8);
    if (!dec || !dec.startsWith('http')) return '';
    return dec.replace('_96.', '_160.');
  } catch {
    return '';
  }
}

export async function getRealReelsCounts(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from('reels')
      .select('music_track_id, music_title');
    if (error || !data) return {};
    const map: Record<string, number> = {};
    for (const r of data) {
      if (r.music_track_id) {
        const id = String(r.music_track_id).trim();
        map[id] = (map[id] || 0) + 1;
      }
      if (r.music_title) {
        const t = String(r.music_title).toLowerCase().trim();
        map[t] = (map[t] || 0) + 1;
      }
    }
    return map;
  } catch {
    return {};
  }
}

const ITUNES = 'https://itunes.apple.com/search';
const MUSIC_LOCALE_CACHE_KEY = 'ar-pixelgram-music-locale-v2';

function bigArtwork(url: string): string {
  return (url || '').replace('100x100bb', '400x400bb').replace('60x60bb', '300x300bb');
}

interface ItunesResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
}

function mapTracks(results: ItunesResult[]): MusicTrack[] {
  const seen = new Set<string>();
  const out: MusicTrack[] = [];
  for (const r of results) {
    if (!r.previewUrl || !r.trackName || !r.trackId) continue;
    const id = String(r.trackId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: r.trackName,
      artist: r.artistName || 'Unknown artist',
      album: r.collectionName,
      artwork: bigArtwork(r.artworkUrl100 || ''),
      previewUrl: r.previewUrl,
      // iTunes previewUrl is a 30-second sample even when trackTimeMillis is longer.
      durationMs: 30_000,
      isFullSong: false,
    });
  }
  return out;
}

// Comprehensive State/Region music preferences for India
export const INDIAN_REGION_TERMS: Record<string, string[]> = {
  Bihar: ['bhojpuri hits', 'pawan singh', 'khesari lal yadav', 'shilpi raj', 'bhojpuri latest', 'maithili hits', 'bihar songs'],
  'Uttar Pradesh': ['bhojpuri hits', 'hindi latest songs', 'khesari lal yadav', 'awadhi songs', 'bollywood hits'],
  Jharkhand: ['nagpuri hits', 'bhojpuri hits', 'khortha songs', 'jharkhand hits'],
  Delhi: ['hindi latest songs', 'bollywood party songs', 'punjabi hits', 'haryanvi hits'],
  Punjab: ['punjabi hits', 'sidhu moose wala', 'diljit dosanjh', 'karan aujla', 'ap dhillon', 'punjabi latest'],
  Haryana: ['haryanvi hits', 'gulzaar chhaniwala', 'masoom sharma', 'renuka panwar', 'haryanvi latest'],
  Maharashtra: ['bollywood latest songs', 'marathi hits', 'ajay atul', 'marathi songs'],
  Gujarat: ['gujarati hits', 'kinjal dave', 'garba hits', 'gujarati latest'],
  Rajasthan: ['rajasthani hits', 'marwadi songs', 'rajasthani folk', 'seema mishra'],
  'West Bengal': ['bengali hits', 'arijit singh', 'bangla songs', 'rabindra sangeet'],
  Assam: ['assamese hits', 'bihu songs', 'zubeen garg'],
  Odisha: ['odia hits', 'odia latest songs', 'humane sagar'],
  'Tamil Nadu': ['tamil hits', 'anirudh', 'ar rahman', 'tamil latest songs'],
  'Andhra Pradesh': ['telugu hits', 'dsp hits', 'thaman s', 'telugu latest'],
  Telangana: ['telugu hits', 'telugu latest', 'dsp hits'],
  Karnataka: ['kannada hits', 'kannada latest songs', 'sanjith hegde'],
  Kerala: ['malayalam hits', 'malayalam latest songs'],
  Goa: ['konkani hits', 'goan songs', 'goa party songs'],
  'Himachal Pradesh': ['pahadi songs', 'hindi latest songs', 'kullu nati'],
  Uttarakhand: ['pahadi songs', 'garhwali songs', 'kumaoni songs'],
  'Jammu and Kashmir': ['kashmiri songs', 'hindi latest songs', 'pahadi songs'],
  Ladakh: ['ladakhi songs', 'pahadi songs', 'hindi latest songs'],
  Chandigarh: ['punjabi hits', 'punjabi latest', 'hindi latest songs'],
  Chhattisgarh: ['chhattisgarhi songs', 'hindi latest songs'],
  Manipur: ['manipuri songs', 'northeast india songs'],
  Meghalaya: ['northeast india songs', 'english hits'],
  Mizoram: ['mizo songs', 'northeast india songs'],
  Nagaland: ['naga songs', 'northeast india songs'],
  Sikkim: ['nepali hits', 'hindi latest songs', 'northeast india songs'],
  Tripura: ['bengali hits', 'northeast india songs'],
  'Andaman and Nicobar Islands': ['hindi latest songs', 'bengali hits'],
  'Dadra and Nagar Haveli and Daman and Diu': ['gujarati hits', 'hindi latest songs'],
  Lakshadweep: ['malayalam hits', 'hindi latest songs'],
  Puducherry: ['tamil hits', 'tamil latest songs'],
};

// Global Country music mapping for all Earth nations
export const COUNTRY_TERMS: Record<string, string[]> = {
  IN: ['hindi latest songs', 'bollywood hits', 'indian pop'],
  PK: ['pakistani hits', 'coke studio pakistan', 'atif aslam', 'ali zafar', 'urdu hits', 'qawwali'],
  NP: ['nepali hits', 'nepali pop', 'nepali songs', 'hindi hits'],
  BD: ['bangla hits', 'bangladesh pop', 'bengali songs'],
  LK: ['sinhala hits', 'tamil hits', 'bailas'],
  CN: ['chinese pop', 'mandopop hits', 'c-pop hits', 'chinese trending'],
  HK: ['cantopop', 'hong kong hits', 'c-pop hits'],
  TW: ['mandopop hits', 'taiwan pop', 'chinese pop'],
  JP: ['j-pop hits', 'japanese pop', 'anime hits'],
  KR: ['k-pop hits', 'korean pop', 'bts', 'blackpink'],
  US: ['billboard top 100', 'pop hits', 'hip hop hits', 'us trending'],
  GB: ['uk top 40', 'british pop', 'uk trending', 'english hits'],
  CA: ['canada top hits', 'pop hits', 'drake', 'the weeknd'],
  AU: ['australia top hits', 'pop hits', 'australian pop'],
  NZ: ['new zealand hits', 'pop hits'],
  BR: ['funk brasil', 'sertanejo hits', 'brazilian pop'],
  MX: ['musica mexicana', 'latin hits', 'reggaeton', 'regional mexicano'],
  ES: ['spain top hits', 'spanish pop', 'latin hits'],
  FR: ['french pop', 'france top hits', 'chanson francaise'],
  DE: ['german pop', 'germany top hits', 'deutschrap'],
  IT: ['italian pop', 'italy top hits', 'sanremo'],
  RU: ['russian pop', 'russia top hits'],
  TR: ['turkish pop', 'turkey top hits', 'turkce pop'],
  SA: ['arabic hits', 'khaleeji songs', 'saudi pop'],
  AE: ['arabic hits', 'khaleeji songs', 'uae top hits'],
  EG: ['egyptian pop', 'arabic hits', 'amr diab'],
  NG: ['afrobeats', 'nigeria top hits', 'burna boy', 'wizkid', 'rema'],
  ZA: ['amapiano', 'south africa top hits', 'afropop'],
  ID: ['indonesian pop', 'dangdut hits', 'indonesia top hits'],
  MY: ['malay hits', 'malaysia pop'],
  PH: ['opm hits', 'filipino pop', 'philippines top hits'],
  TH: ['thai pop', 'thailand top hits', 't-pop'],
  VN: ['v-pop', 'vietnam top hits'],
  NL: ['dutch pop', 'netherlands top hits'],
  SE: ['swedish pop', 'sweden top hits'],
  NO: ['norway top hits', 'norwegian pop'],
  DK: ['danish pop', 'denmark top hits'],
  FI: ['finnish pop', 'finland top hits'],
  PL: ['polish pop', 'poland top hits'],
};

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

export function getCountryTerms(countryCode: string, countryName: string): string[] {
  return uniqueTerms([
    ...(COUNTRY_TERMS[countryCode] || []),
    `${countryName} top songs`,
    `${countryName} latest hits`,
    `${countryName} viral music`,
    'top hits',
    'global viral',
  ]);
}

export function getCountryName(countryCode: string): string {
  try {
    const IntlWithDisplayNames = Intl as typeof Intl & {
      DisplayNames?: new (
        locales: string | string[],
        options: { type: 'region' },
      ) => { of: (code: string) => string | undefined };
    };
    const displayNames = IntlWithDisplayNames.DisplayNames;
    return displayNames ? new displayNames(['en'], { type: 'region' }).of(countryCode) || countryCode : countryCode;
  } catch {
    return countryCode;
  }
}

export const POPULAR_REGIONS = [
  { id: 'bihar', name: 'Bihar (Bhojpuri / Maithili)', countryCode: 'IN', countryName: 'India', regionName: 'Bihar' },
  { id: 'up', name: 'Uttar Pradesh (Bhojpuri / Hindi)', countryCode: 'IN', countryName: 'India', regionName: 'Uttar Pradesh' },
  { id: 'punjab', name: 'Punjab (Punjabi Hits)', countryCode: 'IN', countryName: 'India', regionName: 'Punjab' },
  { id: 'india_all', name: 'All India (Bollywood & Pop)', countryCode: 'IN', countryName: 'India' },
  { id: 'haryana', name: 'Haryana (Haryanvi)', countryCode: 'IN', countryName: 'India', regionName: 'Haryana' },
  { id: 'maharashtra', name: 'Maharashtra (Marathi / Hindi)', countryCode: 'IN', countryName: 'India', regionName: 'Maharashtra' },
  { id: 'bengal', name: 'West Bengal (Bengali)', countryCode: 'IN', countryName: 'India', regionName: 'West Bengal' },
  { id: 'south_in', name: 'South India (Telugu / Tamil)', countryCode: 'IN', countryName: 'India', regionName: 'Telangana' },
  { id: 'pakistan', name: 'Pakistan (Urdu / Coke Studio)', countryCode: 'PK', countryName: 'Pakistan' },
  { id: 'nepal', name: 'Nepal (Nepali Pop)', countryCode: 'NP', countryName: 'Nepal' },
  { id: 'global', name: 'Global Hits (English / Billboard)', countryCode: 'US', countryName: 'Global' },
];

const MANUAL_LOCALE_KEY = 'ar-pixelgram-music-manual-locale-v2';

export function getManualMusicLocale(): MusicLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MANUAL_LOCALE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const trendingCache = new Map<string, MusicTrack[]>();

export function setManualMusicLocale(locale: MusicLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MANUAL_LOCALE_KEY, JSON.stringify(locale));
    trendingCache.clear();
  } catch {}
}

function localeFromBrowser(): MusicLocale {
  const language = typeof navigator !== 'undefined' ? navigator.language || 'en-IN' : 'en-IN';
  const parts = language.split('-');
  const languageCode = parts[0].toLowerCase();
  const languageCountry = parts.find((part) => part.length === 2 && part === part.toUpperCase());
  const timeZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';

  const timezoneCountry: Record<string, string> = {
    'Asia/Calcutta': 'IN',
    'Asia/Kolkata': 'IN',
    'Asia/Dhaka': 'BD',
    'Asia/Karachi': 'PK',
    'Asia/Kathmandu': 'NP',
    'Asia/Colombo': 'LK',
    'Asia/Dubai': 'AE',
    'Asia/Riyadh': 'SA',
    'Asia/Tokyo': 'JP',
    'Asia/Seoul': 'KR',
    'Asia/Shanghai': 'CN',
    'Asia/Singapore': 'SG',
    'Asia/Kuala_Lumpur': 'MY',
    'Asia/Jakarta': 'ID',
    'Australia/Sydney': 'AU',
    'Europe/London': 'GB',
    'Europe/Paris': 'FR',
    'Europe/Berlin': 'DE',
    'Europe/Rome': 'IT',
    'Europe/Madrid': 'ES',
    'America/Toronto': 'CA',
    'America/Vancouver': 'CA',
    'America/Sao_Paulo': 'BR',
    'America/Mexico_City': 'MX',
    'America/New_York': 'US',
  };

  const countryCode = (languageCountry || timezoneCountry[timeZone] || 'IN').toUpperCase();
  const countryName = getCountryName(countryCode);

  return {
    countryCode,
    countryName,
    localTerms: uniqueTerms(getCountryTerms(countryCode, countryName)),
    source: 'browser',
  };
}

export function getDefaultMusicLocale(): MusicLocale {
  return getManualMusicLocale() || localeFromBrowser();
}

function readCachedLocale(): MusicLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MUSIC_LOCALE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as MusicLocale & { savedAt?: number };
    // Cache for 6 hours
    if (!cached.savedAt || Date.now() - cached.savedAt > 6 * 60 * 60 * 1000) return null;
    return cached;
  } catch {
    return null;
  }
}

export function saveMusicLocale(locale: MusicLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUSIC_LOCALE_CACHE_KEY, JSON.stringify({ ...locale, savedAt: Date.now() }));
  } catch {}
}

/**
 * Detect location for music personalization.
 * 1. IP Geolocation (instant, no prompt, detects exact state like Bihar, UP, Maharashtra, Punjab, etc.)
 * 2. GPS Browser reverse geocode fallback if enabled
 * 3. Browser language/timezone fallback
 */
export async function detectMusicLocale(): Promise<MusicLocale> {
  const manual = getManualMusicLocale();
  if (manual) return manual;

  const cached = readCachedLocale();
  if (cached) return cached;

  const fallback = localeFromBrowser();

  // Try fast IP Geolocation first (works immediately on phones without permissions)
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2800);
    const res = await fetch('https://ipwho.is/', { signal: controller.signal });
    window.clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        country_code?: string;
        country?: string;
        region?: string;
        city?: string;
      };
      if (data && data.success !== false && data.country_code) {
        const countryCode = data.country_code.toUpperCase();
        const countryName = data.country || getCountryName(countryCode);
        const regionName = data.region?.replace(/^State of\s+/i, '').trim() || undefined;
        const city = data.city || undefined;

        let regionTerms: string[] = [];
        if (countryCode === 'IN' && regionName) {
          // Check matching Indian state
          const matchKey = Object.keys(INDIAN_REGION_TERMS).find(
            (k) => k.toLowerCase() === regionName.toLowerCase() || regionName.toLowerCase().includes(k.toLowerCase()),
          );
          if (matchKey) {
            regionTerms = INDIAN_REGION_TERMS[matchKey];
          }
        }

        const locale: MusicLocale = {
          countryCode,
          countryName,
          regionName,
          city,
          localTerms: uniqueTerms([
            ...regionTerms,
            ...(regionName ? [`${regionName} latest songs`, `${regionName} hits`] : []),
            ...getCountryTerms(countryCode, countryName),
          ]),
          source: 'ip',
        };
        saveMusicLocale(locale);
        return locale;
      }
    }
  } catch {
    // Continue to browser GPS or fallback
  }

  // Try browser GPS if available
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          maximumAge: 30 * 60 * 1000,
          timeout: 3000,
        });
      });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3000);
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`;
      const res = await fetch(url, { signal: controller.signal });
      window.clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as {
          countryCode?: string;
          countryName?: string;
          principalSubdivision?: string;
          city?: string;
        };
        const countryCode = (data.countryCode || fallback.countryCode).toUpperCase();
        const countryName = data.countryName || getCountryName(countryCode);
        const regionName = data.principalSubdivision?.replace(/^State of\s+/i, '').trim() || undefined;

        let regionTerms: string[] = [];
        if (countryCode === 'IN' && regionName) {
          const matchKey = Object.keys(INDIAN_REGION_TERMS).find(
            (k) => k.toLowerCase() === regionName.toLowerCase() || regionName.toLowerCase().includes(k.toLowerCase()),
          );
          if (matchKey) regionTerms = INDIAN_REGION_TERMS[matchKey];
        }

        const locale: MusicLocale = {
          countryCode,
          countryName,
          regionName,
          city: data.city,
          localTerms: uniqueTerms([
            ...regionTerms,
            ...(regionName ? [`${regionName} latest songs`] : []),
            ...getCountryTerms(countryCode, countryName),
          ]),
          source: 'location',
        };
        saveMusicLocale(locale);
        return locale;
      }
    } catch {}
  }

  saveMusicLocale(fallback);
  return fallback;
}

function decodeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function extractSaavnImage(img: any): string {
  if (Array.isArray(img)) {
    const high = img.find((i: any) => i.quality === '500x500') || img[img.length - 1];
    return high?.url || high?.link || '';
  }
  if (typeof img === 'string') return img;
  return '';
}

function extractSaavnAudio(downloadUrl: any): string {
  if (Array.isArray(downloadUrl)) {
    const best =
      downloadUrl.find((d: any) => d.quality === '160kbps') ||
      downloadUrl.find((d: any) => d.quality === '96kbps') ||
      downloadUrl.find((d: any) => d.quality === '320kbps') ||
      downloadUrl[downloadUrl.length - 1];
    return best?.url || best?.link || '';
  }
  if (typeof downloadUrl === 'string') return downloadUrl;
  return '';
}

function mapSaavnTracks(items: any[]): MusicTrack[] {
  const seen = new Set<string>();
  const out: MusicTrack[] = [];
  for (const r of items) {
    if (!r) continue;
    let audioUrl = '';
    if (r.encrypted_media_url) {
      audioUrl = decryptSaavnMediaUrl(r.encrypted_media_url);
    } else if (r.downloadUrl || r.url) {
      audioUrl = extractSaavnAudio(r.downloadUrl || r.url);
    }
    if (!audioUrl) continue;
    const id = 'saavn_' + (r.id || r.song || r.name);
    if (seen.has(id)) continue;
    seen.add(id);
    const durSec = typeof r.duration === 'string' ? parseInt(r.duration, 10) : Number(r.duration || 180);
    const durationMs = (!isNaN(durSec) && durSec > 0 ? durSec : 180) * 1000;
    const title = decodeHtml(r.song || r.name || r.title || 'Untitled Track');
    const artistList = r.artists?.primary || r.artists?.all;
    const artistNames = Array.isArray(artistList)
      ? artistList.map((item: any) => item?.name).filter(Boolean).join(', ')
      : '';
    const artist = decodeHtml(
      r.primary_artists ||
        r.primaryArtists ||
        artistNames ||
        (typeof r.artists === 'string' ? r.artists : '') ||
        r.singers ||
        'Unknown Artist',
    );
    const artwork = bigArtwork(extractSaavnImage(r.image) || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500');
    out.push({
      id,
      title,
      artist,
      album: decodeHtml(r.album?.name || r.album || ''),
      artwork,
      previewUrl: audioUrl,
      durationMs,
      isFullSong: true,
    });
  }
  return out;
}

async function fetchSaavn(query: string, signal?: AbortSignal): Promise<MusicTrack[]> {
  const q = query.trim();
  if (!q) return [];

  // Strategy 1: Dedicated backend (Render) or serverless API route (Vercel).
  try {
    const apiBase = (import.meta.env.VITE_MUSIC_API_URL || '').replace(/\/+$/, '');
    const res = await fetch(`${apiBase}/api/music-search?q=${encodeURIComponent(q)}`, { signal });
    if (res.ok) {
      const json = (await res.json()) as any;
      if (Array.isArray(json?.results) && json.results.length > 0) {
        return json.results;
      }
    }
  } catch {}

  // Strategy 2: If on Native Android/iOS via Capacitor, use direct CapacitorHttp
  if (Capacitor.isNativePlatform()) {
    try {
      const saavnUrl = 'https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=35&p=1&_marker=0&ctx=android&q=' + encodeURIComponent(q);
      const capRes = await CapacitorHttp.get({
        url: saavnUrl,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (capRes.status === 200) {
        const data = typeof capRes.data === 'string' ? JSON.parse(capRes.data) : capRes.data;
        const tracks = mapSaavnTracks(data?.results || []);
        if (tracks.length > 0) return tracks;
      }
    } catch {}
  }

  // Strategy 3: Public CORS-enabled Saavn API for static browser deployments.
  try {
    const publicApiUrl = new URL('https://saavn.sumit.co/api/search/songs');
    publicApiUrl.searchParams.set('query', q);
    const res = await fetch(publicApiUrl.toString(), { signal });
    if (res.ok) {
      const json = (await res.json()) as any;
      const tracks = mapSaavnTracks(json?.data?.results || json?.results || []);
      if (tracks.length > 0) return tracks;
    }
  } catch {}

  // Strategy 4: Vite dev proxy or Vercel rewrite /api/saavn/...
  try {
    const saavnUrl = '/api/saavn/api.php?__call=search.getResults&_format=json&n=35&p=1&_marker=0&ctx=android&q=' + encodeURIComponent(q);
    const res = await fetch(saavnUrl, { signal });
    if (res.ok) {
      const data = (await res.json()) as any;
      const tracks = mapSaavnTracks(data?.results || []);
      if (tracks.length > 0) return tracks;
    }
  } catch {}

  return [];
}

async function itunes(
  term: string,
  limit: number,
  signal?: AbortSignal,
  countryCode?: string,
): Promise<MusicTrack[]> {
  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: String(Math.min(200, limit)),
  });
  if (countryCode) params.set('country', countryCode);
  const url = ITUNES + '?' + params.toString();
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: ItunesResult[] };
  return mapTracks(json.results || []);
}

/**
 * Unlimited Search: returns extensive songs (A to Z) with Full Songs via JioSaavn + iTunes catalogs.
 */
export async function searchMusic(
  query: string,
  signal?: AbortSignal,
  locale?: MusicLocale,
): Promise<MusicTrack[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const country = locale?.countryCode || 'IN';
    // Query JioSaavn (Full 320kbps songs + regional hits) and iTunes in parallel
    const [saavnResults, itunesGlobal, itunesCountry] = await Promise.all([
      fetchSaavn(q, signal),
      itunes(q, 80, signal),
      itunes(q, 60, signal, country),
    ]);

    const merged = [...saavnResults, ...itunesGlobal, ...itunesCountry];
    const seen = new Set<string>();
    const seenTitles = new Set<string>();
    const out: MusicTrack[] = [];

    for (const t of merged) {
      const cleanTitleKey = (t.title.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + t.artist.toLowerCase().slice(0, 10));
      if (!seen.has(t.id) && !seenTitles.has(cleanTitleKey)) {
        seen.add(t.id);
        seenTitles.add(cleanTitleKey);
        out.push(t);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Top trending hits personalized for user's State and Country with Full Songs.
 */
export async function getTrendingMusic(signal?: AbortSignal, locale?: MusicLocale): Promise<MusicTrack[]> {
  try {
    const loc = locale || getDefaultMusicLocale();
    const terms = uniqueTerms([
      ...(loc.regionName ? [loc.regionName + ' latest songs', loc.regionName + ' hits'] : []),
      ...loc.localTerms.slice(0, 4),
      'bollywood latest songs',
      'trending songs',
      'punjabi hits',
      'viral reels songs',
    ]).slice(0, 5);

    const [saavnLists, itunesLists] = await Promise.all([
      Promise.all(terms.map((term) => fetchSaavn(term, signal).catch(() => [] as MusicTrack[]))),
      Promise.all(terms.slice(0, 3).map((term) => itunes(term, 20, signal, loc.countryCode).catch(() => [] as MusicTrack[]))),
    ]);

    const merged = [...saavnLists.flat(), ...itunesLists.flat()];
    const seen = new Set<string>();
    const seenTitles = new Set<string>();
    const out: MusicTrack[] = [];
    for (const t of merged) {
      const cleanTitleKey = (t.title.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + t.artist.toLowerCase().slice(0, 10));
      if (!seen.has(t.id) && !seenTitles.has(cleanTitleKey)) {
        seen.add(t.id);
        seenTitles.add(cleanTitleKey);
        out.push(t);
      }
    }
    return out.length > 0 ? out : ORIGINAL_AUDIOS;
  } catch {
    return ORIGINAL_AUDIOS;
  }
}

// Built-in Original Audio tracks (Instagram-like viral audio clips and beats)
export const ORIGINAL_AUDIOS: MusicTrack[] = [
  {
    id: 'orig_1',
    title: 'Aaja Aaja (Viral Reel Beat)',
    artist: 'farming_ind01 • Original Audio',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
    previewUrl: 'https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3',
    durationMs: 30000,
    isOriginalAudio: true,
  },
  {
    id: 'orig_2',
    title: 'Kavkaz Vibes (Slowed + Reverb)',
    artist: 'Starly • Original Audio',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80',
    previewUrl: 'https://cdn.freesound.org/previews/536/536108_71257-lq.mp3',
    durationMs: 30000,
    isOriginalAudio: true,
  },
  {
    id: 'orig_3',
    title: 'Lo-Fi Chill Night Beats',
    artist: 'LofiVibes • Original Sound',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80',
    previewUrl: 'https://cdn.freesound.org/previews/415/415804_5121236-lq.mp3',
    durationMs: 30000,
    isOriginalAudio: true,
  },
  {
    id: 'orig_4',
    title: 'Desi Dholak Bass Drop',
    artist: 'DesiMixes • Original Audio',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&auto=format&fit=crop&q=80',
    previewUrl: 'https://cdn.freesound.org/previews/612/612611_5674468-lq.mp3',
    durationMs: 30000,
    isOriginalAudio: true,
  },
  {
    id: 'orig_5',
    title: 'Emotional Piano & Strings',
    artist: 'SymphonySoul • Original Audio',
    artwork: 'https://images.unsplash.com/photo-1520523839898-50712140d04c?w=300&auto=format&fit=crop&q=80',
    previewUrl: 'https://cdn.freesound.org/previews/517/517618_11565147-lq.mp3',
    durationMs: 30000,
    isOriginalAudio: true,
  },
];

export function formatMusicDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
