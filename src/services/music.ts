// ===================== MUSIC (songs for Reels) =====================
// Real song catalog + 30s audio previews via Apple's public iTunes Search API.
// No API key needed, CORS enabled, returns song name + cover art + mp3/m4a preview.

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  previewUrl: string;
  durationMs: number;
}

export interface MusicLocale {
  countryCode: string;
  countryName: string;
  regionName?: string;
  localTerms: string[];
  source: 'location' | 'browser';
}

const ITUNES = 'https://itunes.apple.com/search';
const MUSIC_LOCALE_CACHE_KEY = 'ar-pixelgram-music-locale-v1';

function bigArtwork(url: string): string {
  return (url || '').replace('100x100bb', '300x300bb');
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
      durationMs: r.trackTimeMillis || 30000,
    });
  }
  return out;
}

const INDIAN_REGION_TERMS: Record<string, string[]> = {
  'Andhra Pradesh': ['telugu hits', 'telugu latest songs'],
  'Arunachal Pradesh': ['northeast india songs', 'hindi latest songs'],
  Assam: ['assamese hits', 'bihu songs'],
  Bihar: [
    'bhojpuri latest songs',
    'bhojpuri hit songs',
    'pawan singh songs',
    'khesari lal songs',
    'bhojpuri viral gana',
    'maithili latest songs',
    'bihar hit songs',
  ],
  Chhattisgarh: ['chhattisgarhi songs', 'hindi latest songs'],
  Goa: ['konkani hits', 'goan songs'],
  Gujarat: ['gujarati hits', 'gujarati latest songs'],
  Haryana: ['haryanvi hits', 'haryanvi latest songs', 'sapna choudhary songs', 'diler kharkiya'],
  'Himachal Pradesh': ['pahadi songs', 'hindi latest songs'],
  Jharkhand: ['nagpuri songs', 'bhojpuri latest songs', 'jharkhandi songs'],
  Karnataka: ['kannada hits', 'kannada latest songs'],
  Kerala: ['malayalam hits', 'malayalam latest songs'],
  'Madhya Pradesh': ['hindi latest songs', 'malwi songs'],
  Maharashtra: ['marathi hits', 'marathi latest songs', 'bollywood hits'],
  Manipur: ['manipuri songs', 'northeast india songs'],
  Meghalaya: ['northeast india songs', 'english latest hits'],
  Mizoram: ['mizo songs', 'northeast india songs'],
  Nagaland: ['naga songs', 'northeast india songs'],
  Odisha: ['odia hits', 'odia latest songs'],
  Punjab: ['punjabi hits', 'punjabi latest songs', 'sidhu moose wala', 'karan aujla', 'diljit dosanjh', 'punjabi viral hits'],
  Rajasthan: ['rajasthani folk hits', 'rajasthani songs', 'marwadi songs'],
  Sikkim: ['northeast india songs', 'hindi latest songs'],
  'Tamil Nadu': ['tamil hits', 'tamil latest songs'],
  Telangana: ['telugu hits', 'telugu latest songs'],
  Tripura: ['bengali hits', 'northeast india songs'],
  'Uttar Pradesh': ['bhojpuri hit songs', 'hindi latest songs', 'awadhi songs', 'bhojpuri viral songs', 'bollywood viral hits'],
  Uttarakhand: ['pahadi songs', 'garhwali songs', 'kumaoni songs'],
  'West Bengal': ['bengali hits', 'bengali latest songs', 'bangla songs'],
  'Andaman and Nicobar Islands': ['hindi latest songs', 'bengali hits'],
  Chandigarh: ['punjabi hits', 'punjabi latest songs', 'hindi latest songs'],
  'Dadra and Nagar Haveli and Daman and Diu': ['gujarati hits', 'hindi latest songs'],
  Delhi: ['hindi latest songs', 'bollywood latest', 'punjabi hits'],
  'Jammu and Kashmir': ['kashmiri songs', 'hindi latest songs'],
  Ladakh: ['ladakhi songs', 'hindi latest songs', 'pahadi songs'],
  Lakshadweep: ['malayalam hits', 'hindi latest songs'],
  Puducherry: ['tamil hits', 'tamil latest songs'],
};

