import { supabase } from '@/db/supabase';
import type { Profile } from '@/types/types';

export interface HelloTunePreset {
  id: string;
  title: string;
  artist: string;
  mood: string;
  bpm: number;
  root: number;
  scale: 'maj' | 'min' | 'dor' | 'desi';
  lead: OscillatorType;
  style: 'four' | 'half' | 'lofi';
  seed: number;
  colors: [string, string];
  keywords: string;
}

export interface HelloTuneRecord {
  trackId: string | null;
  url: string | null;
  path: string | null;
  title: string;
  artist: string;
  startSeconds: number;
  durationSeconds: number;
  expiresAt: string;
}

export const HELLO_TUNE_MOODS = ['All', 'Chill', 'Happy', 'Dance', 'Romantic', 'Power', '8-bit'];

export const HELLO_TUNE_PRESETS: HelloTunePreset[] = [
  { id: 'neon', title: 'Neon Nights', artist: 'Pixelgram Studio', mood: 'Chill', bpm: 104, root: 57, scale: 'min', lead: 'square', style: 'half', seed: 3, colors: ['#7C5CFF', '#FF3D7F'], keywords: 'chill night synth lofi रात चिल' },
  { id: 'chai', title: 'Chai Pe Charcha', artist: 'Lo-Fi Chaupal', mood: 'Chill', bpm: 84, root: 60, scale: 'maj', lead: 'triangle', style: 'lofi', seed: 9, colors: ['#FFB347', '#FF5E62'], keywords: 'chai lofi relax coffee चाय शांत' },
  { id: 'dil', title: 'Dil Ka Pixel', artist: 'AR Beats', mood: 'Romantic', bpm: 96, root: 59, scale: 'desi', lead: 'triangle', style: 'half', seed: 5, colors: ['#FF3D7F', '#B5179E'], keywords: 'love pyaar romantic dil heart दिल प्यार रोमांटिक' },
  { id: 'bhangra', title: 'Bhangra Boost', artist: 'Desi Drop', mood: 'Dance', bpm: 128, root: 55, scale: 'desi', lead: 'sawtooth', style: 'four', seed: 2, colors: ['#FF8A00', '#EF4444'], keywords: 'dance party punjabi bhangra shaadi डांस भांगड़ा पार्टी' },
  { id: 'sun', title: 'Sunrise Smile', artist: 'Happy Hour', mood: 'Happy', bpm: 116, root: 60, scale: 'maj', lead: 'triangle', style: 'four', seed: 11, colors: ['#FBBF24', '#F97316'], keywords: 'happy morning smile sunrise खुश सुबह' },
  { id: 'raja', title: 'Raja Mode', artist: 'Bass Baadshah', mood: 'Power', bpm: 122, root: 52, scale: 'dor', lead: 'sawtooth', style: 'four', seed: 7, colors: ['#22D3EE', '#3B82F6'], keywords: 'power swag attitude raja gym boss बॉस' },
  { id: 'monsoon', title: 'Monsoon Memory', artist: 'Rainy Keys', mood: 'Romantic', bpm: 78, root: 57, scale: 'dor', lead: 'sine', style: 'lofi', seed: 13, colors: ['#06B6D4', '#7C5CFF'], keywords: 'rain barish monsoon sad soft बारिश याद' },
  { id: 'arcade', title: 'Arcade Heart', artist: '8-Bit Boys', mood: '8-bit', bpm: 140, root: 64, scale: 'maj', lead: 'square', style: 'four', seed: 4, colors: ['#10B981', '#A3E635'], keywords: 'game retro 8bit arcade pixel गेम' },
  { id: 'gold', title: 'Golden Hour', artist: 'Sunset Club', mood: 'Chill', bpm: 92, root: 62, scale: 'dor', lead: 'triangle', style: 'half', seed: 6, colors: ['#F59E0B', '#EC4899'], keywords: 'sunset evening golden mellow शाम' },
  { id: 'thunder', title: 'Thunder Walk', artist: 'Desi Drop', mood: 'Power', bpm: 112, root: 50, scale: 'min', lead: 'sawtooth', style: 'half', seed: 8, colors: ['#64748B', '#6366F1'], keywords: 'walk swagger thunder entry एंट्री' },
];

