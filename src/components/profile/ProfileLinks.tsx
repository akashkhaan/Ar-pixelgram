import React from 'react';
import { Link2, Instagram, Facebook, Youtube, Globe, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

function parseSmartLink(raw: string, defaultType?: 'website' | 'instagram' | 'facebook'): ParsedLink | null {
  if (!raw || !raw.trim()) return null;
  const val = raw.trim();

  // If designated Instagram field
  if (defaultType === 'instagram') {
    let clean = val;
    if (clean.startsWith('@')) clean = clean.slice(1);
    const url = /^https?:\/\//i.test(clean) ? clean : `https://instagram.com/${clean}`;
    const match = clean.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
    const label = match ? `@${match[1]}` : (clean.startsWith('http') ? 'Instagram' : `@${clean}`);
    return { url, label, type: 'instagram' };
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
    let label = 'YouTube';
    const handleMatch = val.match(/@([a-zA-Z0-9_.-]+)/);
    if (handleMatch) {
      label = `@${handleMatch[1]}`;
    }
    return { url, label, type: 'youtube' };
  }

  // Instagram Detection in generic link
  if (lower.includes('instagram.com')) {
    const handleMatch = val.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
    const label = handleMatch ? `@${handleMatch[1]}` : 'Instagram';
    return { url, label, type: 'instagram' };
  }

  // Facebook Detection in generic link
  if (lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('fb.me')) {
    return { url, label: 'Facebook', type: 'facebook' };
  }

  // Clean generic website domain
  let domain = '';
  try {
    const parsed = new URL(url);
    domain = parsed.hostname.replace(/^www\./, '');
  } catch {
    domain = val.replace(/^https?:\/\/(www\.)?/, '');
  }

  return { url, label: domain || 'Website', type: 'website' };
}

export const ProfileLinks: React.FC<ProfileLinksProps> = ({ profile, user, isOwnProfile }) => {
  const navigate = useNavigate();

  // Read from profile columns with fallback to user_metadata for instant sync
  const rawLink1 = profile.website_link_1 || (isOwnProfile ? (user?.user_metadata?.website_link_1 as string) : null);
  const rawLink2 = profile.website_link_2 || (isOwnProfile ? (user?.user_metadata?.website_link_2 as string) : null);
  const rawInsta = profile.instagram_url || (isOwnProfile ? (user?.user_metadata?.instagram_url as string) : null);
  const rawFb = profile.facebook_url || (isOwnProfile ? (user?.user_metadata?.facebook_url as string) : null);

  const links: ParsedLink[] = [];

  const parsed1 = rawLink1 ? parseSmartLink(rawLink1, 'website') : null;
  if (parsed1) links.push(parsed1);

  const parsed2 = rawLink2 ? parseSmartLink(rawLink2, 'website') : null;
  if (parsed2) links.push(parsed2);

  const parsedInsta = rawInsta ? parseSmartLink(rawInsta, 'instagram') : null;
  if (parsedInsta) links.push(parsedInsta);

  const parsedFb = rawFb ? parseSmartLink(rawFb, 'facebook') : null;
  if (parsedFb) links.push(parsedFb);

  if (links.length === 0) {
    if (isOwnProfile) {
      return (
        <div className="flex justify-center mt-2">
          <button
            type="button"
            onClick={() => navigate('/edit-profile')}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Add links</span>
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2 px-3 max-w-sm mx-auto">
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
            onClick={() => openInAppBrowser(item.url, item.type.toUpperCase())}
            className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer truncate max-w-[150px] shadow-xs active:scale-95 ${badgeStyle}`}
            title={`${item.type.toUpperCase()}: ${item.url}`}
          >
            <IconComponent className="w-3 h-3 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ProfileLinks;
