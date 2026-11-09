import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface PhotoViewerProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

type Pt = { x: number; y: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Instagram jaisa full screen photo: pinch se zoom, double tap se zoom,
 * zoom par khiska sakte ho, neeche swipe / X / phone ka back = band.
 */
const PhotoViewer: React.FC<PhotoViewerProps> = ({ open, src, alt, onClose }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Pt>({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [animating, setAnimating] = useState(false);

  const pointers = useRef(new Map<number, Pt>());
  const pinchStart = useRef<{ d: number; scale: number } | null>(null);
  const panStart = useRef<{ p: Pt; offset: Pt } | null>(null);
  const lastTap = useRef(0);
  const closedByPop = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Phone ka back button viewer band kare (page na badle)
  useEffect(() => {
    if (!open) return;
    closedByPop.current = false;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragY(0);
    window.history.pushState({ ...(window.history.state || {}), pgPhotoViewer: true }, '');
    const onPop = () => {
      closedByPop.current = true;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // X / swipe se band hua to jo history entry daali thi use hata do
      if (!closedByPop.current && window.history.state?.pgPhotoViewer) {
        window.history.back();
      }
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const clampOffset = (o: Pt, s: number): Pt => {
    const maxX = ((s - 1) * window.innerWidth) / 2;
    const maxY = ((s - 1) * window.innerHeight) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, o.x)),
      y: Math.max(-maxY, Math.min(maxY, o.y)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimating(false);
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      pinchStart.current = { d: dist(pts[0], pts[1]), scale };
      panStart.current = null;
    } else if (pts.length === 1) {
      panStart.current = { p: pts[0], offset };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && pinchStart.current) {
      const next = Math.max(MIN_SCALE * 0.8, Math.min(MAX_SCALE, (pinchStart.current.scale * dist(pts[0], pts[1])) / pinchStart.current.d));
      setScale(next);
      setOffset((o) => clampOffset(o, Math.max(1, next)));
    } else if (pts.length === 1 && panStart.current) {
      const dx = pts[0].x - panStart.current.p.x;
      const dy = pts[0].y - panStart.current.p.y;
      if (scale > 1.01) {
        setOffset(clampOffset({ x: panStart.current.offset.x + dx, y: panStart.current.offset.y + dy }, scale));
      } else {
        setDragY(dy);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1;
    const start = panStart.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 1) {
      const p = [...pointers.current.values()][0];
      panStart.current = { p, offset };
      return;
    }
    panStart.current = null;
    setAnimating(true);

    if (scale < 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    }

    if (wasSingle && scale <= 1.01) {
      if (Math.abs(dragY) > 120) {
        onClose();
        return;
      }
      setDragY(0);
    }

    // Double tap: zoom in / out
    const moved = start ? Math.hypot(e.clientX - start.p.x, e.clientY - start.p.y) : 0;
    if (wasSingle && moved < 10) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        if (scale > 1.01) {
          setScale(1);
          setOffset({ x: 0, y: 0 });
        } else {
          setScale(2.5);
          setOffset(clampOffset({
            x: (window.innerWidth / 2 - e.clientX) * 1.5,
            y: (window.innerHeight / 2 - e.clientY) * 1.5,
          }, 2.5));
        }
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const bgOpacity = Math.max(0.35, 1 - Math.abs(dragY) / 400);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center select-none"
      style={{ backgroundColor: `rgba(0,0,0,${bgOpacity})`, touchAction: 'none' }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-95"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        aria-label="Close photo"
      >
        <X className="w-6 h-6" />
      </button>
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt || 'Photo'}
          draggable={false}
          className="max-w-full max-h-full object-contain pointer-events-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y + dragY}px) scale(${scale})`,
            transition: animating ? 'transform 200ms ease-out' : 'none',
          }}
        />
      </div>
    </div>,
    document.body,
  );
};

export default PhotoViewer;
