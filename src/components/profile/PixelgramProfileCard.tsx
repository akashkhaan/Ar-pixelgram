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

  const [scale, setScale] = useState<number>(0.48);

  // Animation states matching user HTML
  const [cardShow, setCardShow] = useState<boolean>(false);
  const [avatarState, setAvatarState] = useState<'initial' | 'center' | 'pos'>('initial');
  const [unameShow, setUnameShow] = useState<boolean>(false);
  const [s1Show, setS1Show] = useState<boolean>(false);
  const [s2Show, setS2Show] = useState<boolean>(false);
  const [s3Show, setS3Show] = useState<boolean>(false);
  const [handleShow, setHandleShow] = useState<boolean>(false);
  const [btnShow, setBtnShow] = useState<boolean>(false);
  const [uiFloat, setUiFloat] = useState<boolean>(false);

  // Animated counters
  const [dispPosts, setDispPosts] = useState<number>(0);
  const [dispFollowers, setDispFollowers] = useState<number>(0);
  const [dispFollowing, setDispFollowing] = useState<number>(0);

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

  // Number count up animation helper
  const animateCount = (
    from: number,
    to: number,
    duration: number,
    setter: React.Dispatch<React.SetStateAction<number>>
  ) => {
    if (from === to) {
      setter(to);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - elapsed, 3);
      setter(Math.round(from + (to - from) * ease));
      if (elapsed < 1) {
        requestAnimationFrame(step);
      } else {
        setter(to);
      }
    };
    requestAnimationFrame(step);
  };

  // Main intro animation timeline from user HTML
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Stage 1: Card show & avatar in center
    timers.push(
      setTimeout(() => {
        setCardShow(true);
        setAvatarState('center');
      }, 100)
    );

    // Stage 2: Avatar flips to final left position
    timers.push(
      setTimeout(() => {
        setAvatarState('pos');
      }, 1400)
    );

    // Stage 3: Username reveals
    timers.push(
      setTimeout(() => {
        setUnameShow(true);
      }, 2200)
    );

    // Stage 4: Posts counter reveals
    timers.push(
      setTimeout(() => {
        setS1Show(true);
        animateCount(0, postsCount, 900, setDispPosts);
      }, 2500)
    );

    // Stage 5: Followers counter reveals
    timers.push(
      setTimeout(() => {
        setS2Show(true);
        animateCount(0, followersCount, 1000, setDispFollowers);
      }, 2750)
    );

    // Stage 6: Following counter reveals
    timers.push(
      setTimeout(() => {
        setS3Show(true);
        animateCount(0, followingCount, 900, setDispFollowing);
      }, 3000)
    );

    // Stage 7: Handle reveals
    timers.push(
      setTimeout(() => {
        setHandleShow(true);
      }, 3400)
    );

    // Stage 8: Action buttons reveal
    timers.push(
      setTimeout(() => {
        setBtnShow(true);
      }, 3800)
    );

    // Stage 9: Ambient floating physics
    timers.push(
      setTimeout(() => {
        setUiFloat(true);
      }, 4300)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [postsCount, followersCount, followingCount]);

  // Keep numbers updated if props change after intro
  useEffect(() => {
    if (s1Show) setDispPosts(postsCount);
  }, [postsCount, s1Show]);
  useEffect(() => {
    if (s2Show) setDispFollowers(followersCount);
  }, [followersCount, s2Show]);
  useEffect(() => {
    if (s3Show) setDispFollowing(followingCount);
  }, [followingCount, s3Show]);

  // Canvas floating particles loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const cols = ['#a78bfa', '#ff5fb0', '#ffb066', '#ffffff'];
    const particles = Array.from({ length: 42 }, () => ({
      x: Math.random() * 784,
      y: Math.random() * 570,
      r: Math.random() * 2.2 + 0.6,
      v: Math.random() * 0.4 + 0.15,
      c: cols[Math.floor(Math.random() * cols.length)],
      o: Math.random() * 0.6 + 0.2,
      ph: Math.random() * 6,
    }));

    const render = (time: number) => {
      ctx.clearRect(0, 0, 784, 570);
      particles.forEach((p) => {
        p.y -= p.v;
        if (p.y < -5) {
          p.y = 575;
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
      className="w-full relative overflow-hidden select-none my-1"
      style={{
        height: `${Math.round(570 * scale)}px`,
        borderRadius: `${Math.round(48 * scale)}px`,
      }}
    >
      {/* Scaled Virtual Stage Container */}
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
        <canvas ref={canvasRef} width={784} height={570} className="absolute inset-0 pointer-events-none z-0" />

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
              <div className="pxc-ring" />
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

          {/* Username with Verified Badge */}
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

          {/* Stats: Posts, Followers, Following */}
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

          {/* Handle */}
          <div className={`pxc-handle pxc-rv ${handleShow ? 'show' : ''}`}>
            @{profile.username}
          </div>

          {/* Action Buttons */}
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
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : followStatus === 'accepted' ? (
                  <>
                    <Check className="w-5 h-5 stroke-[3]" />
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
