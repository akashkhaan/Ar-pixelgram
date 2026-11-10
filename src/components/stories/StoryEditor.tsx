import type React from 'react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Loader2, Music2, Pencil, Trash2, X } from 'lucide-react';
import type { MusicTrack } from '@/services/music';
import {
  STORY_FONTS,
  STORY_TEXT_COLORS,
  type StoryFontId,
  type StoryTextOverlay,
  storyTextStyle,
} from '@/lib/storyText';

interface StoryEditorProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  track: MusicTrack | null;
  uploading: boolean;
  onClose: () => void;
  onOpenMusic: () => void;
  onCutMusic: () => void;
  onShare: (overlays: StoryTextOverlay[]) => void;
}

interface Draft {
  id: string | null;
  text: string;
  font: StoryFontId;
  color: string;
  size: number;
}

const NEW_DRAFT: Draft = { id: null, text: '', font: 'classic', color: '#ffffff', size: 8 };

/** Full-screen Instagram-style story composer: media, text stickers and music. */
const StoryEditor: React.FC<StoryEditorProps> = ({
  mediaUrl,
  mediaType,
  track,
  uploading,
  onClose,
  onOpenMusic,
  onCutMusic,
  onShare,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [overlays, setOverlays] = useState<StoryTextOverlay[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean; startX: number; startY: number } | null>(null);

  const openText = (o?: StoryTextOverlay) => {
    setDraft(o ? { id: o.id, text: o.text, font: o.font, color: o.color, size: o.size } : { ...NEW_DRAFT });
  };

  const saveDraft = () => {
    if (!draft) return;
    const text = draft.text.trim();
    setOverlays(list => {
      if (draft.id) {
        return text
          ? list.map(o => (o.id === draft.id ? { ...o, text, font: draft.font, color: draft.color, size: draft.size } : o))
          : list.filter(o => o.id !== draft.id);
      }
      if (!text) return list;
      return [...list, { id: `t${Date.now()}`, text, font: draft.font, color: draft.color, size: draft.size, x: 50, y: 45 }];
    });
    setDraft(null);
  };

  const deleteDraft = () => {
    if (draft?.id) setOverlays(list => list.filter(o => o.id !== draft.id));
    setDraft(null);
  };

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id, moved: false, startX: e.clientX, startY: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    drag.moved = true;
    const rect = frame.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(95, Math.max(5, ((e.clientY - rect.top) / rect.height) * 100));
    setOverlays(list => list.map(o => (o.id === drag.id ? { ...o, x, y } : o)));
  };

  const onPointerUp = (o: StoryTextOverlay) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) openText(o);
  };

  const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm active:scale-90 transition-transform';

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black select-none" style={{ height: '100dvh' }}>
      <div ref={frameRef} className="absolute inset-0 overflow-hidden" style={{ containerType: 'inline-size' }}>
        {mediaType === 'video' ? (
          <video src={mediaUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
        ) : (
          <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {overlays.map(o => (
          <div
            key={o.id}
            role="button"
            tabIndex={0}
            className="absolute cursor-move touch-none"
            style={{ left: `${o.x}%`, top: `${o.y}%`, transform: 'translate(-50%, -50%)', width: 'max-content', maxWidth: '90cqw', textAlign: 'center' }}
            onPointerDown={e => onPointerDown(e, o.id)}
            onPointerMove={onPointerMove}
            onPointerUp={() => onPointerUp(o)}
          >
            <span style={storyTextStyle(o)}>{o.text}</span>
          </div>
        ))}
      </div>

      {/* Top bar: close on the left, text + music on the right */}
      {!draft && (
        <div
          className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
        >
          <button type="button" aria-label="Close" onClick={onClose} className={iconBtn}>
            <X className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Add text"
              onClick={() => openText()}
              className="flex h-10 items-center justify-center rounded-lg border-2 border-white bg-black/35 px-2.5 text-base font-bold text-white backdrop-blur-sm active:scale-90 transition-transform"
            >
              Aa
            </button>
            <button type="button" aria-label="Add music" onClick={onOpenMusic} className={iconBtn}>
              <Music2 className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom: selected song + share */}
      {!draft && (
        <div
          className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-3 px-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)' }}
        >
          <div className="min-w-0 flex-1">
            {track && (
              <button
                type="button"
                onClick={onCutMusic}
                className="flex max-w-full items-center gap-2 rounded-full bg-black/45 py-1.5 pl-1.5 pr-3 text-white backdrop-blur-sm"
              >
                {track.artwork ? (
                  <img src={track.artwork} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                ) : (
                  <Music2 className="h-5 w-5 shrink-0" />
                )}
                <span className="truncate text-xs font-semibold">{track.title} · {track.artist}</span>
                <Pencil className="h-3.5 w-3.5 shrink-0 opacity-80" />
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => onShare(overlays)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-black shadow-lg active:scale-95 transition-transform disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Your story
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Text editing mode */}
      {draft && (
        <div className="absolute inset-0 z-20 flex flex-col bg-black/60" style={{ containerType: 'inline-size' }}>
          <div
            className="flex items-center justify-between px-4"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
          >
            {draft.id ? (
              <button type="button" aria-label="Delete text" onClick={deleteDraft} className={iconBtn}>
                <Trash2 className="h-5 w-5" />
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={saveDraft} className="rounded-full px-3 py-1.5 text-base font-bold text-white">
              Done
            </button>
          </div>

          <div className="flex flex-1 items-center gap-2 px-3">
            <input
              type="range"
              min={4}
              max={16}
              step={0.5}
              value={draft.size}
              onChange={e => setDraft({ ...draft, size: Number(e.target.value) })}
              aria-label="Text size"
              className="h-40 w-6 shrink-0 accent-white"
              style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            />
            <div className="flex flex-1 justify-center">
              <textarea
                autoFocus
                value={draft.text}
                onChange={e => setDraft({ ...draft, text: e.target.value })}
                placeholder="Type..."
                rows={3}
                maxLength={200}
                className="w-full resize-none border-0 bg-transparent outline-none placeholder:text-white/50"
                style={{ ...storyTextStyle(draft), background: 'transparent', padding: 0 }}
              />
            </div>
          </div>

          <div className="space-y-3 px-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
            <div className="flex justify-center gap-2.5">
              {STORY_TEXT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setDraft({ ...draft, color: c })}
                  className={`h-7 w-7 rounded-full border-2 ${draft.color === c ? 'border-white scale-110' : 'border-white/40'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {STORY_FONTS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, font: f.id })}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${draft.font === f.id ? 'bg-white text-black' : 'bg-white/15 text-white'}`}
                  style={{ fontFamily: storyTextStyle({ font: f.id, color: '#fff', size: 4 }).fontFamily }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};

export default StoryEditor;
