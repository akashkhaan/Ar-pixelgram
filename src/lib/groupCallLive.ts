import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/db/supabase';

/**
 * One shared realtime channel per group call ("group-call-live-<id>").
 *
 * supabase.channel() returns the SAME channel object for the same topic, so the
 * call screen and the group chat page must not each create + subscribe their own
 * copy (adding presence callbacks after subscribe() throws and crashes the page).
 * Everyone goes through this helper instead.
 */
type SyncListener = (userIds: Set<string>) => void;
type ReadyListener = () => void;

interface Entry {
  channel: RealtimeChannel;
  refs: number;
  subscribed: boolean;
  syncListeners: Set<SyncListener>;
  readyListeners: Set<ReadyListener>;
  trackers: Map<symbol, string>;
}

const entries = new Map<string, Entry>();

function readLive(channel: RealtimeChannel): Set<string> {
  const ids = new Set<string>();
  Object.values(channel.presenceState()).forEach(list => {
    (list as Array<{ user_id?: string }>).forEach(item => {
      if (item.user_id) ids.add(item.user_id);
    });
  });
  return ids;
}

function syncTrack(entry: Entry) {
  if (!entry.subscribed) return;
  const userId = Array.from(entry.trackers.values())[0];
  if (userId) void entry.channel.track({ user_id: userId }).catch(() => {});
  else void entry.channel.untrack().catch(() => {});
}

function getEntry(callId: string): Entry {
  let entry = entries.get(callId);
  if (entry) return entry;

  const name = `group-call-live-${callId}`;
  const channel = supabase.channel(name);
  const created: Entry = {
    channel,
    refs: 0,
    subscribed: false,
    syncListeners: new Set(),
    readyListeners: new Set(),
    trackers: new Map(),
  };
  channel.on('presence', { event: 'sync' }, () => {
    const ids = readLive(channel);
    created.syncListeners.forEach(fn => fn(ids));
  });
  channel.subscribe(status => {
    if (status !== 'SUBSCRIBED') return;
    created.subscribed = true;
    syncTrack(created);
    created.readyListeners.forEach(fn => fn());
  });
  entries.set(callId, created);
  return created;
}

export interface LiveHandle {
  readLive: () => Set<string>;
  release: () => void;
}

export function joinGroupCallLive(
  callId: string,
  opts: { trackUserId?: string; onSync?: SyncListener; onReady?: ReadyListener } = {},
): LiveHandle {
  const entry = getEntry(callId);
  entry.refs += 1;
  const token = Symbol('live');
  if (opts.onSync) entry.syncListeners.add(opts.onSync);
  if (opts.onReady) {
    entry.readyListeners.add(opts.onReady);
    if (entry.subscribed) queueMicrotask(() => opts.onReady?.());
  }
  if (opts.trackUserId) {
    entry.trackers.set(token, opts.trackUserId);
    syncTrack(entry);
  }

  let released = false;
  return {
    readLive: () => readLive(entry.channel),
    release: () => {
      if (released) return;
      released = true;
      if (opts.onSync) entry.syncListeners.delete(opts.onSync);
      if (opts.onReady) entry.readyListeners.delete(opts.onReady);
      if (entry.trackers.delete(token)) syncTrack(entry);
      entry.refs -= 1;
      if (entry.refs <= 0) {
        entries.delete(callId);
        void entry.channel.untrack().catch(() => {});
        void supabase.removeChannel(entry.channel);
      }
    },
  };
}