const COUNTRY_TERMS: Record<string, string[]> = {
  IN: ['hindi latest songs', 'indian pop hits', 'bollywood latest'],
  US: ['english latest hits', 'pop hits', 'top songs'],
  GB: ['uk latest hits', 'english latest hits', 'british pop'],
  CA: ['canada latest hits', 'english latest hits', 'french canadian hits'],
  AU: ['australia latest hits', 'english latest hits', 'australian pop'],
  NZ: ['new zealand latest hits', 'english latest hits'],
  BR: ['brazil latest songs', 'sertanejo hits', 'funk brasileiro'],
  MX: ['mexico latest songs', 'latin hits', 'regional mexican'],
  ES: ['spain latest songs', 'spanish hits', 'latin pop'],
  FR: ['france latest songs', 'french pop', 'french hits'],
  DE: ['germany latest songs', 'german pop', 'german hits'],
  IT: ['italy latest songs', 'italian pop', 'italian hits'],
  PT: ['portugal latest songs', 'portuguese hits', 'latin pop'],
  NL: ['netherlands latest songs', 'dutch pop', 'english latest hits'],
  SE: ['sweden latest songs', 'swedish pop', 'english latest hits'],
  NO: ['norway latest songs', 'norwegian pop', 'english latest hits'],
  DK: ['denmark latest songs', 'danish pop', 'english latest hits'],
  FI: ['finland latest songs', 'finnish pop', 'english latest hits'],
  PL: ['poland latest songs', 'polish pop', 'european hits'],
  RU: ['russia latest songs', 'russian pop', 'russian hits'],
  TR: ['turkey latest songs', 'turkish pop', 'turkish hits'],
  AE: ['uae latest songs', 'arabic hits', 'khaleeji songs'],
  SA: ['saudi latest songs', 'arabic hits', 'khaleeji songs'],
  EG: ['egypt latest songs', 'arabic hits', 'egyptian pop'],
  ZA: ['south africa latest songs', 'afropop hits', 'afrobeats'],
  NG: ['nigeria latest songs', 'afrobeats', 'afropop hits'],
  KE: ['kenya latest songs', 'afrobeats', 'afropop hits'],
  GH: ['ghana latest songs', 'afrobeats', 'afropop hits'],
  JP: ['japan latest songs', 'japanese pop', 'j-pop hits'],
  KR: ['korea latest songs', 'k-pop hits', 'korean pop'],
  CN: ['china latest songs', 'mandopop hits', 'chinese pop'],
  TW: ['taiwan latest songs', 'mandopop hits', 'chinese pop'],
  HK: ['hong kong latest songs', 'c-pop hits', 'cantopop'],
  SG: ['singapore latest songs', 'asian pop hits', 'english latest hits'],
  MY: ['malaysia latest songs', 'malay hits', 'asian pop hits'],
  ID: ['indonesia latest songs', 'indonesian pop', 'dangdut hits'],
  TH: ['thailand latest songs', 'thai pop', 'thai hits'],
  PH: ['philippines latest songs', 'opm hits', 'filipino pop'],
  VN: ['vietnam latest songs', 'vietnamese pop', 'v-pop hits'],
  PK: ['pakistan latest songs', 'pakistani pop', 'urdu hits'],
  BD: ['bangladesh latest songs', 'bengali hits', 'bangla songs'],
  LK: ['sri lanka latest songs', 'sinhala hits', 'tamil hits'],
  NP: ['nepal latest songs', 'nepali hits', 'hindi latest songs'],
};

const LANGUAGE_TERMS: Record<string, string[]> = {
  hi: ['hindi latest songs', 'bollywood latest'],
  bho: ['bhojpuri latest songs', 'bhojpuri hits'],
  mai: ['maithili songs', 'bhojpuri latest songs'],
  mr: ['marathi latest songs', 'marathi hits'],
  pa: ['punjabi latest songs', 'punjabi hits'],
  gu: ['gujarati latest songs', 'gujarati hits'],
  bn: ['bengali latest songs', 'bengali hits'],
  te: ['telugu latest songs', 'telugu hits'],
  ta: ['tamil latest songs', 'tamil hits'],
  kn: ['kannada latest songs', 'kannada hits'],
  ml: ['malayalam latest songs', 'malayalam hits'],
  es: ['spanish latest songs', 'latin hits'],
  fr: ['french latest songs', 'french pop'],
  de: ['german latest songs', 'german pop'],
  pt: ['portuguese latest songs', 'latin pop'],
  ar: ['arabic latest songs', 'arabic hits'],
  ja: ['japanese latest songs', 'j-pop hits'],
  ko: ['korean latest songs', 'k-pop hits'],
  id: ['indonesian latest songs', 'indonesian pop'],
  tr: ['turkish latest songs', 'turkish pop'],
};

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

