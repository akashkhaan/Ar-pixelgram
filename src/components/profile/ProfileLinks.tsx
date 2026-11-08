import React from 'react';
import { Link2, Instagram, Facebook, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '@/types/types';
import type { User } from '@supabase/supabase-js';
import { openInAppBrowser } from '@/components/common/InAppBrowserModal';

interface ProfileLinksProps {
  profile: Profile;
  user?: User | null;
  isOwnProfile?: boolean;
}

function cleanDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '') + (parsed.pathname !== '/' ? parsed.pathname : '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '');
  }
}

export const ProfileLinks: React.FC<ProfileLinksProps> = ({ profile, user, isOwnProfile }) => {
  const navigate = useNavigate();

  // Primary from profile columns, fallback to user_metadata for instant sync if migration is pending
  const link1 = profile.website_link_1 || (isOwnProfile ? (user?.user_metadata?.website_link_1 as string) : null);
  const link2 = profile.website_link_2 || (isOwnProfile ? (user?.user_metadata?.website_link_2 as string) : null);
  const rawInsta = profile.instagram_url || (isOwnProfile ? (user?.user_metadata?.instagram_url as string) : null);
  const rawFb = profile.facebook_url || (isOwnProfile ? (user?.user_metadata?.facebook_url as string) : null);

  const formatInstaUrl = (val: string): { url: string; handle: string } => {
    let clean = val.trim();
    if (clean.startsWith('@')) clean = clean.slice(1);
    if (/^https?:\/\//i.test(clean)) {
      const match = clean.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
      const handle = match ? match[1] : 'Instagram';
      return { url: clean, handle: `@${handle}` };
    }
    return { url: `https://instagram.com/${clean}`, handle: `@${clean}` };
  };

  const formatFbUrl = (val: string): { url: string; label: string } => {
    let clean = val.trim();
    if (/^https?:\/\//i.test(clean)) {
      return { url: clean, label: 'Facebook' };
    }
    return { url: `https://facebook.com/${clean}`, label: `fb.com/${clean}` };
  };

  const hasAnyLink = Boolean(link1 || link2 || rawInsta || rawFb);

  if (!hasAnyLink) {
    if (isOwnProfile) {
      return (
        <div className="flex justify-center mt-2.5">
          <button
            type="button"
            onClick={() => navigate('/edit-profile')}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add links (Website, Insta, FB)</span>
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-2.5 px-2">
      {/* Link 1 */}
      {link1 && (
        <button
          type="button"
          onClick={() => openInAppBrowser(link1, 'Website')}
          className="inline-flex items-center gap-1.5 max-w-[180px] px-2.5 py-1 rounded-full text-xs font-medium text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all cursor-pointer truncate"
          title={link1}
        >
          <Link2 className="w-3.5 h-3.5 shrink-0 text-blue-500" />
          <span className="truncate">{cleanDomain(link1)}</span>
        </button>
      )}

      {/* Link 2 */}
      {link2 && (
        <button
          type="button"
          onClick={() => openInAppBrowser(link2, 'Website')}
          className="inline-flex items-center gap-1.5 max-w-[180px] px-2.5 py-1 rounded-full text-xs font-medium text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all cursor-pointer truncate"
          title={link2}
        >
          <Link2 className="w-3.5 h-3.5 shrink-0 text-blue-500" />
          <span className="truncate">{cleanDomain(link2)}</span>
        </button>
      )}

      {/* Instagram */}
      {rawInsta && (
        (() => {
          const { url, handle } = formatInstaUrl(rawInsta);
          return (
            <button
              type="button"
              onClick={() => openInAppBrowser(url, 'Instagram')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-pink-600 dark:text-pink-400 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 transition-all cursor-pointer truncate max-w-[170px]"
              title={`Instagram: ${handle}`}
            >
              <Instagram className="w-3.5 h-3.5 shrink-0 text-pink-500" />
              <span className="truncate">{handle}</span>
            </button>
          );
        })()
      )}

      {/* Facebook */}
      {rawFb && (
        (() => {
          const { url, label } = formatFbUrl(rawFb);
          return (
            <button
              type="button"
              onClick={() => openInAppBrowser(url, 'Facebook')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/20 transition-all cursor-pointer truncate max-w-[170px]"
              title="Facebook Profile"
            >
              <Facebook className="w-3.5 h-3.5 shrink-0 text-blue-600" />
              <span className="truncate">{label}</span>
            </button>
          );
        })()
      )}
    </div>
  );
};

export default ProfileLinks;
