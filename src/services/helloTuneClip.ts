/**
 * Hello Tune clip helpers.
 * Save karte waqt user ki chuni hui jagah (jaise 1:41) se 30 second ka hissa
 * kaat kar alag file banti hai — isliye caller ko hamesha wahi hissa sunai deta hai,
 * phone par remote gaane me seek fail hone ka koi chance nahi.
 */

export interface ClipSource {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

const CLIP_SAMPLE_RATE = 22050;

/** Naye (pehle se kate hue) clip files ke naam "-clip.wav" par khatam hote hain */
export function isPreCutClip(path: string | null | undefined, url?: string | null): boolean {
  const target = (path || url || '').split('?')[0] ?? '';
  return /-clip\.[a-z0-9]+$/i.test(target);
}

/** Caller ke phone par audio file ka kaunsa hissa bajana hai */
export function helloTunePlaybackWindow(
  tune: { path?: string | null; url?: string | null; startSeconds: number; durationSeconds: number },
  audioDuration: number,
): { start: number; end: number } {
  const total = Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : Infinity;
  if (isPreCutClip(tune.path, tune.url)) {
    return { start: 0, end: Math.min(total, Math.max(1, tune.durationSeconds)) };
  }
  const start = Math.max(0, Math.min(tune.startSeconds, Number.isFinite(total) ? Math.max(0, total - 0.1) : tune.startSeconds));
  return { start, end: Math.min(total, start + Math.max(1, tune.durationSeconds)) };
}

/** Buffer ke start..start+length hisse ko mono 16-bit WAV me badlo */
export function encodeWavClip(buffer: ClipSource, startSeconds: number, lengthSeconds: number): Uint8Array {
  const srcRate = buffer.sampleRate;
  const from = Math.max(0, Math.min(buffer.length - 1, Math.floor(startSeconds * srcRate)));
  const to = Math.max(from + 1, Math.min(buffer.length, Math.floor((startSeconds + lengthSeconds) * srcRate)));
  const outRate = Math.min(CLIP_SAMPLE_RATE, srcRate);
  const ratio = srcRate / outRate;
  const outLength = Math.max(1, Math.floor((to - from) / ratio));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const fadeSamples = Math.min(Math.floor(outRate * 0.4), Math.floor(outLength / 4));

  const bytes = new Uint8Array(44 + outLength * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + outLength * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, outLength * 2, true);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = Math.min(to - 1, from + Math.floor(i * ratio));
    let sample = 0;
    for (const data of channels) sample += data[srcIndex] ?? 0;
    sample /= Math.max(1, channels.length);
    if (fadeSamples > 0) {
      if (i < fadeSamples) sample *= i / fadeSamples;
      else if (i > outLength - fadeSamples) sample *= (outLength - i) / fadeSamples;
    }
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytes;
}
