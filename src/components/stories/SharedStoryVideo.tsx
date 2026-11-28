import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Volume2, VolumeX } from 'lucide-react';

interface SharedStoryVideoProps {
  src: string;
  poster?: string | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onLoadedMetadata?: (durationMs: number) => void;
  onEnded?: () => void;
}

/** Autoplaying original reel/video inside the shared-story card. */
export default function SharedStoryVideo({
  src,
  poster,
  videoRef: externalRef,
  onLoadedMetadata,
  onEnded,
}: SharedStoryVideoProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef || internalRef;
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setPaused(false);
    video.play().catch(() => {
      // Browsers that block audible autoplay can still show the moving reel.
      setMuted(true);
      video.muted = true;
      video.play().catch(() => setPaused(true));
    });
  }, [src, videoRef]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
        preload="auto"
        muted={muted}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onLoadedMetadata={(event) => onLoadedMetadata?.((event.currentTarget.duration || 0) * 1000)}
        onEnded={onEnded}
      />
      <div className="absolute right-2 top-2 z-10 flex gap-1.5" onClick={(event) => event.stopPropagation()}>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-8 w-8 rounded-full bg-black/55 text-white hover:bg-black/75"
          aria-label={paused ? 'Play shared video' : 'Pause shared video'}
          onClick={togglePlayback}
        >
          {paused ? <Play className="h-4 w-4" /> : <span className="text-[11px] font-bold">II</span>}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-8 w-8 rounded-full bg-black/55 text-white hover:bg-black/75"
          aria-label={muted ? 'Unmute shared video' : 'Mute shared video'}
          onClick={() => setMuted((value) => !value)}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
