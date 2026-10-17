import React from 'react';
import { Play, Pause, SkipForward, SkipBack, X, Music2 } from 'lucide-react';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { formatMusicDuration } from '@/services/music';
import { useNavigate, useLocation } from 'react-router-dom';

export const GlobalAudioPlayerBar: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    playNext,
    playPrevious,
    stop,
    seek,
  } = useAudioPlayer();

  const navigate = useNavigate();
  const location = useLocation();

  if (!currentTrack) return null;

  // Don't obscure full screen modal or song trimmer if trimmer is active
  const isTrimmerActive = location.pathname.includes('/trim');
  if (isTrimmerActive) return null;

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seek(ratio * duration);
  };

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-[60] animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="relative overflow-hidden rounded-2xl bg-[#0f0e1a]/95 backdrop-blur-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.85),0_0_15px_rgba(124,77,255,0.25)] text-white">
        {/* Interactive Top Progress Bar */}
        <div
          onClick={handleProgressBarClick}
          className="relative h-1 w-full bg-white/10 cursor-pointer group"
          title="Click to seek"
        >
          <div
            className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500 transition-all duration-150 relative"
            style={{ width: `${progressPct}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          {/* Album artwork + Track info */}
          <div
            onClick={() => {
              if (currentTrack?.id && !currentTrack.id.startsWith('custom_')) {
                navigate(`/song/${currentTrack.id}`);
              }
            }}
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer active:opacity-85"
            title="Open song page"
          >
            <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/20 shadow-md">
              {currentTrack.artwork ? (
                <img
                  src={currentTrack.artwork}
                  alt={currentTrack.title}
                  className={`w-full h-full object-cover ${isPlaying ? 'scale-105' : 'scale-100'} transition-transform duration-500`}
                />
              ) : (
                <div className="w-full h-full bg-purple-600/30 flex items-center justify-center">
                  <Music2 className="w-5 h-5 text-white/80" />
                </div>
              )}
              {isPlaying && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center gap-[2px]">
                  <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" />
                  <span className="w-0.5 h-4 bg-white rounded-full animate-pulse delay-75" />
                  <span className="w-0.5 h-2 bg-white rounded-full animate-pulse delay-150" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate leading-tight">
                {currentTrack.title}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-white/70">
                <span className="truncate max-w-[130px]">{currentTrack.artist}</span>
                <span>•</span>
                <span className="font-mono text-[10px] text-white/60">
                  {formatMusicDuration(currentTime * 1000)} / {formatMusicDuration((duration || 30) * 1000)}
                </span>
              </div>
            </div>
          </div>

          {/* Controls: Prev, Play/Pause, Next, Close */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                playPrevious();
              }}
              className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              aria-label="Previous song"
              title="Previous song"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 active:scale-95 shadow-md transition-all"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                playNext();
              }}
              className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              aria-label="Next song"
              title="Next song"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stop();
              }}
              className="p-1.5 ml-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              aria-label="Stop and close music"
              title="Stop and close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalAudioPlayerBar;