const TRACK_COLUMNS = 'hello_tune_track_id,hello_tune_url,hello_tune_path,hello_tune_title,hello_tune_artist,hello_tune_start_seconds,hello_tune_duration_seconds,hello_tune_expires_at';
const EMPTY_TUNE = {
  hello_tune_track_id: null,
  hello_tune_url: null,
  hello_tune_path: null,
  hello_tune_title: null,
  hello_tune_artist: null,
  hello_tune_start_seconds: 0,
  hello_tune_duration_seconds: 20,
  hello_tune_expires_at: null,
};
const HELLO_TUNE_DAYS = 28;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const audioBuffers = new Map<string, AudioBuffer>();

type ProfileTuneFields = Pick<
  Profile,
  | 'hello_tune_track_id'
  | 'hello_tune_url'
  | 'hello_tune_path'
  | 'hello_tune_title'
  | 'hello_tune_artist'
  | 'hello_tune_start_seconds'
  | 'hello_tune_duration_seconds'
  | 'hello_tune_expires_at'
>;

export function getHelloTuneFromProfile(profile: Profile | null | undefined): HelloTuneRecord | null {
  if (!profile?.hello_tune_title || !profile.hello_tune_expires_at) return null;
  const trackId = profile.hello_tune_track_id || null;
  const url = profile.hello_tune_url || null;
  if (!trackId && !url) return null;
  return {
    trackId,
    url,
    path: profile.hello_tune_path || null,
    title: profile.hello_tune_title,
    artist: profile.hello_tune_artist || 'Pixelgram',
    startSeconds: Math.max(0, Number(profile.hello_tune_start_seconds) || 0),
    durationSeconds: Math.max(1, Number(profile.hello_tune_duration_seconds) || 20),
    expiresAt: profile.hello_tune_expires_at,
  };
}

export function isHelloTuneActive(tune: HelloTuneRecord | null | undefined, now = Date.now()): tune is HelloTuneRecord {
  return Boolean(
    tune &&
      (tune.trackId || tune.url) &&
      Number.isFinite(Date.parse(tune.expiresAt)) &&
      Date.parse(tune.expiresAt) > now
  );
}

function tuneFromRow(row: ProfileTuneFields | null): HelloTuneRecord | null {
  if (!row?.hello_tune_title || !row.hello_tune_expires_at) return null;
  const trackId = row.hello_tune_track_id || null;
  const url = row.hello_tune_url || null;
  if (!trackId && !url) return null;
  return {
    trackId,
    url,
    path: row.hello_tune_path || null,
    title: row.hello_tune_title,
    artist: row.hello_tune_artist || 'Pixelgram',
    startSeconds: Math.max(0, Number(row.hello_tune_start_seconds) || 0),
    durationSeconds: Math.max(1, Number(row.hello_tune_duration_seconds) || 20),
    expiresAt: row.hello_tune_expires_at,
  };
}

async function removeTuneFile(path: string | null | undefined) {
  if (!path) return true;
  try {
    const { error } = await supabase.storage.from('hello-tunes').remove([path]);
    if (error) {
      console.warn('Hello Tune file cleanup failed:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function loadMyHelloTune(userId: string): Promise<HelloTuneRecord | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(TRACK_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  const row = data as ProfileTuneFields | null;
  const tune = tuneFromRow(row);
  if (!tune) {
    if (row?.hello_tune_path) {
      if (await removeTuneFile(row.hello_tune_path)) {
        await supabase.from('profiles').update({ hello_tune_path: null }).eq('user_id', userId);
      }
    }
    return null;
  }
  if (isHelloTuneActive(tune)) return tune;

  const { error: clearError } = await supabase
    .from('profiles')
    .update({ ...EMPTY_TUNE, hello_tune_path: tune.path })
    .eq('user_id', userId);
  if (!clearError && await removeTuneFile(tune.path)) {
    await supabase.from('profiles').update({ hello_tune_path: null }).eq('user_id', userId);
  }
  return null;
}

function safeFileExtension(file: File) {
  const extension = file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || '';
  const allowed = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'webm']);
  return allowed.has(extension) ? extension : null;
}

function audioMimeType(extension: string) {
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    webm: 'audio/webm',
  };
  return mimeTypes[extension] || 'audio/mpeg';
}

