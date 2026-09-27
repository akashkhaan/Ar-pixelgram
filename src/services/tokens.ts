/**
 * Facebook Graph API-style Access Token & Device Security Manager
 * Implements 30-day expiring tokens, multi-device tracking, country verification,
 * and admin global token rotation.
 */

export interface FacebookApiToken {
  id: string;
  token: string;
  userId: string;
  username: string;
  email?: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  expiresInDays: number;
  originCountry: string;
  currentCountry: string;
  activeDeviceId: string;
  activeDeviceName: string;
  status: 'active' | 'expired' | 'revoked';
  version: number;
}

export interface DeviceSession {
  id: string;
  deviceName: string;
  browser: string;
  platform: string;
  ipAddress: string;
  location: string;
  country: string;
  lastActive: string;
  isCurrentDevice: boolean;
}

const STORAGE_KEY_TOKENS = 'pixelgram_access_tokens_v1';
const STORAGE_KEY_SESSIONS = 'pixelgram_device_sessions_v1';
const STORAGE_KEY_MASTER_VER = 'pixelgram_master_token_version';
const STORAGE_KEY_MASTER_TOKEN = 'pixelgram_master_system_token';

// Helper to generate a realistic Facebook Graph API Access Token (190+ chars)
export function generateFbTokenString(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const prefix = 'EAA';
  let body = '';
  // Generate ~195 random chars
  for (let i = 0; i < 192; i++) {
    body += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${body}ZDZD`;
}

// Get global master token security version
export function getMasterTokenVersion(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY_MASTER_VER);
    return v ? parseInt(v, 10) : 1;
  } catch {
    return 1;
  }
}

// Current device session info
export function getCurrentDeviceInfo(): DeviceSession {
  const ua = navigator.userAgent;
  let browser = 'Chrome';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';

  let platform = 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) platform = 'iOS';
  else if (ua.includes('Windows')) platform = 'Windows 11';
  else if (ua.includes('Macintosh')) platform = 'macOS';
  else if (ua.includes('Linux')) platform = 'Linux';

  return {
    id: 'current_device_session',
    deviceName: `${platform} Mobile / Browser`,
    browser: `${browser} Web`,
    platform,
    ipAddress: '103.24.128.45',
    location: 'New Delhi, India',
    country: 'India',
    lastActive: 'Active now',
    isCurrentDevice: true,
  };
}

// Get all active sessions for a user
export function getUserDeviceSessions(userId: string): DeviceSession[] {
  try {
    const key = `${STORAGE_KEY_SESSIONS}_${userId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}

  const current = getCurrentDeviceInfo();
  // Realistic initial remote sessions for multi-device security check
  const initialSessions: DeviceSession[] = [
    current,
    {
      id: 'session_remote_1',
      deviceName: 'iPhone 15 Pro Max',
      browser: 'Safari Mobile 17.4',
      platform: 'iOS 17',
      ipAddress: '49.36.110.82',
      location: 'Mumbai, Maharashtra, India',
      country: 'India',
      lastActive: '2 hours ago',
      isCurrentDevice: false,
    },
    {
      id: 'session_remote_2',
      deviceName: 'Windows PC (Chrome 128)',
      browser: 'Chrome 128.0',
      platform: 'Windows 11',
      ipAddress: '157.34.201.19',
      location: 'Bengaluru, Karnataka, India',
      country: 'India',
      lastActive: 'Yesterday at 10:15 PM',
      isCurrentDevice: false,
    },
  ];

  saveUserDeviceSessions(userId, initialSessions);
  return initialSessions;
}

export function saveUserDeviceSessions(userId: string, sessions: DeviceSession[]): void {
  try {
    const key = `${STORAGE_KEY_SESSIONS}_${userId}`;
    localStorage.setItem(key, JSON.stringify(sessions));
  } catch {}
}

// Log out selected sessions
export function logoutSelectedSessions(userId: string, sessionIdsToLogout: string[]): DeviceSession[] {
  const currentSessions = getUserDeviceSessions(userId);
  const remaining = currentSessions.filter(
    (s) => s.isCurrentDevice || !sessionIdsToLogout.includes(s.id)
  );
  saveUserDeviceSessions(userId, remaining);
  return remaining;
}

// Get all stored tokens
export function getAllTokens(): FacebookApiToken[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TOKENS);
    if (!raw) return [];
    const list: FacebookApiToken[] = JSON.parse(raw);
    const masterVer = getMasterTokenVersion();
    const now = Date.now();

    // Check expiration and master version invalidation
    return list.map((t) => {
      if (t.status === 'active') {
        if (t.version < masterVer) {
          return { ...t, status: 'expired' as const };
        }
        if (new Date(t.expiresAt).getTime() < now) {
          return { ...t, status: 'expired' as const };
        }
      }
      return t;
    });
  } catch {
    return [];
  }
}

// Save token
export function saveToken(token: FacebookApiToken): void {
  try {
    const existing = getAllTokens().filter((t) => t.id !== token.id);
    existing.unshift(token);
    localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(existing));
  } catch {}
}

// Get latest active token for user
export function getUserActiveToken(userId: string): FacebookApiToken | null {
  const tokens = getAllTokens().filter((t) => t.userId === userId && t.status === 'active');
  return tokens[0] || null;
}

// Generate a new 30-day token for user
export function createUserAccessToken(
  userId: string,
  username: string,
  email?: string,
  originCountry: string = 'India',
  currentCountry: string = 'India'
): FacebookApiToken {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 Days expiry
  const masterVer = getMasterTokenVersion();
  const currentDev = getCurrentDeviceInfo();

  const newToken: FacebookApiToken = {
    id: `fb_tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    token: generateFbTokenString(),
    userId,
    username,
    email,
    scopes: [
      'public_profile',
      'email',
      'user_posts',
      'user_photos',
      'user_videos',
      'user_friends',
      'publish_actions',
    ],
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    expiresInDays: 30,
    originCountry,
    currentCountry,
    activeDeviceId: currentDev.id,
    activeDeviceName: currentDev.deviceName,
    status: 'active',
    version: masterVer,
  };

  saveToken(newToken);
  return newToken;
}

// Revoke user token
export function revokeUserToken(tokenId: string): void {
  const all = getAllTokens().map((t) => {
    if (t.id === tokenId) {
      return { ...t, status: 'revoked' as const };
    }
    return t;
  });
  localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(all));
}

// Admin: Rotate Master Secret Key and Invalidate All Tokens
export function rotateMasterTokenSecret(): { newVersion: number; newMasterToken: string; invalidatedCount: number } {
  const currentVer = getMasterTokenVersion();
  const newVersion = currentVer + 1;
  const newMasterToken = generateFbTokenString();

  // Invalidate all existing tokens
  const all = getAllTokens().map((t) => ({ ...t, status: 'expired' as const }));
  localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(all));

  // Store new version & new master token
  localStorage.setItem(STORAGE_KEY_MASTER_VER, newVersion.toString());
  localStorage.setItem(STORAGE_KEY_MASTER_TOKEN, newMasterToken);

  return {
    newVersion,
    newMasterToken,
    invalidatedCount: all.length,
  };
}

export function getMasterSystemToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_MASTER_TOKEN) || generateFbTokenString();
  } catch {
    return generateFbTokenString();
  }
}
