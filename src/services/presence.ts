import { supabase } from '@/db/supabase';
import type { Profile } from '@/types/types';

/** Itne second ke andar heartbeat aaya ho tab hi "online" maana jayega */
export const ONLINE_WINDOW_SECONDS = 150;

export interface OnlineUser {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_admin: boolean;
  last_seen_at: string;
  country: string | null;
  city: string | null;
  device: string | null;
  os: string | null;
  /** kitne second pehle last heartbeat aaya */
  secondsAgo: number;
}

type PresenceRow = {
  user_id: string;
  is_online: boolean | null;
  last_seen_at: string | null;
};

type GeoRow = {
  user_id: string | null;
  country: string | null;
  city: string | null;
  device_name: string | null;
  os: string | null;
  created_at: string;
};

/**
 * Abhi online users (naam + photo + country) — admin panel ke liye.
 *
 * presence: online_status table me har 30s me heartbeat aata hai (AuthContext).
 * Stale rows (app force-close) ko 150s window se bahar kar dete hain, warna
 * band app bhi "online" dikhta rehta hai.
 */
export async function getOnlineUsers(): Promise<OnlineUser[]> {
  const since = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000).toISOString();

  const { data: presence, error } = await supabase
    .from('online_status')
    .select('user_id, is_online, last_seen_at')
    .eq('is_online', true)
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false });

  if (error) throw error;
  const rows = (presence || []).filter((r: PresenceRow) => r.user_id) as PresenceRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.user_id);

  const [{ data: profiles }, geo] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url, is_verified, is_admin')
      .in('user_id', ids),
    latestGeoByUser(ids),
  ]);

  const profileMap = new Map<string, Partial<Profile>>(
    (profiles || []).map((p: Partial<Profile>) => [String(p.user_id), p]),
  );

  const users: OnlineUser[] = [];
  for (const row of rows) {
    const p = profileMap.get(row.user_id);
    const g = geo.get(row.user_id);
    const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : Date.now();
    users.push({
      user_id: row.user_id,
      username: p?.username || 'user',
      full_name: p?.full_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      is_verified: Boolean(p?.is_verified),
      is_admin: Boolean(p?.is_admin),
      last_seen_at: new Date(lastSeen).toISOString(),
      country: g?.country ?? null,
      city: g?.city ?? null,
      device: g?.device_name ?? null,
      os: g?.os ?? null,
      secondsAgo: Math.max(0, Math.round((Date.now() - lastSeen) / 1000)),
    });
  }

  return users;
}

/** Har user ka sabse naya visit (country/city/device) — table na ho to khaali */
async function latestGeoByUser(ids: string[]): Promise<Map<string, GeoRow>> {
  const map = new Map<string, GeoRow>();
  try {
    const { data, error } = await supabase
      .from('visitor_sessions')
      .select('user_id, country, city, device_name, os, created_at')
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .limit(400);
    if (error || !data) return map;
    for (const row of data as GeoRow[]) {
      if (row.user_id && !map.has(row.user_id)) map.set(row.user_id, row);
    }
  } catch {
    /* visitor_sessions optional hai */
  }
  return map;
}

/**
 * Live subscription: koi bhi user online/offline ho to callback.
 * Realtime available na ho to polling har 20s par chalta hai.
 */
export function subscribeOnlineUsers(onChange: () => void): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  timer = setInterval(onChange, 20000);

  try {
    channel = supabase
      .channel('admin-online-users-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'online_status' },
        () => onChange(),
      )
      .subscribe();
  } catch {
    channel = null;
  }

  return () => {
    if (timer) clearInterval(timer);
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    }
  };
}
