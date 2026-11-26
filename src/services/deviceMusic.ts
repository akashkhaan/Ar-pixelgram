import { Capacitor, registerPlugin } from '@capacitor/core';

/** Phone (MediaStore) ka ek gaana */
export interface DeviceSong {
  id: string;
  uri: string;
  title: string;
  artist: string;
  durationMs: number;
  size: number;
  fileName: string;
  mimeType: string;
  /** Web par user ne jo file chuni — native par undefined */
  file?: File;
}

interface DeviceMusicPluginApi {
  listSongs(): Promise<{ songs: DeviceSong[] }>;
  readSong(options: { uri: string }): Promise<{ data: string }>;
}

const DeviceMusic = registerPlugin<DeviceMusicPluginApi>('DeviceMusic');

export function canListDeviceSongs(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('DeviceMusic');
}

export async function listDeviceSongs(): Promise<DeviceSong[]> {
  const { songs } = await DeviceMusic.listSongs();
  return (songs || []).filter(song => song && song.uri);
}

/** Native gaane ka WebView-playable URL (content:// -> local server) */
export function deviceSongSrc(song: DeviceSong): string {
  return Capacitor.convertFileSrc(song.uri);
}

function guessMime(song: DeviceSong): string {
  if (song.mimeType) return song.mimeType;
  const ext = song.fileName.split('.').pop()?.toLowerCase() || '';
  return ({ m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/opus' } as Record<string, string>)[ext] || 'audio/mpeg';
}

/** Gaane ko File me badlo (decode + upload ke liye) */
export async function deviceSongToFile(song: DeviceSong): Promise<File> {
  if (song.file) return song.file;
  const name = song.fileName || `${song.title || 'song'}.mp3`;
  const type = guessMime(song);
  try {
    const response = await fetch(deviceSongSrc(song));
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    if (!blob.size) throw new Error('empty');
    return new File([blob], name, { type });
  } catch {
    const { data } = await DeviceMusic.readSong({ uri: song.uri });
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type });
  }
}

/** Web ke liye: user ki chuni hui files ko song list me badlo */
export function filesToSongs(files: FileList | File[]): DeviceSong[] {
  return Array.from(files)
    .filter(file => file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(file.name))
    .map((file, index) => ({
      id: `web-${Date.now()}-${index}`,
      uri: '',
      title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Gaana',
      artist: '',
      durationMs: 0,
      size: file.size,
      fileName: file.name,
      mimeType: file.type,
      file,
    }));
}
