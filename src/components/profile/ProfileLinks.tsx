import React from 'react';
import { Link2, Instagram, Facebook, Youtube, Globe } from 'lucide-react';
import type { Profile } from '@/types/types';
import type { User } from '@supabase/supabase-js';
import { openInAppBrowser } from '@/components/common/InAppBrowserModal';

interface ProfileLinksProps {
  profile: Profile;
  user?: User | null;
  isOwnProfile?: boolean;
}

interface ParsedLink {
  url: string;
  label: string;
  type: 'youtube' | 'instagram' | 'facebook' | 'website';
}

export type { ParsedLink };

function parseSmartLink(raw: string, defaultType?: 'website' | 'instagram' | 'facebook'): ParsedLink | null {
  if (!raw || !raw.trim()) return null;
  const val = raw.trim();

  // If designated Instagram field
  if (defaultType === 'instagram') {
    let clean = val;
    if (clean.startsWith('@')) clean = clean.slice(1);
    const url = /^https?:\/\//i.test(clean) ? clean : `https://instagram.com/${clean}`;
    return { url, label: 'Instagram', type: 'instagram' };
  }

  // If designated Facebook field
  if (defaultType === 'facebook') {
    const url = /^https?:\/\//i.test(val) ? val : `https://facebook.com/${val}`;
    return { url, label: 'Facebook', type: 'facebook' };
  }

  // Generic link 1 or 2 — auto-detect platform (YouTube, Instagram, Facebook, or Website)
  const lower = val.toLowerCase();
  const url = /^https?:\/\//i.test(val) ? val : `https://${val}`;

  // YouTube Detection
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return { url, label: 'YouTube', type: 'youtube' };
  }

  // Instagram Detection in generic link
  if (lower.includes('instagram.com')) {
    return { url, label: 'Instagram', type: 'instagram' };
  }

  // Facebook Detection in generic link
  if (lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('fb.me')) {
    return { url, label: 'Facebook', type: 'facebook' };
  }

  return { url, label: 'Website', type: 'website' };
}

/**
 * Profile ke saare links (website 1/2, instagram, facebook) parse karke deta hai.
 * Bio/Links sheet aur inline row dono isi ko use karte hain — ek hi jagah logic.
 */
export function getProfileLinks(
  profile: Profile,
  user?: User | null,
  isOwnProfile?: boolean
): ParsedLink[] {
  const rawLink1 = profile.website_link_1 || (isOwnProfile ? (user?.user_metadata?.website_link_1 as string) : null);
  const rawLink2 = profile.website_link_2 || (isOwnProfile ? (user?.user_metadata?.website_link_2 as string) : null);
  const rawInsta = profile.instagram_url || (isOwnProfile ? (user?.user_metadata?.instagram_url as string) : null);
  const rawFb = profile.facebook_url || (isOwnProfile ? (user?.user_metadata?.facebook_url as string) : null);

  const links: ParsedLink[] = [];

  const parsed1 = rawLink1 ? parseSmartLink(rawLink1, 'website') : null;
  if (parsed1) links.push(parsed1);

  const parsed2 = rawLink2 ? parseSmartLink(rawLink2, 'website') : null;
  if (parsed2) {
    if (parsed2.type === 'website' && parsed1?.type === 'website') {
      parsed2.label = 'Website 2';
    }
    links.push(parsed2);
  }

  const parsedInsta = rawInsta ? parseSmartLink(rawInsta, 'instagram') : null;
  if (parsedInsta) links.push(parsedInsta);

  const parsedFb = rawFb ? parseSmartLink(rawFb, 'facebook') : null;
  if (parsedFb) links.push(parsedFb);

  return links;
}

export const ProfileLinks: React.FC<ProfileLinksProps> = ({ profile, user, isOwnProfile }) => {
  const links = getProfileLinks(profile, user, isOwnProfile);

  if (links.length === 0) {
    return null;
  }

  // All 4 links in ONE single horizontal line (flex-nowrap)
  return (
    <div className="flex flex-nowrap items-center justify-center gap-1.5 mt-2 px-1 w-full max-w-full overflow-x-auto no-scrollbar">
      {links.map((item, idx) => {
        let badgeStyle = '';
        let IconComponent = Globe;

        switch (item.type) {
          case 'youtube':
            badgeStyle = 'text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border-red-500/25';
            IconComponent = Youtube;
            break;
          case 'instagram':
            badgeStyle = 'text-pink-600 dark:text-pink-400 bg-pink-500/10 hover:bg-pink-500/20 border-pink-500/25';
            IconComponent = Instagram;
            break;
          case 'facebook':
            badgeStyle = 'text-blue-600 dark:text-blue-400 bg-blue-600/10 hover:bg-blue-600/20 border-blue-600/25';
            IconComponent = Facebook;
            break;
          default:
            badgeStyle = 'text-foreground/90 bg-muted/70 hover:bg-muted border-border/70';
            IconComponent = Link2;
            break;
        }

        return (
          <button
            key={idx}
            type="button"
            onClick={() => openInAppBrowser(item.url, item.label)}
            className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-semibold border transition-all cursor-pointer shrink-0 shadow-xs active:scale-95 ${badgeStyle}`}
            title={`${item.label}: ${item.url}`}
          >
            <IconComponent className="w-3 h-3 shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ProfileLinks;
