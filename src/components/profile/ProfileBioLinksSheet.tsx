import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Link2, Instagram, Facebook, Youtube, Globe } from 'lucide-react';
import type { Profile } from '@/types/types';
import type { User } from '@supabase/supabase-js';
import { getProfileLinks } from './ProfileLinks';
import { openInAppBrowser } from '@/components/common/InAppBrowserModal';

interface ProfileBioLinksSheetProps {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  user?: User | null;
  isOwnProfile?: boolean;
}

/**
 * "See more" par khulne wala panel — ek side bio, doosri side links.
 * Bio me @mentions tap karne layak hote hain (profile par le jaate hain).
 */
export const ProfileBioLinksSheet: React.FC<ProfileBioLinksSheetProps> = ({
  open,
  onClose,
  profile,
  user,
  isOwnProfile,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const bio = (profile.bio || '').trim();
  const links = getProfileLinks(profile, user, isOwnProfile);
  const hasBoth = Boolean(bio) && links.length > 0;

  const iconFor = (type: string) => {
    switch (type) {
      case 'youtube':
        return { Icon: Youtube, cls: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20' };
      case 'instagram':
        return { Icon: Instagram, cls: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20' };
      case 'facebook':
        return { Icon: Facebook, cls: 'text-blue-600 dark:text-blue-400 bg-blue-600/10 border-blue-600/20' };
      default:
        return { Icon: Globe, cls: 'text-foreground bg-muted/70 border-border/70' };
    }
  };

  /** Bio me @username ko tap-able banao */
  const renderBio = (text: string) => {
    const parts = text.split(/(@[A-Za-z0-9._]{2,30})/g);
    return parts.map((part, i) =>
      part.startsWith('@') ? (
        <span key={i} className="font-semibold text-primary">
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  };

  const body = (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bio and links"
        className={`relative w-full max-w-md rounded-t-3xl bg-card text-foreground shadow-2xl border-t border-border transition-transform duration-300 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">
              {profile.full_name || profile.username}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">@{profile.username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center hover:bg-muted active:scale-95 transition-all text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="h-px bg-border/70 mx-4" />

        {/* Two columns: bio (left) | links (right) */}
        <div className={`grid gap-3 px-4 pt-3 ${hasBoth ? 'grid-cols-1 min-[380px]:grid-cols-2' : 'grid-cols-1'}`}>
          {bio && (
            <section aria-label="Bio" className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Bio</h3>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/60 p-2.5 max-h-56 overflow-y-auto">
                <p className="text-[13px] leading-[1.65] whitespace-pre-line break-words">
                  {renderBio(bio)}
                </p>
              </div>
            </section>
          )}

          {links.length > 0 && (
            <section aria-label="Links" className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Link2 className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Links</h3>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/60 p-1.5 max-h-56 overflow-y-auto space-y-1.5">
                {links.map((item, idx) => {
                  const { Icon, cls } = iconFor(item.type);
                  return (
                    <button
                      key={`${item.url}-${idx}`}
                      type="button"
                      onClick={() => openInAppBrowser(item.url, item.label)}
                      className={`w-full inline-flex items-center gap-1.5 h-9 px-2.5 rounded-full text-[11.5px] font-semibold border transition-all active:scale-95 ${cls}`}
                      title={`${item.label}: ${item.url}`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {!bio && links.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Is profile me abhi bio ya link nahi hai.
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
};

export default ProfileBioLinksSheet;
