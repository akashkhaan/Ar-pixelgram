import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, ImagePlus, Link2, Loader2, Settings, TrendingUp } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/types';
import { useHasStory } from '@/hooks/useStoryUsers';
import PhotoViewer from '@/components/common/PhotoViewer';
import { openInAppBrowser } from '@/components/common/InAppBrowserModal';
import { getProfileLinks } from '@/components/profile/ProfileLinks';
import { formatCompact } from '@/lib/profile/professionalStats';

interface ProfileCoverHeaderProps {
  profile: Profile;
  user?: User | null;
  isOwnProfile: boolean;
  /** Suspended/locked account: bio, links, counts chhupe rahte hain */
  restricted: boolean;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  followStatus?: 'accepted' | 'pending' | null;
  followLoading?: boolean;
  onFollow?: () => void;
  coverUrl: string;
  coverUploading?: boolean;
  onCoverUpload?: (file: File) => void;
  onAvatarUpload?: (file: File) => void;
  onShareProfile: () => void;
  onOpenLinks: () => void;
  onScrollToPosts: () => void;
  /** Reels + videos ke asli views (sirf apne profile par) */
  totalViews: number;
}

const VerifiedBadge = () => (
  <svg viewBox="0 0 24 24" aria-label="Verified" className="w-5 h-5 shrink-0">
    <path
      d="M12 1.8l2.5 1.7 3-.2 1.2 2.8 2.7 1.4-.4 3 1.3 2.7-2 2.3-.3 3-3 .8-1.8 2.4-2.8-1.1-2.8 1.1-1.8-2.4-3-.8-.3-3-2-2.3 1.3-2.7-.4-3 2.7-1.4 1.2-2.8 3 .2z"
      fill="#2f8bff"
    />
    <path d="M7.8 12.3l3 3 5.6-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

export const ProfileCoverHeader: React.FC<ProfileCoverHeaderProps> = ({
  profile,
  user,
  isOwnProfile,
  restricted,
  postsCount,
  followersCount,
  followingCount,
  followStatus,
  followLoading,
  onFollow,
  coverUrl,
  coverUploading,
  onCoverUpload,
  onAvatarUpload,
  onShareProfile,
  onOpenLinks,
  onScrollToPosts,
  totalViews,
}) => {
  const navigate = useNavigate();
  const hasStory = useHasStory(profile?.user_id);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  // Kaunsa cover URL sach me load hua (cache se turant load hone par bhi sahi rahe)
  const [loadedCover, setLoadedCover] = useState<string | null>(null);
  const coverOk = loadedCover === coverUrl;
  const [viewer, setViewer] = useState<string | null>(null);
  // Toota hua profile photo link ho to naam ka pehla akshar dikhao
  const [brokenAvatar, setBrokenAvatar] = useState<string | null>(null);
  const avatarOk = Boolean(profile.avatar_url) && brokenAvatar !== profile.avatar_url;
  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioOverflows, setBioOverflows] = useState(false);
  const bioRef = useRef<HTMLParagraphElement>(null);

  const displayName = profile.full_name || profile.username;
  const bio = restricted ? '' : (profile.bio || '').trim();
  const links = restricted ? [] : getProfileLinks(profile, user, isOwnProfile);

  // "See more" sirf tab jab bio 3 line se lambi ho
  useEffect(() => {
    const el = bioRef.current;
    if (!el || bioExpanded) return;
    setBioOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [bio, bioExpanded]);

  const handleAvatarTap = () => {
    // Story dali ho to tap par story khule (pehle jaisa)
    if (hasStory) {
      navigate(`/stories?u=${profile.user_id}`);
      return;
    }
    if (avatarOk && profile.avatar_url) {
      setViewer(profile.avatar_url);
      return;
    }
    if (isOwnProfile) avatarInputRef.current?.click();
  };

  const handleCoverTap = () => {
    if (coverOk) setViewer(coverUrl);
    else if (isOwnProfile) coverInputRef.current?.click();
  };

  const pickFile = (cb?: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && cb) cb(file);
  };

  const pillBtn =
    'h-10 flex-1 min-w-0 rounded-full bg-muted text-foreground text-[14px] font-semibold border border-border/60 active:scale-[0.97] transition-transform flex items-center justify-center gap-1.5';

  return (
    <section className="relative" aria-label="Profile">
      {/* Cover photo — upar tak full */}
      <div className="relative w-full aspect-[16/10] max-h-[340px] overflow-hidden bg-muted">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, hsl(var(--p1) / 0.55), hsl(var(--p2) / 0.45))' }}
        />
        <img
          src={coverUrl}
          alt=""
          onLoad={() => setLoadedCover(coverUrl)}
          onError={() => setLoadedCover(null)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${coverOk ? 'opacity-100' : 'opacity-0'}`}
        />
        <button
          type="button"
          onClick={handleCoverTap}
          className="absolute inset-0 w-full h-full"
          aria-label={coverOk ? 'Cover photo dekhein' : 'Cover photo'}
        />
        {/* Niche fade — photo background me ghul jaye */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />

        {isOwnProfile && (
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
            className="absolute right-3 bottom-3 z-10 h-9 px-3 rounded-full bg-black/55 text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm active:scale-95 transition-transform"
            aria-label="Cover photo badlein"
          >
            {coverUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : coverOk ? <Camera className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
            {!coverOk && !coverUploading && <span>Cover add karein</span>}
          </button>
        )}
      </div>

      {/* Profile photo — cover par aadha chadha hua */}
      <div className="relative px-4 -mt-14 z-10 flex items-end">
        <div className="relative">
          <button
            type="button"
            onClick={handleAvatarTap}
            className="block w-[104px] h-[104px] rounded-full p-[4px] active:scale-95 transition-transform"
            style={{
              background: hasStory
                ? '#ef4444'
                : 'conic-gradient(from 200deg, hsl(var(--p1)), hsl(var(--p2)), #ff8a1f, hsl(var(--p1)))',
            }}
            aria-label="Profile photo dekhein"
          >
            <span className="block w-full h-full rounded-full overflow-hidden bg-background p-[3px]">
              {avatarOk && profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  onError={() => setBrokenAvatar(profile.avatar_url)}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span
                  className="w-full h-full rounded-full flex items-center justify-center text-4xl font-black text-white"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #ec2c8f, #ff8a1f)' }}
                >
                  {profile.username?.[0]?.toUpperCase() || 'P'}
                </span>
              )}
            </span>
          </button>
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background shadow-lg active:scale-95"
              aria-label="Profile photo badlein"
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isOwnProfile && (
        <>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={pickFile(onAvatarUpload)} />
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={pickFile(onCoverUpload)} />
        </>
      )}

      <div className="px-4 pt-2">
        {/* Naam + username */}
        <h2 className="text-[22px] leading-tight font-bold text-foreground flex items-center gap-1.5 min-w-0">
          <span className="truncate">{displayName}</span>
          {profile.is_verified && <VerifiedBadge />}
        </h2>
        <p className="text-[14px] text-muted-foreground truncate">@{profile.username}</p>

        {/* Posts / followers / following — tap karne par pehle jaisa */}
        <div className="mt-2 flex items-center gap-3 text-[13px] text-muted-foreground">
          <button type="button" onClick={onScrollToPosts} className="active:opacity-70">
            <b className="text-foreground">{restricted ? 0 : postsCount}</b> पोस्ट्स
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => navigate(`/followers/${profile.user_id}`)} className="active:opacity-70">
            <b className="text-foreground">{restricted ? 0 : followersCount}</b> फॉलोअर्स
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => navigate(`/following/${profile.user_id}`)} className="active:opacity-70">
            <b className="text-foreground">{restricted ? 0 : followingCount}</b> फॉलोइंग
          </button>
        </div>

        {/* Buttons */}
        <div className="mt-3 flex items-center gap-2">
          {isOwnProfile ? (
            <>
              <button type="button" className={pillBtn} onClick={() => navigate('/edit-profile')}>
                Edit profile
              </button>
              <button type="button" className={pillBtn} onClick={onShareProfile}>
                Share profile
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="h-10 w-12 shrink-0 rounded-2xl bg-muted text-foreground border border-border/60 flex items-center justify-center active:scale-95 transition-transform"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onFollow}
                disabled={followLoading}
                className={
                  followStatus
                    ? pillBtn
                    : 'h-10 flex-1 min-w-0 rounded-full text-white text-[14px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform'
                }
                style={followStatus ? undefined : { background: 'linear-gradient(135deg, hsl(var(--p1)), hsl(var(--p2)))' }}
              >
                {followLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : followStatus === 'accepted' ? (
                  <>
                    <Check className="w-4 h-4" /> Following
                  </>
                ) : followStatus === 'pending' ? (
                  'Requested'
                ) : (
                  'Follow'
                )}
              </button>
              <button type="button" className={pillBtn} onClick={() => navigate(`/chat/${profile.user_id}`)}>
                Message
              </button>
            </>
          )}
        </div>

        {/* Bio — Edit profile ke niche */}
        {bio && (
          <div className="mt-3">
            <p
              ref={bioRef}
              className={`text-[14.5px] leading-[1.6] text-foreground whitespace-pre-line break-words ${
                bioExpanded ? '' : 'line-clamp-3'
              }`}
            >
              {bio}
            </p>
            {(bioOverflows || bioExpanded) && (
              <button
                type="button"
                onClick={() => setBioExpanded((v) => !v)}
                className="mt-0.5 text-[14px] text-muted-foreground font-medium"
              >
                {bioExpanded ? 'See less' : 'See more'}
              </button>
            )}
          </div>
        )}

        {/* Link — bio ke niche */}
        {links.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 min-w-0 text-[14px]">
            <Link2 className="w-4 h-4 shrink-0 text-foreground -rotate-45" />
            <button
              type="button"
              onClick={() => openInAppBrowser(links[0].url, links[0].label)}
              className="font-semibold text-foreground truncate min-w-0 text-left"
            >
              {shortUrl(links[0].url)}
            </button>
            {links.length > 1 && (
              <button type="button" onClick={onOpenLinks} className="shrink-0 text-muted-foreground">
                and {links.length - 1} more
              </button>
            )}
          </div>
        )}

        {/* Professional dashboard — sirf apne profile par */}
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => navigate('/professional-dashboard')}
            className="mt-3 w-full rounded-2xl bg-muted/70 border border-border/60 px-4 py-3 flex items-start gap-3 text-left active:scale-[0.99] transition-transform"
          >
            <TrendingUp className="w-5 h-5 mt-0.5 shrink-0 text-emerald-500" />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-foreground">Professional dashboard</span>
              <span className="block text-[13px] text-muted-foreground">
                {formatCompact(totalViews)} views on your reels & videos
              </span>
            </span>
          </button>
        )}
      </div>

      <PhotoViewer open={Boolean(viewer)} src={viewer || ''} alt={displayName} onClose={() => setViewer(null)} />
    </section>
  );
};

export default ProfileCoverHeader;