export async function saveMyHelloTune(
  userId: string,
  input: {
    trackId?: string;
    file?: File;
    title: string;
    artist: string;
    startSeconds: number;
    durationSeconds: number;
  }
): Promise<HelloTuneRecord> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.id !== userId) {
    throw new Error('Sirf apna Hello Tune set kar sakte ho');
  }
  if (!input.trackId && !input.file) throw new Error('Gana select karo');
  if (input.file && input.file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Audio file 20 MB se chhoti honi chahiye');
  }

  const { data: previous, error: previousError } = await supabase
    .from('profiles')
    .select('hello_tune_path')
    .eq('user_id', userId)
    .maybeSingle();
  if (previousError) throw previousError;

  let path: string | null = null;
  let url: string | null = null;
  if (input.file) {
    const extension = safeFileExtension(input.file);
    if (!extension) throw new Error('MP3, M4A, AAC, WAV, OGG ya WebM audio upload karo');
    path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('hello-tunes')
      .upload(path, input.file, {
        cacheControl: '3600',
        contentType: new Set([
          'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/wav',
          'audio/x-wav', 'audio/ogg', 'audio/opus', 'audio/webm',
        ]).has(input.file.type) ? input.file.type : audioMimeType(extension),
        upsert: false,
      });
    if (uploadError) throw uploadError;
    url = supabase.storage.from('hello-tunes').getPublicUrl(path).data.publicUrl;
  }

  const expiresAt = new Date(Date.now() + HELLO_TUNE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: saveError } = await supabase
    .from('profiles')
    .update({
      hello_tune_track_id: input.trackId || null,
      hello_tune_url: url,
      hello_tune_path: path,
      hello_tune_title: input.title.trim(),
      hello_tune_artist: input.artist.trim(),
      hello_tune_start_seconds: Math.max(0, input.startSeconds),
      hello_tune_duration_seconds: Math.round(input.durationSeconds),
      hello_tune_expires_at: expiresAt,
    })
    .eq('user_id', userId);

  if (saveError) {
    await removeTuneFile(path);
    throw saveError;
  }

  const oldPath = (previous as { hello_tune_path?: string | null } | null)?.hello_tune_path;
  if (oldPath && oldPath !== path) await removeTuneFile(oldPath);

  return {
    trackId: input.trackId || null,
    url,
    path,
    title: input.title.trim(),
    artist: input.artist.trim(),
    startSeconds: Math.max(0, input.startSeconds),
    durationSeconds: Math.round(input.durationSeconds),
    expiresAt,
  };
}

export async function removeMyHelloTune(userId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.id !== userId) {
    throw new Error('Sirf apna Hello Tune hata sakte ho');
  }
  const { data: previous, error: previousError } = await supabase
    .from('profiles')
    .select('hello_tune_path')
    .eq('user_id', userId)
    .maybeSingle();
  if (previousError) throw previousError;

  const { error } = await supabase
    .from('profiles')
    .update({
      ...EMPTY_TUNE,
      hello_tune_path: (previous as { hello_tune_path?: string | null } | null)?.hello_tune_path || null,
    })
    .eq('user_id', userId);
  if (error) throw error;
  const oldPath = (previous as { hello_tune_path?: string | null } | null)?.hello_tune_path;
  if (await removeTuneFile(oldPath)) {
    await supabase.from('profiles').update({ hello_tune_path: null }).eq('user_id', userId);
  }
}

