import { supabase } from '@/db/supabase';
import { createNotification, toggleStoryLike, isStoryLiked } from './api';
import type { Profile } from '@/types/types';
import type { MusicTrack } from './music';

export interface UserNote {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  expires_at: string;
  profile?: Profile | null;
  music_track?: {
    id: string;
    title: string;
    artist: string;
    artwork?: string | null;
    preview_url: string;
    start_ms?: number;
    duration_ms?: number;
  } | null;
  likes_count: number;
  views_count: number;
}

export interface NotePayload {
  text: string;
  music?: {
    id: string;
    title: string;
    artist: string;
    artwork?: string | null;
    preview_url: string;
    start_ms?: number;
    duration_ms?: number;
  } | null;
}

const NOTE_PREFIX = '<!--pixelgram_user_note:';
const NOTE_SUFFIX = '-->';
const NOTE_IMAGE_PLACEHOLDER =
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&q=80';

// Global cache for resolved song preview URLs
const trackPreviewCache = new Map<string, { previewUrl: string; artwork: string | null }>();

/**
 * Resolve iTunes audio preview if missing from payload
 */
export async function resolveNoteTrackPreview(music: {
  id?: string;
  title?: string;
  artist?: string;
  preview_url?: string;
  artwork?: string | null;
}): Promise<{ previewUrl: string; artwork: string | null }> {
  if (music.preview_url && music.preview_url.startsWith('http')) {
    return { previewUrl: music.preview_url, artwork: music.artwork || null };
  }
  const key = `${music.id || ''}_${music.title || ''}`.trim();
  if (trackPreviewCache.has(key)) {
    return trackPreviewCache.get(key)!;
  }

  try {
    let url = '';
    if (music.id && /^\d+$/.test(music.id)) {
      url = `https://itunes.apple.com/lookup?id=${music.id}`;
    } else if (music.title) {
      url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        `${music.title} ${music.artist || ''}`.trim()
      )}&entity=song&limit=1`;
    }

    if (url) {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const r = json.results?.[0];
        if (r && r.previewUrl) {
          const result = {
            previewUrl: r.previewUrl,
            artwork: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '400x400bb') : null,
          };
          trackPreviewCache.set(key, result);
          return result;
        }
      }
    }
  } catch (e) {
    console.warn('Could not resolve note track preview', e);
  }

  return { previewUrl: '', artwork: null };
}

/**
 * NoteAudioManager
 * Manages reliable audio playback for notes across user gestures,
 * bypassing mobile browser / Android WebView autoplay limitations.
 */
export class NoteAudioManager {
  private static audio: HTMLAudioElement | null = null;
  private static currentUrl: string | null = null;
  private static listeners: Set<(playing: boolean) => void> = new Set();
  private static timeListeners: Set<(currentTime: number) => void> = new Set();

  static play(previewUrl: string, startMs: number = 0): HTMLAudioElement | null {
    if (!previewUrl) return null;

    if (this.audio && this.currentUrl === previewUrl && !this.audio.paused) {
      this.notify(true);
      return this.audio;
    }

    if (!this.audio) {
      this.audio = new Audio();
    }

    const audio = this.audio;
    this.currentUrl = previewUrl;

    try {
      audio.pause();
    } catch {}

    audio.src = previewUrl;
    audio.volume = 1.0;
    audio.muted = false;
    audio.preload = 'auto';
    audio.loop = true;
    (audio as any).playsInline = true;

    const startTime = Math.max(0, startMs / 1000);
    try {
      audio.currentTime = startTime;
    } catch {}

    audio.onended = () => {
      audio.currentTime = startTime;
      audio.play().catch(() => this.notify(false));
    };

    audio.onplay = () => this.notify(true);
    audio.onpause = () => this.notify(false);
    audio.onerror = () => this.notify(false);
    audio.ontimeupdate = () => {
      this.notifyTime(audio.currentTime);
    };

    try {
      const p = audio.play();
      if (p !== undefined) {
        p.then(() => {
          this.notify(true);
        }).catch((err) => {
          console.warn('Note audio autoplay failed:', err);
          this.notify(false);
        });
      }
    } catch (err) {
      console.warn('Note audio sync play failed:', err);
      this.notify(false);
    }

    return audio;
  }

  static stop(): void {
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {}
      this.currentUrl = null;
      this.notify(false);
    }
  }

  static toggle(previewUrl?: string, startMs: number = 0): boolean {
    if (!this.audio) {
      if (previewUrl) {
        this.play(previewUrl, startMs);
        return true;
      }
      return false;
    }
    if (this.audio.paused) {
      this.audio
        .play()
        .then(() => this.notify(true))
        .catch(() => this.notify(false));
      return true;
    } else {
      this.audio.pause();
      this.notify(false);
      return false;
    }
  }

  static isPlaying(): boolean {
    return !!(this.audio && !this.audio.paused);
  }

  static getCurrentUrl(): string | null {
    return this.currentUrl;
  }

  static subscribe(listener: (playing: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.isPlaying());
    return () => {
      this.listeners.delete(listener);
    };
  }

  static subscribeTime(listener: (currentTime: number) => void): () => void {
    this.timeListeners.add(listener);
    return () => {
      this.timeListeners.delete(listener);
    };
  }

  private static notify(playing: boolean): void {
    this.listeners.forEach((fn) => {
      try {
        fn(playing);
      } catch {}
    });
  }

  private static notifyTime(currentTime: number): void {
    this.timeListeners.forEach((fn) => {
      try {
        fn(currentTime);
      } catch {}
    });
  }
}

export function encodeNoteCaption(payload: NotePayload): string {
  return `${NOTE_PREFIX}${JSON.stringify(payload)}${NOTE_SUFFIX}`;
}

export function decodeNoteStory(story: any): UserNote | null {
  if (!story || !story.caption || !story.caption.startsWith(NOTE_PREFIX)) {
    return null;
  }

  try {
    const raw = story.caption.slice(
      NOTE_PREFIX.length,
      story.caption.lastIndexOf(NOTE_SUFFIX)
    );
    const payload: NotePayload = JSON.parse(raw);
    const m = (payload.music || (payload as any).music_track) as any;

    const musicTrack = m
      ? {
          id: String(m.id || ''),
          title: m.title || '',
          artist: m.artist || '',
          artwork: m.artwork || m.artwork_url || m.artworkUrl || null,
          preview_url: m.preview_url || m.previewUrl || m.preview || '',
          start_ms: m.start_ms || m.startMs || 0,
          duration_ms: m.duration_ms || m.durationMs || 30000,
        }
      : null;

    return {
      id: story.id,
      user_id: story.user_id,
      text: payload.text || '',
      created_at: story.created_at,
      expires_at: story.expires_at,
      profile: story.profile || null,
      music_track: musicTrack,
      likes_count: story.likes_count || 0,
      views_count: story.views_count || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Creates or updates the user's current 24-hour note.
 * Any previous active note of this user is deleted/replaced.
 */
export async function postUserNote(
  userId: string,
  text: string,
  musicTrack?: {
    track: MusicTrack;
    startMs: number;
  } | null
): Promise<UserNote> {
  try {
    const { data: oldNotes } = await supabase
      .from('stories')
      .select('id, caption')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());

    if (oldNotes && oldNotes.length > 0) {
      const noteIdsToDelete = oldNotes
        .filter((s: any) => s.caption && s.caption.startsWith(NOTE_PREFIX))
        .map((s: any) => s.id);
      if (noteIdsToDelete.length > 0) {
        await supabase.from('stories').delete().in('id', noteIdsToDelete);
      }
    }
  } catch (e) {
    console.warn('Could not clean old notes', e);
  }

  const rawTrack = musicTrack?.track as any;
  const previewUrl =
    rawTrack?.preview_url ||
    rawTrack?.previewUrl ||
    rawTrack?.preview ||
    '';
  const artwork =
    rawTrack?.artwork ||
    rawTrack?.artwork_url ||
    rawTrack?.artworkUrl ||
    rawTrack?.artworkUrl100 ||
    null;

  const payload: NotePayload = {
    text: text.trim(),
    music: musicTrack
      ? {
          id: String(rawTrack.id || ''),
          title: rawTrack.title || '',
          artist: rawTrack.artist || '',
          artwork: artwork,
          preview_url: previewUrl,
          start_ms: musicTrack.startMs || 0,
          duration_ms: 30000,
        }
      : null,
  };

  const caption = encodeNoteCaption(payload);

  const { data, error } = await supabase
    .from('stories')
    .insert({
      user_id: userId,
      image_url: NOTE_IMAGE_PLACEHOLDER,
      caption,
    })
    .select('id, user_id, caption, created_at, expires_at, likes_count, views_count')
    .single();

  if (error) throw error;

  const decoded = decodeNoteStory(data);
  if (!decoded) throw new Error('Failed to encode note');
  return decoded;
}

/**
 * Delete a note
 */
export async function deleteUserNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('stories').delete().eq('id', noteId);
  if (error) throw error;
}

/**
 * Fetch visible notes for current user:
 * 1. User's own active note
 * 2. Active notes from followers/following who have set a note
 * Strictly returns only users who have actually created a valid active note.
 */
export async function getFeedNotes(userId: string): Promise<{
  myNote: UserNote | null;
  friendNotes: UserNote[];
}> {
  const now = new Date().toISOString();

  const [followersRes, followingRes] = await Promise.all([
    supabase.from('follows').select('follower_id').eq('following_id', userId),
    supabase.from('follows').select('following_id').eq('follower_id', userId),
  ]);

  const followerIds = new Set((followersRes.data || []).map((f: any) => f.follower_id));
  const followingIds = new Set((followingRes.data || []).map((f: any) => f.following_id));

  // Eligible users: current user + followers + following
  const eligibleIds = new Set<string>([userId, ...followerIds, ...followingIds]);
  const candidateIds = Array.from(eligibleIds);

  if (candidateIds.length === 0) {
    return { myNote: null, friendNotes: [] };
  }

  const { data: storiesData } = await supabase
    .from('stories')
    .select('id, user_id, caption, created_at, expires_at, likes_count, views_count')
    .in('user_id', candidateIds)
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (!storiesData || storiesData.length === 0) {
    return { myNote: null, friendNotes: [] };
  }

  const noteStories = storiesData.filter(
    (s: any) => s.caption && s.caption.startsWith(NOTE_PREFIX)
  );

  if (noteStories.length === 0) {
    return { myNote: null, friendNotes: [] };
  }

  // Get profiles for note creators
  const profileUserIds = Array.from(new Set(noteStories.map((s: any) => s.user_id)));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', profileUserIds);

  const profileMap: Record<string, Profile> = {};
  (profiles || []).forEach((p: Profile) => {
    profileMap[p.user_id] = p;
  });

  const notesList: UserNote[] = [];
  const seenUsers = new Set<string>();

  for (const s of noteStories) {
    if (seenUsers.has(s.user_id)) continue;
    seenUsers.add(s.user_id);

    const decoded = decodeNoteStory({ ...s, profile: profileMap[s.user_id] || null });

    // STRICT VALIDATION: Note must have text or music, non-expired, and a valid profile
    if (decoded && (decoded.text || decoded.music_track) && decoded.profile) {
      const expTime = new Date(decoded.expires_at).getTime();
      if (expTime > Date.now()) {
        notesList.push(decoded);
      }
    }
  }

  // Auto-resolve any missing preview URLs in the background / feed load
  await Promise.all(
    notesList.map(async (n) => {
      if (n.music_track && (!n.music_track.preview_url || !n.music_track.artwork)) {
        try {
          const resolved = await resolveNoteTrackPreview(n.music_track);
          if (resolved.previewUrl && !n.music_track.preview_url) {
            n.music_track.preview_url = resolved.previewUrl;
          }
          if (resolved.artwork && !n.music_track.artwork) {
            n.music_track.artwork = resolved.artwork;
          }
        } catch {}
      }
    })
  );

  const myNote = notesList.find((n) => n.user_id === userId) || null;
  // ONLY friends who have an active note are returned
  const friendNotes = notesList.filter((n) => n.user_id !== userId);

  return { myNote, friendNotes };
}

/**
 * Toggle like on a note & notify the note owner with a clear like notification
 */
export async function toggleNoteLike(
  note: UserNote,
  userId: string,
  isLiked: boolean
): Promise<void> {
  try {
    await toggleStoryLike(note.id, userId, isLiked);
    if (!isLiked && note.user_id !== userId) {
      createNotification(note.user_id, 'story_like', userId, note.id).catch(() => {});
    }
  } catch (e) {
    console.warn('Note like toggle fallback error:', e);
  }
}

export async function recordNoteView(noteId: string, viewerId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('story_views')
    .select('id')
    .eq('story_id', noteId)
    .eq('viewer_id', viewerId)
    .maybeSingle();

  if (existing) return;

  await supabase.from('story_views').insert({
    story_id: noteId,
    viewer_id: viewerId,
  });
  await supabase.rpc('increment_story_views', { story_id: noteId }).catch(() => {});
}

export async function getNoteViewersAndLikers(noteId: string): Promise<{
  viewers: Array<{ viewer_id: string; viewed_at: string; profile: Profile }>;
  likesCount: number;
}> {
  const [{ data: views }, { data: story }] = await Promise.all([
    supabase
      .from('story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', noteId)
      .order('viewed_at', { ascending: false }),
    supabase.from('stories').select('likes_count').eq('id', noteId).single(),
  ]);

  const viewersList = views || [];
  if (viewersList.length === 0) {
    return { viewers: [], likesCount: story?.likes_count || 0 };
  }

  const userIds = viewersList.map((v: any) => v.viewer_id);
  const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', userIds);

  const pMap: Record<string, Profile> = {};
  (profiles || []).forEach((p: Profile) => {
    pMap[p.user_id] = p;
  });

  const fullViewers = viewersList.map((v: any) => ({
    viewer_id: v.viewer_id,
    viewed_at: v.viewed_at,
    profile: pMap[v.viewer_id] || ({ username: 'user', full_name: 'User' } as Profile),
  }));

  return {
    viewers: fullViewers,
    likesCount: story?.likes_count || 0,
  };
}

export async function isNoteLiked(noteId: string, userId: string): Promise<boolean> {
  try {
    return await isStoryLiked(noteId, userId);
  } catch {
    return false;
  }
}
