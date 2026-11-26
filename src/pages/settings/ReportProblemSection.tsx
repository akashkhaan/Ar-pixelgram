import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { submitProblemReport, uploadImage, uploadVideo } from '@/services/api';

const OWNER_URL = 'https://www.instagram.com/akash_raaj_89?stkn=MXR3NTNhaTB2Mm15cg==';

const P: Record<string, string> = {
  insta: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M9 7a3 3 0 0 1 6 0M3 12h5M16 12h5M4 6l3 3M20 6l-3 3M4 19l3-3M20 19l-3-3M12 11v4"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  userx: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 9l5 5M22 9l-5 5"/>',
  alert: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v4M12 14h.01"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>',
  dollar: '<circle cx="12" cy="12" r="10"/><path d="M15 9c0-1.4-1.3-2.2-3-2.2S9 7.6 9 9s1.3 2 3 2.5 3 1.1 3 2.5-1.3 2.2-3 2.2-3-.8-3-2.2M12 5.5v13"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  copy: '<circle cx="12" cy="12" r="10"/><path d="M15 9.5a3.5 3.5 0 1 0 0 5"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17.5h.01"/>',
};

const Svg = ({ p, className }: { p: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} dangerouslySetInnerHTML={{ __html: p }} />
);
const Chev = () => <svg className="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>;
const BackIco = () => <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>;

interface Item { value: string; i: string; h: number; t: string; d: string; owner?: boolean }

const ITEMS: Item[] = [
  { value: 'owner', i: 'insta', h: 0, t: 'Owner contact', d: 'Click on join pixelgram owner connect', owner: true },
  { value: 'bug', i: 'bug', h: 255, t: "Something isn't working", d: 'App crash, error or any feature not working' },
  { value: 'post', i: 'img', h: 215, t: 'Inappropriate post', d: 'Nudity, violence ya offensive content' },
  { value: 'story', i: 'img', h: 285, t: 'Inappropriate story', d: 'Story me galat ya offensive content' },
  { value: 'user', i: 'userx', h: 325, t: 'Suspicious or fake account', d: 'Fake profile, impersonation ya spam account' },
  { value: 'harassment', i: 'alert', h: 35, t: 'Bullying or harassment', d: 'Who is bothering you or anyone else?' },
  { value: 'hate', i: 'ban', h: 0, t: 'Hate speech or symbols', d: 'Content spreading hatred' },
  { value: 'scam', i: 'dollar', h: 150, t: 'Scam or fraud', d: 'Scam of money, gift or fake offer' },
  { value: 'spam', i: 'shield', h: 235, t: 'Spam', d: 'Message again and again, fake links' },
  { value: 'privacy', i: 'lock', h: 265, t: 'Privacy concern', d: 'Misuse of my photo, info or data' },
  { value: 'copyright', i: 'copy', h: 190, t: 'Intellectual property', d: 'My content was used without permission' },
  { value: 'other', i: 'help', h: 310, t: 'Something else', d: 'Any other problem or feedback' },
];

const COLORS = ['#6a5cff', '#ff5fa2', '#35d6a0', '#ffb020', '#2b9dff', '#ff6b4a'];
const VID_TXT = 'Select video (max 50MB)';

function burst(x: number, y: number, h: number) {
  for (let k = 0; k < 14; k++) {
    const d = document.createElement('i'); d.className = 'rp-dot';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.background = `hsl(${(h + k * 25) % 360} 90% 60%)`;
    document.body.append(d);
    const ang = (k / 14) * Math.PI * 2, dist = 70 + Math.random() * 70;
    const an = d.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px) scale(0)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.3,1)' });
    an.onfinish = () => d.remove();
  }
}

