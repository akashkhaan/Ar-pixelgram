// Facebook-style "Where you're logged in": har device apni row user_devices me
// likhta hai, aur remote logout hone par khud sign out ho jaata hai.
import { supabase } from '@/db/supabase';
import { getDeviceId } from '@/services/accessToken';

export interface LoginSession {
  device_id: string;
  device_name: string | null;
  user_agent: string | null;
  platform: string | null;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  first_seen_at: string;
  logged_in_at: string | null;
  last_seen_at: string;
}


const GENERIC_NAME = /^(Android|iOS|iPadOS|Windows|macOS|ChromeOS|Linux|Unknown)\b.*\b(Phone|Tablet|Laptop|PC)$/i;

export function describeDevice(ua: string, platform?: string | null, savedName?: string | null) {
  const isApp = platform === 'app';
  let os = 'Unknown';
  let kind: 'phone' | 'tablet' | 'laptop' | 'pc' = 'pc';
  let model = '';
  const android = ua.match(/Android\s([\d.]+);\s*([^;)]+)/i);
  if (android) {
    os = `Android ${android[1]}`;
    model = android[2].replace(/Build\/.*/i, '').trim();
    if (/^(K|wv)$/i.test(model)) model = '';
    kind = /Mobile/i.test(ua) ? 'phone' : 'tablet';
  } else if (/iPhone/i.test(ua)) { os = 'iOS'; model = 'iPhone'; kind = 'phone'; }
  else if (/iPad/i.test(ua)) { os = 'iPadOS'; model = 'iPad'; kind = 'tablet'; }
  else if (/Windows/i.test(ua)) { os = 'Windows'; kind = 'pc'; }
  else if (/Macintosh|Mac OS/i.test(ua)) { os = 'macOS'; kind = 'laptop'; }
  else if (/CrOS/i.test(ua)) { os = 'ChromeOS'; kind = 'laptop'; }
  else if (/Linux/i.test(ua)) { os = 'Linux'; kind = 'pc'; }

  const browser = /EdgA?\//i.test(ua) ? 'Microsoft Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
    : /UCBrowser/i.test(ua) ? 'UC Browser'
    : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
    : /CriOS|Chrome/i.test(ua) ? 'Chrome'
    : /Safari/i.test(ua) ? 'Safari' : 'Browser';

  // Chrome jaise browser UA me model chhupa dete hain ("K") — tab register ke waqt
  // bheja hua asli model (device_name) use karo.
  if (!model && savedName && !GENERIC_NAME.test(savedName) && !/^(iPhone|iPad)$/i.test(savedName)) model = savedName.trim();
  const kindLabel = kind === 'phone' ? 'Phone' : kind === 'tablet' ? 'Tablet' : kind === 'laptop' ? 'Laptop' : 'PC';
  const title = model ? model : `${os} ${kindLabel}`;
  const via = isApp ? 'Pixelgram App' : browser;
  return { title, os, kind, kindLabel, via, isApp, model };
}

/** Asli model code: UA se, warna Chrome ke hidden "model" field se. */
async function getDeviceModel(): Promise<string> {
  const ua = navigator.userAgent;
  const m = ua.match(/Android\s[\d.]+;\s*([^;)]+)/i);
  const fromUa = m ? m[1].replace(/Build\/.*/i, '').trim() : '';
  if (fromUa && !/^(K|wv)$/i.test(fromUa)) return fromUa;
  try {
    const hv = await (navigator as any).userAgentData?.getHighEntropyValues?.(['model']);
    if (hv?.model) return String(hv.model).trim();
  } catch { /* ignore */ }
  return '';
}

