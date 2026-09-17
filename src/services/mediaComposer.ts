import type { MusicTrack } from '@/services/music';

interface ComposeOptions {
  track: MusicTrack;
  startMs: number;
  muteOriginal: boolean;
  mediaType: 'image' | 'video';
}

function supportedMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
}

function waitForMedia(media: HTMLMediaElement | HTMLImageElement): Promise<void> {
  if (media instanceof HTMLImageElement) {
    if (media.complete && media.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Media preview load nahi ho paaya'));
      };
      const cleanup = () => {
        media.removeEventListener('load', onReady);
        media.removeEventListener('error', onError);
      };
      media.addEventListener('load', onReady);
      media.addEventListener('error', onError);
    });
  }
  if (media.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Media preview load nahi ho paaya'));
    };
    const cleanup = () => {
      media.removeEventListener('loadeddata', onReady);
      media.removeEventListener('canplay', onReady);
      media.removeEventListener('error', onError);
    };
    media.addEventListener('loadeddata', onReady);
    media.addEventListener('canplay', onReady);
    media.addEventListener('error', onError);
  });
}

/**
 * Story music is baked into a temporary video in the browser. That preserves
 * the existing stories table/API exactly as-is while making the selected
 * audio audible to everyone who views the story.
 */
export async function composeMediaWithMusic(file: File, options: ComposeOptions): Promise<File> {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return file;
  const mimeType = supportedMimeType();
  if (!mimeType) return file;

  const sourceUrl = URL.createObjectURL(file);
  const media = options.mediaType === 'video'
    ? document.createElement('video')
    : document.createElement('img');
  const audio = new Audio(options.track.previewUrl);
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';

  try {
    media.src = sourceUrl;
    if (media instanceof HTMLVideoElement) {
      media.muted = options.muteOriginal;
      media.playsInline = true;
      media.loop = true;
    }
    await waitForMedia(media);
    await waitForMedia(audio);

    const width = media instanceof HTMLVideoElement ? media.videoWidth || 720 : media.naturalWidth || 720;
    const height = media instanceof HTMLVideoElement ? media.videoHeight || 1280 : media.naturalHeight || 1280;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1080 / Math.max(width, height));
    canvas.width = Math.max(2, Math.round(width * scale));
    canvas.height = Math.max(2, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;

    const audioContext = new AudioContext();
    const audioDestination = audioContext.createMediaStreamDestination();
    const musicSource = audioContext.createMediaElementSource(audio);
    musicSource.connect(audioDestination);
    musicSource.connect(audioContext.destination);

    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()];
    const captureSource = media as HTMLVideoElement & { captureStream?: () => MediaStream };
    if (media instanceof HTMLVideoElement && !options.muteOriginal && captureSource.captureStream) {
      const originalStream = captureSource.captureStream();
      tracks.push(...originalStream.getAudioTracks());
    }
    const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
    const chunks: Blob[] = [];
    const recorded = new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    const duration = media instanceof HTMLVideoElement
      ? Math.min(15, Math.max(1, media.duration || 15))
      : 15;
    const startedAt = performance.now();
    const draw = () => {
      context.drawImage(media, 0, 0, canvas.width, canvas.height);
      if (performance.now() - startedAt < duration * 1000) {
        requestAnimationFrame(draw);
      }
    };

    audio.currentTime = Math.max(0, options.startMs / 1000);
    await audio.play();
    if (media instanceof HTMLVideoElement) await media.play();
    recorder.start(250);
    draw();
    await new Promise<void>((resolve) => window.setTimeout(resolve, duration * 1000 + 150));
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await recorded;
    await audioContext.close();
    const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    return new File([blob], `story-${Date.now()}.${extension}`, { type: mimeType });
  } catch {
    // Some browsers reject cross-origin audio previews. Keep the original
    // upload usable rather than failing the entire story publish.
    return file;
  } finally {
    audio.pause();
    URL.revokeObjectURL(sourceUrl);
  }
}