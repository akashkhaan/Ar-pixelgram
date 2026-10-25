import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Story } from '@/types/types';
import type { StoryViewer } from '@/services/api';
import './storyViewers.css';

export type ViewerFilter = 'all' | 'liked' | 'nolike';

const GR: [string, string][] = [
  ['#7b5cff', '#ff4d8d'], ['#00c6ff', '#0072ff'], ['#f7971e', '#ff3b5c'],
  ['#11998e', '#38ef7d'], ['#b24592', '#f15f79'], ['#4776e6', '#8e54e9'],
];
const gradFor = (u: string) => { let h = 0; for (const c of u) h = (h * 31 + c.charCodeAt(0)) % GR.length; return GR[h]; };
const ini = (n: string) => n.split(/[ ._]/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'abhi';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const isVideo = (s: Story) =>
  (s as Story & { media_type?: string }).media_type === 'video' || !!s.image_url?.match(/\.(mp4|mov|webm|avi)(\?|$)/i);

export const EyeIcon = () => (<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
export const HeartIcon = ({ className }: { className?: string }) => (<svg className={className} viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>);
const PplIcon = () => (<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.4 0 4.2 1.8 4.2 4" /></svg>);

interface Props {
  open: boolean;
  stories: Story[];
  index: number;
  viewersMap: Record<string, StoryViewer[] | undefined>;
  initialFilter?: ViewerFilter;
  onSelect: (i: number) => void;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}

const StoryViewersSheet: React.FC<Props> = ({ open, stories, index, viewersMap, initialFilter = 'all', onSelect, onClose, onOpenProfile }) => {
  const [filter, setFilter] = useState<ViewerFilter>(initialFilter);
  const stripRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const progScroll = useRef(false);
  const progT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sraf = useRef(0);
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => { if (open) { setFilter(initialFilter); if (listRef.current) listRef.current.scrollTop = 0; } }, [open, initialFilter]);

  const scaleStrip = () => {
    const st = stripRef.current; if (!st) return 0;
    const mid = st.scrollLeft + st.clientWidth / 2; let best = 0, bd = 1e9;
    Array.from(st.children).forEach((node, i) => {
      const t = node as HTMLElement;
      const d = (t.offsetLeft + t.offsetWidth / 2 - mid) / 72, a = Math.abs(d);
      t.style.transform = `scale(${Math.max(0.68, 1.26 - 0.3 * a).toFixed(3)})`;
      t.style.zIndex = String(10 - Math.round(a));
      if (a < bd) { bd = a; best = i; }
    });
    return best;
  };

  const centerThumb = (i: number, smooth: boolean) => {
    const st = stripRef.current; const t = st?.children[i] as HTMLElement | undefined;
    if (!st || !t) return;
    progScroll.current = true;
    st.scrollTo({ left: t.offsetLeft - (st.clientWidth - t.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
    clearTimeout(progT.current);
    progT.current = setTimeout(() => { progScroll.current = false; scaleStrip(); }, 450);
  };

  // jab bhi story change ho (ya sheet khule) to thumbnail beech me
  useLayoutEffect(() => { if (open) centerThumb(index, true); }, [index, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { centerThumb(indexRef.current, false); scaleStrip(); }, 0);
    const onResize = () => scaleStrip();
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [open, stories.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onStripScroll = () => {
    cancelAnimationFrame(sraf.current);
    sraf.current = requestAnimationFrame(() => {
      const best = scaleStrip();
      if (progScroll.current || best >= stories.length) return;
      if (best !== indexRef.current) onSelect(best);
    });
  };

  // sheet: upar se niche swipe = band
  const sg = useRef<{ x: number; y: number; m: 'v' | 'n' | null; dy: number } | null>(null);
  useEffect(() => {
    const sheet = sheetRef.current; if (!sheet) return;
    const reset = () => { sheet.classList.remove('drag'); sheet.style.transform = ''; };
    const ts = (e: TouchEvent) => {
      const t = e.touches[0], L = listRef.current, S = stripRef.current;
      const tgt = e.target as Node;
      sg.current = { x: t.clientX, y: t.clientY, m: (L && L.contains(tgt) && L.scrollTop > 0) || (S && S.contains(tgt)) ? 'n' : null, dy: 0 };
    };
    const tm = (e: TouchEvent) => {
      const g = sg.current; if (!g || g.m === 'n') return;
      const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y; g.dy = dy;
      if (!g.m && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) g.m = (Math.abs(dy) > Math.abs(dx) && dy > 0) ? 'v' : 'n';
      if (g.m === 'v') { sheet.classList.add('drag'); sheet.style.transform = `translateY(${Math.max(0, dy)}px)`; if (e.cancelable) e.preventDefault(); }
    };
    const te = () => { const g = sg.current; if (!g) return; sg.current = null; if (g.m === 'v') { reset(); if (g.dy > 110) onClose(); } };
    const tc = () => { sg.current = null; reset(); };
    sheet.addEventListener('touchstart', ts, { passive: true });
    sheet.addEventListener('touchmove', tm, { passive: false });
    sheet.addEventListener('touchend', te);
    sheet.addEventListener('touchcancel', tc);
    return () => {
      sheet.removeEventListener('touchstart', ts); sheet.removeEventListener('touchmove', tm);
      sheet.removeEventListener('touchend', te); sheet.removeEventListener('touchcancel', tc);
    };
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  const cur = stories[index];
  const v = (cur && viewersMap[cur.id]) || [];
  const loading = !!cur && viewersMap[cur.id] === undefined;
  const liked = v.filter(x => x.liked), no = v.filter(x => !x.liked);
  const arr = filter === 'liked' ? liked : filter === 'nolike' ? no : v;
  const tabIdx = ['all', 'liked', 'nolike'].indexOf(filter);

  return createPortal(
    <div className={`psv-root${open ? ' open' : ''}`} onClick={e => e.stopPropagation()}>
      <section className="psv-sheet" ref={sheetRef} aria-label="Viewers" aria-hidden={!open}>
        <div className="psv-grab" />
        <div className="psv-top">
          <h2><EyeIcon /><span>Viewers ({loading ? '…' : v.length})</span></h2>
          <button className="psv-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="psv-strip-wrap">
          <div className="psv-strip" ref={stripRef} onScroll={onStripScroll}>
            {stories.map((s, i) => {
              const list = viewersMap[s.id];
              return (
                <button key={s.id} className={`psv-th${i === index ? ' on' : ''}`} onClick={() => onSelect(i)}>
                  {isVideo(s)
                    ? <video src={s.image_url} muted playsInline preload="metadata" />
                    : <img src={s.image_url} alt="" />}
                  <span className="cnt"><PplIcon /><i style={{ fontStyle: 'normal' }}>{list ? list.length : '…'}</i></span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="psv-tabs" style={{ ['--i' as string]: tabIdx } as React.CSSProperties}>
          {([['all', 'Sab', v.length], ['liked', 'Like', liked.length], ['nolike', 'Bina like', no.length]] as const).map(([f, label, n]) => (
            <button key={f} className={`psv-tab${filter === f ? ' on' : ''}`}
              onClick={() => { setFilter(f); if (listRef.current) listRef.current.scrollTop = 0; }}>
              {f === 'all' ? <PplIcon /> : <HeartIcon className={f === 'liked' ? 'hh' : undefined} />}
              {label} <span className="n">{loading ? '…' : n}</span>
            </button>
          ))}
        </div>
        <div className="psv-list" ref={listRef}>
          {loading ? (
            <div className="psv-empty">Load ho raha hai…</div>
          ) : !arr.length ? (
            <div className="psv-empty"><EyeIcon />{v.length ? 'Is list me koi nahi' : 'Abhi tak kisi ne ye story nahi dekhi'}</div>
          ) : arr.map((x, i) => {
            const p = x.profile; const g = gradFor(p.username || p.user_id);
            return (
              <button key={p.user_id} className={`psv-row${x.liked ? ' lkd' : ''}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                onClick={() => onOpenProfile(p.user_id)}>
                <div className="pa" style={{ background: `linear-gradient(135deg,${g[0]},${g[1]})` }}>
                  {p.avatar_url ? <img src={p.avatar_url} alt={p.username} /> : ini(p.full_name || p.username || '?')}
                </div>
                <div className="mid"><b>{p.username}</b>{p.full_name && <span>{p.full_name}</span>}</div>
                {x.liked
                  ? <div className="psv-chip lk"><HeartIcon />Like kiya</div>
                  : <div className="psv-chip">{timeAgo(x.viewed_at)} pehle</div>}
              </button>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default StoryViewersSheet;
