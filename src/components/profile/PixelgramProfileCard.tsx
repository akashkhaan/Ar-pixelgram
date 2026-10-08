import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Loader2 } from 'lucide-react';
import type { Profile } from '@/types/types';

interface PixelgramProfileCardProps {
  profile: Profile;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  followStatus?: 'accepted' | 'pending' | null;
  followLoading?: boolean;
  onFollow?: () => void;
  onAvatarUpload?: (file: File) => void;
  onScrollToPosts?: () => void;
}

export const PixelgramProfileCard: React.FC<PixelgramProfileCardProps> = ({
  profile,
  postsCount,
  followersCount,
  followingCount,
  isOwnProfile,
  followStatus,
  followLoading,
  onFollow,
  onAvatarUpload,
  onScrollToPosts,
}) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Responsive scale factor (base width 784px)
  const [scale, setScale] = useState<number>(0.48);

  // Animation timeline state
  const [cardShow, setCardShow] = useState<boolean>(false);
  const [avatarState, setAvatarState] = useState<'initial' | 'center' | 'pos'>('initial');
  const [unameShow, setUnameShow] = useState<boolean>(false);
  const [s1Show, setS1Show] = useState<boolean>(false);
  const [s2Show, setS2Show] = useState<boolean>(false);
  const [s3Show, setS3Show] = useState<boolean>(false);
  const [handleShow, setHandleShow] = useState<boolean>(false);
  const [btnShow, setBtnShow] = useState<boolean>(false);
  const [uiFloat, setUiFloat] = useState<boolean>(false);

  // Display count numbers (start from 0, animate up)
  const [dispPosts, setDispPosts] = useState<number>(0);
  const [dispFollowers, setDispFollowers] = useState<number>(0);
  const [dispFollowing, setDispFollowing] = useState<number>(0);

  // Track if initial count animation has run
  const hasAnimatedPosts = useRef<boolean>(false);
  const hasAnimatedFollowers = useRef<boolean>(false);
  const hasAnimatedFollowing = useRef<boolean>(false);

  // Responsive scale observer
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) {
          setScale(w / 784);
        }
      }
    };
    handleResize();

    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', handleResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Guaranteed count-up animation function
  const countUp = (
    from: number,
    to: number,
    durationMs: number,
    setter: React.Dispatch<React.SetStateAction<number>>
  ) => {
    if (to <= 0) {
      setter(0);
      return;
    }
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startTime) / durationMs);
      // easeOutCubic curve
      const ease = 1 - Math.pow(1 - elapsed, 3);
      const current = Math.round(from + (to - from) * ease);
      setter(current);
      if (elapsed < 1) {
        requestAnimationFrame(step);
      } else {
        setter(to);
      }
    };
    requestAnimationFrame(step);
  };

  // Snappy sequence on mount
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Stage 1 (50ms): Card appears, avatar enters center
    timers.push(
      setTimeout(() => {
        setCardShow(true);
        setAvatarState('center');
      }, 50)
    );

    // Stage 2 (800ms): Avatar flips to left position
    timers.push(
      setTimeout(() => {
        setAvatarState('pos');
      }, 800)
    );

    // Stage 3 (1200ms): Username appears
    timers.push(
      setTimeout(() => {
        setUnameShow(true);
      }, 1200)
    );

    // Stage 4 (1400ms): Posts appear & count
    timers.push(
      setTimeout(() => {
        setS1Show(true);
        hasAnimatedPosts.current = true;
        countUp(0, postsCount, 800, setDispPosts);
      }, 1400)
    );

    // Stage 5 (1600ms): Followers appear & count
    timers.push(
      setTimeout(() => {
        setS2Show(true);
        hasAnimatedFollowers.current = true;
        countUp(0, followersCount, 1000, setDispFollowers);
      }, 1600)
    );

    // Stage 6 (1800ms): Following appear & count
    timers.push(
      setTimeout(() => {
        setS3Show(true);
        hasAnimatedFollowing.current = true;
        countUp(0, followingCount, 800, setDispFollowing);
      }, 1800)
    );

    // Stage 7 (2000ms): Handle reveals
    timers.push(
      setTimeout(() => {
        setHandleShow(true);
      }, 2000)
    );

    // Stage 8 (2200ms): Buttons reveal
    timers.push(
      setTimeout(() => {
        setBtnShow(true);
      }, 2200)
    );

    // Stage 9 (2500ms): Ambient floating physics
    timers.push(
      setTimeout(() => {
        setUiFloat(true);
      }, 2500)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  // Animate whenever numbers load or change (e.g. after Supabase API fetch)
  useEffect(() => {
    if (s1Show || hasAnimatedPosts.current) {
      countUp(dispPosts, postsCount, 700, setDispPosts);
    }
  }, [postsCount]);

  useEffect(() => {
    if (s2Show || hasAnimatedFollowers.current) {
      countUp(dispFollowers, followersCount, 900, setDispFollowers);
    }
  }, [followersCount]);

  useEffect(() => {
    if (s3Show || hasAnimatedFollowing.current) {
      countUp(dispFollowing, followingCount, 700, setDispFollowing);
    }
  }, [followingCount]);

  // Floating particles canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const cols = ['#a78bfa', '#ff5fb0', '#ffb066', '#ffffff'];
    const particles = Array.from({ length: 38 }, () => ({
      x: Math.random() * 784,
      y: Math.random() * 415,
      r: Math.random() * 2.2 + 0.6,
      v: Math.random() * 0.4 + 0.15,
      c: cols[Math.floor(Math.random() * cols.length)],
      o: Math.random() * 0.6 + 0.2,
      ph: Math.random() * 6,
    }));

    const render = (time: number) => {
      ctx.clearRect(0, 0, 784, 415);
      particles.forEach((p) => {
        p.y -= p.v;
        if (p.y < -5) {
          p.y = 420;
          p.x = Math.random() * 784;
        }
        ctx.globalAlpha = p.o * (0.6 + 0.4 * Math.sin(time / 700 + p.ph));
        ctx.fillStyle = p.c;
        ctx.shadowColor = p.c;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(time / 2000 + p.ph) * 8, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleAvatarClick = () => {
    if (isOwnProfile && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAvatarUpload) {
      onAvatarUpload(file);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full relative overflow-hidden select-none my-1 bg-white dark:bg-[#0b0f19] border border-slate-200/80 dark:border-white/10 shadow-sm transition-colors duration-300"
      style={{
        height: `${Math.round(415 * scale)}px`,
        borderRadius: `${Math.round(36 * scale)}px`,
      }}
    >
      {/* Scaled Virtual Stage Container (Compact 784x415 base) */}
      <div
        className="pxc-stage"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {/* Ambient Aurora Glow */}
        <div className="pxc-aurora">
          <i />
          <i />
          <i />
        </div>

        {/* Drifting Grid Lines */}
        <div className="pxc-grid" />

        {/* Floating Particles Canvas */}
        <canvas ref={canvasRef} width={784} height={415} className="absolute inset-0 pointer-events-none z-0 hidden dark:block" />

        {/* Glowing Conic Border Card */}
        <div className={`pxc-card ${cardShow ? 'show' : ''}`} />

        {/* Inner Interactive UI */}
        <div className={`pxc-ui ${uiFloat ? 'float' : ''}`}>
          {/* 3D Flipping Avatar */}
          <div
            className={`pxc-avatar ${
              avatarState === 'center' ? 'center' : avatarState === 'pos' ? 'pos' : ''
            }`}
            onClick={handleAvatarClick}
            style={{ cursor: isOwnProfile ? 'pointer' : 'default' }}
            title={isOwnProfile ? 'Tap to change profile picture' : undefined}
          >
            {/* Front Face */}
            <div className="face front">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username} />
              ) : (
                <div
                  className="avatar-img flex items-center justify-center font-black text-6xl text-white shadow-2xl"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #ec2c8f, #ff8a1f)',
                  }}
                >
                  {profile.username?.[0]?.toUpperCase() || 'P'}
                </div>
              )}
            </div>

            {/* Back Face with Conic Spinning Ring */}
            <div className="face back">
              {/* ring removed */}
              <div
                className="pxc-ph"
                style={{
                  backgroundImage: profile.avatar_url
                    ? `url(${profile.avatar_url})`
                    : 'linear-gradient(135deg, #7c3aed, #ec2c8f, #ff8a1f)',
                }}
              />
            </div>

            {/* Camera Badge if Own Profile */}
            {isOwnProfile && (
              <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-lg border-2 border-white/80 z-20 pointer-events-none">
                <Camera className="w-5 h-5 text-white" />
              </div>
            )}
          </div>

          {/* Hidden File Input for Avatar Upload */}
          {isOwnProfile && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          )}

          {/* Username with Verified Badge (Bigger & Bolder Text) */}
          <div className={`pxc-uname pxc-rv ${unameShow ? 'show' : ''}`}>
            <span>{profile.full_name || profile.username}</span>
            {profile.is_verified && (
              <svg viewBox="0 0 24 24" aria-label="Verified">
                <path
                  d="M12 1.8l2.5 1.7 3-.2 1.2 2.8 2.7 1.4-.4 3 1.3 2.7-2 2.3-.3 3-3 .8-1.8 2.4-2.8-1.1-2.8 1.1-1.8-2.4-3-.8-.3-3-2-2.3 1.3-2.7-.4-3 2.7-1.4 1.2-2.8 3 .2z"
                  fill="#2f8bff"
                />
                <path
                  d="M7.8 12.3l3 3 5.6-6"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>

          {/* Stats: Posts, Followers, Following (Bold Numbers with Smooth Count Up) */}
          <div className="pxc-stats">
            {/* Posts */}
            <button
              type="button"
              className={`pxc-stat pxc-rv ${s1Show ? 'show' : ''}`}
              onClick={onScrollToPosts}
            >
              <b>{dispPosts}</b>
              <span>पोस्ट्स</span>
            </button>

            {/* Followers */}
            <button
              type="button"
              className={`pxc-stat pxc-rv ${s2Show ? 'show' : ''}`}
              onClick={() => navigate(`/followers/${profile.user_id}`)}
            >
              <b>{dispFollowers}</b>
              <span>फॉलोअर्स</span>
            </button>

            {/* Following */}
            <button
              type="button"
              className={`pxc-stat pxc-rv ${s3Show ? 'show' : ''}`}
              onClick={() => navigate(`/following/${profile.user_id}`)}
            >
              <b>{dispFollowing}</b>
              <span>फॉलोइंग</span>
            </button>
          </div>

          {/* Handle (Bigger & Crisper Text) */}
          <div className={`pxc-handle pxc-rv ${handleShow ? 'show' : ''}`}>
            @{profile.username}
          </div>

          {/* Action Buttons (Bigger Text & Sleek Touch Areas) */}
          {isOwnProfile ? (
            <>
              {/* Button 1: Edit Profile */}
              <button
                type="button"
                className={`pxc-btn pxc-follow pxc-rv ${btnShow ? 'show' : ''}`}
                onClick={() => navigate('/edit-profile')}
              >
                <span>प्रोफ़ाइल एडिट करें</span>
              </button>

              {/* Button 2: Settings */}
              <button
                type="button"
                className={`pxc-btn pxc-msg pxc-rv ${btnShow ? 'show' : ''}`}
                onClick={() => navigate('/settings')}
              >
                <span>सेटिंग्स</span>
              </button>
            </>
          ) : (
            <>
              {/* Button 1: Follow / Following */}
              <button
                type="button"
                className={`pxc-btn pxc-follow pxc-rv ${btnShow ? 'show' : ''} ${
                  followStatus === 'accepted' ? 'on' : ''
                }`}
                onClick={onFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : followStatus === 'accepted' ? (
                  <>
                    <Check className="w-6 h-6 stroke-[3]" />
                    <span>FOLLOWING</span>
                  </>
                ) : followStatus === 'pending' ? (
                  <span>REQUESTED</span>
                ) : (
                  <span>FOLLOW</span>
                )}
              </button>

              {/* Button 2: Message */}
              <button
                type="button"
                className={`pxc-btn pxc-msg pxc-rv ${btnShow ? 'show' : ''}`}
                onClick={() => navigate(`/chat/${profile.user_id}`)}
              >
                <span>MESSAGE</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PixelgramProfileCard;