function getCountryTerms(countryCode: string, countryName: string): string[] {
  return uniqueTerms([
    ...(COUNTRY_TERMS[countryCode] || []),
    `${countryName} latest songs`,
    `${countryName} top songs`,
    `${countryName} popular music`,
    'latest songs',
    'top songs',
  ]);
}

function getCountryName(countryCode: string): string {
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
  };

  // TIMEZONE is far more reliable for physical geography than browser language (which defaults to en-GB on many phones)
  let countryCode = 'IN';
  if (timeZone && timezoneCountry[timeZone]) {
    countryCode = timezoneCountry[timeZone];
  } else if (timeZone.includes('Calcutta') || timeZone.includes('Kolkata') || timeZone.includes('India')) {
    countryCode = 'IN';
  } else if (languageCountry && languageCountry !== 'GB' && languageCountry !== 'US') {
    countryCode = languageCountry;
  } else if (languageCountry) {
    countryCode = languageCountry;
  }

  const countryName = getCountryName(countryCode);
  return {
    countryCode,
    countryName,
    localTerms: uniqueTerms([
      ...getCountryTerms(countryCode, countryName),
      ...(LANGUAGE_TERMS[languageCode] || []),
    ]),
    source: 'browser',
  };
}

export function getDefaultMusicLocale(): MusicLocale {
  return getManualMusicLocale() || localeFromBrowser();
}

function localeKey(locale?: MusicLocale): string {
  return locale ? `${locale.countryCode}:${locale.regionName || ''}` : 'global';
}

function readCachedLocale(): MusicLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MUSIC_LOCALE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as MusicLocale & { savedAt?: number };
    if (!cached.savedAt || Date.now() - cached.savedAt > 24 * 60 * 60 * 1000) return null;
    return cached;
  } catch {
    return null;
  }
}

function cacheLocale(locale: MusicLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUSIC_LOCALE_CACHE_KEY, JSON.stringify({ ...locale, savedAt: Date.now() }));
  } catch {
    // Storage can be disabled in private browsing; personalization still works for this session.
  }
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not available'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 15 * 60 * 1000,
      timeout: 5000,
    });
  });
}

/** Detect location once for music personalization; checks manual preference first, then IP/GPS, then browser fallback. */
export async function detectMusicLocale(): Promise<MusicLocale> {
  const manual = getManualMusicLocale();
  if (manual) return manual;

  const cached = readCachedLocale();
  if (cached) return cached;

  const fallback = localeFromBrowser();

  // Try fast IP geolocation first (does not prompt user for GPS permission)
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3500);
    const ipRes = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    window.clearTimeout(timeout);
    if (ipRes.ok) {
      const ipData = (await ipRes.json()) as { country_code?: string; country_name?: string; region?: string };
      if (ipData.country_code) {
        const countryCode = ipData.country_code.toUpperCase();
        const countryName = ipData.country_name || getCountryName(countryCode);
        const regionName = ipData.region?.replace(/^State of\s+/i, '').trim() || undefined;
        const locale: MusicLocale = {
          countryCode,
          countryName,
          regionName,
          localTerms: uniqueTerms([
            ...(regionName && countryCode === 'IN' ? (INDIAN_REGION_TERMS[regionName] || []) : []),
            ...getCountryTerms(countryCode, countryName),
            ...fallback.localTerms,
            ...(regionName ? [`${regionName} latest songs`] : []),
          ]),
          source: 'location',
        };
        cacheLocale(locale);
        return locale;
      }
    }
  } catch {
    // IP lookup failed, continue to GPS
  }

  try {
    const position = await getCurrentPosition();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`;
    const response = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) throw new Error('reverse geocode failed');
    const data = (await response.json()) as {
      countryCode?: string;
      countryName?: string;
      principalSubdivision?: string;
    };
    const countryCode = (data.countryCode || fallback.countryCode).toUpperCase();
    const countryName = data.countryName || getCountryName(countryCode);
    const regionName = data.principalSubdivision?.replace(/^State of\s+/i, '').trim() || undefined;
    const locale: MusicLocale = {
      countryCode,
      countryName,
      regionName,
      localTerms: uniqueTerms([
        ...(regionName && countryCode === 'IN' ? (INDIAN_REGION_TERMS[regionName] || []) : []),
        ...getCountryTerms(countryCode, countryName),
        ...fallback.localTerms,
        ...(regionName ? [`${regionName} latest songs`] : []),
      ]),
      source: 'location',
    };
    cacheLocale(locale);
    return locale;
  } catch {
    return fallback;
  }
}

async function itunes(
  term: string,
  limit: number,
  signal?: AbortSignal,
  countryCode?: string,
  recent = false,
): Promise<MusicTrack[]> {
  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: String(Math.min(200, limit)),
  });
  if (countryCode && countryCode !== 'ALL' && countryCode !== 'GLOBAL') params.set('country', countryCode);
  if (recent) params.set('sort', 'recent');
  const url = `${ITUNES}?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('music search failed');
  const json = (await res.json()) as { results?: ItunesResult[] };
  return mapTracks(json.results || []);
}

