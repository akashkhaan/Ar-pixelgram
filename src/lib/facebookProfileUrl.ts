import { supabase } from '@/db/supabase';

// In-memory cache for resolved user IDs and numeric IDs
const numericToUserIdCache = new Map<string, string>();
const userIdToNumericCache = new Map<string, string>();

/**
 * Generates a deterministic Facebook-style 14-digit numeric ID for any given userId/profileId.
 * Always begins with '615' followed by 11 deterministic digits.
 * Example output: 61582269994535
 */
export function getFacebookNumericId(input: string): string {
  if (!input) return '61500000000000';
  if (userIdToNumericCache.has(input)) {
    return userIdToNumericCache.get(input)!;
  }

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ((ch << 5) - ch), 0x5bd1e995);
  }

  const u1 = BigInt(h1 >>> 0);
  const u2 = BigInt(h2 >>> 0);
  const combined = (u1 << 32n) | u2;
  // 11 digits: 10,000,000,000 to 99,999,999,999
  const sub = (combined % 89999999999n) + 10000000000n;
  const result = `615${sub.toString()}`;

  userIdToNumericCache.set(input, result);
  numericToUserIdCache.set(result, input);
  return result;
}

/**
 * Returns the canonical Facebook-style profile URL:
 * https://www.pixelgram.com/profile.php?id=61582269994535
 */
export function getCanonicalFacebookProfileUrl(userIdOrProfileId: string): string {
  const numericId = getFacebookNumericId(userIdOrProfileId);
  return `https://www.pixelgram.com/profile.php?id=${numericId}`;
}

/**
 * Returns the shareable profile URL for current browser environment or pixelgram.com:
 * If on localhost/preview/custom domain, uses window.location.origin so tapping/clicking
 * immediately opens inside the active app.
 */
export function getShareableProfileUrl(userIdOrProfileId: string): string {
  const numericId = getFacebookNumericId(userIdOrProfileId);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/profile.php?id=${numericId}`;
  }
  return `https://www.pixelgram.com/profile.php?id=${numericId}`;
}

/**
 * Resolves any id parameter (numeric Facebook ID, UUID, or username)
 * back to the user's authentic user_id from Supabase profiles.
 */
export async function resolveFacebookIdToUserId(idParam: string): Promise<string | null> {
  if (!idParam) return null;
  const trimmed = idParam.trim();

  // 1. Direct UUID match check
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  if (isUuid) {
    return trimmed;
  }

  // 2. Check in-memory cache
  if (numericToUserIdCache.has(trimmed)) {
    return numericToUserIdCache.get(trimmed)!;
  }

  // 3. Query all profiles from Supabase to match numeric ID or username
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('user_id, username, id');

    if (error || !profiles) {
      console.warn('Failed to fetch profiles for FB ID resolution:', error);
      return null;
    }

    // Iterate and find match
    for (const p of profiles) {
      const fbIdUser = getFacebookNumericId(p.user_id);
      const fbIdProfile = p.id ? getFacebookNumericId(p.id) : '';

      numericToUserIdCache.set(fbIdUser, p.user_id);
      if (fbIdProfile) numericToUserIdCache.set(fbIdProfile, p.user_id);

      if (fbIdUser === trimmed || fbIdProfile === trimmed) {
        return p.user_id;
      }
      if (p.username && p.username.toLowerCase() === trimmed.toLowerCase()) {
        return p.user_id;
      }
      if (p.user_id === trimmed || p.id === trimmed) {
        return p.user_id;
      }
    }
  } catch (err) {
    console.error('Error resolving Facebook numeric ID:', err);
  }

  return null;
}

/**
 * Copies the profile link to clipboard and returns the copied URL
 */
export async function copyProfileLink(userIdOrProfileId: string): Promise<{ liveUrl: string; canonicalUrl: string }> {
  const numericId = getFacebookNumericId(userIdOrProfileId);
  const liveUrl = getShareableProfileUrl(userIdOrProfileId);
  const canonicalUrl = `https://www.pixelgram.com/profile.php?id=${numericId}`;

  const textToCopy = liveUrl;

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      fallbackCopyText(textToCopy);
    }
  } else {
    fallbackCopyText(textToCopy);
  }

  return { liveUrl, canonicalUrl };
}

function fallbackCopyText(text: string) {
  if (typeof document === 'undefined') return;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Fallback copy failed:', err);
  }
  document.body.removeChild(textArea);
}
