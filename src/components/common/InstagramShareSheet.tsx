import React, { useState, useEffect } from 'react';
import {
  X, Search, Copy, Check, Send, Share2, MessageSquare, ExternalLink,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getMessagedProfiles, getMutualFollows, sendMessage, type Profile } from '@/services/api';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

interface InstagramShareSheetProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  mediaType?: 'post' | 'reel' | 'video';
  thumbnailUrl?: string;
}

export const InstagramShareSheet: React.FC<InstagramShareSheetProps> = ({
  open,
  onClose,
  url,
  title = 'Pixelgram',
  mediaType = 'post',
  thumbnailUrl,
}) => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoadingFriends(true);
    // Fetch messaged profiles + mutual follows or following list
    (async () => {
      try {
        const [messaged, mutuals] = await Promise.all([
          getMessagedProfiles(user.id).catch(() => [] as Profile[]),
          getMutualFollows(user.id).catch(() => [] as Profile[]),
        ]);

        const map = new Map<string, Profile>();
        messaged.forEach((p) => { if (p && p.user_id !== user.id) map.set(p.user_id, p); });
        mutuals.forEach((p) => { if (p && p.user_id !== user.id) map.set(p.user_id, p); });

        // If list is small, fetch other active users to make sharing useful
        if (map.size < 6) {
          const { data: popular } = await supabase
            .from('profiles')
            .select('*')
            .neq('user_id', user.id)
            .limit(10);
          (popular || []).forEach((p: Profile) => { if (p && !map.has(p.user_id)) map.set(p.user_id, p); });
        }

        setFriends(Array.from(map.values()));
      } catch (err) {
        console.error('Failed to load friends for share:', err);
      } finally {
        setLoadingFriends(false);
      }
    })();
  }, [open, user]);

  if (!open) return null;

  const filteredFriends = friends.filter((f) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      f.username?.toLowerCase().includes(q) ||
      f.full_name?.toLowerCase().includes(q)
    );
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleSendDM = async (friend: Profile) => {
    if (!user || sentMap[friend.user_id]) return;
    try {
      const msg = `Check out this ${mediaType} on Pixelgram:\n${url}`;
      await sendMessage(friend.user_id, msg);
      setSentMap((prev) => ({ ...prev, [friend.user_id]: true }));
      toast.success(`Sent to @${friend.username}`);
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Check out this ${mediaType} on Pixelgram:`,
          url,
        });
      } catch {
        /* user dismissed */
      }
    } else {
      handleCopyLink();
    }
  };

  const shareText = encodeURIComponent(`Check out this ${mediaType} on Pixelgram: ${url}`);
  const encodedUrl = encodeURIComponent(url);

  const socialChannels = [
    {
      name: 'WhatsApp',
      color: '#25D366',
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/3670/3670051.png',
      fallbackEmoji: '💬',
      action: () => window.open(`https://api.whatsapp.com/send?text=${shareText}`, '_blank'),
    },
    {
      name: 'Facebook',
      color: '#1877F2',
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/5968/5968764.png',
      fallbackEmoji: '📘',
      action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank'),
    },
    {
      name: 'Telegram',
      color: '#229ED9',
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png',
      fallbackEmoji: '✈️',
      action: () => window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(`Check out this ${mediaType} on Pixelgram:`)}`, '_blank'),
    },
    {
      name: 'X (Twitter)',
      color: '#000000',
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/5968/5968830.png',
      fallbackEmoji: '🐦',
      action: () => window.open(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${shareText}`, '_blank'),
    },
    {
      name: 'Copy Link',
      color: '#6366f1',
      isCopy: true,
      action: handleCopyLink,
    },
    {
      name: 'More...',
      color: '#8b5cf6',
      isMore: true,
      action: handleNativeShare,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-card border-t border-border rounded-t-3xl max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab bar */}
        <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto mt-3" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
          <h3 className="font-bold text-base text-foreground">Share to</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search friend */}
        <div className="px-4 py-2.5">
          <div className="relative flex items-center bg-muted/70 rounded-xl px-3 py-2 border border-border/50">
            <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search people..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="p-0.5 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Friends list (Send in DM) */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5 min-h-[160px] max-h-[260px]">
          {loadingFriends ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-xs">Loading contacts…</span>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-xs">
              No users found. You can still share via social apps below.
            </div>
          ) : (
            filteredFriends.map((f) => {
              const isSent = sentMap[f.user_id];
              return (
                <div key={f.user_id} className="flex items-center justify-between gap-3 p-1.5 rounded-xl hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {f.avatar_url ? (
                      <img
                        src={f.avatar_url}
                        alt={f.username}
                        className="w-11 h-11 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-base">
                        {f.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{f.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{f.full_name || `@${f.username}`}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSendDM(f)}
                    disabled={isSent}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 ${
                      isSent
                        ? 'bg-muted text-muted-foreground cursor-default'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                    }`}
                  >
                    {isSent ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        Sent
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        Send
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Social channels horizontal row */}
        <div className="border-t border-border/60 bg-muted/30 px-3 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
            Share to apps
          </p>
          <div className="flex items-center gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {socialChannels.map((item) => (
              <button
                key={item.name}
                onClick={item.action}
                className="flex flex-col items-center gap-1.5 shrink-0 group active:scale-95 transition-transform"
                style={{ width: 68 }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-105"
                  style={{ backgroundColor: item.color }}
                >
                  {item.isCopy ? (
                    copied ? <Check className="w-6 h-6 text-white" /> : <Copy className="w-6 h-6 text-white" />
                  ) : item.isMore ? (
                    <Share2 className="w-6 h-6 text-white" />
                  ) : item.iconUrl ? (
                    <img src={item.iconUrl} alt={item.name} className="w-6 h-6 object-contain" />
                  ) : (
                    <span className="text-xl">{item.fallbackEmoji}</span>
                  )}
                </div>
                <span className="text-[11px] font-medium text-foreground text-center truncate w-full">
                  {item.isCopy && copied ? 'Copied!' : item.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstagramShareSheet;
