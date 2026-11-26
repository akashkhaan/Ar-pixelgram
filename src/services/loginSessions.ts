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
    deviceName: describeDevice(navigator.userAgent, isNativeApp() ? 'app' : 'web').title,
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
