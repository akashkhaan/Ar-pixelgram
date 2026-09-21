import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquare,
  MessageSquareWarning,
  Search,
  Share2,
  Shield,
  UserMinus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  blockUser,
  unblockUser,
  isBlocked,
  reportUserProfile,
  sendMessage,
  getMessagedProfiles,
} from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/types';
import {
  copyProfileLink,
  getCanonicalFacebookProfileUrl,
  getFacebookNumericId,
  getShareableProfileUrl,
} from '@/lib/facebookProfileUrl';

interface FacebookProfileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  isOwnProfile: boolean;
  onTriggerSearch: () => void;
  onBlockStateChange?: (blocked: boolean) => void;
}

type SheetView =
  | 'menu'
  | 'report'
  | 'report_success'
  | 'help'
  | 'block_confirm'
  | 'share_message';

export const FacebookProfileBottomSheet: React.FC<FacebookProfileBottomSheetProps> = ({
  isOpen,
  onClose,
  profile,
  isOwnProfile,
  onTriggerSearch,
  onBlockStateChange,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [currentView, setCurrentView] = useState<SheetView>('menu');
  const [copied, setCopied] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  // Report state
  const [selectedReportReason, setSelectedReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  // Share message state
  const [recentFriends, setRecentFriends] = useState<Profile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sentFriendIds, setSentFriendIds] = useState<Set<string>>(new Set());
  const [sendingToId, setSendingToId] = useState<string | null>(null);

  const displayName = profile.full_name || profile.username || 'User';
  const firstName = displayName.trim().split(' ')[0] || displayName;
  const numericId = getFacebookNumericId(profile.user_id || profile.id);
  const canonicalUrl = getCanonicalFacebookProfileUrl(profile.user_id || profile.id);
  const liveShareUrl = getShareableProfileUrl(profile.user_id || profile.id);

  // Check if currently blocked
  useEffect(() => {
    if (!isOpen || !user || isOwnProfile) return;
    isBlocked(user.id, profile.user_id)
      .then(setBlocked)
      .catch(() => setBlocked(false));
  }, [isOpen, user, profile.user_id, isOwnProfile]);

  // Reset view on close/open
  useEffect(() => {
    if (isOpen) {
      setCurrentView('menu');
      setCopied(false);
      setSelectedReportReason(null);
      setReportDetails('');
      setSentFriendIds(new Set());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Copy Profile Link
  const handleCopyLink = async () => {
    try {
      const { canonicalUrl } = await copyProfileLink(profile.user_id || profile.id);
      setCopied(true);
      toast.success(
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-sm">Profile link copied!</span>
          <span className="text-xs opacity-90 truncate max-w-[260px]">{canonicalUrl}</span>
        </div>,
        { duration: 3500 }
      );
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  // Handle WhatsApp Share
  const handleWhatsAppShare = () => {
    const text = `Check out ${displayName}'s profile on Pixelgram:\n${liveShareUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
    onClose();
  };

  // Handle Native Share / More Options
  const handleMoreShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${displayName} on Pixelgram`,
          text: `Check out ${displayName}'s profile on Pixelgram!`,
          url: liveShareUrl,
        });
        onClose();
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') return;
      }
    }
    // Fallback: copy link
    await handleCopyLink();
  };

  // Handle Block / Unblock
  const handleToggleBlock = async () => {
    if (!user) return;
    setBlockLoading(true);
    try {
      if (blocked) {
        await unblockUser(user.id, profile.user_id);
        setBlocked(false);
        onBlockStateChange?.(false);
        toast.success(`Unblocked ${displayName}`);
        onClose();
      } else {
        await blockUser(user.id, profile.user_id);
        setBlocked(true);
        onBlockStateChange?.(true);
        toast.success(`Blocked ${displayName}`);
        onClose();
      }
    } catch {
      toast.error('Operation failed. Please try again.');
    } finally {
      setBlockLoading(false);
    }
  };

  // Handle Submit Report
  const handleSubmitReport = async () => {
    if (!user || !selectedReportReason) return;
    setReportLoading(true);
    try {
      await reportUserProfile(
        user.id,
        profile.user_id,
        selectedReportReason,
        reportDetails.trim() || undefined
      );
      setCurrentView('report_success');
    } catch (e) {
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setReportLoading(false);
    }
  };

  // Handle Share as Direct Message (load recent friends)
  const handleOpenShareMessage = async () => {
    setCurrentView('share_message');
    if (!user) return;
    setLoadingFriends(true);
    try {
      const friends = await getMessagedProfiles(user.id);
      setRecentFriends(friends.filter((f) => f.user_id !== profile.user_id));
    } catch {
      setRecentFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleSendToFriend = async (friend: Profile) => {
    if (!user) return;
    setSendingToId(friend.user_id);
    try {
      await sendMessage(
        friend.user_id,
        `Check out ${displayName}'s profile on Pixelgram:\n${liveShareUrl}`
      );
      setSentFriendIds((prev) => new Set([...prev, friend.user_id]));
      toast.success(`Profile sent to ${friend.full_name || friend.username}`);
    } catch {
      toast.error('Could not send message');
    } finally {
      setSendingToId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] bg-background text-foreground border-t sm:border border-border/80 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Pull Handle */}
        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-1 shrink-0" />

        {/* ===================== VIEW: MAIN FACEBOOK MENU ===================== */}
        {currentView === 'menu' && (
          <div className="overflow-y-auto px-2 pb-6 pt-1">
            {!isOwnProfile ? (
              <div className="space-y-0.5">
                {/* 1. Report profile */}
                <button
                  type="button"
                  onClick={() => setCurrentView('report')}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <MessageSquareWarning className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Report profile</span>
                </button>

                {/* 2. Help {firstName} */}
                <button
                  type="button"
                  onClick={() => setCurrentView('help')}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Heart className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Help {firstName}</span>
                </button>

                {/* 3. Block */}
                <button
                  type="button"
                  onClick={() => setCurrentView('block_confirm')}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <UserMinus className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">
                    {blocked ? `Unblock ${firstName}` : 'Block'}
                  </span>
                </button>

                {/* 4. Search */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onTriggerSearch();
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Search className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Search</span>
                </button>

                {/* 5. Copy link to profile */}
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-between gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {copied ? (
                        <Check className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Link2 className="w-5 h-5 text-foreground" />
                      )}
                    </div>
                    <span className="text-[15px] font-medium text-foreground">
                      {copied ? 'Link copied!' : 'Copy link to profile'}
                    </span>
                  </div>
                  {copied && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      Copied
                    </span>
                  )}
                </button>

                {/* 6. Send in WhatsApp */}
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-5.46-4.45-9.92-9.91-9.92zm5.8 14.07c-.24.67-1.39 1.29-1.92 1.35-.49.06-1.12.08-3.23-.79-2.7-1.12-4.44-3.86-4.57-4.04-.14-.18-1.09-1.45-1.09-2.76 0-1.32.69-1.96.93-2.23.25-.26.54-.33.72-.33.19 0 .37.01.53.02.17.01.4.06.63.54.24.5.82 1.99.89 2.14.07.15.12.33.02.53-.1.19-.15.31-.29.48-.15.17-.31.37-.44.5-.15.15-.31.31-.13.61.17.3 78 1.27 1.68 2.07 1.15 1.03 2.13 1.35 2.43 1.5.3.15.48.13.66-.08.18-.21.78-.91.99-1.22.21-.31.42-.26.71-.15.29.11 1.83.86 2.15 1.02.31.16.52.24.6.37.07.14.07.8-.17 1.47z" />
                    </svg>
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Send in WhatsApp</span>
                </button>

                {/* 7. Share as message */}
                <button
                  type="button"
                  onClick={handleOpenShareMessage}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Share as message</span>
                </button>

                {/* 8. More sharing options */}
                <button
                  type="button"
                  onClick={handleMoreShare}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Share2 className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">More sharing options</span>
                </button>
              </div>
            ) : (
              /* OWN PROFILE OPTIONS */
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/edit-profile');
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Edit profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onTriggerSearch();
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Search className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Search profile</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-between gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {copied ? (
                        <Check className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Link2 className="w-5 h-5 text-foreground" />
                      )}
                    </div>
                    <span className="text-[15px] font-medium text-foreground">
                      {copied ? 'Link copied!' : 'Copy link to profile'}
                    </span>
                  </div>
                  {copied && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      Copied
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-5.46-4.45-9.92-9.91-9.92zm5.8 14.07c-.24.67-1.39 1.29-1.92 1.35-.49.06-1.12.08-3.23-.79-2.7-1.12-4.44-3.86-4.57-4.04-.14-.18-1.09-1.45-1.09-2.76 0-1.32.69-1.96.93-2.23.25-.26.54-.33.72-.33.19 0 .37.01.53.02.17.01.4.06.63.54.24.5.82 1.99.89 2.14.07.15.12.33.02.53-.1.19-.15.31-.29.48-.15.17-.31.37-.44.5-.15.15-.31.31-.13.61.17.3 78 1.27 1.68 2.07 1.15 1.03 2.13 1.35 2.43 1.5.3.15.48.13.66-.08.18-.21.78-.91.99-1.22.21-.31.42-.26.71-.15.29.11 1.83.86 2.15 1.02.31.16.52.24.6.37.07.14.07.8-.17 1.47z" />
                    </svg>
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Send in WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleMoreShare}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Share2 className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">More sharing options</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/settings');
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-muted/60 active:bg-muted transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-[15px] font-medium text-foreground">Settings & Privacy</span>
                </button>
              </div>
            )}

            {/* Bottom Profile Link Box (Facebook Style) */}
            <div className="mt-4 pt-3 border-t border-border/70 px-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {isOwnProfile ? 'Your profile link' : 'Profile link'}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">ID: {numericId}</span>
              </div>
              <div
                onClick={handleCopyLink}
                className="group flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted active:bg-muted/80 border border-border/80 cursor-pointer transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-foreground truncate select-all">
                    {canonicalUrl}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {copied ? 'Copied to clipboard' : 'Tap to copy'}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== VIEW: REPORT PROFILE ===================== */}
        {currentView === 'report' && (
          <div className="px-5 pb-6 pt-3 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-foreground">Report profile</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Why are you reporting this profile?</p>
              </div>
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { id: 'fake_account', label: 'Pretending to be someone / Fake account' },
                { id: 'inappropriate', label: 'Posting inappropriate content' },
                { id: 'harassment', label: 'Harassment or bullying' },
                { id: 'spam', label: 'Spam, scams or commercial fraud' },
                { id: 'hate_speech', label: 'Hate speech or symbols' },
                { id: 'violence', label: 'Violence or dangerous activities' },
                { id: 'something_else', label: 'Something else' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedReportReason(item.id)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                    selectedReportReason === item.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  {selectedReportReason === item.id && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {selectedReportReason && (
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Optional: Provide more details to help us investigate..."
                rows={3}
                maxLength={300}
                className="w-full p-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedReportReason || reportLoading}
                onClick={handleSubmitReport}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Report'}
              </button>
            </div>
          </div>
        )}

        {/* ===================== VIEW: REPORT SUCCESS ===================== */}
        {currentView === 'report_success' && (
          <div className="px-6 py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-xl text-foreground">Thanks for letting us know</h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              We use reports like yours to review accounts and keep the Pixelgram community safe.
            </p>
            <div className="pt-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ===================== VIEW: HELP {FIRSTNAME} ===================== */}
        {currentView === 'help' && (
          <div className="px-5 pb-6 pt-3 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-foreground">Help {firstName}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose how you'd like to support {displayName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/chat/${profile.user_id}?prefill=Hey%20${firstName},%20just%20checking%20in%20on%20you!%20Hope%20you%27re%20doing%20well.`);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Send a caring message</p>
                    <p className="text-xs text-muted-foreground">Reach out and let them know you care</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>

              <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Support & Crisis Helplines
                </p>
                <div className="space-y-2 text-xs text-foreground">
                  <div className="flex justify-between items-center py-1 border-b border-border/40">
                    <span className="font-medium">National Emergency Helpline:</span>
                    <a href="tel:112" className="text-primary font-bold hover:underline">112</a>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-border/40">
                    <span className="font-medium">Tele-MANAS Mental Health Helpline:</span>
                    <a href="tel:14416" className="text-primary font-bold hover:underline">14416 / 1800-891-4416</a>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="font-medium">AASRA Suicide Prevention:</span>
                    <a href="tel:+919820466726" className="text-primary font-bold hover:underline">+91 9820466726</a>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedReportReason('suicide_self_harm');
                  setCurrentView('report');
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Report self-harm concern</p>
                    <p className="text-xs text-muted-foreground">Privately alert Pixelgram trust & safety team</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCurrentView('menu')}
              className="w-full py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* ===================== VIEW: BLOCK CONFIRMATION ===================== */}
        {currentView === 'block_confirm' && (
          <div className="px-5 pb-6 pt-3 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-foreground">
                {blocked ? `Unblock ${firstName}?` : `Block ${firstName}?`}
              </h3>
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-2 text-sm text-muted-foreground leading-relaxed">
              {blocked ? (
                <p>
                  {displayName} will be able to view your posts, follow your profile, and send you messages again.
                </p>
              ) : (
                <>
                  <p className="font-medium text-foreground">{displayName} will not be able to:</p>
                  <ul className="space-y-1.5 list-disc list-inside text-xs">
                    <li>See your posts, reels, or stories</li>
                    <li>Tag you in posts or comments</li>
                    <li>Message or call you on Pixelgram</li>
                    <li>Find your profile in search</li>
                  </ul>
                  <p className="text-xs pt-1 text-muted-foreground">
                    They won't be notified that you blocked them. You can unblock them anytime.
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={blockLoading}
                onClick={handleToggleBlock}
                className={`flex-1 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                  blocked ? 'bg-primary hover:opacity-90' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {blockLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : blocked ? (
                  'Unblock'
                ) : (
                  'Block'
                )}
              </button>
            </div>
          </div>
        )}

        {/* ===================== VIEW: SHARE AS MESSAGE ===================== */}
        {currentView === 'share_message' && (
          <div className="px-5 pb-6 pt-3 space-y-4 overflow-y-auto max-h-[70vh]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-foreground">Share as message</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send {displayName}'s profile to a friend
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingFriends ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Loading chats...</span>
              </div>
            ) : recentFriends.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
                <p className="text-sm font-medium text-foreground">No recent conversations</p>
                <p className="text-xs text-muted-foreground">
                  You haven't messaged anyone recently. Try sharing via WhatsApp or copy link.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
                {recentFriends.map((friend) => {
                  const isSent = sentFriendIds.has(friend.user_id);
                  const isSending = sendingToId === friend.user_id;
                  const friendName = friend.full_name || friend.username;

                  return (
                    <div
                      key={friend.user_id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {friend.avatar_url ? (
                          <img
                            src={friend.avatar_url}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0">
                            {friendName[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{friendName}</p>
                          <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isSent || isSending}
                        onClick={() => handleSendToFriend(friend)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                          isSent
                            ? 'bg-muted text-muted-foreground cursor-default'
                            : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-95'
                        }`}
                      >
                        {isSending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isSent ? (
                          'Sent'
                        ) : (
                          'Send'
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setCurrentView('menu')}
              className="w-full py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacebookProfileBottomSheet;
