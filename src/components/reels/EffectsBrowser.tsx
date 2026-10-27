import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowLeft, Bookmark, Check, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EFFECTS, renderEffect, searchEffects, type CameraEffect, type EffectCategory } from '@/pages/reels/cameraEffects';
import './camera-effects.css';

export function EffectThumbnail({ effect }: { effect: CameraEffect; video?: RefObject<HTMLVideoElement | null> }) {
  if (effect.id === "none") {
    return (
      <div className="w-full h-full rounded-full flex items-center justify-center bg-white/20 text-white font-bold text-[10px]">
        OFF
      </div>
    );
  }
  return (
    <div
      className="w-full h-full rounded-full flex flex-col items-center justify-center text-center p-1"
      style={{
        background: effect.overlay === "vignette"
          ? "radial-gradient(circle, #38bdf8 20%, #0f172a 90%)"
          : effect.overlay === "flare"
          ? "linear-gradient(135deg, #f472b6, #fbbf24)"
          : effect.overlay === "film"
          ? "linear-gradient(135deg, #fdba74, #78716c)"
          : effect.overlay === "glitter"
          ? "radial-gradient(circle, #e879f9, #4c1d95)"
          : effect.overlay === "hearts"
          ? "linear-gradient(135deg, #f43f5e, #fb7185)"
          : "linear-gradient(135deg, #818cf8, #c084fc)",
      }}
    >
      <span className="text-[9px] font-black leading-none text-white drop-shadow truncate max-w-full">
        {effect.name.slice(0, 7)}
      </span>
    </div>
  );
}

interface Props {
  open: boolean;
  searchInitially: boolean;
  onClose: () => void;
  onSelect: (effect: CameraEffect) => void;
  selected: CameraEffect;
  video: RefObject<HTMLVideoElement | null>;
  saved: string[];
  onSave: (id: string) => void;
}

export function EffectsBrowser({ open, searchInitially, onClose, onSelect, selected, video, saved, onSave }: Props) {
  const [search, setSearch] = useState(searchInitially);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EffectCategory>('trending');
  const [onlySaved, setOnlySaved] = useState(false);
  useEffect(() => { if (open) { setSearch(searchInitially); setQuery(''); } }, [open, searchInitially]);
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose]);
  if (!open) return null;
  const results = searchEffects(query, search || onlySaved ? undefined : category, onlySaved ? saved : undefined);
  return <div className="effects-browser-backdrop">
    <Button className="effects-dismiss" variant="ghost" aria-label="Close effects" onClick={onClose} />
    <section className={`effects-browser ${search ? 'effects-browser-search' : ''}`} role="dialog" aria-modal="true" aria-label={search ? 'Search effects' : 'Browse effects'}>
      <div className="effects-handle" />
      {search ? <div className="effects-search-header">
        <Button variant="ghost" size="icon" aria-label="Back to effects" onClick={() => { setSearch(false); setQuery(''); }}><ArrowLeft /></Button>
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search effects" aria-label="Search effects" />
        {query && <Button variant="ghost" size="icon" aria-label="Clear search" onClick={() => setQuery('')}><X /></Button>}
        <Button variant="ghost" size="icon" aria-label="Close effects" onClick={onClose}><X /></Button>
      </div> : <div className="effects-tabs">
        <Button variant="ghost" size="icon" aria-label="Search effects" onClick={() => { setSearch(true); setOnlySaved(false); }}><Search /></Button>
        <Button variant="ghost" size="icon" aria-label="Saved effects" aria-pressed={onlySaved} onClick={() => setOnlySaved((v) => !v)}><Bookmark fill={onlySaved ? 'currentColor' : 'none'} /></Button>
        <Sparkles className="effects-small-icon" />
        {(['trending', 'appearance', 'aesthetic'] as const).map((tab) => <Button key={tab} variant="ghost" className="effects-tab" aria-pressed={!onlySaved && category === tab} onClick={() => { setOnlySaved(false); setCategory(tab); }}>{tab}</Button>)}
        <Button variant="ghost" size="icon" aria-label="Close effects" onClick={onClose}><X /></Button>
      </div>}
      <div className="effects-results">
        {results.length === 0 ? <p className="effects-empty">{onlySaved ? 'No saved effects' : 'No effects found'}</p> : <div className="effects-grid">
          {results.map((effect) => <div key={effect.id} className="effect-tile">
            <Button variant="ghost" className="effect-pick" aria-label={`Apply ${effect.name}`} aria-pressed={selected.id === effect.id} onClick={() => onSelect(effect)}>
              <EffectThumbnail effect={effect} video={video} />
              {selected.id === effect.id && <Check className="effect-check" />}
              <span>{effect.name}</span>
            </Button>
            <Button variant="ghost" size="icon" className="effect-save" aria-label={`${saved.includes(effect.id) ? 'Unsave' : 'Save'} ${effect.name}`} onClick={() => onSave(effect.id)}><Bookmark fill={saved.includes(effect.id) ? 'currentColor' : 'none'} /></Button>
          </div>)}
        </div>}
      </div>
    </section>
  </div>;
}

export function EffectsCarousel({ selected, onSelect, onBrowse, onSave, saved, video }: Omit<Props, 'open' | 'searchInitially' | 'onClose'> & { onBrowse: () => void }) {
  return <div className="camera-effects-controls">
    <div className="effects-carousel" aria-label="Camera effects">
      {EFFECTS.map((effect) => <Button key={effect.id} variant="ghost" aria-label={`Apply ${effect.name}`} aria-pressed={selected.id === effect.id} className="effect-lens" onClick={(e) => { onSelect(effect); e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }}><EffectThumbnail effect={effect} video={video} /></Button>)}
      <Button variant="ghost" aria-label="Browse effects" className="effect-lens effect-browse" onClick={onBrowse}><Sparkles /></Button>
    </div>
    <div className="selected-effect-name">
      <Button variant="ghost" size="icon" aria-label={`${saved.includes(selected.id) ? 'Unsave' : 'Save'} selected effect`} onClick={() => onSave(selected.id)}><Bookmark fill={saved.includes(selected.id) ? 'currentColor' : 'none'} /></Button>
      <span>{selected.name}</span>
      <Button variant="ghost" size="icon" aria-label="Remove effect" onClick={() => { const normal = EFFECTS.find((e) => e.id === 'none'); if (normal) onSelect(normal); }}><X /></Button>
    </div>
  </div>;
}