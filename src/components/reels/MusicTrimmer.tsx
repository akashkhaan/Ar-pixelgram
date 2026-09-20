import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Music2, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { formatMusicDuration, type MusicTrack } from '@/services/music';

interface Props {
  track: MusicTrack;
  videoUrl: string;
  mediaType?: 'image' | 'video';
  /** Previously chosen start point (ms) */
  initialStartMs?: number;
  initialMuteOriginal?: boolean;
  onBack: () => void;
  onDone: (opts: { startMs: number; muteOriginal: boolean }) => void;
}

// Realistic waveform bars (Instagram look)
const BAR_COUNT = 52;
function generateWaveformBars(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 100000;
  }
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    h = (h * 1103515245 + 12345 + i * 13) % 2147483648;
    return 25 + ((h >>> 8) % 75);
  });
}

const MusicTrimmer: React.FC<Props> = ({
  track,
  videoUrl,
  mediaType = 'video',
  initialStartMs = 0,
  initialMuteOriginal = true,
  onBack,
  onDone,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioDuration, setAudioDuration] = useState(30);
  const [videoDuration, setVideoDuration] = useState(0);
  const [start, setStart] = useState(initialStartMs / 1000);
  const [muteOriginal, setMuteOriginal] = useState(initialMuteOriginal);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

  const bars = useMemo(() => generateWaveformBars(track.id), [track.id]);

  // Window length (standard Instagram 15s to 30s)
  const clipLen = useMemo(() => {
    if (!audioDuration) return 15;
    const v = mediaType === 'image' ? 15 : (videoDuration || 15);
    return Math.min(audioDuration, Math.max(5, v));
  }, [audioDuration, mediaType, videoDuration]);

  const maxStart = Math.max(0, audioDuration - clipLen);

  useEffect(() => {
    if (start > maxStart) setStart(maxStart);
  }, [maxStart, start]);

  // Loop the audio snippet and keep video in sync
  useEffect(() => {
    const a = audioRef.current;
    const v = videoRef.current;
    if (!a || !ready) return;

    a.currentTime = start;
    a.play().catch(() => {});
    setIsPlaying(true);

    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }

    const onTime = () => {
      if (clipLen && a.currentTime >= start + clipLen) {
        a.currentTime = start;
        if (v) {
          v.currentTime = 0;
          v.play().catch(() => {});
        }
      }
    };

    a.addEventListener('timeupdate', onTime);
    return () => a.removeEventListener('timeupdate', onTime);
  }, [start, clipLen, ready]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setStart(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleConfirm = () => {
    audioRef.current?.pause();
    onDone({
      startMs: Math.round(start * 1000),
      muteOriginal,
    });
  };

  const selStartPct = audioDuration ? (start / audioDuration) * 100 : 0;
  const selWidthPct = audioDuration ? (clipLen / audioDuration) * 100 : 50;

  return (
    <div className="fixed inset-0 z-[80] bg-black text-white flex flex-col font-sans select-none">
      {/* Top Navigation Bar with Album Art, Title, Artist and Checkmark */}
      <div
        className="flex items-center justify-between px-3 pb-2 pt-3 bg-gradient-to-b from-black/80 to-transparent z-20"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all text-white"
          aria-label="Back to music search"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Center Track info */}
        <div className="flex items-center gap-2.5 max-w-[200px] min-w-0">
          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-white/20 shadow">
            {track.artwork ? (
              <img src={track.artwork} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/10">
                <Music2 className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{track.title}</p>
            <p className="text-[10px] text-white/70 truncate">{track.artist}</p>
          </div>
        </div>

        {/* Done / Checkmark button */}
        <button
          type="button"
          onClick={handleConfirm}
          className="w-10 h-10 rounded-full bg-white text-black hover:bg-white/90 active:scale-95 flex items-center justify-center shadow-lg transition-all"
          title="Done / Confirm music"
        >
          <Check className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      {/* Helper text prompt */}
      <div className="text-center py-1 z-10">
        <p className="text-xs text-white/80 font-medium drop-shadow">
          Choose the part that you want for your {mediaType === 'image' ? 'post' : 'reel'}
        </p>
      </div>

      {/* Media Preview (Video or Image) */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {mediaType === 'image' ? (
          <img
            src={videoUrl}
            alt="Preview"
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            loop
            muted={muteOriginal}
            onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration || 0)}
          />
        )}

        {/* Audio element */}
        <audio
          ref={audioRef}
          src={track.previewUrl}
          loop
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration || 30;
            setAudioDuration(dur);
            setReady(true);
          }}
        />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        )}
      </div>

      {/* Bottom Waveform & Original Audio Controls */}
      <div className="px-4 pb-6 pt-3 space-y-3.5 bg-gradient-to-t from-black via-black/95 to-black/80 border-t border-white/10 z-20">
        {/* Waveform Scrubber with highlighted selection box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-white/70 px-1 font-medium">
            <span>{formatMusicDuration(start * 1000)}</span>
            <span className="text-primary font-bold">{Math.round(clipLen)}s selected</span>
            <span>{formatMusicDuration((start + clipLen) * 1000)}</span>
          </div>

          <div className="relative h-16 rounded-2xl bg-white/10 px-2 overflow-hidden flex items-center">
            {/* Background waveform bars */}
            <div className="absolute inset-0 flex items-center gap-[3px] px-2">
              {bars.map((heightPct, idx) => (
                <span
                  key={idx}
                  className="flex-1 rounded-full bg-white/30 transition-all duration-150"
                  style={{ height: `${heightPct}%` }}
                />
              ))}
            </div>

            {/* Selection highlight box (Instagram yellow/primary frame) */}
            <div
              className="absolute top-1 bottom-1 rounded-xl border-2 border-amber-400 bg-amber-400/25 pointer-events-none transition-all duration-75 shadow-lg"
              style={{
                left: `${selStartPct}%`,
                width: `${selWidthPct}%`,
              }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-amber-400 rounded-full" />
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-amber-400 rounded-full" />
            </div>

            {/* Touch / Drag slider */}
            <input
              type="range"
              min={0}
              max={Math.max(0.1, maxStart)}
              step={0.1}
              value={start}
              onChange={handleSliderChange}
              aria-label="Choose song start position"
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
            />
          </div>

          <p className="text-[11px] text-white/50 text-center font-medium">
            Drag the slider to adjust music timing
          </p>
        </div>

        {/* Original camera audio toggle */}
        {mediaType === 'video' && (
          <button
            type="button"
            onClick={() => setMuteOriginal((prev) => !prev)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.99] transition-all border border-white/5"
          >
            <div className="flex items-center gap-2.5">
              {muteOriginal ? (
                <VolumeX className="w-4 h-4 text-white/70" />
              ) : (
                <Volume2 className="w-4 h-4 text-primary" />
              )}
              <span className="text-xs font-semibold text-white">
                {muteOriginal ? 'Original camera audio muted' : 'Original camera audio active'}
              </span>
            </div>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                muteOriginal ? 'bg-white/10 text-white/70' : 'bg-primary/20 text-primary'
              }`}
            >
              {muteOriginal ? 'Unmute' : 'Mute'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export default MusicTrimmer;
