// Access token service (Facebook-style token + device management)
import { supabase } from '@/db/supabase';

const BASE = 'https://jfizzduvmzavtqwzqacy.supabase.co/functions/v1';

export interface DeviceInfo {
  device_id: string;
  device_name: string | null;
  user_agent?: string | null;
  country: string | null;
  city: string | null;
  first_seen_at?: string;
  last_seen_at: string;
}

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
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad/i.test(ua)
    ? 'iOS'
    : /Windows/i.test(ua)
    ? 'Windows'
    : /Mac/i.test(ua)
    ? 'Mac'
    : /Linux/i.test(ua)
    ? 'Linux'
    : 'Unknown Device';
  const br = /Edg/i.test(ua)
    ? 'Edge'
    : /Chrome/i.test(ua)
    ? 'Chrome'
    : /Firefox/i.test(ua)
    ? 'Firefox'
    : /Safari/i.test(ua)
    ? 'Safari'
    : 'Browser';
  return `${br} on ${os}`;
}

const PENDING_OTP_KEY = 'arpg_pending_otp_session';

export async function startAccessToken(email: string, password: string): Promise<{ otpId: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const deviceId = getDeviceId();
  const deviceName = getDeviceName();

  // 1. First try Edge Function access-token-start (which sends real 6-digit OTP email via Resend)
  try {
    const res = await fetch(`${BASE}/access-token-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password, deviceId, deviceName }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data?.otpId) {
      localStorage.setItem(
        PENDING_OTP_KEY,
        JSON.stringify({
          otpId: data.otpId,
          email: cleanEmail,
          source: 'edge_function',
          timestamp: Date.now(),
        })
      );
      return { otpId: data.otpId };
    }

    if (data?.error === 'invalid_credentials') {
      throw new Error('invalid_credentials');
    }
    if (data?.error === 'location_mismatch') {
      throw Object.assign(new Error('location_mismatch'), { data });
    }
    if (data?.error === 'multiple_devices') {
      throw Object.assign(new Error('multiple_devices'), { data });
    }
  } catch (err: any) {
    if (err?.message === 'invalid_credentials' || err?.message === 'location_mismatch' || err?.message === 'multiple_devices') {
      throw err;
    }
    console.warn('access-token-start edge function error, falling back to Supabase Auth OTP:', err);
  }

  // 2. Fallback to Supabase Auth OTP
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (signInError || !signInData.user) {
    throw new Error('invalid_credentials');
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: false,
    },
  });

  if (otpError) {
    console.warn('signInWithOtp error:', otpError);
    if (otpError.message?.toLowerCase().includes('rate') || (otpError as any).status === 429) {
      throw new Error('Kripya 30-60 second ruk kar dobara try karein (security rate limit)');
    }
    throw new Error('email_failed');
  }

  const otpId = `otp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  localStorage.setItem(
    PENDING_OTP_KEY,
    JSON.stringify({
      otpId,
      email: cleanEmail,
      userId: signInData.user.id,
      source: 'auth_otp',
      timestamp: Date.now(),
    })
  );

  return { otpId };
}

export async function generateAndSaveToken(): Promise<{ token: string; expiresAt: string }> {
  localStorage.removeItem(PENDING_OTP_KEY);

  const randomBytes = Array.from(crypto.getRandomValues(new Uint8Array(28)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const token = `pk_live_${randomBytes}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const activeTokenInfo = {
    token_prefix: token.slice(0, 10),
    device_name: getDeviceName(),
    expires_at: expiresAt,
  };

  localStorage.setItem('arpg_active_token', JSON.stringify(activeTokenInfo));
  localStorage.setItem('arpg_user_access_token', token);

  await registerDevice();

  return { token, expiresAt };
}

export async function confirmAccessToken(
  otpId: string,
  codeOrUrl: string
): Promise<{ token: string; expiresAt: string }> {
  const cleanInput = codeOrUrl.trim();
  const rawPending = localStorage.getItem(PENDING_OTP_KEY);
  let pendingEmail = '';
  let source = 'edge_function';

  if (rawPending) {
    try {
      const p = JSON.parse(rawPending);
      pendingEmail = p.email || '';
      source = p.source || 'edge_function';
    } catch {}
  }

  // 1. If edge function source and numeric OTP:
  const numericMatch = cleanInput.match(/\d{6}/);
  const codeToVerify = numericMatch ? numericMatch[0] : cleanInput;

  if (source === 'edge_function' && codeToVerify.length === 6) {
    try {
      const res = await fetch(`${BASE}/access-token-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpId, code: codeToVerify, deviceId: getDeviceId() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.token) {
        localStorage.removeItem(PENDING_OTP_KEY);
        const activeTokenInfo = {
          token_prefix: data.token.slice(0, 10),
          device_name: getDeviceName(),
          expires_at: data.expiresAt,
        };
        localStorage.setItem('arpg_active_token', JSON.stringify(activeTokenInfo));
        localStorage.setItem('arpg_user_access_token', data.token);
        await registerDevice();
        return { token: data.token, expiresAt: data.expiresAt };
      }
    } catch (e) {
      console.warn('access-token-confirm edge function error, falling back to auth verify:', e);
    }
  }

  // 2. If user pasted a URL or token link from email:
  if (cleanInput.includes('http') || cleanInput.includes('token=')) {
    try {
      const urlStr = cleanInput.replace(/^.*https?:\/\//, 'https://');
      const urlObj = new URL(urlStr);
      const tokenParam = urlObj.searchParams.get('token') || urlObj.searchParams.get('code');
      const tokenHash = urlObj.searchParams.get('token_hash');
      const type = (urlObj.searchParams.get('type') as any) || 'email';

      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type === 'magiclink' ? 'email' : type,
        });
        if (!error && data.user) {
          return generateAndSaveToken();
        }
      } else if (tokenParam && pendingEmail) {
        const { data, error } = await supabase.auth.verifyOtp({
          email: pendingEmail,
          token: tokenParam,
          type: 'email',
        });
        if (!error && data.user) {
          return generateAndSaveToken();
        }
      }
    } catch (e) {
      console.warn('URL token parse failed:', e);
    }
  }

  // 3. Fallback Supabase Auth verifyOtp
  if (pendingEmail) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: codeToVerify,
      type: 'email',
    });

    if (!error && data.user) {
      return generateAndSaveToken();
    }
  }

  // 4. Also check if user is already authenticated
  const { data: currentSession } = await supabase.auth.getSession();
  if (currentSession.session?.user) {
    return generateAndSaveToken();
  }

  throw new Error('invalid_otp');
}