const SCALES: Record<HelloTunePreset['scale'], number[]> = {
  maj: [0, 2, 4, 7, 9],
  min: [0, 3, 5, 7, 10],
  dor: [0, 2, 3, 5, 7, 9, 10],
  desi: [0, 1, 4, 5, 7, 8, 11],
};
const PROGRESSIONS = [[0, 0, 3, 4], [0, 5, 3, 4], [0, 3, 4, 3], [0, 4, 5, 3]];
const STYLES = {
  four: { kick: [0, 4, 8, 12], snare: [4, 12] },
  half: { kick: [0, 8], snare: [4, 12] },
  lofi: { kick: [0, 6, 10], snare: [8] },
};

export async function renderHelloTunePreset(id: string): Promise<AudioBuffer> {
  const cached = audioBuffers.get(id);
  if (cached) return cached;
  const track = HELLO_TUNE_PRESETS.find(item => item.id === id);
  if (!track) throw new Error('Ye Hello Tune nahi mili');

  const offlineWindow = window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const OfflineContext = window.OfflineAudioContext || offlineWindow.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error('Is browser mein audio preview support nahi hai');

  const sampleRate = 22050;
  const stepDuration = 60 / track.bpm / 4;
  const bars = 18;
  const duration = bars * 16 * stepDuration;
  const context = new OfflineContext(1, Math.ceil(duration * sampleRate), sampleRate);
  const master = context.createGain();
  master.gain.setValueAtTime(0.45, 0);
  master.gain.setValueAtTime(0.45, duration - 2);
  master.gain.linearRampToValueAtTime(0, duration);
  master.connect(context.destination);

  let seed = track.seed * 977;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const scale = SCALES[track.scale];
  const note = (degree: number, octave: number) =>
    track.root + 12 * (octave + Math.floor(degree / scale.length)) + scale[((degree % scale.length) + scale.length) % scale.length];
  const frequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  const leadVolume = track.lead === 'sawtooth' ? 0.55 : track.lead === 'square' ? 0.65 : 1;
  const noiseBuffer = context.createBuffer(1, sampleRate, sampleRate);
  const noise = noiseBuffer.getChannelData(0);
  for (let i = 0; i < sampleRate; i++) noise[i] = random() * 2 - 1;

  const playNote = (type: OscillatorType, hz: number, at: number, length: number, volume: number, detune = 0) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hz;
    oscillator.detune.value = detune;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
  };
  const kick = (at: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(150, at);
    oscillator.frequency.exponentialRampToValueAtTime(40, at + 0.12);
    gain.gain.setValueAtTime(0.9, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(at);
    oscillator.stop(at + 0.25);
  };
  const noiseHit = (at: number, length: number, volume: number, highPass: number) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = highPass;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(at);
    source.stop(at + length + 0.02);
  };
  const makeDrums = () =>
    Array.from({ length: 16 }, (_, index) => (random() < (index % 4 === 0 ? 0.85 : 0.4) ? Math.floor(random() * 6) - 1 : null));
  const melodyA = makeDrums();
  const melodyB = makeDrums();
  const progression = PROGRESSIONS[track.seed % PROGRESSIONS.length];
  const style = STYLES[track.style];

  for (let bar = 0; bar < bars; bar++) {
    const section = bar < 2 ? 0 : bar % 8 < 4 ? 1 : 2;
    const root = progression[bar % progression.length];
    [0, 2, 4].forEach(offset => playNote('triangle', frequency(note(root + offset, 0)), bar * 16 * stepDuration, 16 * stepDuration, section ? 0.045 : 0.03));
    for (let step = 0; step < 16; step++) {
      const at = (bar * 16 + step) * stepDuration;
      if (style.kick.includes(step) && (section > 0 || step === 0)) kick(at);
      if (style.snare.includes(step) && section > 0) noiseHit(at, 0.12, 0.28, 1800);
      if (step % 2 === 0) noiseHit(at + (track.style === 'lofi' && step % 4 === 2 ? stepDuration * 0.25 : 0), 0.04, section ? 0.07 : 0.04, 7000);
      if (section > 0 && (step % 4 === 0 || (track.style === 'lofi' && step === 6))) {
        playNote('triangle', frequency(note(root, -1)), at, stepDuration * 3, 0.34);
      }
      if (section === 0 && step % 2 === 0) {
        const passing = [0, 2, 4][(step / 2) % 3];
        playNote('triangle', frequency(note(root + passing, 1)), at, stepDuration * 1.6, 0.07);
      }
      const degree = (section === 1 ? melodyA : melodyB)[step];
      if (section > 0 && degree !== null) {
        playNote(track.lead, frequency(note(root + degree, 1)), at, stepDuration * 1.8, (section === 2 ? 0.13 : 0.1) * leadVolume);
        if (section === 2) playNote(track.lead, frequency(note(root + degree, 2)), at, stepDuration * 1.4, 0.05 * leadVolume, 6);
      }
    }
  }

  const buffer = await context.startRendering();
  audioBuffers.set(id, buffer);
  return buffer;
}

