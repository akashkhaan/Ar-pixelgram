// लोग/डिस्कवर पेज — Ultra-smooth native scrolling People List
import StoryRing from '@/components/common/StoryRing';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layouts/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getAllProfiles, getFollowStatus, followUser, unfollowUser, createNotification } from '@/services/api';
import type { Profile } from '@/types/types';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const VerifiedIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff" stroke="#07070a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Verified" className="shrink-0">
    <path d="M12 2.5l2.4 1.9 3-.2 1 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-1 2.9-3-.2L12 21.5l-2.4-1.9-3 .2-1-2.9L3.1 15.2 4 12.3l-.9-2.9 2.5-1.7 1-2.9 3 .2z"/>
    <path d="M8.6 12.2l2.4 2.3 4.4-4.6"/>
  </svg>
);

const UserPlusIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M19 8v6"/>
    <path d="M22 11h-6"/>
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
);

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
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .people-app {
          position: relative;
          width: 100%;
          min-height: 100%;
          --people-bg: hsl(var(--background));
          --people-surface: hsl(var(--card));
          --people-muted-surface: hsl(var(--muted));
          --people-foreground: hsl(var(--foreground));
          --people-subtle: hsl(var(--muted-foreground));
          background: var(--people-bg);
          color: var(--people-foreground);
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        }
        .people-orb {
          position: absolute;
          top: -100px;
          left: 50%;
          transform: translateX(-50%);
          width: 360px;
          height: 260px;
          border-radius: 50%;
          background: radial-gradient(closest-side, rgba(255,61,127,.12), rgba(124,92,255,0));
          pointer-events: none;
        }
        .people-list {
          padding: 8px 10px 90px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .people-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 20px;
          background: var(--people-surface);
          border: 1px solid hsl(var(--border) / .75);
          box-shadow: 0 6px 18px rgba(0,0,0,.08);
          transition: transform .15s ease, border-color .15s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .people-row:active {
          transform: scale(0.99);
        }
        .people-avatar {
          position: relative;
          flex: 0 0 46px;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: 0 0 18px rgba(124,92,255,.18);
          cursor: pointer;
        }
        .people-ring {
          position: absolute;
          top: -8px;
          left: -8px;
          width: 62px;
          height: 62px;
          background: conic-gradient(from 0deg, rgba(124,92,255,.35), rgba(255,61,127,.9) 25%, rgba(124,92,255,.35) 50%, rgba(255,61,127,.8) 75%, rgba(124,92,255,.35));
          animation: spin 6s linear infinite;
        }
        .people-inner {
          position: absolute;
          inset: 2.5px;
          border-radius: 50%;
          background: linear-gradient(135deg, hsl(var(--muted)), hsl(var(--background)));
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 800;
          color: var(--people-foreground);
        }
        .people-inner img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }
        .people-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          text-align: left;
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
        }
        .people-uname {
          display: flex;
          align-items: center;
          gap: 5px;
          width: 100%;
          min-width: 0;
        }
        .people-uname span {
          font-size: 14.5px;
          font-weight: 800;
          letter-spacing: -.2px;
          color: var(--people-foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: block;
        }
        .people-fullname {
          font-size: 12px;
          font-weight: 500;
          color: var(--people-subtle);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .people-btn {
          flex: 0 0 auto;
          min-width: 84px;
          height: 36px;
          padding: 0 12px;
          border-radius: 18px;
          font-family: inherit;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          cursor: pointer;
          transition: transform .12s ease, opacity .2s ease;
          box-sizing: border-box;
        }
        .people-btn:active {
          transform: scale(.93);
        }
        .people-btn.follow {
          border: 1px solid hsl(var(--border) / .8);
          background: linear-gradient(180deg, #ffffff 0%, #e8e8ee 100%);
          color: #111116;
          font-weight: 800;
          box-shadow: 0 3px 12px rgba(0,0,0,.1);
        }
        .people-btn.following {
          border: 1px solid hsl(var(--border));
          background: var(--people-muted-surface);
          color: var(--people-foreground);
          font-weight: 700;
        }
        .people-btn.requested {
          border: 1px solid hsl(var(--border));
          background: var(--people-muted-surface);
          color: var(--people-subtle);
          font-weight: 700;
        }
        .people-search {
          display: block;
          box-sizing: border-box;
          width: 100%;
          height: 40px;
          padding: 0 16px 0 40px;
          border-radius: 12px;
          background: var(--people-surface);
          border: 1px solid hsl(var(--border));
          color: var(--people-foreground);
          font-size: 14px;
          outline: none;
          box-shadow: inset 0 1px 2px rgba(0,0,0,.05);
          transition: border-color .2s, background .2s;
        }
        .people-search::placeholder { color: var(--people-subtle); }
        .people-search:focus { border-color: #ff3d7f; }
        .people-loading-icon { color: var(--people-subtle); }
        .people-loading-label { color: var(--people-subtle); font-size: 12px; font-weight: 500; }
        .people-empty-icon {
          background: var(--people-muted-surface);
          border: 1px solid hsl(var(--border));
        }
        .people-empty-title { color: var(--people-foreground); }
        .people-empty-copy { color: var(--people-subtle); }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="people-app">
        <div className="people-orb" aria-hidden="true" />

        {/* Search Bar */}
        <div className="relative z-10 px-3.5 pt-3 pb-1.5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--people-subtle)' }} />
            <input
              type="text"
              placeholder="Search by name or username..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="people-search"
            />
          </div>
        </div>

        {/* Content State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin people-loading-icon" />
            <span className="people-loading-label">Loading people...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="people-empty-icon w-14 h-14 rounded-2xl flex items-center justify-center mb-3 text-2xl shadow-lg">
              🔍
            </div>
            <p className="people-empty-title text-sm font-semibold">No people found</p>
            <p className="people-empty-copy text-xs mt-1">Try searching with a different name or username</p>
          </div>
        ) : (
          <div className="people-list">
            {filtered.map(profile => {
              const status = followMap[profile.user_id];
              const isFollowLoading = !!followLoading[profile.user_id];
              const isFollowed = status === 'accepted';
              const isPending = status === 'pending';
              const initial = (profile.full_name || profile.username || '?').charAt(0).toUpperCase();

              return (
                <div
                  key={profile.id || profile.user_id}
                  className="people-row"
                >
                  {/* Glowing Animated Ring Avatar */}
                  <div
                    className="people-avatar"
                    onClick={() => navigate(`/profile/${profile.user_id}`)}
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${profile.username}'s profile`}
                  >
                    <div className="people-ring" aria-hidden="true" />
                    <div className="people-inner">
                      <StoryRing userId={profile.user_id} className="w-full h-full">
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.username} />
                      ) : (
                        <span>{initial}</span>
                      )}
                      </StoryRing>
                    </div>
                  </div>

                  {/* Info — full width for long usernames */}
                  <button
                    type="button"
                    className="people-info"
                    onClick={() => navigate(`/profile/${profile.user_id}`)}
                  >
                    <div className="people-uname">
                      <span>{profile.username}</span>
                      {profile.is_verified && <VerifiedIcon />}
                    </div>
                    <div className="people-fullname">
                      {profile.full_name || `@${profile.username}`}
                    </div>
                  </button>

                  {/* Compact Action Button */}
                  <button
                    type="button"
                    onClick={() => handleFollow(profile)}
                    disabled={isFollowLoading}
                    className={`people-btn ${
                      isFollowed ? 'following' : isPending ? 'requested' : 'follow'
                    }`}
                    aria-label={`${isFollowed ? 'Unfollow' : 'Follow'} ${profile.username}`}
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
                        <UserPlusIcon />
                        <span>Follow</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default PeoplePage;
