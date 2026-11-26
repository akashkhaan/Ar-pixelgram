// लोग/डिस्कवर पेज — Accounts list (SETSM design: glossy 3D cards + animated Follow button; profile tap old profile page kholta hai)
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layouts/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getAllProfiles, getFollowStatus, followUser, unfollowUser, createNotification } from '@/services/api';
import type { Profile } from '@/types/types';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import GlassSearch from '@/components/common/GlassSearch';

const VerifiedIcon: React.FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="#6a5cff"
    stroke="#fff"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    role="img"
    aria-label="Verified"
    style={{ flex: 'none' }}
  >
    <path d="M12 2.5l2.4 1.9 3-.2 1 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-1 2.9-3-.2L12 21.5l-2.4-1.9-3 .2-1-2.9L3.1 15.2 4 12.3l-.9-2.9 2.5-1.7 1-2.9 3 .2z" />
    <path d="M8.6 12.2l2.4 2.3 4.4-4.6" fill="none" />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** Username se stable hue nikalta hai — har avatar ka apna rang */
const hueOf = (value: string) => {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};

/** Follow karne par sparkle + ring effect (naya design) */
const playFollowFx = (btn: HTMLElement, avatar: HTMLElement | null, card: HTMLElement | null, hue: number) => {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c1 = `hsl(${hue} 85% 58%)`;
  const c2 = `hsl(${(hue + 40) % 360} 82% 50%)`;
  const r = btn.getBoundingClientRect();
  // halo
  const h = document.createElement('div');
  h.className = 'acc-fx';
  h.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:999px;box-shadow:0 0 0 3px rgba(240,98,168,.7),0 0 24px rgba(123,92,245,.6)`;
  document.body.appendChild(h);
  h.animate([{ transform: 'scale(1)', opacity: .9 }, { transform: 'scale(1.5,1.9)', opacity: 0 }], { duration: 700, easing: 'ease-out' }).onfinish = () => h.remove();
  // sparkles
  const cols = [c1, c2, '#7b5cf5', '#f062a8', '#ffc23a'];
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (let i = 0; i < 16; i++) {
    const sp = document.createElement('span');
    sp.className = 'acc-fx';
    const sz = 6 + Math.random() * 8, c = cols[i % cols.length];
    sp.style.cssText = `width:${sz}px;height:${sz}px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,${c})`;
    document.body.appendChild(sp);
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 80;
    sp.animate([
      { transform: `translate(${x}px,${y}px) scale(0)`, opacity: 1 },
      { transform: `translate(${x + Math.cos(a) * d * .6}px,${y + Math.sin(a) * d * .6}px) scale(1.2)`, opacity: 1, offset: .3 },
      { transform: `translate(${x + Math.cos(a) * d}px,${y + Math.sin(a) * d + 30}px) scale(0)`, opacity: 0 },
    ], { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => sp.remove();
  }
  // avatar shock rings + flip
  if (avatar) {
    const ar = avatar.getBoundingClientRect();
    [0, 140].forEach(delay => {
      const ring = document.createElement('div');
      ring.className = 'acc-fx';
      ring.style.cssText = `left:${ar.left}px;top:${ar.top}px;width:${ar.width}px;height:${ar.height}px;border-radius:50%;border:3px solid ${c2};box-shadow:0 0 20px ${c2}`;
      document.body.appendChild(ring);
      ring.animate([{ transform: 'scale(1)', opacity: .85 }, { transform: 'scale(3.4)', opacity: 0 }], { duration: 900, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }).onfinish = () => ring.remove();
    });
    avatar.animate([
      { transform: 'perspective(500px) rotateY(0) scale(1)' },
      { transform: 'perspective(500px) rotateY(180deg) scale(1.18)', offset: .5 },
      { transform: 'perspective(500px) rotateY(360deg) scale(1)' },
    ], { duration: 850, easing: 'cubic-bezier(.4,0,.2,1)' });
  }
  if (card) {
    card.classList.remove('sweep');
    void card.offsetWidth;
    card.classList.add('sweep');
  }
};

/** Button par bloom/jelly animation dobara chalata hai */
const replayBtnAnim = (btn: HTMLElement | null, shine: boolean) => {
  if (!btn) return;
  btn.classList.remove('bloom', 'jelly', 'shine');
  void btn.offsetWidth;
  btn.classList.add('bloom', 'jelly');
  if (shine) btn.classList.add('shine');
};

const PeoplePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [followMap, setFollowMap] = useState<Record<string, 'accepted' | 'pending' | null>>({});
  const followMapRef = React.useRef(followMap);
  followMapRef.current = followMap;
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const all = await getAllProfiles(0, 100);
      const others = all.filter(p => p.user_id !== user?.id);
      setProfiles(others);
      setFiltered(others);

      if (user) {
        const statusEntries = await Promise.all(
          others.map(async p => [p.user_id, await getFollowStatus(user.id, p.user_id)] as [string, 'accepted' | 'pending' | null])
        );
        setFollowMap(Object.fromEntries(statusEntries));
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(profiles);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(profiles.filter(p =>
      p.username.toLowerCase().includes(q) || (p.full_name || '').toLowerCase().includes(q)
    ));
  }, [search, profiles]);

  const handleFollow = async (profile: Profile, btn?: HTMLButtonElement | null) => {
    if (!user) return;
    const card = btn?.closest('.acc-item') as HTMLElement | null;
    const avatar = card?.querySelector('.acc-avatar') as HTMLElement | null;
    const hue = hueOf(profile.username || profile.user_id);
    setFollowLoading(prev => ({ ...prev, [profile.user_id]: true }));
    const status = followMap[profile.user_id];
    try {
      if (status === 'accepted' || status === 'pending') {
        await unfollowUser(profile.user_id, user.id);
        setFollowMap(prev => ({ ...prev, [profile.user_id]: null }));
        toast.success(`Unfollowed ${profile.username}`);
      } else {
        await followUser(profile.user_id, profile.is_private);
        if (profile.is_private) {
          setFollowMap(prev => ({ ...prev, [profile.user_id]: 'pending' }));
          if (btn) playFollowFx(btn, avatar, card, hue);
          await createNotification(profile.user_id, 'follow_request', user.id);
          toast.success('Follow request sent');
        } else {
          setFollowMap(prev => ({ ...prev, [profile.user_id]: 'accepted' }));
          if (btn) playFollowFx(btn, avatar, card, hue);
          await createNotification(profile.user_id, 'follow', user.id);
          toast.success(`Following ${profile.username}`);
        }
      }
    } catch (err) {
      console.error('Follow action failed:', err);
      toast.error('Action failed, please try again');
    } finally {
      setFollowLoading(prev => ({ ...prev, [profile.user_id]: false }));
      requestAnimationFrame(() => replayBtnAnim(btn ?? null, followMapRef.current[profile.user_id] != null));
    }
  };

  return (
    <MobileLayout autoHideNav>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');

        /* Light palette — jaisa design diya gaya hai */
        .people-accounts {
          --acc-bg: #ffffff;
          --acc-card: #ffffff;
          --acc-tint: #f4f5fb;
          --acc-text: #14172b;
          --acc-muted: #7b8099;
          --acc-line: #eceef7;
          --acc-ring: #ffffff;
          --acc-g1: #6a5cff;
          --acc-g2: #ff5fa2;
          min-height: 100%;
          width: 100%;
          background: var(--acc-bg);
          color: var(--acc-text);
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          padding-bottom: calc(84px + env(safe-area-inset-bottom));
        }
        /* Dark mode — wahi design, app ke tokens ke saath */
        .dark .people-accounts {
          --acc-bg: hsl(var(--background));
          --acc-card: hsl(var(--card));
          --acc-tint: hsl(var(--muted));
          --acc-text: hsl(var(--foreground));
          --acc-muted: hsl(250 18% 70%);
          --acc-line: hsl(var(--border));
          --acc-ring: hsl(var(--card));
        }

        .acc-list {
          --u: calc(min(100vw, 430px) / 360);
          max-width: 430px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: calc(11 * var(--u));
          padding: calc(6 * var(--u)) calc(12 * var(--u)) 48px;
        }
        .acc-item {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: calc(10 * var(--u));
          padding: calc(8 * var(--u)) calc(10 * var(--u));
          background: var(--acc-card);
          border-radius: calc(32 * var(--u));
          width: 100%;
          box-sizing: border-box;
          text-align: left;
          cursor: pointer;
          transition: background .25s, transform .25s cubic-bezier(.2,.9,.3,1.3);
        }
        .acc-item:active { background: var(--acc-tint); transform: perspective(700px) rotateX(5deg) scale(.975); }
        .acc-item::before {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(100deg, transparent 20%, rgba(123,92,245,.13) 45%, rgba(240,98,168,.16) 55%, transparent 80%);
          transform: translateX(-110%);
        }
        .acc-item.sweep::before { animation: acc-sweep .9s ease-out; }
        @keyframes acc-sweep { to { transform: translateX(110%); } }

        /* glossy 3D sphere avatar */
        .acc-avatar {
          --s: calc(48 * var(--u));
          position: relative;
          flex: none;
          width: var(--s);
          height: var(--s);
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: calc(var(--s) * .42);
          color: #fff;
          text-shadow: 0 2px 4px rgba(0,0,0,.28);
          background: linear-gradient(135deg, hsl(var(--h) 85% 58%), hsl(calc(var(--h) + 40) 82% 50%));
          box-shadow: inset -7px -10px 16px rgba(0,0,0,.25), inset 5px 6px 12px rgba(255,255,255,.4), 0 12px 20px hsl(calc(var(--h) + 40) 82% 50% / .5);
          overflow: hidden;
          cursor: pointer;
          padding: 0;
          border: 0;
        }
        .acc-avatar::before {
          content: ""; position: absolute; left: 15%; top: 7%; width: 56%; height: 34%; border-radius: 50%;
          background: linear-gradient(rgba(255,255,255,.8), rgba(255,255,255,0)); filter: blur(.6px); z-index: 1; pointer-events: none;
        }
        .acc-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
        .acc-who {
          flex: 1; min-width: 0; display: flex; flex-direction: column;
          background: transparent; border: 0; padding: 0; text-align: left; cursor: pointer; font-family: inherit;
        }
        .acc-user {
          font-weight: 700;
          font-size: calc(16 * var(--u));
          letter-spacing: -.2px;
          color: var(--acc-text);
          display: flex; align-items: center; gap: 4px; min-width: 0;
        }
        .acc-user span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .acc-name {
          font-weight: 600;
          font-size: calc(13.5 * var(--u));
          color: var(--acc-muted);
          margin-top: 1px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* glossy 3D button */
        .acc-btn {
          flex: none;
          width: calc(92 * var(--u));
          height: calc(34 * var(--u));
          border: 0;
          border-radius: 999px;
          color: #fff;
          font-weight: 700;
          font-size: calc(15 * var(--u));
          font-family: inherit;
          cursor: pointer;
          background: linear-gradient(100deg, #7b5cf5, #f062a8);
          box-shadow: inset 0 -4px 0 rgba(60,20,120,.28), inset 0 2px 0 rgba(255,255,255,.5), 0 12px 22px rgba(123,92,245,.36);
          display: flex; align-items: center; justify-content: center; white-space: nowrap;
          position: relative; overflow: hidden;
          transition: width .55s cubic-bezier(.3,1.5,.5,1), background .3s, color .3s, box-shadow .2s, transform .12s;
          box-sizing: border-box;
          padding: 0;
        }
        .acc-btn::before {
          content: ""; position: absolute; left: 0; right: 0; top: 0; height: 52%; pointer-events: none;
          background: linear-gradient(rgba(255,255,255,.42), rgba(255,255,255,.04));
          border-radius: 999px 999px 60% 60%; transition: opacity .3s;
        }
        .acc-btn::after {
          content: ""; position: absolute; top: -10%; bottom: -10%; left: -60%; width: 40%; pointer-events: none;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.85), transparent); transform: skewX(-20deg);
        }
        .acc-btn.shine::after { animation: acc-shine .75s ease-out; }
        @keyframes acc-shine { to { left: 130%; } }
        .acc-btn:active { transform: translateY(3px) scale(.96); }
        .acc-btn:focus-visible { outline: 3px solid #fff; outline-offset: 3px; box-shadow: 0 0 0 6px #7b5cf5; }
        .acc-btn .in { position: relative; z-index: 1; display: flex; align-items: center; gap: calc(6 * var(--u)); }
        .acc-btn svg { width: calc(13 * var(--u)); height: calc(13 * var(--u)); fill: none; stroke: currentColor; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; }
        .acc-btn.is-on, .acc-btn.is-pending {
          width: calc(118 * var(--u));
          background: linear-gradient(180deg, #fff, #efeaff);
          color: #6a45e8;
          box-shadow: inset 0 -3px 0 rgba(123,92,245,.18), inset 0 2px 0 #fff, 0 8px 16px rgba(123,92,245,.2);
        }
        .acc-btn.is-on::before, .acc-btn.is-pending::before { opacity: 0; }
        .acc-btn.bloom .in { animation: acc-bloom .6s cubic-bezier(.2,1.7,.4,1); }
        @keyframes acc-bloom { 0% { transform: scale(.4); opacity: 0; } 100% { transform: none; opacity: 1; } }
        .acc-btn.bloom svg path { stroke-dasharray: 30; animation: acc-draw .45s .08s ease-out both; }
        @keyframes acc-draw { from { stroke-dashoffset: 30; } to { stroke-dashoffset: 0; } }
        .acc-btn.jelly { animation: acc-jelly .8s cubic-bezier(.3,1,.4,1); }
        @keyframes acc-jelly { 0%{transform:scale(1)} 18%{transform:scale(1.2,.74)} 38%{transform:scale(.84,1.2)} 58%{transform:scale(1.08,.94)} 78%{transform:scale(.97,1.03)} 100%{transform:scale(1)} }
        .acc-btn:disabled { cursor: default; }
        .acc-state { color: var(--acc-muted); font-size: 12px; font-weight: 500; }
        .acc-fx { position: fixed; left: 0; top: 0; z-index: 90; pointer-events: none; will-change: transform; }
        @media (prefers-reduced-motion: reduce) {
          .acc-btn, .acc-item { transition: none; animation: none; }
        }
      `}</style>

      <div className="people-accounts">
        {/* Search — jaisa pehle kaam kar raha tha, waisa hi */}
        <div className="relative z-10 px-3.5 pt-3 pb-2">
          <div className="relative">
            <GlassSearch
              placeholder="Search by name or username..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin acc-state" />
            <span className="acc-state">Loading people...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 text-2xl bg-[var(--acc-tint)] border border-[var(--acc-line)]">
              🔍
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--acc-text)' }}>No people found</p>
            <p className="text-xs mt-1" style={{ color: 'var(--acc-muted)' }}>Try searching with a different name or username</p>
          </div>
        ) : (
          <main className="acc-list" aria-label="Accounts">
            {filtered.map(profile => {
              const status = followMap[profile.user_id];
              const isFollowLoading = !!followLoading[profile.user_id];
              const isFollowed = status === 'accepted';
              const isPending = status === 'pending';
              const displayName = profile.full_name || `@${profile.username}`;
              const initial = (profile.full_name || profile.username || '?').charAt(0).toUpperCase();

              return (
                <div
                  key={profile.id || profile.user_id}
                  className="acc-item"
                  onClick={() => navigate(`/profile/${profile.user_id}`)}
                >
                  <button
                    type="button"
                    className="acc-avatar"
                    style={{ '--h': hueOf(profile.username || profile.user_id) } as React.CSSProperties}
                    onClick={() => navigate(`/profile/${profile.user_id}`)}
                    aria-label={`View ${profile.username}'s profile`}
                  >
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.username} loading="lazy" />
                    ) : (
                      <span aria-hidden="true">{initial}</span>
                    )}
                  </button>

                  <button
                    type="button"
                    className="acc-who"
                    onClick={() => navigate(`/profile/${profile.user_id}`)}
                  >
                    <div className="acc-user">
                      <span>{profile.username}</span>
                      {profile.is_verified && <VerifiedIcon />}
                    </div>
                    <div className="acc-name">{displayName}</div>
                  </button>

                  <button
                    type="button"
                    className={`acc-btn ${isFollowed ? 'is-on' : isPending ? 'is-pending' : ''}`}
                    onClick={e => { e.stopPropagation(); handleFollow(profile, e.currentTarget); }}
                    disabled={isFollowLoading}
                    aria-pressed={isFollowed || isPending}
                    aria-label={`${isFollowed || isPending ? 'Unfollow' : 'Follow'} ${profile.username}`}
                  >
                    <span className="in">
                      {isFollowLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isFollowed ? (
                        <span>Following</span>
                      ) : isPending ? (
                        <span>Requested</span>
                      ) : (
                        <>
                          <PlusIcon />
                          <span>Follow</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </main>
        )}
      </div>
    </MobileLayout>
  );
};

export default PeoplePage;