export async function decodeHelloTuneFile(file: File): Promise<AudioBuffer> {
  const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Is browser mein audio preview support nahi hai');
  const context = new AudioContextConstructor();
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close().catch(() => {});
  }
}

export function playHelloTuneBuffer(
  buffer: AudioBuffer,
  startSeconds: number,
  durationSeconds: number,
  repeat = true,
  volume = 0.8
): () => void {
  const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Is browser mein audio playback support nahi hai');
  const context = new AudioContextConstructor();
  const gain = context.createGain();
  gain.gain.value = volume;
  gain.connect(context.destination);

  let stopped = false;
  let source: AudioBufferSourceNode | null = null;
  const startClip = () => {
    if (stopped) return;
    const start = Math.max(0, Math.min(startSeconds, Math.max(0, buffer.duration - 0.05)));
    const length = Math.max(0.05, Math.min(durationSeconds, buffer.duration - start));
    source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      source = null;
      if (repeat && !stopped) startClip();
    };
    source.start(0, start, length);
  };
  void context.resume().then(startClip).catch(() => {});

  return () => {
    stopped = true;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* already stopped */ }
    }
    void context.close().catch(() => {});
  };
}

function playUploadedHelloTune(tune: HelloTuneRecord): Promise<() => void> {
  return new Promise((resolve, reject) => {
    if (!tune.url) {
      reject(new Error('Hello Tune audio missing hai'));
      return;
    }
    const audio = new Audio(tune.url);
    audio.preload = 'auto';
    audio.volume = 0.8;
    let settled = false;
    let starting = false;
    let clipStart = tune.startSeconds;
    let clipEnd = clipStart + tune.durationSeconds;

    const cleanup = () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('error', onError);
      audio.removeAttribute('src');
      audio.load();
    };
    const onError = () => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new Error('Hello Tune load nahi ho payi'));
      }
    };
    const onTimeUpdate = () => {
      if (audio.currentTime >= clipEnd) {
        audio.currentTime = clipStart;
        void audio.play().catch(onError);
      }
    };
    const onMetadata = () => {
      if (starting) return;
      starting = true;
      clipStart = Math.max(0, Math.min(tune.startSeconds, Math.max(0, audio.duration - 0.1)));
      clipEnd = Math.min(audio.duration, clipStart + tune.durationSeconds);
      audio.currentTime = clipStart;
      audio.addEventListener('timeupdate', onTimeUpdate);
      void audio.play().then(() => {
        settled = true;
        resolve(cleanup);
      }).catch(onError);
    };

    audio.addEventListener('loadedmetadata', onMetadata, { once: true });
    audio.addEventListener('error', onError);
    audio.load();
    if (audio.readyState >= 1) onMetadata();
  });
}

export async function playCallerHelloTune(tune: HelloTuneRecord): Promise<() => void> {
  if (!isHelloTuneActive(tune)) throw new Error('Hello Tune expire ho chuki hai');
  if (tune.url) return playUploadedHelloTune(tune);
  if (tune.trackId) {
    const buffer = await renderHelloTunePreset(tune.trackId);
    return playHelloTuneBuffer(buffer, tune.startSeconds, tune.durationSeconds, true, 0.8);
  }
  throw new Error('Hello Tune audio missing hai');
}
