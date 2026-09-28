import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

/**
 * Generates a stable, deterministic 15-digit Facebook-style UID number from any ID string.
 * Example format: 100084729482910 (exactly 15 digits, starting with 1000)
 */
export function generateNumericUid(id: string): string {
  if (!id) return '100000000000000';
  if (/^\d{14,16}$/.test(id)) return id;

  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const part1 = Math.abs(h1).toString().padStart(10, '0');
  const part2 = Math.abs(h2).toString().padStart(10, '0');
  const combined = (part1 + part2).slice(0, 11);
  return `1000${combined}`;
}

/**
 * Returns the numeric UID for a group, caching bidirectional mapping in localStorage
 */
export function getGroupNumericUid(groupId: string): string {
  if (!groupId) return '';
  if (/^\d{14,16}$/.test(groupId)) return groupId;

  const storageKey = `group_uid_${groupId}`;
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached && /^\d{14,16}$/.test(cached)) {
      localStorage.setItem(`group_uid_lookup_${cached}`, groupId);
      return cached;
    }
  } catch {
    // ignore localStorage errors
  }

  const numericUid = generateNumericUid(groupId);
  try {
    localStorage.setItem(storageKey, numericUid);
    localStorage.setItem(`group_uid_lookup_${numericUid}`, groupId);
  } catch {
    // ignore localStorage errors
  }
  return numericUid;
}

/**
 * Given a URL param (which can be a UUID or a 15-digit Facebook UID),
 * resolves to the original group UUID.
 */
export async function resolveGroupId(paramId: string): Promise<string> {
  if (!paramId) return '';

  // If it's already a standard UUID with dashes, return it
  if (paramId.includes('-')) {
    getGroupNumericUid(paramId); // prime cache
    return paramId;
  }

  // If it's a numeric UID
  if (/^\d+$/.test(paramId)) {
    try {
      const cached = localStorage.getItem(`group_uid_lookup_${paramId}`);
      if (cached) return cached;
    } catch {
      // ignore
    }

    // Try finding the group in Supabase
    try {
      const { data } = await supabase.from('groups').select('id');
      if (data && data.length > 0) {
        for (const g of data) {
          const uid = getGroupNumericUid(g.id);
          if (uid === paramId) {
            try {
              localStorage.setItem(`group_uid_lookup_${paramId}`, g.id);
            } catch {
              // ignore
            }
            return g.id;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return paramId;
}

/**
 * Returns the full Facebook Messenger desktop browser URL for the group
 * e.g., https://domain.com/messages/t/100084729482910
 */
export function getGroupFacebookUrl(groupId: string): string {
  const uid = getGroupNumericUid(groupId);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/messages/t/${uid}`;
}

/**
 * Copies the numeric UID to the user's clipboard and triggers a toast notification
 */
export async function copyGroupUidToClipboard(groupId: string, e?: React.MouseEvent): Promise<boolean> {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const uid = getGroupNumericUid(groupId);
  if (!uid) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(uid);
    } else {
      const el = document.createElement('textarea');
      el.value = uid;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    toast.success(`Group UID Copied: ${uid}`);
    return true;
  } catch {
    toast.error('Failed to copy Group UID');
    return false;
  }
}

/**
 * Copies the Facebook-style browser URL to clipboard and triggers a toast notification
 */
export async function copyGroupFacebookUrlToClipboard(groupId: string, e?: React.MouseEvent): Promise<boolean> {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const url = getGroupFacebookUrl(groupId);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    toast.success('Facebook Group URL Copied to Clipboard!');
    return true;
  } catch {
    toast.error('Failed to copy Group URL');
    return false;
  }
}
