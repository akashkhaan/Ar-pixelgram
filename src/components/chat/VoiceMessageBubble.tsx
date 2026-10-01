import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceMessageBubbleProps {
  audioUrl: string;
  durationText?: string;
  isMe: boolean;
  className?: string;
}

export const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({
  audioUrl,
  durationText,
  isMe,
  className,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => console.error('Audio play failed:', err));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = percent * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const formatSecs = (secs: number) => {
    if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Waveform bars representation
  const barHeights = [25, 45, 75, 55, 90, 65, 40, 85, 100, 70, 50, 80, 95, 60, 45, 70, 40, 30];

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 py-1 px-1 min-w-[210px] sm:min-w-[240px]',
        className
      )}
    >
      {/* Play/Pause Circle Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90 shadow-sm',
          isMe
            ? 'bg-white text-[#0084FF] hover:bg-white/90'
            : 'bg-[#0084FF] text-white hover:bg-[#0084FF]/90'
        )}
        aria-label={isPlaying ? 'Pause' : 'Play voice message'}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform & Scrubber */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <div
          onClick={handleSeek}
          className="h-7 flex items-center gap-[3px] cursor-pointer py-1"
          title="Click to seek"
        >
          {barHeights.map((h, i) => {
            const barProgress = (i / barHeights.length) * 100;
            const isPlayed = barProgress <= progress;
            return (
              <span
                key={i}
                style={{ height: `${h}%` }}
                className={cn(
                  'w-[3px] rounded-full transition-colors duration-100',
                  isMe
                    ? isPlayed
                      ? 'bg-white'
                      : 'bg-white/40'
                    : isPlayed
                    ? 'bg-[#0084FF]'
                    : 'bg-muted-foreground/35'
                )}
              />
            );
          })}
        </div>

        {/* Time info */}
        <div
          className={cn(
            'flex items-center justify-between text-[10px] font-medium leading-none px-0.5',
            isMe ? 'text-white/80' : 'text-muted-foreground'
          )}
        >
          <span>{isPlaying || currentTime > 0 ? formatSecs(currentTime) : (durationText || 'Voice')}</span>
          <span>{duration > 0 ? formatSecs(duration) : (durationText || '')}</span>
        </div>
      </div>
    </div>
  );
};