function confetti() {
  const cx = innerWidth / 2, cy = innerHeight * 0.4;
  for (let k = 0; k < 46; k++) {
    const c = document.createElement('i'); c.className = 'rp-conf';
    c.style.background = COLORS[k % COLORS.length];
    document.body.append(c);
    const ang = Math.random() * Math.PI * 2, v = 120 + Math.random() * 190;
    const dx = Math.cos(ang) * v, up = Math.sin(ang) * v - 120, fall = innerHeight * 0.45 + Math.random() * 160;
    const an = c.animate([
      { transform: `translate(${cx}px,${cy}px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${cx + dx * .7}px,${cy + up * .7}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: .4 },
      { transform: `translate(${cx + dx}px,${cy + up + fall}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
    ], { duration: 1700 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)' });
    an.onfinish = () => c.remove();
  }
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Props { userId: string; onBack: () => void; onDone: () => void }

const ReportProblemSection: React.FC<Props> = ({ userId, onBack }) => {
  const [sel, setSel] = useState<Item>(ITEMS[1]);
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState({ x: 0, y: 0, r: 0 });
  const [msg, setMsg] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [video, setVideo] = useState<File | null>(null);
  const [vidBad, setVidBad] = useState(0);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const busy = useRef(false);
  const ovRef = useRef<HTMLDivElement>(null);
  const plRef = useRef<SVGSVGElement>(null);
  const photoIn = useRef<HTMLInputElement>(null);
  const videoIn = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = 'rp-font';
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;800&display=swap';
      document.head.append(l);
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('rp-lock', open);
    return () => document.body.classList.remove('rp-lock');
  }, [open]);

  const openSheet = (x: Item, el: HTMLElement) => {
    const r = (el.querySelector('.ico') as HTMLElement).getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 20;
    setGeo({ x: cx, y: cy, r: rad });
    setSel(x);
    if (ovRef.current) ovRef.current.scrollTop = 0;
    setOpen(true);
    burst(cx, cy, x.h);
  };

  const closeSheet = (reset: boolean) => {
    if (busy.current && !reset) return;
    setOpen(false);
    if (reset) setTimeout(() => {
      setMsg(''); setPhoto(null); setPhotoUrl(''); setVideo(null);
      if (photoIn.current) photoIn.current.value = '';
      if (videoIn.current) videoIn.current.value = '';
      setSending(false); busy.current = false;
      plRef.current?.getAnimations().forEach(n => n.cancel());
    }, 1000);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setPhoto(f); setPhotoUrl(URL.createObjectURL(f));
  };
  const onVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 50 * 1024 * 1024) { e.target.value = ''; setVideo(null); setVidBad(n => n + 1); return; }
    setVidBad(0); setVideo(f);
  };

  const submit = async () => {
    if (busy.current || !msg.trim()) return;
    busy.current = true;
    setSending(true);
    plRef.current?.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(70px,-60px) scale(.6) rotate(12deg)', opacity: 0 },
    ], { duration: 550, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    const started = Date.now();
    try {
      const attachments: string[] = [];
      if (photo) attachments.push(await uploadImage('posts', photo, userId));
      if (video) attachments.push(await uploadVideo('stories', video, userId));
      const details = [
        `[${sel.t}]`, msg.trim(),
        attachments.length ? `\nAttachments:\n${attachments.join('\n')}` : '',
      ].filter(Boolean).join('\n');
      await submitProblemReport(userId, sel.value, details);
    } catch (err) {
      toast.error((err as Error).message || 'Report submit nahi ho paayi');
      setSending(false); busy.current = false;
      plRef.current?.getAnimations().forEach(n => n.cancel());
      return;
    }
    await wait(Math.max(0, 1500 - (Date.now() - started)));
    setSuccess(true);
    confetti();
    await wait(2800);
    setSuccess(false);
    closeSheet(true);
  };

  const geoStyle = { '--x': geo.x + 'px', '--y': geo.y + 'px', '--r': geo.r + 'px' } as React.CSSProperties;

  return (
    <div className={`rp${open ? ' open' : ''}`}>
      <style>{CSS}</style>
      <div className="page">
        <button className="back" type="button" onClick={onBack}><BackIco />Back</button>
        <h1>Report a Problem</h1>
        <p className="sub">What is the problem? Select an option from below. You can also send screenshot or video.</p>
        <div className="list">
          {ITEMS.map(x => x.owner ? (
            <a key={x.value} className="row" href={OWNER_URL} target="_blank" rel="noopener noreferrer">
              <span className="ico insta" style={{ '--h': x.h } as React.CSSProperties}><Svg p={P[x.i]} /></span>
              <span className="txt"><div className="title"><span className="tt">{x.t}</span><span className="pill">Instagram</span></div><div className="desc">{x.d}</div></span>
              <Chev />
            </a>
          ) : (
            <button key={x.value} type="button" className="row" onClick={e => openSheet(x, e.currentTarget)}>
              <span className="ico" style={{ '--h': x.h } as React.CSSProperties}><Svg p={P[x.i]} /></span>
              <span className="txt"><div className="title"><span className="tt">{x.t}</span></div><div className="desc">{x.d}</div></span>
              <Chev />
            </button>
          ))}
        </div>
      </div>

      <div className="wave" style={{ ...geoStyle, '--h': sel.h } as React.CSSProperties} />
      <div className={`ov${sending ? ' sending' : ''}`} ref={ovRef} style={geoStyle} role="dialog" aria-modal="true" aria-hidden={!open}>
        <div className="inner">
          <div className="rise" style={{ '--i': 0 } as React.CSSProperties}><button className="cl" type="button" onClick={() => closeSheet(false)}><BackIco />Back</button></div>
          <div className="shead">
            <span className="ico pop" style={{ '--h': sel.h } as React.CSSProperties}><Svg p={P[sel.i]} /></span>
            <div className="txt"><div className="title rise" style={{ '--i': 1 } as React.CSSProperties}>{sel.t}</div><div className="desc rise" style={{ '--i': 2 } as React.CSSProperties}>{sel.d}</div></div>
          </div>
          <div className="rise" style={{ '--i': 3 } as React.CSSProperties}><div className="label">Problem explained in detail</div></div>
          <div className="rise" style={{ '--i': 4 } as React.CSSProperties}>
            <textarea maxLength={1000} placeholder="Kya hua, kab hua, kis screen par hua…" value={msg} onChange={e => setMsg(e.target.value)} />
            <div className="count"><span>{msg.length}</span>/1000</div>
          </div>
          <div className="rise" style={{ '--i': 5 } as React.CSSProperties}><div className="label">Screenshot / Photo (optional)</div></div>
          <div className="rise" style={{ '--i': 6 } as React.CSSProperties}>
            <label className="add">
              <div style={{ display: photoUrl ? 'none' : '' }}><svg viewBox="0 0 24 24"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M16 5h6M19 2v6M3 16l5-5 4 4 3-3 6 6" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>Add</div>
              {photoUrl && <img src={photoUrl} alt="" />}
              <input ref={photoIn} type="file" accept="image/*" onChange={onPhoto} />
            </label>
          </div>
          <div className="rise" style={{ '--i': 7 } as React.CSSProperties}><div className="label">Video (optional)</div></div>
          <div className="rise" style={{ '--i': 8 } as React.CSSProperties}>
            <label key={vidBad} className={`vid${vidBad ? ' bad' : ''}`}>
              <svg viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="3" /><path d="M16 10.5l6-3.5v10l-6-3.5" /></svg>
              <span>{video ? video.name : VID_TXT}</span>
              <input ref={videoIn} type="file" accept="video/*" onChange={onVideo} />
            </label>
          </div>
          <div className="rise keep" style={{ '--i': 9 } as React.CSSProperties}>
            <button className={`submit${sending ? ' sending' : ''}`} type="button" disabled={!msg.trim()} onClick={submit}>
              <svg ref={plRef} className="pl" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg><span className="lbl">Submit Report</span>
            </button>
          </div>
          <div className="rise keep" style={{ '--i': 10 } as React.CSSProperties}><p className="note">The report has directly reached our team. We will contact you if necessary.</p></div>
        </div>
      </div>

      <div className={`succ${success ? ' show' : ''}`} aria-live="polite">
        <div className="okc"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
        <p>The report has directly reached our team. We will contact you if necessary.</p>
      </div>
    </div>
  );
};

