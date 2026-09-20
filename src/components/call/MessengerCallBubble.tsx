import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, Video, PhoneOff, Mic, MicOff } from 'lucide-react';

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

function initials(name: string) {
  return (name || 'G')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('');
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
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
    x: typeof window !== 'undefined' ? window.innerWidth - 78 : 280,
    y: typeof window !== 'undefined' ? Math.max(120, window.innerHeight - 240) : 320,
  }));

  const [isDragging, setIsDragging] = useState(false);
  const [isOverDismiss, setIsOverDismiss] = useState(false);
  const [snapping, setSnapping] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number; moved: boolean }>({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    moved: false,
  });

  // Attach video stream if video call
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  // Adjust position if window resizes
  useEffect(() => {
    const handleResize = () => {
      setPos(prev => ({
        x: prev.x < window.innerWidth / 2 ? 14 : window.innerWidth - 78,
        y: Math.min(Math.max(60, prev.y), window.innerHeight - 120),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only primary button
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y,
      moved: false,
    };
    setIsDragging(true);
    setSnapping(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const { startX, startY, initialX, initialY } = dragStartRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.hypot(dx, dy) > 6) {
      dragStartRef.current.moved = true;
    }

    const maxX = window.innerWidth - 78;
    const maxY = window.innerHeight - 100;
    const nextX = Math.min(Math.max(10, initialX + dx), maxX);
    const nextY = Math.min(Math.max(50, initialY + dy), maxY);

    setPos({ x: nextX, y: nextY });

    // Check if over bottom "✕ End Call" target
    const dismissTargetY = window.innerHeight - 90;
    const dismissTargetX = window.innerWidth / 2;
    const distToDismiss = Math.hypot(nextX + 32 - dismissTargetX, nextY + 32 - dismissTargetY);
    setIsOverDismiss(distToDismiss < 65);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}

    // Tap/Click detection
    if (!dragStartRef.current.moved) {
      onMaximize();
      return;
    }

    // Dropped into bottom "End call" zone
    if (isOverDismiss) {
      onEndCall();
      return;
    }

    // Snap to nearest screen edge (left or right)
    setSnapping(true);
    const targetX = pos.x < window.innerWidth / 2 ? 14 : window.innerWidth - 78;
    setPos(prev => ({ ...prev, x: targetX }));
  };

  return (
    <>
      {/* Messenger Bottom Drop Target: "Drag here to end call" */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] flex flex-col items-center gap-1.5 transition-all duration-200 pointer-events-none ${
          isDragging ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-75 translate-y-6 pointer-events-none'
        }`}
      >
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all duration-200 shadow-2xl ${
            isOverDismiss
              ? 'bg-red-600 border-white scale-125 ring-4 ring-red-500/50 shadow-red-600/50'
              : 'bg-neutral-900/90 border-red-500/80 backdrop-blur-md scale-100 text-red-400'
          }`}
        >
          <PhoneOff className="h-7 w-7 text-white animate-pulse" />
        </div>
        <span className="rounded-full bg-black/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md shadow-md">
          {isOverDismiss ? 'Release to end call' : 'Drag here to end'}
        </span>
      </div>

      {/* Floating Draggable Messenger Call Head */}
      <div
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`fixed top-0 left-0 z-[9999] flex flex-col items-center select-none cursor-grab active:cursor-grabbing ${
          snapping ? 'transition-transform duration-300 ease-out' : ''
        }`}
      >
        {/* Circular Avatar / Live PIP */}
        <div
          className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 text-white shadow-2xl border-2 transition-transform active:scale-95 ${
            isOverDismiss
              ? 'border-red-500 ring-4 ring-red-500/50'
              : 'border-emerald-400/90 ring-4 ring-emerald-500/30 shadow-emerald-900/40'
          }`}
        >
          {/* Pulsing radar ring */}
          {!isOverDismiss && (
            <span className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping pointer-events-none" />
          )}

          {/* Inner media */}
          <div className="relative h-full w-full rounded-full overflow-hidden flex items-center justify-center bg-neutral-950">
            {kind === 'video' && videoStream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : avatarUrl ? (
              <img
                src={avatarUrl}
                alt={title}
                className="h-full w-full object-cover pointer-events-none"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-800 text-base font-bold text-white">
                {initials(title)}
              </div>
            )}
          </div>

          {/* Messenger Call Status Badge (Bottom-Right) */}
          <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-neutral-900 shadow-md">
            {kind === 'video' ? (
              <Video className="h-2.5 w-2.5" />
            ) : (
              <Phone className="h-2.5 w-2.5" />
            )}
          </div>

          {/* Muted Mic indicator if muted */}
          {muted && (
            <div className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white ring-2 ring-neutral-900 shadow-md">
              <MicOff className="h-2.5 w-2.5" />
            </div>
          )}
        </div>

        {/* Elapsed Time Pill attached to bubble */}
        <div className="mt-1 flex items-center gap-1 rounded-full bg-black/85 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-white/15 shadow-md backdrop-blur-md pointer-events-none">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{formatDuration(elapsedSeconds)}</span>
        </div>
      </div>
    </>
  );
};
