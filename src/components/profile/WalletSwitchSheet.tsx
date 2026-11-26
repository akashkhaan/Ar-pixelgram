import { supabase } from '@/db/supabase';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  getSavedAccounts,
  switchToAccount,
  removeSavedAccount,
  logInToAnotherAccount,
  SavedAccount,
} from '@/lib/savedAccounts';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const S = 62, H = 150;
const hueOf = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };

const VT = () => (<svg className="vt" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" /><path d="M7 12.5l3.2 3.2L17 9" /></svg>);
const ARR = () => (<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
const CHK = () => (<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
const TRASH = () => (<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>);

const CSS = `
.wss{--bg:#fff;--tint:#f4f5fb;--text:#14172b;--muted:#7b8099;--line:#e6e8f4;--g1:#6a5cff;--g2:#ff5fa2;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text)}
.wss *{box-sizing:border-box}
.wss button{font-family:inherit;color:inherit}
.wss svg{fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
@property --ang{syntax:"<angle>";initial-value:0deg;inherits:false}
.wss .scrim{position:fixed;inset:0;background:rgba(20,23,43,.4);opacity:0;pointer-events:none;transition:opacity .35s;z-index:80}
.wss .sh{position:fixed;left:0;right:0;bottom:0;z-index:81;max-width:560px;margin:0 auto;max-height:92%;overflow-y:auto;background:var(--bg);border-radius:30px 30px 0 0;box-shadow:0 -22px 50px -20px rgba(40,30,120,.4);padding:8px 16px max(16px,env(safe-area-inset-bottom));transform:translateY(106%);transition:transform .5s cubic-bezier(.2,.9,.25,1.02);overscroll-behavior:contain}
.wss.opened .scrim{opacity:1;pointer-events:auto}
.wss.opened .sh{transform:none}
.wss .grab{display:block;width:44px;height:5px;border-radius:3px;background:#dcdff0;margin:2px auto 12px;border:0;cursor:pointer}
.wss .sh-t{display:flex;align-items:center;justify-content:center;position:relative;padding:4px 0 10px}
.wss .sh-t h2{margin:0;font-size:17px;font-weight:800;background:linear-gradient(100deg,var(--g1),var(--g2),#ff9a3c);-webkit-background-clip:text;background-clip:text;color:transparent}
.wss .x{position:absolute;right:0;top:0;border:0;background:var(--tint);width:32px;height:32px;border-radius:50%;display:grid;place-items:center;cursor:pointer}
.wss .x svg{width:16px;height:16px;stroke-width:2.4}
.wss .in{opacity:0;transform:translateY(34px) scale(.96)}
.wss.opened .in{opacity:1;transform:none;transition:opacity .5s,transform .65s cubic-bezier(.2,.9,.25,1.1);transition-delay:calc(.22s + var(--i) * .08s)}
.wss .vt{flex:none;width:16px;height:16px;overflow:visible}
.wss .vt circle{fill:#1d9bf0;stroke:none}.wss .vt path{stroke:#fff;stroke-width:2.6}
.wss .stack{position:relative;margin:0 0 12px;overflow-y:auto;overflow-x:hidden;max-height:min(46vh,350px);overscroll-behavior:contain;scrollbar-width:none;padding:6px 0 14px;-webkit-mask-image:linear-gradient(transparent 0,#000 12px);mask-image:linear-gradient(transparent 0,#000 12px)}
.wss .stack::-webkit-scrollbar{display:none}
.wss .sw2{position:relative}
.wss .srch{position:relative;margin:0 0 6px}
.wss .srch svg{position:absolute;left:13px;top:50%;width:17px;height:17px;margin-top:-8.5px;stroke:#9a9eb5;stroke-width:2.2}
.wss .srch input{width:100%;height:40px;border:1.5px solid var(--line);border-radius:14px;background:var(--tint);padding:0 14px 0 38px;font:600 14px/1 inherit;font-family:inherit;color:var(--text);outline:none;transition:border-color .2s,box-shadow .2s}
.wss .srch input:focus{border-color:var(--g1);box-shadow:0 0 0 4px rgba(106,92,255,.12)}
.wss .card:not(.isCur) .cbd{display:none}
.wss .card{position:absolute;left:0;right:0;height:150px;border-radius:26px;padding:11px 16px;color:#fff;overflow:hidden;cursor:pointer;transform-origin:50% 0;background:linear-gradient(135deg,hsl(var(--h) 88% 62%),hsl(calc(var(--h) + 45) 82% 48%));box-shadow:0 -10px 22px -12px rgba(20,23,43,.45),0 18px 30px -18px hsl(var(--h) 80% 40%);-webkit-tap-highlight-color:transparent}
.wss .card:active{filter:brightness(1.06)}
.wss .chd{position:relative;z-index:2;display:flex;align-items:center;gap:12px;height:40px}
.wss .cav{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:17px;background:rgba(255,255,255,.22);box-shadow:0 0 0 2px rgba(255,255,255,.85);overflow:hidden}
.wss .cav img{width:100%;height:100%;object-fit:cover}
.wss .ctx{flex:1;min-width:0}
.wss .cn{display:flex;align-items:center;gap:6px;font-weight:800;font-size:15px;letter-spacing:-.01em;line-height:1.2}
.wss .cn .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wss .ch{font-weight:600;font-size:12px;opacity:.85;margin-top:2px}
.wss .card .vt circle{fill:#fff}.wss .card .vt path{stroke:#1d9bf0}
.wss .cr{flex:none;display:flex;align-items:center;gap:6px}
.wss .sp{display:flex;align-items:center;gap:5px;height:30px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.24);backdrop-filter:blur(6px);font-weight:700;font-size:12px}
.wss .sp svg{width:13px;height:13px;stroke-width:2.4}
.wss .trash{flex:none;width:30px;height:30px;border:0;border-radius:50%;background:transparent;display:grid;place-items:center;cursor:pointer;color:rgba(255,255,255,.8)}
.wss .trash svg{width:17px;height:17px}.wss .trash:active{background:rgba(255,255,255,.2)}
.wss .fck{width:30px;height:30px;border-radius:50%;background:#fff;display:grid;place-items:center;color:hsl(var(--h) 80% 48%);animation:wssck .6s cubic-bezier(.34,1.7,.5,1) .5s both}
.wss .fck svg{width:16px;height:16px;stroke-width:3}
@keyframes wssck{from{transform:scale(0) rotate(-90deg)}}
.wss .cbd{position:absolute;left:16px;right:16px;bottom:14px;z-index:2;display:flex;align-items:flex-end;justify-content:space-between}
.wss .act{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.22)}
.wss .act::before{content:"";width:7px;height:7px;border-radius:50%;background:#7dffb4;box-shadow:0 0 8px #7dffb4}
.wss .cw{font-weight:800;font-size:17px;letter-spacing:-.02em;opacity:.95}
.wss .deco{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.28),rgba(255,255,255,0) 70%);pointer-events:none}
.wss .d1{width:190px;height:190px;right:-60px;top:-70px}
.wss .d2{width:140px;height:140px;left:-40px;bottom:-60px}
.wss .shine{position:absolute;top:0;bottom:0;width:60%;left:-70%;background:linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-18deg);pointer-events:none;z-index:1}
.wss .card.isCur .shine{animation:wssshine 3.4s ease-in-out 1.2s infinite}
@keyframes wssshine{60%,100%{left:130%}}
.wss .card.loading .sp{font-size:0;width:30px;padding:0;justify-content:center}
.wss .card.loading .sp svg{display:none}
.wss .card.loading .sp::after{content:"";width:15px;height:15px;border-radius:50%;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;animation:wssspin .7s linear infinite}
@keyframes wssspin{to{transform:rotate(360deg)}}
.wss .wv{position:fixed;inset:0;z-index:90;pointer-events:none;visibility:hidden;clip-path:circle(0px at 50% 50%)}
.wss .addrow{display:flex;align-items:center;gap:12px;padding:9px 10px;width:100%;border:0;background:var(--tint);text-align:left;cursor:pointer;border-radius:18px;margin-top:2px}
.wss .pl{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:var(--g1);border:2px dashed #c9cdea}
.wss .pl svg{width:20px;height:20px;stroke-width:2.4}
.wss .txt{flex:1;min-width:0}
.wss .addrow .nm{font-weight:800;font-size:14.5px}
.wss .addrow .hd{font-weight:500;font-size:12px;color:var(--muted);margin-top:3px}
.wss .addrow .ar{flex:none;width:32px;height:32px;border-radius:50%;background:var(--bg);display:grid;place-items:center}
.wss .addrow .ar svg{width:16px;height:16px;stroke:#6b7090;stroke-width:2.3}
.wss .foot{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 0 2px;margin-top:4px;border-top:1px solid var(--line);font-weight:800;font-size:13.5px}
.wss .foot i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:#fff;font-style:normal;font-size:11px;background:linear-gradient(140deg,var(--g1),var(--g2))}
.wss .foot span{background:linear-gradient(100deg,var(--g1),var(--g2));-webkit-background-clip:text;background-clip:text;color:transparent}
.wss .pp{margin:0 0 12px;padding:12px;border-radius:18px;background:var(--tint);border:1.5px solid var(--g1)}
.wss .pp p{margin:0 0 8px;font-weight:700;font-size:13px}
.wss .pp form{display:flex;gap:8px}
.wss .pp input{flex:1;min-width:0;height:40px;border:1.5px solid var(--line);border-radius:12px;background:var(--bg);color:var(--text);padding:0 12px;font:600 14px inherit;font-family:inherit;outline:none}
.wss .pp button{height:40px;padding:0 14px;border:0;border-radius:12px;color:#fff!important;font-weight:800;background:linear-gradient(120deg,var(--g1),var(--g2));cursor:pointer}
.wss .empty{text-align:center;color:var(--muted);font-size:13px;font-weight:600;padding:18px 0}
.dark .wss{--bg:hsl(248 28% 9%);--tint:hsl(248 24% 15%);--text:hsl(250 20% 95%);--muted:hsl(250 15% 62%);--line:hsl(248 20% 22%)}
.dark .wss .grab{background:hsl(248 20% 28%)}
@media (prefers-reduced-motion:reduce){.wss *,.wss *::before,.wss *::after{animation-duration:.01ms!important;transition-duration:.01ms!important;transition-delay:0s!important}}
`;

const WalletSwitchSheet: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user, profile } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [opened, setOpened] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [entered, setEntered] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [passFor, setPassFor] = useState<SavedAccount | null>(null);
  const [pass, setPass] = useState('');
  const busy = useRef(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const wvRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const curId = user?.id;

  useEffect(() => {
    if (isOpen) {
      let list = getSavedAccounts();
      if (curId && !list.some((a) => a.user_id === curId)) {
        list = [...list, { user_id: curId, username: profile?.username || '', full_name: profile?.full_name || '', avatar_url: profile?.avatar_url, access_token: '', refresh_token: '', last_active: Date.now(), is_verified: !!profile?.is_verified } as SavedAccount];
      }
      setAccounts(list);
      setOrder(list.filter((a) => a.user_id !== curId).map((a) => a.user_id).concat(curId ? [curId] : []));
      setQ(''); setPassFor(null); setPass(''); setEntered(false);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setOpened(true)));
      setTimeout(() => setEntered(true), 280);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const ids = list.map((a) => a.user_id).filter(Boolean);
      if (ids.length) {
        supabase.from('profiles').select('user_id, is_verified, avatar_url, full_name, username').in('user_id', ids)
          .then(({ data }) => {
            if (!data?.length) return;
            const m = new Map(data.map((r: any) => [r.user_id, r]));
            setAccounts((p) => {
              const u = p.map((a) => { const r: any = m.get(a.user_id); return r ? { ...a, is_verified: r.is_verified ?? a.is_verified, avatar_url: r.avatar_url || a.avatar_url, full_name: r.full_name || a.full_name, username: r.username || a.username } : a; });
              try { localStorage.setItem('pixelgram_saved_accounts_v1', JSON.stringify(u.filter((a) => a.access_token || a.refresh_token))); } catch {}
              return u;
            });
          }, () => {});
      }
      return () => { document.body.style.overflow = prev; };
    } else {
      setOpened(false);
      const t = setTimeout(() => setMounted(false), 500);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [isOpen]);

  // start on the active (front) card
  useLayoutEffect(() => { if (entered && stackRef.current) stackRef.current.scrollTop = stackRef.current.scrollHeight; }, [entered]);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.user_id, a])), [accounts]);
  const key = q.trim().toLowerCase();
  const visible = order.filter((id) => {
    const a = byId.get(id); if (!a) return false;
    return !key || ((a.full_name || '') + ' ' + (a.username || '')).toLowerCase().includes(key);
  });
  const n = visible.length;

  const close = () => { if (busy.current) return; onClose(); };

  const remove = (a: SavedAccount) => {
    setRemoving(a.user_id);
    setTimeout(() => {
      removeSavedAccount(a.user_id);
      setAccounts((p) => p.filter((x) => x.user_id !== a.user_id));
      setOrder((p) => p.filter((x) => x !== a.user_id));
      setRemoving(null);
      toast.success(`Removed ${a.full_name || a.username} from saved accounts`);
    }, 420);
  };

  const doSwitch = (a: SavedAccount) => {
    if (busy.current) return;
    busy.current = true;
    try { navigator.vibrate?.(18); } catch {}
    setLoadingId(a.user_id);
    setQ('');
    toast.info('Switching to ' + (a.full_name || a.username) + '...');
    setOrder((p) => p.filter((x) => x !== a.user_id).concat(a.user_id));
    stackRef.current?.scrollTo({ top: stackRef.current.scrollHeight, behavior: 'smooth' });

    setTimeout(async () => {
      const wv = wvRef.current, el = cardRefs.current[a.user_id];
      const h = hueOf(a.user_id);
      if (wv && el) {
        const R = Math.hypot(innerWidth, innerHeight) + 80;
        const r0 = el.querySelector('.cav')!.getBoundingClientRect();
        const sx = r0.left + r0.width / 2, sy = r0.top + r0.height / 2;
        wv.style.background = `linear-gradient(140deg,hsl(${h} 88% 62%),hsl(${h + 40} 82% 48%))`;
        wv.style.visibility = 'visible'; wv.style.opacity = '1';
        wv.style.transition = 'none'; wv.style.clipPath = `circle(0px at ${sx}px ${sy}px)`; void wv.offsetWidth;
        wv.style.transition = 'clip-path .65s cubic-bezier(.6,0,.3,1)';
        wv.style.clipPath = `circle(${R}px at ${sx}px ${sy}px)`;
      }
      await new Promise((r) => setTimeout(r, 680));
      const res = await switchToAccount(a);
      if (res.success) return; // page reloads into the new account
      if (wv) { wv.style.transition = 'opacity .25s'; wv.style.opacity = '0'; setTimeout(() => { wv.style.visibility = 'hidden'; }, 300); }
      setLoadingId(null);
      busy.current = false;
      if (res.requiresPassword) { setPassFor(a); setPass(''); toast.info(`Enter password to switch to ${a.full_name || a.username}`); }
      else toast.error(res.message || 'Unable to switch account. Please try again.');
    }, 950);
  };

  const submitPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passFor || !pass.trim() || busy.current) return;
    busy.current = true;
    const res = await switchToAccount(passFor, pass.trim());
    busy.current = false;
    if (!res.success) toast.error(res.message || 'Invalid password. Please try again.');
  };

  if (!mounted) return null;

  return createPortal(
    <div className={`wss${opened ? ' opened' : ''}`}>
      <style>{CSS}</style>
      <div className="scrim" onClick={close} />
      <div className="sh" role="dialog" aria-modal="true" aria-hidden={!opened}>
        <button className="grab" type="button" aria-label="Close" onClick={close} />
        <div className="sh-t in" style={{ ['--i' as any]: 0 }}>
          <h2>Switch accounts</h2>
          <button className="x" type="button" aria-label="Close" onClick={close}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        {passFor && (
          <div className="pp">
            <p>Log in to {passFor.full_name || passFor.username}</p>
            <form onSubmit={submitPass}>
              <input type="password" autoFocus placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} />
              <button type="submit">Log in</button>
            </form>
          </div>
        )}

        {accounts.length > 4 && (
          <div className="srch">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input type="search" placeholder={`Search ${accounts.length} accounts`} autoComplete="off" value={q}
              onChange={(e) => { setQ(e.target.value); setTimeout(() => stackRef.current?.scrollTo({ top: stackRef.current.scrollHeight, behavior: 'smooth' }), 0); }} />
          </div>
        )}

        <div className="stack" ref={stackRef}>
          <div className="sw2" style={{ height: n ? (n - 1) * S + H : 0 }}>
            {order.map((id) => {
              const a = byId.get(id); if (!a) return null;
              const vi = visible.indexOf(id);
              const show = vi >= 0;
              const on = id === curId;
              const name = a.full_name || a.username || 'Account';
              const last = (n - 1) * S;
              const d = Math.min((n - 1 - vi) * 55, 420);
              const sp = '.75s cubic-bezier(.34,1.35,.5,1)';
              let style: React.CSSProperties = { ['--h' as any]: hueOf(id), zIndex: id === loadingId ? 50 : vi + 1 };
              if (!entered) style = { ...style, top: last, transform: 'scale(.84) translateY(40px)', opacity: 0, transition: 'none' };
              else if (!show) style = { ...style, top: 0, opacity: 0, visibility: 'hidden', pointerEvents: 'none' };
              else style = { ...style, top: vi * S, opacity: 1, transform: `scale(${Math.max(0.9, 1 - (n - 1 - vi) * 0.02)})` + (removing === id ? ' translateX(120%) rotate(8deg)' : ''),
                transition: removing === id ? 'transform .4s ease-in, opacity .4s' : `top ${sp} ${d}ms, transform ${sp} ${d}ms, opacity .4s ${d}ms` };
              if (removing === id) style.opacity = 0;
              return (
                <div key={id} ref={(r) => { cardRefs.current[id] = r; }} className={`card${on ? ' isCur' : ''}${loadingId === id ? ' loading' : ''}`} style={style}
                  onClick={(e) => {
                    if (busy.current) return;
                    if ((e.target as HTMLElement).closest('.trash')) { remove(a); return; }
                    if (!on) doSwitch(a);
                  }}>
                  <div className="chd">
                    <span className="cav">{a.avatar_url ? <img src={a.avatar_url} alt="" /> : (name[0] || 'P').toUpperCase()}</span>
                    <div className="ctx">
                      <div className="cn"><span className="n">{name}</span>{a.is_verified ? <VT /> : null}</div>
                      <div className="ch">@{a.username}</div>
                    </div>
                    <div className="cr">
                      {on ? <span className="fck"><CHK /></span> : (<>
                        <span className="sp">Switch <ARR /></span>
                        <button className="trash" type="button" aria-label="Remove"><TRASH /></button>
                      </>)}
                    </div>
                  </div>
                  <div className="cbd"><span className="act">Active</span><span className="cw">Pixelgram</span></div>
                  <i className="deco d1" /><i className="deco d2" /><i className="shine" />
                </div>
              );
            })}
          </div>
          {!n && <div className="empty">No accounts found</div>}
        </div>

        <div className="in" style={{ ['--i' as any]: 4 }}>
          <button className="addrow" type="button" onClick={async () => { onClose(); toast.info('Opening login to add account...'); await logInToAnotherAccount(); }}>
            <span className="pl"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>
            <span className="txt"><div className="nm">Log in to another account</div><div className="hd">Create new or login another account</div></span>
            <span className="ar"><ARR /></span>
          </button>
        </div>
        <div className="in" style={{ ['--i' as any]: 5 }}><div className="foot"><i>P</i><span>Pixelgram</span></div></div>
      </div>
      <div className="wv" ref={wvRef} />
    </div>,
    document.body
  );
};

export default WalletSwitchSheet;