/** Search songs by name / artist / lyrics keyword. Returns extensive, unlimited results across artists and regions. */
export async function searchMusic(
  query: string,
  signal?: AbortSignal,
  locale?: MusicLocale,
): Promise<MusicTrack[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const isDiscoveryQuery = /^(song|songs|music|latest|trending|gana|gaane|hit|hits|viral|new)$/i.test(q);
    const searches: Promise<MusicTrack[]>[] = [];

    if (isDiscoveryQuery) {
      if (locale?.regionName) {
        searches.push(itunes(`${locale.regionName} ${q}`, 50, signal, locale.countryCode));
      }
      searches.push(itunes(`${locale?.countryName || 'hindi'} ${q}`, 50, signal, locale?.countryCode));
      searches.push(itunes(q, 50, signal));
    } else {
      // 1. Direct query with max results in user country
      searches.push(itunes(q, 100, signal, locale?.countryCode));
      // 2. Unrestricted global query so all songs/albums appear
      searches.push(itunes(q, 100, signal));
      // 3. Artist or regional variation if specified
      if (locale?.regionName) {
        searches.push(itunes(`${q} ${locale.regionName}`, 40, signal, locale.countryCode));
      }
      // 4. Hindi/Bollywood fallback if Indian locale
      if (locale?.countryCode === 'IN') {
        searches.push(itunes(`${q} song`, 60, signal, 'IN'));
      }
    }

    const lists = await Promise.all(searches.map(p => p.catch(() => [] as MusicTrack[])));
    const merged = lists.flat();
    const seen = new Set<string>();
    return merged.filter((track) => (seen.has(track.id) ? false : (seen.add(track.id), true)));
  } catch {
    return [];
  }
}

const TRENDING_TERMS = ['trending hindi songs', 'bhojpuri hits', 'punjabi hits', 'bollywood 2025', 'top hits'];
const trendingCache = new Map<string, MusicTrack[]>();

/** Default / trending song list shown before the user searches anything. */
export async function getTrendingMusic(signal?: AbortSignal, locale?: MusicLocale): Promise<MusicTrack[]> {
  const key = localeKey(locale);
  const cached = trendingCache.get(key);
  if (cached && cached.length > 0) return cached;
  try {
    const localizedTerms = locale
      ? [
          ...locale.localTerms,
          ...(locale.regionName ? [`${locale.regionName} latest songs`, `${locale.regionName} hit songs`] : []),
          `${locale.countryName} latest songs`,
        ]
      : TRENDING_TERMS;
    const terms = uniqueTerms([...localizedTerms, ...TRENDING_TERMS]).slice(0, 8);
    const lists = await Promise.all(
      terms.map((term) => itunes(term, 25, signal, locale?.countryCode, true).catch(() => [] as MusicTrack[])),
    );
    const merged = lists.flat();
    const seen = new Set<string>();
    const unique = merged.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    if (unique.length > 0) trendingCache.set(key, unique);
    return unique;
  } catch {
    return [];
  }
}

export function formatMusicDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
