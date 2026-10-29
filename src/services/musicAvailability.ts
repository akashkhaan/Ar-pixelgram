// Source availability is independent of the song's advertised album duration.
export interface AvailableTrack {
  id: string;
  title: string;
  artist: string;
  previewUrl: string;
  durationMs: number;
  isFullSong?: boolean;
}

export function hasFullAudio(track: AvailableTrack): boolean {
  if (track.isFullSong !== undefined) return track.isFullSong;
  // Legacy saved Saavn rows did not persist the flag. Only restore known full sources.
  return track.id.startsWith('saavn_') && track.durationMs > 30_000 &&
    /^https?:\/\//i.test(track.previewUrl) && !/\/previews?\//i.test(track.previewUrl);
}

export function mergeMusicTracks<T extends AvailableTrack>(tracks: T[]): T[] {
  const byRecording = new Map<string, T>();
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const track of tracks) {
    if (!track.previewUrl || !Number.isFinite(track.durationMs) || track.durationMs <= 0) continue;
    const key = `${normalize(track.title)}|${normalize(track.artist)}`;
    const previous = byRecording.get(key);
    if (!previous || (!hasFullAudio(previous) && hasFullAudio(track))) byRecording.set(key, track);
  }
  const seenIds = new Set<string>();
  return [...byRecording.values()].sort((a, b) => Number(hasFullAudio(b)) - Number(hasFullAudio(a)))
    .filter(track => {
      if (seenIds.has(track.id)) return false;
      seenIds.add(track.id);
      return true;
    });
}

export function playableDurationSeconds(track: AvailableTrack): number {
  return Number.isFinite(track.durationMs) && track.durationMs > 0 ? track.durationMs / 1000 : 30;
}
