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

const START_KEY = 'arpg_session_started_at';
const GEO_KEY = 'arpg_geo_cache';

export function describeDevice(ua: string, platform?: string | null) {
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

  const kindLabel = kind === 'phone' ? 'Phone' : kind === 'tablet' ? 'Tablet' : kind === 'laptop' ? 'Laptop' : 'PC';
  const title = model ? model : `${os} ${kindLabel}`;
  const via = isApp ? 'Pixelgram App' : browser;
  return { title, os, kind, kindLabel, via, isApp };
}

function isNativeApp(): boolean {
  try { return !!(window as any).Capacitor?.isNativePlatform?.(); } catch { return false; }
}

async function getGeo(): Promise<{ ip: string | null; city: string | null; region: string | null; country: string | null }> {
  try {
    const cached = JSON.parse(sessionStorage.getItem(GEO_KEY) || 'null');
    if (cached) return cached;
  } catch { /* ignore */ }
  try {
    const r = await fetch('https://ipapi.co/json/');
    const j = await r.json();
    const geo = { ip: j.ip ?? null, city: j.city ?? null, region: j.region ?? null, country: j.country_name ?? null };
    sessionStorage.setItem(GEO_KEY, JSON.stringify(geo));
    return geo;
  } catch {
    return { ip: null, city: null, region: null, country: null };
  }
}

export function clearSessionMarks() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(START_KEY)).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function sessionStartedAt(userId: string): string {
  const key = `${START_KEY}_${userId}`;
  let v = localStorage.getItem(key);
  if (!v) { v = new Date().toISOString(); localStorage.setItem(key, v); }
  return v;
}

/** Returns true when this device was logged out remotely (caller should sign out). */
export async function heartbeat(userId: string): Promise<boolean> {
  const deviceId = getDeviceId();
  const started = sessionStartedAt(userId);
  const { data: row } = await supabase
    .from('user_devices')
    .select('logged_out_at, logged_in_at')
    .eq('user_id', userId).eq('device_id', deviceId).maybeSingle();

  if (row?.logged_out_at && new Date(row.logged_out_at).getTime() > new Date(started).getTime()) {
    localStorage.removeItem(`${START_KEY}_${userId}`);
    return true;
  }
  const geo = await getGeo();
  const freshLogin = !row || !!row.logged_out_at || !row.logged_in_at;
  const now = new Date().toISOString();
  await supabase.from('user_devices').upsert({
    user_id: userId,
    device_id: deviceId,
    device_name: describeDevice(navigator.userAgent, isNativeApp() ? 'app' : 'web').title,
    user_agent: navigator.userAgent,
    platform: isNativeApp() ? 'app' : 'web',
    ...(geo.ip ? geo : {}),
    last_seen_at: now,
    logged_out_at: null,
    ...(freshLogin ? { logged_in_at: started } : {}),
  }, { onConflict: 'user_id,device_id' });
  return false;
}

export async function listSessions(userId: string): Promise<LoginSession[]> {
  const { data, error } = await supabase
    .from('user_devices')
    .select('device_id, device_name, user_agent, platform, ip, city, region, country, first_seen_at, logged_in_at, last_seen_at')
    .eq('user_id', userId)
    .is('logged_out_at', null)
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LoginSession[];
}

export async function logoutSessions(userId: string, deviceIds: string[]): Promise<void> {
  if (!deviceIds.length) return;
  const { error } = await supabase
    .from('user_devices')
    .update({ logged_out_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('device_id', deviceIds);
  if (error) throw error;
}

export function formatFull(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
