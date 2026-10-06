// Access token service (Facebook-style token + device management)
import { supabase } from '@/db/supabase';

const BASE = (import.meta.env.VITE_SUPABASE_URL || 'https://jfizzduvmzavtqwzqacy.supabase.co') + '/functions/v1';

export function getDeviceId(): string {
  let id = localStorage.getItem('arpg_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('arpg_device_id', id);
  }
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Unknown';
  const br = /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}

async function call<T = any>(fn: string, body: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${BASE}/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || 'request_failed'), { data: json, status: res.status });
  return json as T;
}

export interface DeviceInfo {
  device_id: string;
  device_name: string | null;
  user_agent?: string | null;
  country: string | null;
  city: string | null;
  first_seen_at?: string;
  last_seen_at: string;
}

export const startAccessToken = (email: string, password: string) =>
  call<{ otpId: string }>('access-token-start', { email, password, deviceId: getDeviceId(), deviceName: getDeviceName() });

export const confirmAccessToken = (otpId: string, code: string) =>
  call<{ token: string; expiresAt: string }>('access-token-confirm', { otpId, code, deviceId: getDeviceId() });

export const registerDevice = () =>
  call('access-token-devices', { action: 'register', deviceId: getDeviceId(), deviceName: getDeviceName() }, true);

export const listDevices = () =>
  call<{ devices: DeviceInfo[]; activeToken: { token_prefix: string; device_name: string | null; expires_at: string } | null }>(
    'access-token-devices', { action: 'list' }, true);

export const logoutDevices = (deviceIds: string[]) =>
  call('access-token-devices', { action: 'logout', deviceIds }, true);

export const adminTokenStatus = () =>
  call<{ currentToken: string | null; generatedAt: string | null; activeUserTokens: number }>('admin-token-regenerate', { action: 'status' }, true);

export const adminTokenRegenerate = () =>
  call<{ currentToken: string | null; generatedAt: string | null; activeUserTokens: number }>('admin-token-regenerate', { action: 'regenerate' }, true);
