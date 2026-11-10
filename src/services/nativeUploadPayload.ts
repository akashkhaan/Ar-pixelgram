import type { PersistentUploadJob } from './persistentUploadQueue';
import { cleanDisplayCaption, encodePostMusic } from './api';

/** Use the same rows and caption/music fallback as the existing web publishers. */
export function nativeUploadPayload(job: PersistentUploadJob, publicUrl: string, coverUrl: string | null, recordId: string) {
  const music = job.musicPayload;
  const caption = job.caption?.trim() || null;
  const encoded = music ? encodePostMusic(caption, music) : caption;
  let base: Record<string, unknown>;
  if (job.kind === 'video') {
    base = { id: recordId, user_id: job.userId, title: job.videoTitle?.trim() || 'Untitled Video',
      description: job.videoDescription?.trim() || null, video_url: publicUrl, thumbnail_url: coverUrl,
      duration_sec: job.videoDuration && Number.isFinite(job.videoDuration) ? Math.round(job.videoDuration) : null,
      visibility: job.videoVisibility || 'public' };
  } else if (job.kind === 'reel') {
    base = { id: recordId, user_id: job.userId, video_url: publicUrl,
      caption: cleanDisplayCaption(caption || ''), thumbnail_url: coverUrl };
  } else {
    base = { id: recordId, user_id: job.userId, image_url: publicUrl, caption: encoded };
  }
  const row = { ...base };
  if (music && job.kind !== 'video') {
    Object.assign(row, { music_track_id: music.track_id, music_title: music.title,
      music_artist: music.artist, music_artwork_url: music.artwork_url || null,
      music_preview_url: music.preview_url, music_start_ms: music.start_ms || 0,
      music_duration_ms: music.duration_ms || null });
    if (job.kind !== 'post') row.mute_original = music.mute_original;
  }
  const fallback = { ...base };
  if (music && job.kind === 'reel') fallback.caption = encodePostMusic(cleanDisplayCaption(caption || ''), music);
  return { table: job.kind === 'story' ? 'stories' : job.kind === 'post' ? 'posts' : job.kind === 'reel' ? 'reels' : 'videos',
    row, fallback, hasMusic: Boolean(music && job.kind !== 'video') };
}