// Agar kisi model ka naam list me na mile tab bhi company ka naam dikhe.
const BRAND_PREFIXES: [RegExp, string][] = [
  [/^CPH|^PH[A-Z]\d|^OPPO/i, 'OPPO'], [/^RMX|^realme/i, 'realme'], [/^V2\d{3}|^vivo|^I2\d{3}/i, 'vivo'],
  [/^SM-|^GT-|^Galaxy/i, 'Samsung'], [/^(M|2\d)\d{3,}[A-Z]|^Redmi|^POCO|^Mi\s|^Xiaomi/i, 'Xiaomi'],
  [/^(IN|LE|KB|NE|PJ|CPH25|AC)\d{4}|^ONEPLUS/i, 'OnePlus'], [/^moto|^XT\d/i, 'Motorola'], [/^Pixel/i, 'Google'],
  [/^Infinix|^X6\d{2}/i, 'Infinix'], [/^TECNO|^[A-Z]{2}\d[a-z]?$/i, 'TECNO'], [/^Nokia|^TA-\d/i, 'Nokia'],
  [/^A0\d{2}$|^Nothing/i, 'Nothing'], [/^LAVA|^LXX/i, 'Lava'], [/^itel/i, 'itel'],
  [/^(ANY|CMA|ELN|LGE|RBN|VNE|ALI|CRT|RMO)-/i, 'HONOR'],
];
export function brandFromModel(model: string): string {
  const hit = BRAND_PREFIXES.find(([re]) => re.test(model));
  return hit ? hit[1] : '';
}

const NAME_CACHE = 'arpg_phone_names_v1';

/** Model code -> "OPPO A3x 5G". Google ki live list (server) se, sab phones ke liye. */
export async function resolvePhoneNames(models: string[]): Promise<Record<string, string>> {
  let cache: Record<string, string> = {};
  try { cache = JSON.parse(localStorage.getItem(NAME_CACHE) || '{}'); } catch { /* ignore */ }
  const need = [...new Set(models.filter(m => m && !cache[m]))];
  const base = (import.meta.env.VITE_MUSIC_API_URL || 'https://ar-pixelgram-music-api.onrender.com').replace(/\/+$/, '');
  if (need.length) {
    try {
      const res = await fetch(`${base}/api/device-name?models=${encodeURIComponent(need.join(','))}`, { signal: AbortSignal.timeout(45_000) });
      const { names } = await res.json();
      if (names && typeof names === 'object') {
        cache = { ...cache, ...names };
        localStorage.setItem(NAME_CACHE, JSON.stringify(cache));
      }
    } catch { /* server so raha ho to brand fallback */ }
  }
  const out: Record<string, string> = {};
  for (const m of models) {
    if (!m) continue;
    const brand = brandFromModel(m);
    out[m] = cache[m] || (brand && !m.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${m}` : m);
  }
  return out;
}

function isNativeApp(): boolean {
  try { return !!(window as any).Capacitor?.isNativePlatform?.() || /;\s*wv\)/i.test(navigator.userAgent); } catch { return false; }
}

async function callDevices<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('access-token-devices', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const START_KEY = 'arpg_login_registered';

export function clearSessionMarks() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(START_KEY)).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/** Returns true when this device was logged out remotely (caller should sign out). */
export async function heartbeat(userId: string): Promise<boolean> {
  const deviceId = getDeviceId();
  const key = `${START_KEY}_${userId}`;
  if (localStorage.getItem(key)) {
    const { devices } = await callDevices<{ devices: LoginSession[] }>({ action: 'list' });
    if (!devices.some(d => d.device_id === deviceId)) {
      localStorage.removeItem(key);
      return true;
    }
  }
  await callDevices({
    action: 'register',
    deviceId,
    deviceName: (await getDeviceModel()) || describeDevice(navigator.userAgent, isNativeApp() ? 'app' : 'web').title,
  });
  localStorage.setItem(key, new Date().toISOString());
  return false;
}

export async function listSessions(_userId: string): Promise<LoginSession[]> {
  await heartbeat(_userId).catch(() => false);
  const { devices } = await callDevices<{ devices: LoginSession[] }>({ action: 'list' });
  return (devices ?? []).map(d => ({
    ...d,
    platform: /;\s*wv\)/i.test(d.user_agent ?? '') ? 'app' : 'web',
    logged_in_at: d.first_seen_at,
    ip: null,
    region: null,
  }));
}

export async function logoutSessions(_userId: string, deviceIds: string[]): Promise<void> {
  if (!deviceIds.length) return;
  await callDevices({ action: 'logout', deviceIds });
}

export function formatFull(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
