import React, { useState, useRef, useEffect } from 'react';
import { Maximize2, Phone, PhoneOff, Video, Mic, MicOff } from 'lucide-react';

interface MessengerCallBubbleProps {
  avatarUrl?: string | null;
  title: string;
  kind: 'audio' | 'video';
  elapsedSeconds: number;
  videoStream?: MediaStream | null;
  muted?: boolean;
  onToggleMute?: () => void;
  onMaximize: () => void;
  onEndCall: () => void;
}

const CARD_WIDTH = 232;
const CARD_HEIGHT = 68;

function initials(name: string) {
  return (name || 'G')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export const MessengerCallBubble: React.FC<MessengerCallBubbleProps> = ({
  avatarUrl,
  title,
  kind,
  elapsedSeconds,
  videoStream,
  muted,
  onToggleMute,
  onMaximize,
  onEndCall,
}) => {
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(12, window.innerWidth - CARD_WIDTH - 14) : 120,
    y: typeof window !== 'undefined' ? Math.max(90, window.innerHeight - 170) : 320,
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [isOverDismiss, setIsOverDismiss] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0, moved: false });

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  useEffect(() => {
    const handleResize = () => {
      const maxX = Math.max(12, window.innerWidth - CARD_WIDTH - 12);
      setPos(previous => ({
        x: previous.x < window.innerWidth / 2 ? 12 : maxX,
        y: Math.min(Math.max(56, previous.y), Math.max(56, window.innerHeight - CARD_HEIGHT - 72)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStartRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      initialX: pos.x,
      initialY: pos.y,
      moved: false,
    };
    setIsDragging(true);
    setSnapping(false);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const { startX, startY, initialX, initialY } = dragStartRef.current;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > 6) dragStartRef.current.moved = true;

    const maxX = Math.max(12, window.innerWidth - CARD_WIDTH - 12);
    const maxY = Math.max(56, window.innerHeight - CARD_HEIGHT - 72);
    const nextX = Math.min(Math.max(12, initialX + dx), maxX);
    const nextY = Math.min(Math.max(56, initialY + dy), maxY);
    setPos({ x: nextX, y: nextY });

    const endX = window.innerWidth / 2;
    const endY = window.innerHeight - 58;
    const distance = Math.hypot(nextX + CARD_WIDTH / 2 - endX, nextY + CARD_HEIGHT / 2 - endY);
    setIsOverDismiss(distance < 74);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}

    if (!dragStartRef.current.moved) {
      onMaximize();
      return;
    }
    if (isOverDismiss) {
      onEndCall();
      return;
    }

    setSnapping(true);
    const targetX = pos.x < window.innerWidth / 2
      ? 12
      : Math.max(12, window.innerWidth - CARD_WIDTH - 12);
    setPos(previous => ({ ...previous, x: targetX }));
  };

  const stopDrag = (event: React.PointerEvent) => event.stopPropagation();
  const runControl = (event: React.MouseEvent, action?: () => void) => {
    event.stopPropagation();
    action?.();
  };

  return (
    <>
      <div
        className={`fixed bottom-6 left-1/2 z-[9998] flex -translate-x-1/2 flex-col items-center gap-1.5 transition-all duration-200 pointer-events-none ${isDragging ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-75 translate-y-6'}`}
      >
        <div className={`flex h-16 w-16 items-center justify-center rounded-full border-2 shadow-2xl transition-all ${isOverDismiss ? 'scale-125 bg-red-600 border-white ring-4 ring-red-500/50' : 'bg-neutral-900/90 border-red-500/80 text-red-400'}`}>
          <PhoneOff className="h-7 w-7 text-white animate-pulse" />
        </div>
        <span className="rounded-full bg-black/75 px-3 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur-md">
          {isOverDismiss ? 'Release to end call' : 'Drag here to end'}
        </span>
      </div>

      <div
        style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`fixed left-0 top-0 z-[9999] select-none ${snapping ? 'transition-transform duration-300 ease-out' : ''}`}
      >
        <div className={`flex h-[68px] w-[232px] items-center gap-2 rounded-full border border-emerald-200/40 bg-emerald-500/95 px-2.5 text-white shadow-2xl shadow-emerald-950/40 backdrop-blur-md ${isOverDismiss ? 'ring-4 ring-red-500/70' : ''}`}>
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-white/80 bg-neutral-900 shadow-md">
            {kind === 'video' && videoStream ? (
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            ) : avatarUrl ? (
              <img src={avatarUrl} alt={title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-700 to-teal-900 text-sm font-bold">
                {initials(title)}
              </div>
            )}
            <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 ring-2 ring-emerald-400">
              {kind === 'video' ? <Video className="h-2.5 w-2.5" /> : <Phone className="h-2.5 w-2.5" />}
            </span>
          </div>

          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-bold" title={title}>{title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-50/95">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white animate-pulse" />
              {kind === 'video' ? 'Video call' : 'Audio call'} · {formatDuration(elapsedSeconds)}
            </p>
          </div>

          <button type="button" aria-label="Return to call" title="Return to call" onPointerDown={stopDrag} onClick={event => runControl(event, onMaximize)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/20 active:scale-90">
            <Maximize2 className="h-4 w-4" />
          </button>
          <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} onPointerDown={stopDrag} onClick={event => runControl(event, onToggleMute)} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full active:scale-90 ${muted ? 'bg-red-600/90' : 'hover:bg-white/20'}`}>
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </>
  );
};
