import { supabase } from '@/db/supabase';
import { createNotification } from './api';
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
const NOTE_IMAGE_PLACEHOLDER = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&q=80';

export function encodeNoteCaption(payload: NotePayload): string {
  return `${NOTE_PREFIX}${JSON.stringify(payload)}${NOTE_SUFFIX}`;
}

export function decodeNoteStory(story: any): UserNote | null {
  if (!story || !story.caption || !story.caption.startsWith(NOTE_PREFIX)) {
    return null;
  }
  try {
    const raw = story.caption.slice(NOTE_PREFIX.length, story.caption.lastIndexOf(NOTE_SUFFIX));
    const payload: NotePayload = JSON.parse(raw);
    return {
      id: story.id,
      user_id: story.user_id,
      text: payload.text || '',
      created_at: story.created_at,
      expires_at: story.expires_at,
      profile: story.profile || null,
      music_track: payload.music || null,
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
  // First, find and delete any existing active note by this user
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

  const payload: NotePayload = {
    text: text.trim(),
    music: musicTrack
      ? {
          id: musicTrack.track.id,
          title: musicTrack.track.title,
          artist: musicTrack.track.artist,
          artwork: musicTrack.track.artwork_url || null,
          preview_url: musicTrack.track.preview_url,
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
 * 2. Active notes from mutual connections (followers + following who follow back or follow each other)
 */
export async function getFeedNotes(userId: string): Promise<{
  myNote: UserNote | null;
  friendNotes: UserNote[];
}> {
  // Get users who follow current user OR whom current user follows
  const [followersRes, followingRes] = await Promise.all([
    supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId)
      .eq('status', 'accepted'),
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .eq('status', 'accepted'),
  ]);

  const followerIds = new Set((followersRes.data || []).map((f: any) => f.follower_id));
  const followingIds = new Set((followingRes.data || []).map((f: any) => f.following_id));

  // Eligible users: current user + mutual connections (followers and following)
  const eligibleIds = new Set<string>([userId, ...followerIds, ...followingIds]);
  const candidateIds = Array.from(eligibleIds);

  if (candidateIds.length === 0) {
    return { myNote: null, friendNotes: [] };
  }

  const { data: storiesData } = await supabase
    .from('stories')
    .select('*')
    .in('user_id', candidateIds)
    .gt('expires_at', new Date().toISOString())
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
    if (decoded) {
      notesList.push(decoded);
    }
  }

  const myNote = notesList.find((n) => n.user_id === userId) || null;
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
  if (isLiked) {
    await supabase.from('story_likes').delete().eq('story_id', note.id).eq('user_id', userId);
    await supabase.rpc('decrement_story_likes', { story_id: note.id }).catch(() => {});
  } else {
    await supabase.from('story_likes').upsert({ story_id: note.id, user_id: userId });
    await supabase.rpc('increment_story_likes', { story_id: note.id }).catch(() => {});

    // Notify owner about the like
    if (note.user_id !== userId) {
      try {
        const snippet = note.text.length > 50 ? `${note.text.slice(0, 50)}...` : note.text;
        await createNotification(
          note.user_id,
          'story_like',
          userId,
          note.id,
          undefined,
          `liked your note: "${snippet}"`
        );
      } catch (e) {
        console.warn('Note like notification error:', e);
      }
    }
  }
}

/**
 * Record view on a note
 */
export async function recordNoteView(noteId: string, viewerId: string): Promise<void> {
  const { error } = await supabase
    .from('story_views')
    .upsert({ story_id: noteId, viewer_id: viewerId });
  if (!error) {
    await supabase.rpc('increment_story_views', { story_id: noteId }).catch(() => {});
  }
}

/**
 * Fetch viewers and likers of a note (Instagram "Seen by" sheet)
 */
export async function getNoteViewersAndLikers(noteId: string): Promise<{
  viewers: { profile: Profile; viewed_at: string; liked: boolean }[];
  likesCount: number;
  viewsCount: number;
}> {
  const [viewsRes, likesRes] = await Promise.all([
    supabase
      .from('story_views')
      .select('created_at, profiles!story_views_viewer_id_fkey(*)')
      .eq('story_id', noteId)
      .order('created_at', { ascending: false }),
    supabase.from('story_likes').select('user_id').eq('story_id', noteId),
  ]);

  const likedSet = new Set(
    ((likesRes.data as { user_id: string }[] | null) || []).map((l) => l.user_id)
  );

  const rawViews = (viewsRes.data as any[] | null) || [];
  const viewers = rawViews
    .map((r) => ({
      profile: r.profiles as Profile,
      viewed_at: r.created_at as string,
      liked: likedSet.has(r.profiles?.user_id),
    }))
    .filter((v) => !!v.profile);

  return {
    viewers,
    likesCount: likedSet.size,
    viewsCount: viewers.length,
  };
}

/**
 * Check if a specific note is liked by user
 */
export async function isNoteLiked(noteId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('story_likes')
    .select('id')
    .eq('story_id', noteId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}
