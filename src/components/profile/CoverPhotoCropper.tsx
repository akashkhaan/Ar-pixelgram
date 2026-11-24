import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, RotateCcw, ZoomIn } from 'lucide-react';

interface Props {
  file: File;
  onCancel: () => void;
  onDone: (file: File, previewUrl: string) => void;
  /** width:height — cover ke liye 2:1 (profile page ke cover area jaisa) */
  aspect?: number;
  /** Export ki width (px). Height = width / aspect */
  outWidth?: number;
  title?: string;
}

/**
 * Cover photo adjuster — photo pick karne ke baad seedha upload nahi hoti.
 * User drag karke (idhar-udhar) aur zoom karke set karta hai, phir "Set karo".
 * Export: JPEG (wide), aspect 2:1 default.
 */
const CoverPhotoCropper: React.FC<Props> = ({
  file,
  onCancel,
  onDone,
  aspect = 2,
  outWidth = 1440,
  title = 'Cover photo set karo',
}) => {
  const MAX_W = 340;
  const MAX_H = 230;
  // crop box screen size — jitni jagah mile usi ke hisaab se
  const [box, setBox] = useState({ w: 320, h: 160 });
  const [src, setSrc] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Box ko screen ke hisaab se fit karo (chhoti screen par bhi poora dikhe)
  useEffect(() => {
    const fit = () => {
      const availW = Math.min(MAX_W, window.innerWidth - 48);
      const availH = Math.min(MAX_H, Math.round(window.innerHeight * 0.42));
      let w = availW;
      let h = Math.round(w / aspect);
      if (h > availH) {
        h = availH;
        w = Math.round(h * aspect);
      }
      setBox({ w: Math.max(160, w), h: Math.max(80, h) });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [aspect]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // base scale = "cover" (photo crop box ko poora bhare)
  const baseScale = img ? Math.max(box.w / img.width, box.h / img.height) : 1;
  const scale = baseScale * zoom;

  const clamp = useCallback((next: { x: number; y: number }) => {
    if (!img) return next;
    const maxX = Math.max(0, (img.width * scale - box.w) / 2);
    const maxY = Math.max(0, (img.height * scale - box.h) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, [img, scale, box.w, box.h]);

  useEffect(() => { setOffset(o => clamp(o)); }, [clamp]);

  const start = (x: number, y: number) => { dragRef.current = { x, y, ox: offset.x, oy: offset.y }; };
  const move = (x: number, y: number) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (x - d.x), y: d.oy + (y - d.y) }));
  };
  const end = () => { dragRef.current = null; };

  const reset = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  const handleDone = async () => {
    if (!img) return;
    setSaving(true);
    try {
      const OUT_W = outWidth;
      const OUT_H = Math.round(OUT_W / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_unavailable');

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';

      const ratio = OUT_W / box.w;
      const drawW = img.width * scale * ratio;
      const drawH = img.height * scale * ratio;
      ctx.drawImage(
        img,
        OUT_W / 2 - drawW / 2 + offset.x * ratio,
        OUT_H / 2 - drawH / 2 + offset.y * ratio,
        drawW,
        drawH,
      );

      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('crop_failed'))), 'image/jpeg', 0.9),
      );
      const cropped = new File([blob], `cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onDone(cropped, canvas.toDataURL('image/jpeg', 0.85));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/80 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <p className="text-sm font-bold text-white">{title}</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-white/80 hover:text-white px-2 py-1"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        {/* Crop area */}
        <div
          className="relative overflow-hidden rounded-xl bg-black touch-none select-none cursor-grab active:cursor-grabbing ring-1 ring-white/25 shadow-2xl"
          style={{ width: box.w, height: box.h }}
          onMouseDown={e => start(e.clientX, e.clientY)}
          onMouseMove={e => move(e.clientX, e.clientY)}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={e => start(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }}
          onTouchEnd={end}
        >
          {src && img && (
            <img
              src={src}
              alt="Selected cover"
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
              style={{
                width: img.width * scale,
                height: img.height * scale,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
          {/* Thirds grid */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
          </div>
        </div>

        <p className="text-center text-[11px] text-white/70">
          Photo ko ungli se idhar-udhar kheench kar set karo · zoom se chhota/bada karo
        </p>

        {/* Zoom */}
        <div className="flex w-full max-w-[340px] items-center gap-3">
          <ZoomIn className="h-4 w-4 shrink-0 text-white/70" />
          <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={v => setZoom(v[0])} />
          <button
            type="button"
            onClick={reset}
            className="shrink-0 rounded-full p-1.5 text-white/70 hover:text-white"
            aria-label="Reset"
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex gap-3 px-4 pt-3"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 flex-1 font-semibold"
          onClick={handleDone}
          disabled={!img || saving}
        >
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Set karo'}
        </Button>
      </div>
    </div>
  );
};

export default CoverPhotoCropper;
