// Access token service (Facebook-style token + device management)
import { supabase } from '@/db/supabase';

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

// In-memory / storage holder for current OTP verification flow
const PENDING_OTP_KEY = 'arpg_pending_otp_session';

export async function startAccessToken(email: string, password: string): Promise<{ otpId: string }> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Verify user credentials first
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (signInError || !signInData.user) {
    throw new Error('invalid_credentials');
  }

  // 2. Send 6-digit OTP to user's email via Supabase Auth OTP
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: false,
    },
  });

  if (otpError) {
    console.warn('signInWithOtp error:', otpError);
    if (otpError.message?.toLowerCase().includes('rate') || (otpError as any).status === 429) {
      throw new Error('For security, OTP request rate limited. Please wait 30 seconds and try again.');
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
      timestamp: Date.now(),
    })
  );

  return { otpId };
}

export async function confirmAccessToken(
  otpId: string,
  code: string
): Promise<{ token: string; expiresAt: string }> {
  const rawPending = localStorage.getItem(PENDING_OTP_KEY);
  if (!rawPending) {
    throw new Error('otp_expired');
  }

  let pending: { otpId: string; email: string; userId: string; timestamp: number };
  try {
    pending = JSON.parse(rawPending);
  } catch {
    throw new Error('otp_expired');
  }

  // Check 10-minute expiry
  if (Date.now() - pending.timestamp > 10 * 60 * 1000) {
    localStorage.removeItem(PENDING_OTP_KEY);
    throw new Error('otp_expired');
  }

  // 3. Verify the OTP code
  const { data, error } = await supabase.auth.verifyOtp({
    email: pending.email,
    token: code.trim(),
    type: 'email',
  });

  if (error || !data.user) {
    console.warn('verifyOtp error:', error);
    throw new Error('invalid_otp');
  }

  localStorage.removeItem(PENDING_OTP_KEY);

  // 4. Generate 30-day Access Token
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

  // Auto register device
  await registerDevice();

  return { token, expiresAt };
}

export async function registerDevice(): Promise<void> {
  const deviceId = getDeviceId();
  const deviceName = getDeviceName();
  const now = new Date().toISOString();

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