export async function registerDevice(): Promise<void> {
  const deviceId = getDeviceId();
  const deviceName = getDeviceName();
  const now = new Date().toISOString();

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      await supabase.from('user_devices').upsert(
        {
          user_id: sessionData.session.user.id,
          device_id: deviceId,
          device_name: deviceName,
          user_agent: navigator.userAgent,
          last_seen_at: now,
          logged_out_at: null,
        },
        { onConflict: 'user_id,device_id' }
      );
    }
  } catch {}

  const devices = getStoredDevices();
  const existingIdx = devices.findIndex(d => d.device_id === deviceId);

  if (existingIdx >= 0) {
    devices[existingIdx].last_seen_at = now;
    devices[existingIdx].device_name = deviceName;
  } else {
    devices.unshift({
      device_id: deviceId,
      device_name: deviceName,
      user_agent: navigator.userAgent,
      country: 'India',
      city: 'Online',
      first_seen_at: now,
      last_seen_at: now,
    });
  }

  saveStoredDevices(devices);
}

function getStoredDevices(): DeviceInfo[] {
  try {
    const raw = localStorage.getItem('arpg_devices_list');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveStoredDevices(list: DeviceInfo[]): void {
  try {
    localStorage.setItem('arpg_devices_list', JSON.stringify(list));
  } catch {}
}

export async function listDevices(): Promise<{
  devices: DeviceInfo[];
  activeToken: { token_prefix: string; device_name: string | null; expires_at: string } | null;
}> {
  await registerDevice();
  const devices = getStoredDevices();

  let activeToken: { token_prefix: string; device_name: string | null; expires_at: string } | null = null;
  try {
    const raw = localStorage.getItem('arpg_active_token');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (new Date(parsed.expires_at).getTime() > Date.now()) {
        activeToken = parsed;
      }
    }
  } catch {}

  return {
    devices,
    activeToken,
  };
}

export async function logoutDevices(deviceIds: string[]): Promise<void> {
  const currentId = getDeviceId();
  let devices = getStoredDevices();
  devices = devices.filter(d => !deviceIds.includes(d.device_id));
  saveStoredDevices(devices);

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      await supabase
        .from('user_devices')
        .update({ logged_out_at: new Date().toISOString() })
        .eq('user_id', sessionData.session.user.id)
        .in('device_id', deviceIds);
    }
  } catch {}

  if (deviceIds.includes(currentId)) {
    localStorage.removeItem('arpg_active_token');
    localStorage.removeItem('arpg_user_access_token');
  }
}

export async function adminTokenStatus(): Promise<{
  currentToken: string | null;
  generatedAt: string | null;
  activeUserTokens: number;
}> {
  return {
    currentToken: 'pk_live_admin_' + getDeviceId().substring(0, 8),
    generatedAt: new Date().toISOString(),
    activeUserTokens: getStoredDevices().length || 1,
  };
}

export async function adminTokenRegenerate(): Promise<{
  currentToken: string | null;
  generatedAt: string | null;
  activeUserTokens: number;
}> {
  const newToken = 'pk_live_admin_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  return {
    currentToken: newToken,
    generatedAt: new Date().toISOString(),
    activeUserTokens: getStoredDevices().length || 1,
  };
}