const CSS = `
.rp{--bg:#ffffff;--tint:#f4f5fb;--text:#14172b;--muted:#7b8099;--line:#e6e8f4;--g1:#6a5cff;--g2:#ff5fa2;color-scheme:light;
  background:var(--bg);color:var(--text);min-height:100%;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  padding:0 14px max(28px,env(safe-area-inset-bottom))}
.rp *{box-sizing:border-box;margin:0}
body.rp-lock{overflow:hidden}
.rp button{font-family:inherit;color:inherit}
.rp svg{fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.rp .page{max-width:520px;margin:0 auto;padding:0 4px}
.rp .back{display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;padding:18px 0 6px;font-weight:600;font-size:15px;color:var(--muted);cursor:pointer}
.rp .back svg{width:20px;height:20px}
.rp h1{font-size:25px;font-weight:800;letter-spacing:-.02em;margin-top:8px;color:var(--text)}
.rp .sub{font-size:14px;line-height:1.45;color:var(--muted);margin:8px 0 14px;font-weight:500}
.rp .list{display:flex;flex-direction:column;gap:2px}
.rp .row{width:100%;display:flex;align-items:center;gap:14px;text-align:left;padding:12px 2px;border:0;background:transparent;cursor:pointer;border-radius:14px;transition:background .15s;color:var(--text);text-decoration:none}
.rp .row:active{background:var(--tint)}
.rp .row:focus-visible{outline:2px solid var(--g1);outline-offset:2px}
.rp .ico{flex:none;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:#fff;
  background:linear-gradient(140deg,hsl(var(--h) 85% 62%),hsl(calc(var(--h) + 40) 80% 52%));box-shadow:0 8px 14px -9px hsl(var(--h) 80% 50%)}
.rp .ico svg{width:22px;height:22px}
.rp .ico.insta{background:linear-gradient(45deg,#f9a03c,#e1306c 55%,#8a3ab9);box-shadow:0 8px 14px -9px #e1306c}
.rp .txt{flex:1;min-width:0}
.rp .title{font-weight:800;font-size:15.5px;letter-spacing:-.01em;line-height:1.25;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rp .desc{font-weight:500;font-size:13px;line-height:1.35;color:var(--muted);margin-top:3px}
.rp .pill{font-size:11px;font-weight:800;color:#c2307a;background:#ffe9f3;border-radius:999px;padding:3px 9px;letter-spacing:0}
.rp .chev{flex:none;width:18px;height:18px;stroke:#a4a8bf;stroke-width:2.2}
.rp .wave,.rp .ov{position:fixed;inset:0;clip-path:circle(0px at var(--x,50%) var(--y,50%));visibility:hidden;transition:clip-path .85s cubic-bezier(.65,0,.2,1),visibility 0s 1s}
.rp .wave{z-index:120;background:linear-gradient(140deg,hsl(var(--h) 85% 62%),hsl(calc(var(--h) + 45) 80% 52%));transition-delay:.14s,1s}
.rp .ov{z-index:121;background:#fff;overflow-y:auto;overscroll-behavior:contain;transition-delay:0s,1s}
.rp.open .wave,.rp.open .ov{clip-path:circle(var(--r,150vmax) at var(--x,50%) var(--y,50%));visibility:visible;transition-delay:0s,0s}
.rp.open .ov{transition-delay:.15s,0s}
.rp .inner{max-width:560px;margin:0 auto;padding:max(14px,env(safe-area-inset-top)) 22px max(28px,env(safe-area-inset-bottom))}
.rp .cl{display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;padding:10px 0 6px;font-weight:600;font-size:15px;color:var(--muted);cursor:pointer}
.rp .cl svg{width:20px;height:20px}
.rp .shead{display:flex;align-items:center;gap:16px;margin-top:14px}
.rp .shead .ico{width:60px;height:60px;border-radius:50%}
.rp .shead .ico svg{width:28px;height:28px}
.rp .shead .title{font-size:21px}
.rp .rise{opacity:0;transform:translateY(30px) scale(.97);transition:opacity .3s,transform .3s}
.rp.open .rise{opacity:1;transform:none;transition:opacity .55s,transform .7s cubic-bezier(.2,.9,.25,1);transition-delay:calc(.5s + var(--i) * .075s)}
.rp .pop{transform:scale(0) rotate(-120deg);transition:transform .3s}
.rp.open .pop{transform:none;transition:transform .85s cubic-bezier(.34,1.7,.5,1) .42s}
.rp-dot{position:fixed;z-index:130;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;pointer-events:none}
.rp .label{font-weight:800;font-size:14.5px;margin:22px 0 9px}
.rp textarea{width:100%;height:150px;resize:none;border:1.5px solid var(--line);border-radius:18px;background:#fbfbfe;padding:14px 16px;font:500 15px/1.45 inherit;font-family:inherit;color:var(--text);outline:none;transition:border-color .2s,box-shadow .2s}
.rp textarea::placeholder{color:#a3a8c0}
.rp textarea:focus{border-color:var(--g1);box-shadow:0 0 0 4px rgba(106,92,255,.12);background:#fff}
.rp .count{text-align:right;font-size:12px;font-weight:600;color:var(--muted);margin-top:6px}
.rp .add{position:relative;width:104px;height:104px;border-radius:20px;border:1.8px dashed #c9cdea;background:#fbfbfe;display:grid;place-items:center;cursor:pointer;overflow:hidden;color:var(--muted);font-size:12.5px;font-weight:600;text-align:center}
.rp .add svg{width:26px;height:26px;display:block;margin:0 auto 6px}
.rp .add img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.rp .vid{width:100%;display:flex;align-items:center;gap:12px;height:54px;padding:0 16px;border:1.5px solid var(--line);border-radius:16px;background:#fbfbfe;cursor:pointer;font-weight:600;font-size:15px;text-align:left}
.rp .vid svg{width:22px;height:22px;color:var(--g1);flex:none}
.rp .vid span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp .vid.bad{border-color:#e5384f;animation:rpshake .35s}
@keyframes rpshake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.rp .submit{position:relative;overflow:hidden;width:100%;height:54px;margin:26px auto 0;border:0;border-radius:18px;display:flex;align-items:center;justify-content:center;gap:10px;font-weight:800;font-size:16px;color:#fff;cursor:pointer;background:linear-gradient(120deg,var(--g1),var(--g2));box-shadow:0 14px 24px -14px rgba(106,92,255,.85);transition:width .55s cubic-bezier(.65,0,.25,1),border-radius .55s,opacity .2s,transform .15s,gap .3s}
.rp .submit .lbl{transition:font-size .25s,opacity .2s;font-size:16px}
.rp .submit svg{width:20px;height:20px}
.rp .submit::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.45) 50%,transparent 70%);transform:translateX(-120%);animation:rpshine 2.6s 1.6s infinite}
@keyframes rpshine{to{transform:translateX(120%)}}
.rp .submit::before{content:"";position:absolute;left:50%;top:50%;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;opacity:0;animation:rpspin .8s linear infinite}
@keyframes rpspin{to{transform:rotate(360deg)}}
.rp .submit.sending{width:54px;border-radius:27px;gap:0;pointer-events:none}
.rp .submit.sending .lbl{font-size:0;opacity:0}
.rp .submit.sending::before{opacity:1;transition:opacity .2s .45s}
.rp .submit.sending::after{display:none}
.rp .ov.sending .rise:not(.keep){opacity:.18;transition-delay:0s}
.rp .succ{position:fixed;inset:0;z-index:122;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:30px;opacity:0;visibility:hidden;transition:opacity .35s,visibility 0s .35s}
.rp .succ.show{opacity:1;visibility:visible;transition-delay:0s}
.rp .okc{position:relative;width:124px;height:124px;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(140deg,#35d6a0,#14a8c8);box-shadow:0 22px 40px -18px rgba(20,168,200,.8);transform:scale(0)}
.rp .show .okc{animation:rpokpop .75s cubic-bezier(.34,1.6,.5,1) .1s forwards}
@keyframes rpokpop{to{transform:scale(1)}}
.rp .okc svg{width:60px;height:60px;stroke-width:3.2}
.rp .okc path{stroke-dasharray:40;stroke-dashoffset:40}
.rp .show .okc path{animation:rpdraw .5s ease-out .6s forwards}
@keyframes rpdraw{to{stroke-dashoffset:0}}
.rp .okc::before,.rp .okc::after{content:"";position:absolute;inset:0;border-radius:50%;border:3px solid #35d6a0;opacity:0}
.rp .show .okc::before{animation:rpring 1.4s ease-out .45s}
.rp .show .okc::after{animation:rpring 1.4s ease-out .75s}
@keyframes rpring{from{transform:scale(1);opacity:.7}to{transform:scale(2.3);opacity:0}}
.rp .succ p{max-width:300px;text-align:center;font-weight:700;font-size:16px;line-height:1.5;color:var(--text);opacity:0;transform:translateY(18px)}
.rp .show p{animation:rpup .6s cubic-bezier(.2,.9,.25,1) .9s forwards}
@keyframes rpup{to{opacity:1;transform:none}}
.rp-conf{position:fixed;z-index:130;top:0;left:0;width:9px;height:14px;border-radius:2px;pointer-events:none}
.rp .submit:disabled{opacity:.4;box-shadow:none;cursor:not-allowed}
.rp .submit:disabled::after{display:none}
.rp .submit:not(:disabled):active{transform:scale(.98)}
.rp .note{text-align:center;font-size:12.5px;line-height:1.5;color:var(--muted);margin-top:14px;font-weight:500}
.rp input[type=file]{display:none}
@media (prefers-reduced-motion:reduce){.rp .wave,.rp .ov,.rp .rise,.rp .pop,.rp .row{transition:none!important}.rp .vid.bad,.rp .submit::after,.rp .submit::before,.rp .show .okc,.rp .show .okc path,.rp .show .okc::before,.rp .show .okc::after,.rp .show p{animation:none}.rp .okc{transform:none}.rp .okc path{stroke-dashoffset:0}.rp .succ p{opacity:1;transform:none}}
`;

export default ReportProblemSection;
