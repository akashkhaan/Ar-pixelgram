import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowLeft, Bookmark, Check, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EFFECTS, renderEffect, searchEffects, type CameraEffect, type EffectCategory } from '@/pages/reels/cameraEffects';
import './camera-effects.css';

export function EffectThumbnail({ effect, video }: { effect: CameraEffect; video: RefObject<HTMLVideoElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const context = canvas.current?.getContext('2d');
      const source = video.current;
      if (context && source && source.readyState >= 2) renderEffect(context, source, source.videoWidth, source.videoHeight, effect, performance.now(), true);
    };
    draw(); const interval = setInterval(draw, 700);
    return () => clearInterval(interval);
  }, [effect, video]);
  return <canvas ref={canvas} width={120} height={150} className="effect-thumbnail" aria-hidden="true" />;
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