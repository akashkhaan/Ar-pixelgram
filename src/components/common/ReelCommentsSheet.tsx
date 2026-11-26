import { CommentText } from "./CommentText";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Trash2, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  getReelComments, addReelComment, deleteReelComment, createNotification,
  type ReelComment,
} from '@/services/api';
import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getCommentLikeStates, toggleCommentLike, type CommentLikeState } from '@/services/commentLikes';
import { notifyMentions } from '@/lib/mentions';

interface Props {
  reelId: string;
  reelOwnerId: string;
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
  highlightCommentId?: string | null;
}

const ReelCommentsSheet: React.FC<Props> = ({ reelId, reelOwnerId, open, onClose, onCountChange, highlightCommentId }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<ReelComment | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [likes, setLikes] = useState<Record<string, CommentLikeState>>({});
  const [likeBusy, setLikeBusy] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    const c = await getReelComments(reelId);
    setComments(c);
    onCountChange?.(c.length);
  };

  useEffect(() => { if (open) refresh(); /* eslint-disable-next-line */ }, [reelId, open]);

  // Har comment ke like count + mera like
  useEffect(() => {
    if (!open) return;
    let live = true;
    getCommentLikeStates('reel', comments.map(c => c.id), user?.id)
      .then(map => { if (live) setLikes(map); })
      .catch(() => {});
    return () => { live = false; };
  }, [open, comments, user?.id]);

  const handleLikeComment = async (c: ReelComment) => {
    if (!user) return;
    if (c.user_id === user.id) return;
    setLikeBusy(prev => ({ ...prev, [c.id]: true }));
    try {
      const { liked } = await toggleCommentLike('reel', c.id, c.user_id, {
        contentId: reelId,
        actorId: user.id,
        commentPreview: c.content,
      });
      setLikes(prev => {
        const cur = prev[c.id] || { count: 0, mine: false };
        return {
          ...prev,
          [c.id]: { count: Math.max(0, cur.count + (liked ? 1 : -1)), mine: liked },
        };
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Like nahi hua');
    } finally {
      setLikeBusy(prev => ({ ...prev, [c.id]: false }));
    }
  };
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments.length]);

  // Group: top-level + replies
  const grouped = useMemo(() => {
    const parents = comments.filter(c => !c.parent_id);
    const byParent: Record<string, ReelComment[]> = {};
    for (const c of comments) {
      if (c.parent_id) (byParent[c.parent_id] ||= []).push(c);
    }
    return parents.map(p => ({ parent: p, replies: byParent[p.id] || [] }));
  }, [comments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;
    setLoading(true);
    try {
      const text = content.trim();
      await addReelComment(reelId, text, replyTo?.id || null);
      setContent('');
      const wasReply = replyTo;
      setReplyTo(null);
      toast.success(wasReply ? 'Reply added' : 'Comment added');
      // Notification bhejna optional hai — fail ho to comment fail nahi hona chahiye.
      if (wasReply && wasReply.user_id !== user.id) {
        createNotification(wasReply.user_id, 'comment_reply', user.id, reelId, wasReply.id, text.slice(0, 120)).catch(() => {});
      } else if (!wasReply && reelOwnerId !== user.id) {
        createNotification(reelOwnerId, 'reel_comment', user.id, reelId, undefined, text.slice(0, 120)).catch(() => {});
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Comment save nahi hua');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteReelComment(id);
    await refresh();
  };

  const goToProfile = (uid?: string) => { if (uid) { onClose(); navigate(`/profile/${uid}`); } };

  // Like button pe pop + chhote dil udte hain (sirf design animation)
  const likeFx = (btn: HTMLElement, willLike: boolean) => {
    btn.classList.remove('rcs-pop'); void btn.offsetWidth; btn.classList.add('rcs-pop');
    if (!willLike) return;
    try { navigator.vibrate?.(12); } catch { /* ignore */ }
    const r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let k = 0; k < 7; k++) {
      const h = document.createElement('i'); h.className = 'rcs-mh'; h.textContent = ['❤️', '💖', '💗'][k % 3];
      h.style.left = cx + 'px'; h.style.top = cy + 'px'; document.body.append(h);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, d = 30 + Math.random() * 40;
      h.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d - 8}px,${Math.sin(a) * d - 8}px) scale(1.1)`, opacity: 0 }], { duration: 800 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => h.remove();
    }
  };

  // Send button pe ring effect
  const sendFx = (btn: HTMLElement | null) => {
    if (!btn) return;
    try { navigator.vibrate?.(16); } catch { /* ignore */ }
    const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    for (let k = 0; k < 2; k++) {
      const d = document.createElement('i'); d.className = 'rcs-ring';
      d.style.cssText = `left:${x}px;top:${y}px;width:40px;height:40px;margin:-20px 0 0 -20px`;
      document.body.append(d);
      d.animate([{ transform: 'scale(.6)', opacity: 0.8 }, { transform: 'scale(4.5)', opacity: 0 }], { duration: 800, delay: k * 160, easing: 'ease-out', fill: 'backwards' }).onfinish = () => d.remove();
    }
  };

  const hue = (str: string) => { let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };

  if (!open) return null;

  const Row: React.FC<{ c: ReelComment; isReply?: boolean; i: number }> = ({ c, isReply, i }) => {
    const isHighlighted = highlightCommentId === c.id;
    const uname = c.profile?.username || '';
    const mine = likes[c.id]?.mine;
    return (
    <div className={cn('rcs-cm', isReply && 'rcs-reply', isHighlighted && 'rcs-glow')} style={{ ['--i' as string]: i }}>
      <button type="button" onClick={() => goToProfile(c.profile?.user_id)} className="rcs-av" style={{ ['--h' as string]: hue(uname || 'x') }}>
        {c.profile?.avatar_url ? (
          <img src={c.profile.avatar_url} alt="" />
        ) : (
          <span>{uname[0]?.toUpperCase()}</span>
        )}
      </button>
      <div className="rcs-bd">
        <div className="rcs-meta">
          <button type="button" onClick={() => goToProfile(c.profile?.user_id)} className="rcs-name">{uname}</button>
          {c.profile?.is_verified && <BadgeCheck className="rcs-badge" />}
          <span>{new Date(c.created_at).toLocaleDateString()}</span>
        </div>
        <div className="rcs-tx"><CommentText text={c.content} /></div>
        <div className="rcs-acts">
          <button
            type="button"
            className="rcs-rp"
            onClick={() => setReplyTo(isReply ? comments.find(x => x.id === c.parent_id) || c : c)}
          >
            Reply
          </button>
          {user?.id === c.user_id && (
            <button type="button" className="rcs-rp rcs-del" onClick={() => handleDelete(c.id)}>
              <Trash2 /> Delete
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label={mine ? 'Unlike comment' : 'Like comment'}
        disabled={!!likeBusy[c.id] || user?.id === c.user_id}
        onClick={e => { likeFx(e.currentTarget, !mine); void handleLikeComment(c); }}
        className={cn('rcs-lk', mine && 'rcs-on', user?.id === c.user_id && 'rcs-self')}
      >
        <Heart />
        {(likes[c.id]?.count || 0) > 0 && <span>{likes[c.id]?.count}</span>}
      </button>
    </div>
    );
  };

  let idx = 0;

  // Render via portal directly into document.body so the sheet is not clipped
  // or positioned relative to a transformed parent (the reels slide rail uses
  // translateY, which turns position:fixed into relative-to-parent).
  return createPortal(
    <div
      className="rcs-root"
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      <style>{RCS_CSS}</style>
      <div className="rcs-dim" onClick={onClose} />
      <section className="rcs-sheet">
        <div className="rcs-hd">
          <h2>Comments · <span key={comments.length} className="rcs-cnt">{comments.length}</span></h2>
          <button type="button" onClick={onClose} className="rcs-x" aria-label="Close"><X /></button>
        </div>

        <div className="rcs-list">
          {grouped.length === 0 ? (
            <p className="rcs-empty">Sabse pehle comment karo!</p>
          ) : grouped.map(g => (
            <div key={g.parent.id}>
              <Row c={g.parent} i={idx++} />
              {g.replies.map(r => <Row key={r.id} c={r} isReply i={idx++} />)}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {replyTo && (
          <div className="rcs-rep">
            <span>Replying to <b>@{replyTo.profile?.username}</b></span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel"><X /></button>
          </div>
        )}

        {user ? (
          <form
            onSubmit={e => { sendFx(e.currentTarget.querySelector('.rcs-send')); void handleSubmit(e); }}
            className={cn('rcs-cp', replyTo && 'rcs-cp-rpl')}
          >
            <input
              className="rcs-inp"
              placeholder={replyTo ? `Reply to ${replyTo.profile?.username}…` : 'Add a comment…'}
              value={content}
              onChange={e => setContent(e.target.value)}
              maxLength={500}
              autoComplete="off"
              enterKeyHint="send"
            />
            <button type="submit" className="rcs-send" aria-label="Send" disabled={!content.trim() || loading}>
              <Send />
            </button>
          </form>
        ) : (
          <div className="rcs-cp rcs-signin">
            <button type="button" onClick={() => { onClose(); navigate('/login'); }}>
              Sign in to comment
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
};

const RCS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
.rcs-root{position:fixed;inset:0;z-index:100;display:flex;align-items:flex-end;justify-content:center;
  --rt:#14172b;--rm:#7b8099;--rl:#e8eaf5;--rtint:#f4f5fb;--g1:#6a5cff;--g2:#ff5fa2;
  font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--rt)}
.rcs-root button{font-family:inherit;border:0;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}
.rcs-dim{position:absolute;inset:0;background:rgba(10,8,30,.5);animation:rcs-fade .3s ease both}
@keyframes rcs-fade{from{opacity:0}}
.rcs-sheet{position:relative;width:100%;max-width:560px;height:min(72vh,600px);display:flex;flex-direction:column;background:#fff;
  border-radius:30px 30px 0 0;box-shadow:0 -24px 60px -24px rgba(60,50,160,.45);animation:rcs-up .7s cubic-bezier(.2,.9,.25,1.03) both}
@keyframes rcs-up{from{transform:translateY(105%)}}
.rcs-hd{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid var(--rl)}
.rcs-hd h2{font-size:18px;font-weight:800;letter-spacing:-.01em;margin:0;color:var(--rt)}
.rcs-cnt{display:inline-block;animation:rcs-roll .5s cubic-bezier(.2,.9,.25,1.2)}
@keyframes rcs-roll{from{transform:translateY(100%);opacity:0}}
.rcs-x{width:36px;height:36px;border-radius:50%;background:var(--rtint)!important;display:grid;place-items:center;color:var(--rt)}
.rcs-x svg{width:18px;height:18px;stroke-width:2.4}
.rcs-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 16px 10px;scrollbar-width:none}
.rcs-list::-webkit-scrollbar{display:none}
.rcs-empty{text-align:center;color:var(--rm);font-size:14px;font-weight:600;padding:32px 0}
.rcs-cm{display:flex;gap:12px;align-items:flex-start;padding:12px 4px;border-radius:18px;position:relative;
  animation:rcs-rise .6s cubic-bezier(.2,.9,.25,1) both;animation-delay:calc(min(var(--i),10) * 80ms + .35s)}
@keyframes rcs-rise{from{opacity:0;transform:translateY(22px)}}
.rcs-reply{margin-left:40px}
.rcs-reply .rcs-av{width:32px;height:32px;font-size:13px}
.rcs-av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:16px;color:#fff;overflow:hidden;padding:0;
  background:linear-gradient(140deg,hsl(var(--h) 85% 62%),hsl(calc(var(--h) + 40) 80% 50%))!important;box-shadow:0 0 0 2px #fff,0 0 0 4px hsl(var(--h) 85% 84%)}
.rcs-av img{width:100%;height:100%;object-fit:cover}
.rcs-bd{flex:1;min-width:0}
.rcs-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rcs-name{font-weight:800;font-size:15px;color:var(--rt);padding:0}
.rcs-badge{width:15px;height:15px;color:var(--g1)}
.rcs-meta>span{font-size:12.5px;color:var(--rm);font-weight:500;margin-left:2px}
.rcs-tx{font-size:15px;line-height:1.4;margin-top:3px;overflow-wrap:anywhere;font-weight:500;color:var(--rt)}
.rcs-acts{display:flex;gap:14px;align-items:center}
.rcs-rp{margin-top:4px;font-size:13px;font-weight:700;color:var(--rm);padding:2px 0;display:flex;align-items:center;gap:4px}
.rcs-rp:active{color:var(--g1)}
.rcs-del svg{width:12px;height:12px}
.rcs-del:active{color:#ff3b6b}
.rcs-lk{flex:none;width:36px;min-height:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8d92aa;margin-top:2px}
.rcs-lk svg{width:22px;height:22px;stroke-width:1.9}
.rcs-lk span{font-size:11px;font-weight:700}
.rcs-lk.rcs-on{color:#ff3b6b}.rcs-lk.rcs-on svg{fill:#ff3b6b}
.rcs-lk.rcs-self{opacity:.6}
.rcs-lk.rcs-pop svg{animation:rcs-hp .55s cubic-bezier(.34,2,.5,1)}
@keyframes rcs-hp{from{transform:scale(.3)}}
.rcs-glow::before{content:"";position:absolute;inset:0;border-radius:18px;background:linear-gradient(100deg,rgba(106,92,255,.16),rgba(255,95,162,.16));box-shadow:0 0 0 2px rgba(106,92,255,.35);pointer-events:none}
.rcs-rep{display:flex;align-items:center;justify-content:space-between;margin:0 16px;padding:8px 12px;border-radius:12px;background:var(--rtint);font-size:13px;font-weight:600;color:var(--rm)}
.rcs-rep b{color:var(--rt)}
.rcs-rep button{width:24px;height:24px;display:grid;place-items:center;color:var(--rm)}.rcs-rep svg{width:16px;height:16px;stroke-width:2.4}
.rcs-cp{display:flex;gap:10px;align-items:center;padding:12px 16px max(14px,env(safe-area-inset-bottom));border-top:1px solid var(--rl)}
.rcs-cp-rpl{border-top:0}
.rcs-inp{flex:1;min-width:0;height:48px;border:1.5px solid var(--rl);border-radius:24px;background:#fbfbfe;padding:0 18px;font:500 15px/1 inherit;font-family:inherit;color:var(--rt);outline:none;transition:border-color .2s,box-shadow .2s}
.rcs-inp::placeholder{color:#a3a8c0}
.rcs-inp:focus{border-color:var(--g1);box-shadow:0 0 0 4px rgba(106,92,255,.12);background:#fff}
.rcs-send{flex:none;width:48px;height:48px;border-radius:16px;display:grid;place-items:center;color:#fff;
  background:linear-gradient(130deg,var(--g1),var(--g2))!important;box-shadow:0 12px 20px -10px rgba(106,92,255,.85);transition:opacity .25s,transform .15s,filter .25s}
.rcs-send svg{width:22px;height:22px}
.rcs-send:disabled{opacity:.4;box-shadow:none;filter:saturate(.6);cursor:default}
.rcs-send:not(:disabled):active{transform:scale(.9)}
.rcs-signin{justify-content:center}
.rcs-signin button{font-size:14px;font-weight:800;background:linear-gradient(120deg,var(--g1),var(--g2));-webkit-background-clip:text;background-clip:text;color:transparent}
.rcs-ring{position:fixed;z-index:160;pointer-events:none;border-radius:50%;border:3px solid #ff5fa2}
.rcs-mh{position:fixed;z-index:165;pointer-events:none;font-size:14px;font-style:normal}
@media (prefers-reduced-motion:reduce){.rcs-root *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;

export default ReelCommentsSheet;
