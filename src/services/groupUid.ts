import { supabase } from "@/db/supabase";
import { toast } from "sonner";

// In-memory cache for fast synchronous & fallback resolution
const memoryUidLookup = new Map<string, string>();
const memoryIdToUid = new Map<string, string>();

/**
 * Generates a stable, deterministic 15-digit Facebook-style UID number from any ID string.
 * Example format: 100084729482910 (exactly 15 digits, starting with 1000)
 */
export function generateNumericUid(id: string): string {
  if (!id) return "100000000000000";
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

  const part1 = Math.abs(h1).toString().padStart(10, "0");
  const part2 = Math.abs(h2).toString().padStart(10, "0");
  const combined = (part1 + part2).slice(0, 11);

  return `1000${combined}`;
}

/**
 * Returns the numeric UID for a group, caching bidirectional mapping in memory & localStorage
 */
export function getGroupNumericUid(groupId: string): string {
  if (!groupId) return "";
  if (/^\d{14,16}$/.test(groupId)) return groupId;

  // 1. Check memory cache first
  const memoryCached = memoryIdToUid.get(groupId);
  if (memoryCached) {
    return memoryCached;
  }

  const storageKey = `group_uid_${groupId}`;
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached && /^\d{14,16}$/.test(cached)) {
      memoryIdToUid.set(groupId, cached);
      memoryUidLookup.set(cached, groupId);
      localStorage.setItem(`group_uid_lookup_${cached}`, groupId);
      return cached;
    }
  } catch {
    // ignore localStorage errors
  }

  const numericUid = generateNumericUid(groupId);
  memoryIdToUid.set(groupId, numericUid);
  memoryUidLookup.set(numericUid, groupId);

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
 * synchronously resolves if in memory/localStorage cache, or resolves via Supabase.
 */
export function resolveGroupIdSync(paramId: string): string {
  if (!paramId) return "";
  if (paramId.includes("-")) {
    getGroupNumericUid(paramId);
    return paramId;
  }
  if (/^\d+$/.test(paramId)) {
    const mem = memoryUidLookup.get(paramId);
    if (mem && mem.includes("-")) return mem;
    try {
      const cached = localStorage.getItem(`group_uid_lookup_${paramId}`);
      if (cached && cached.includes("-")) {
        memoryUidLookup.set(paramId, cached);
        memoryIdToUid.set(cached, paramId);
        return cached;
      }
    } catch {
      // ignore
    }
  }
  return "";
}

/**
 * Given a URL param (which can be a UUID or a 15-digit Facebook UID),
 * resolves to the original group UUID.
 */
export async function resolveGroupId(paramId: string): Promise<string> {
  if (!paramId) return "";

  // If it is already a standard UUID with dashes, return it
  if (paramId.includes("-")) {
    getGroupNumericUid(paramId); // prime cache
    return paramId;
  }

  // If it is a numeric UID
  if (/^\d+$/.test(paramId)) {
    // 1. Check sync cache
    const syncResult = resolveGroupIdSync(paramId);
    if (syncResult) return syncResult;

    // 2. Try group_members table (accessible to all members)
    try {
      const { data: memberRows } = await supabase.from("group_members").select("group_id");
      if (memberRows && memberRows.length > 0) {
        for (const row of memberRows) {
          if (row.group_id) {
            const uid = getGroupNumericUid(row.group_id);
            if (uid === paramId) {
              memoryUidLookup.set(paramId, row.group_id);
              memoryIdToUid.set(row.group_id, paramId);
              try {
                localStorage.setItem(`group_uid_lookup_${paramId}`, row.group_id);
              } catch {
                // ignore
              }
              return row.group_id;
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // 3. Try finding the group in Supabase groups table
    try {
      const { data } = await supabase.from("groups").select("id");
      if (data && data.length > 0) {
        for (const g of data) {
          if (g.id) {
            const uid = getGroupNumericUid(g.id);
            if (uid === paramId) {
              memoryUidLookup.set(paramId, g.id);
              memoryIdToUid.set(g.id, paramId);
              try {
                localStorage.setItem(`group_uid_lookup_${paramId}`, g.id);
              } catch {
                // ignore
              }
              return g.id;
            }
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
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/messages/t/${uid}`;
}

/**
 * Copies the numeric UID to the user clipboard and triggers a toast notification
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
      const el = document.createElement("textarea");
      el.value = uid;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    toast.success(`Group UID Copied: ${uid}`);
    return true;
  } catch {
    toast.error("Failed to copy Group UID");
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
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    toast.success("Facebook Group URL Copied to Clipboard!");
    return true;
  } catch {
    toast.error("Failed to copy Group URL");
    return false;
  }
}
