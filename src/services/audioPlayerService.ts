import { type MusicTrack } from '@/services/music';

export interface AudioPlayerState {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  queue: MusicTrack[];
  queueIndex: number;
}

type Listener = (state: AudioPlayerState) => void;

class AudioPlayerService {
  private audio: HTMLAudioElement | null = null;
  private state: AudioPlayerState = {
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    queue: [],
    queueIndex: -1,
  };
  private listeners = new Set<Listener>();
  private notificationActive = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initAudio();
      this.initMediaSession();
    }
  }

  private initAudio() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    (this.audio as any).playsInline = true;

    this.audio.addEventListener('play', () => {
      this.state.isPlaying = true;
      this.updateMediaSessionPlayback('playing');
      this.notify();
    });

    this.audio.addEventListener('pause', () => {
      this.state.isPlaying = false;
      this.updateMediaSessionPlayback('paused');
      this.notify();
    });

    this.audio.addEventListener('timeupdate', () => {
      if (this.audio) {
        this.state.currentTime = this.audio.currentTime || 0;
        this.state.duration = this.audio.duration || this.state.duration || 0;
        this.updateMediaSessionPosition();
        this.notify();
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.audio && this.audio.duration) {
        this.state.duration = this.audio.duration;
        this.notify();
      }
    });

    this.audio.addEventListener('ended', () => {
      // Automatic continuous playback: play next song in queue
      this.playNext(true);
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio playback error, attempting next:', e);
      this.state.isPlaying = false;
      this.notify();
      // Try next track after brief pause if available
      if (this.state.queue.length > 1) {
        setTimeout(() => this.playNext(true), 800);
      }
    });
  }

  private initMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => this.resume());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('stop', () => this.stop());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
      
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skip = details.seekOffset || 10;
        this.seek(Math.max(0, this.state.currentTime - skip));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skip = details.seekOffset || 10;
        this.seek(Math.min(this.state.duration, this.state.currentTime + skip));
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          this.seek(details.seekTime);
        }
      });
    } catch (e) {
      console.warn('MediaSession action handler error:', e);
    }
  }

  private updateMediaSessionMetadata(track: MusicTrack) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !window.MediaMetadata) return;

    try {
      const artwork = track.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title,
        artist: `${track.artist} • Pixelgram`,
        album: track.album || 'Pixelgram Music',
        artwork: [
          { src: artwork, sizes: '96x96', type: 'image/jpeg' },
          { src: artwork, sizes: '128x128', type: 'image/jpeg' },
          { src: artwork, sizes: '192x192', type: 'image/jpeg' },
          { src: artwork, sizes: '256x256', type: 'image/jpeg' },
          { src: artwork, sizes: '384x384', type: 'image/jpeg' },
          { src: artwork, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
      navigator.mediaSession.playbackState = 'playing';
    } catch (e) {
      console.warn('Failed to set MediaMetadata:', e);
    }
  }

  private updateMediaSessionPlayback(state: 'playing' | 'paused' | 'none') {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {}
  }

  private updateMediaSessionPosition() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
      if (this.state.duration && !isNaN(this.state.duration) && isFinite(this.state.duration)) {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, this.state.duration),
          playbackRate: 1,
          position: Math.min(Math.max(0, this.state.currentTime), this.state.duration),
        });
      }
    } catch {}
  }

  public getState(): AudioPlayerState {
    return { ...this.state };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  public async playTrack(track: MusicTrack, queue?: MusicTrack[], index?: number): Promise<void> {
    this.initAudio();
    if (!this.audio) return;

    // If queue is provided, update queue and index
    if (queue && queue.length > 0) {
      this.state.queue = queue;
      this.state.queueIndex = index !== undefined && index >= 0 ? index : queue.findIndex((t) => t.id === track.id);
      if (this.state.queueIndex < 0) this.state.queueIndex = 0;
    } else if (!this.state.queue.some((t) => t.id === track.id)) {
      this.state.queue = [track];
      this.state.queueIndex = 0;
    }

    this.state.currentTrack = track;
    this.state.currentTime = 0;
    this.state.duration = (track.durationMs || 30000) / 1000;

    try {
      this.audio.pause();
      this.audio.src = track.previewUrl;
      this.audio.currentTime = 0;
      this.audio.load();
      await this.audio.play();
      this.state.isPlaying = true;
      this.updateMediaSessionMetadata(track);
    } catch (err) {
      console.warn('Playback error:', err);
      this.state.isPlaying = false;
    }

    this.notify();
  }

  public togglePlay(): void {
    if (!this.audio) return;
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.resume();
    }
  }

  public pause(): void {
    if (this.audio) {
      this.audio.pause();
    }
    this.state.isPlaying = false;
    this.updateMediaSessionPlayback('paused');
    this.notify();
  }

  public resume(): void {
    if (this.audio && this.state.currentTrack) {
      this.audio.play().catch(() => {});
      this.state.isPlaying = true;
      this.updateMediaSessionPlayback('playing');
      this.notify();
    }
  }

  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
    }
    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.state.currentTime = 0;
    this.state.duration = 0;
    this.updateMediaSessionPlayback('none');
    this.notify();
  }

  public playNext(autoAdvance = false): void {
    if (this.state.queue.length === 0) return;
    const nextIndex = (this.state.queueIndex + 1) % this.state.queue.length;
    const nextTrack = this.state.queue[nextIndex];
    if (nextTrack) {
      void this.playTrack(nextTrack, this.state.queue, nextIndex);
    }
  }

  public playPrevious(): void {
    if (this.state.queue.length === 0) return;
    const prevIndex = (this.state.queueIndex - 1 + this.state.queue.length) % this.state.queue.length;
    const prevTrack = this.state.queue[prevIndex];
    if (prevTrack) {
      void this.playTrack(prevTrack, this.state.queue, prevIndex);
    }
  }

  public seek(timeInSeconds: number): void {
    if (this.audio) {
      this.audio.currentTime = timeInSeconds;
      this.state.currentTime = timeInSeconds;
      this.notify();
    }
  }
}

export const audioPlayerService = new AudioPlayerService();
