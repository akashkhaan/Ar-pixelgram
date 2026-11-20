// लोग/डिस्कवर पेज — Accounts list (naya design: simple card rows + gradient Follow pill)
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

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** Username se stable hue nikalta hai — har avatar ka apna rang */
const hueOf = (value: string) => {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};

const PeoplePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [followMap, setFollowMap] = useState<Record<string, 'accepted' | 'pending' | null>>({});
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

  const handleFollow = async (profile: Profile) => {
    if (!user) return;
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
          await createNotification(profile.user_id, 'follow_request', user.id);
          toast.success('Follow request sent');
        } else {
          setFollowMap(prev => ({ ...prev, [profile.user_id]: 'accepted' }));
          await createNotification(profile.user_id, 'follow', user.id);
          toast.success(`Following ${profile.username}`);
        }
      }
    } catch (err) {
      console.error('Follow action failed:', err);
      toast.error('Action failed, please try again');
    } finally {
      setFollowLoading(prev => ({ ...prev, [profile.user_id]: false }));
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
          max-width: 520px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 4px 12px 8px;
        }
        .acc-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: var(--acc-card);
          border: 1px solid var(--acc-line);
          border-radius: 18px;
          box-shadow: 0 6px 18px -12px rgba(60, 50, 160, .28);
          width: 100%;
          box-sizing: border-box;
          text-align: left;
        }
        .acc-avatar {
          flex: none;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 16px;
          color: #fff;
          background: linear-gradient(140deg, hsl(var(--h) 85% 62%), hsl(calc(var(--h) + 40) 80% 50%));
          box-shadow: 0 0 0 2px var(--acc-ring), 0 0 0 3.5px hsl(var(--h) 85% 85% / .9);
          margin: 0 2px;
          overflow: hidden;
          cursor: pointer;
          padding: 0;
          border: 0;
        }
        .acc-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
          display: block;
        }
        .acc-who {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: transparent;
          border: 0;
          padding: 0;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
        }
        .acc-user {
          font-weight: 700;
          font-size: clamp(12.5px, 3.9vw, 15px);
          letter-spacing: -.01em;
          line-height: 1.25;
          color: var(--acc-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }
        .acc-user span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .acc-name {
          font-weight: 500;
          font-size: clamp(11.5px, 3.4vw, 13px);
          line-height: 1.3;
          color: var(--acc-muted);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .acc-btn {
          flex: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 92px;
          height: 34px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          font-family: inherit;
          font-weight: 600;
          font-size: 12.5px;
          cursor: pointer;
          color: #fff;
          background: linear-gradient(120deg, var(--acc-g1), var(--acc-g2));
          box-shadow: 0 6px 12px -7px rgba(106, 92, 255, .7);
          transition: transform .15s, box-shadow .2s, background .2s, color .2s;
          box-sizing: border-box;
        }
        .acc-btn svg {
          width: 13px;
          height: 13px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .acc-btn:active { transform: scale(.95); }
        .acc-btn:focus-visible { outline: 2px solid var(--acc-g1); outline-offset: 3px; }
        .acc-btn.is-on {
          background: var(--acc-tint);
          color: var(--acc-g1);
          box-shadow: inset 0 0 0 1.5px hsl(var(--border));
        }
        .acc-btn.is-pending {
          background: var(--acc-tint);
          color: var(--acc-text);
          box-shadow: inset 0 0 0 1.5px hsl(var(--border));
        }
        .acc-btn:disabled { opacity: .7; cursor: default; }
        .acc-state { color: var(--acc-muted); font-size: 12px; font-weight: 500; }
        @media (prefers-reduced-motion: reduce) {
          .acc-btn { transition: none; }
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
                <div key={profile.id || profile.user_id} className="acc-item">
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
                    onClick={() => handleFollow(profile)}
                    disabled={isFollowLoading}
                    aria-pressed={isFollowed || isPending}
                    aria-label={`${isFollowed || isPending ? 'Unfollow' : 'Follow'} ${profile.username}`}
                  >
                    {isFollowLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isFollowed ? (
                      <>
                        <CheckIcon />
                        <span>Following</span>
                      </>
                    ) : isPending ? (
                      <span>Requested</span>
                    ) : (
                      <>
                        <PlusIcon />
                        <span>Follow</span>
                      </>
                    )}
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
