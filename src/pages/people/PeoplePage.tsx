// लोग/डिस्कवर पेज — Exact match with Pixelgram People List UI
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layouts/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getAllProfiles, getFollowStatus, followUser, unfollowUser, createNotification } from '@/services/api';
import type { Profile } from '@/types/types';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const VerifiedIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" stroke="#07070a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Verified" className="shrink-0">
    <path d="M12 2.5l2.4 1.9 3-.2 1 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-1 2.9-3-.2L12 21.5l-2.4-1.9-3 .2-1-2.9L3.1 15.2 4 12.3l-.9-2.9 2.5-1.7 1-2.9 3 .2z"/>
    <path d="M8.6 12.2l2.4 2.3 4.4-4.6"/>
  </svg>
);

const UserPlusIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M19 8v6"/>
    <path d="M22 11h-6"/>
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
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
      const all = await getAllProfiles(0, 60);
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
          display: flex;
          flex-direction: column;
          background: #07070a;
          color: #f5f5f7;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          overflow-x: hidden;
        }
        .people-orb {
          position: absolute;
          top: -120px;
          left: 50%;
          width: 460px;
          height: 360px;
          border-radius: 50%;
          background: radial-gradient(closest-side, rgba(255,255,255,.16), rgba(255,255,255,0));
          pointer-events: none;
          animation: drift 9s ease-in-out infinite;
        }
        .people-list {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 14px 14px 36px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-width: none;
        }
        .people-list::-webkit-scrollbar {
          display: none;
        }
        .people-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          border-radius: 26px;
          background: linear-gradient(160deg, rgba(255,255,255,.11) 0%, rgba(255,255,255,.03) 55%, rgba(255,255,255,.06) 100%);
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 14px 32px rgba(0,0,0,.55);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          animation: rowin .6s cubic-bezier(.2,.8,.2,1) both;
          transition: transform .25s ease, border-color .25s ease;
        }
        .people-row:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,.22);
        }
        .people-avatar {
          position: relative;
          flex: 0 0 auto;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: 0 0 26px rgba(255,255,255,.16);
          cursor: pointer;
        }
        .people-ring {
          position: absolute;
          top: -10px;
          left: -10px;
          width: 80px;
          height: 80px;
          background: conic-gradient(from 0deg, rgba(255,255,255,.05), rgba(255,255,255,1) 25%, rgba(255,255,255,.05) 50%, rgba(255,255,255,.7) 75%, rgba(255,255,255,.05));
          animation: spin 6s linear infinite;
        }
        .people-inner {
          position: absolute;
          inset: 3px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 25%, #34343c 0%, #141418 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 23px;
          font-weight: 800;
          color: #fff;
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
          gap: 4px;
          text-align: left;
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
        }
        .people-uname {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .people-uname span {
          font-size: 16.5px;
          font-weight: 800;
          letter-spacing: -.3px;
          color: #fff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .people-fullname {
          font-size: 13.5px;
          font-weight: 500;
          color: #a1a1ab;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .people-btn {
          flex: 0 0 auto;
          min-width: 112px;
          height: 46px;
          padding: 0 18px;
          border-radius: 23px;
          font-family: inherit;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
          transition: transform .12s ease, background .2s ease;
        }
        .people-btn:active {
          transform: scale(.94);
        }
        .people-btn.follow {
          position: relative;
          overflow: hidden;
          border: 0;
          background: linear-gradient(180deg, #fff 0%, #d6d6dc 100%);
          color: #07070a;
          font-weight: 800;
          animation: glow 2.8s ease-in-out infinite;
        }
        .people-btn.follow::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 40%;
          height: 100%;
          background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.85), rgba(255,255,255,0));
          animation: shine 3.2s ease-in-out infinite;
        }
        .people-btn.following {
          border: 1px solid rgba(255,255,255,.28);
          background: rgba(255,255,255,.08);
          color: #f5f5f7;
          font-weight: 700;
        }
        .people-btn.requested {
          border: 1px solid rgba(255,255,255,.28);
          background: rgba(255,255,255,.08);
          color: #a1a1ab;
          font-weight: 700;
        }
        .people-btn:focus-visible {
          outline: 2px solid #fff;
          outline-offset: 2px;
        }
        @keyframes rowin {
          from { opacity: 0; transform: translateY(22px) scale(.97); }
          to { opacity: 1; transform: none; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shine {
          0% { transform: translateX(-140%) skewX(-20deg); }
          55%, 100% { transform: translateX(260%) skewX(-20deg); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 6px 18px rgba(255,255,255,.12); }
          50% { box-shadow: 0 8px 28px rgba(255,255,255,.30); }
        }
        @keyframes drift {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, 26px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .people-row, .people-ring, .people-btn.follow, .people-btn.follow::after, .people-orb {
            animation: none;
          }
        }
      `}</style>

      <div className="people-app">
        <div className="people-orb" aria-hidden="true" />

        {/* Sleek Glass Search Bar */}
        <div className="relative z-10 px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a1a1ab]" />
            <input
              type="text"
              placeholder="Search by name or username..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white/[0.06] border border-white/10 text-sm text-white placeholder-[#888894] outline-none focus:border-white/30 backdrop-blur-md transition-all shadow-inner"
            />
          </div>
        </div>

        {/* Content State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-white/70" />
            <span className="text-xs text-[#a1a1ab] font-medium">Loading people...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-16 h-16 rounded-3xl bg-white/[0.05] border border-white/10 flex items-center justify-center mb-3 text-2xl shadow-lg">
              🔍
            </div>
            <p className="text-[#a1a1ab] text-sm font-semibold">No people found</p>
            <p className="text-[#6d6d78] text-xs mt-1">Try searching with a different name or username</p>
          </div>
        ) : (
          <div className="people-list">
            {filtered.map((profile, i) => {
              const status = followMap[profile.user_id];
              const isFollowLoading = !!followLoading[profile.user_id];
              const isFollowed = status === 'accepted';
              const isPending = status === 'pending';
              const initial = (profile.full_name || profile.username || '?').charAt(0).toUpperCase();

              return (
                <div
                  key={profile.id || profile.user_id}
                  className="people-row"
                  style={{ animationDelay: `${Math.min(i * 0.05, 0.5).toFixed(2)}s` }}
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
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.username} />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                  </div>

                  {/* Info */}
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

                  {/* Action Button */}
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
                      <Loader2 className="w-4 h-4 animate-spin" />
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
