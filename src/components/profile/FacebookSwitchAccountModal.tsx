import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Loader2, X, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  getSavedAccounts,
  switchToAccount,
  removeSavedAccount,
  logInToAnotherAccount,
  SavedAccount,
} from '@/lib/savedAccounts';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface FacebookSwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FacebookSwitchAccountModal: React.FC<FacebookSwitchAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      setAccounts(getSavedAccounts());
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentUserId = user?.id;

  const handleSelectAccount = async (account: SavedAccount) => {
    if (account.user_id === currentUserId) {
      onClose();
      return;
    }

    setSwitchingId(account.user_id);
    toast.info(`Switching to ${account.full_name || account.username}...`);

    const ok = await switchToAccount(account);
    if (!ok) {
      setSwitchingId(null);
      toast.error(
        `Session expired for ${account.full_name || account.username}. Tap below to log in again.`,
        {
          action: {
            label: 'Log in',
            onClick: () => handleAddAccount(),
          },
          duration: 5000,
        }
      );
    }
  };

  const handleAddAccount = async () => {
    onClose();
    toast.info('Opening login...');
    await logInToAnotherAccount();
  };

  const handleRemoveAccount = (e: React.MouseEvent, accountId: string, name: string) => {
    e.stopPropagation();
    removeSavedAccount(accountId);
    setAccounts(getSavedAccounts());
    toast.success(`Removed ${name} from saved accounts`);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop with soft blur */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Facebook Bottom Sheet with Premium Continuous Rainbow Accent */}
      <div
        className="relative z-10 w-full max-w-md bg-card dark:bg-[#1E1F20] rounded-t-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-250 border-t border-border/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌈 Top Continuous Animated Rainbow Glowing Line 🌈 */}
        <div className="h-[3px] w-full premium-rainbow-border shrink-0" />

        {/* Top Drag Indicator */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <div className="w-11 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Title Header with Rang-Birange Dynamic Shifting Rainbow Gradient */}
        <div className="relative px-6 py-2.5 text-center border-b border-border/30">
          <h2 className="text-[18px] font-black tracking-tight premium-rainbow-text">
            Switch accounts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-2.5 p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground active:scale-95 transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saved Accounts List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {accounts.map((acc) => {
            const isCurrent = acc.user_id === currentUserId;
            const isSwitching = switchingId === acc.user_id;

            return (
              <div
                key={acc.user_id}
                onClick={() => !isSwitching && handleSelectAccount(acc)}
                className={cn(
                  'group relative rounded-2xl transition-all cursor-pointer select-none',
                  isCurrent
                    ? 'p-[1.5px] premium-rainbow-border premium-rainbow-glow shadow-md'
                    : 'p-[1.5px] hover:p-[1.5px] hover:premium-rainbow-border'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-between gap-3.5 p-3 rounded-[15px] transition-colors',
                    isCurrent
                      ? 'bg-card dark:bg-[#252627]'
                      : 'bg-muted/40 hover:bg-muted/70 active:bg-muted dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 border border-border/30'
                  )}
                >
                  {/* Left: Avatar + Details */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Avatar with Rang-Birange Dynamic Glowing Ring */}
                    <div className="relative shrink-0 p-[2px] rounded-full premium-rainbow-border shadow-xs">
                      {acc.avatar_url ? (
                        <img
                          src={acc.avatar_url}
                          alt=""
                          className="w-12 h-12 rounded-full object-cover bg-background"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center text-foreground font-black text-lg">
                          <span className="premium-rainbow-text">
                            {acc.full_name?.[0]?.toUpperCase() || acc.username?.[0]?.toUpperCase() || 'U'}
                          </span>
                        </div>
                      )}

                      {/* Switching Loading Overlay */}
                      {isSwitching && (
                        <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Name + Notifications / Username */}
                    <div className="min-w-0 flex-1 text-left">
                      <p
                        className={cn(
                          'text-[15px] font-bold truncate leading-snug',
                          isCurrent ? 'premium-rainbow-text' : 'text-foreground group-hover:text-primary transition-colors'
                        )}
                      >
                        {acc.full_name || acc.username}
                      </p>
                      {acc.notifications_count && acc.notifications_count > 0 ? (
                        <p className="text-xs text-red-500 font-semibold flex items-center gap-1.5 mt-0.5">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                          <span>{acc.notifications_count} notifications</span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground truncate mt-0.5 font-medium">
                          @{acc.username}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Checkmark for Active account OR Switch Badge & Delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isCurrent ? (
                      /* Active Checkmark with Dynamic Rainbow Gradient Circle */
                      <div className="w-7 h-7 rounded-full premium-rainbow-border flex items-center justify-center text-white shadow-md">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-muted/80 text-foreground group-hover:premium-rainbow-text group-hover:bg-primary/10 transition-all border border-border/40">
                          <span>Switch</span>
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveAccount(e, acc.user_id, acc.full_name || acc.username)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                          title="Remove from saved accounts"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Row: Log in to another account (with Rang-Birange Dynamic Rainbow Accent) */}
          <div
            onClick={handleAddAccount}
            className="group p-[1.5px] rounded-2xl hover:premium-rainbow-border transition-all cursor-pointer select-none mt-2"
          >
            <div className="flex items-center gap-3.5 p-3 rounded-[15px] bg-muted/40 hover:bg-muted/70 active:bg-muted dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 border border-border/30 transition-colors">
              {/* Circular Plus Button with Dynamic Rainbow Shifting Glow */}
              <div className="w-12 h-12 rounded-full p-[2px] premium-rainbow-border flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 active:scale-95 transition-transform">
                <div className="w-full h-full rounded-full bg-card dark:bg-[#1E1F20] flex items-center justify-center">
                  <Plus className="w-5 h-5 premium-rainbow-icon stroke-[2.5]" />
                </div>
              </div>

              <div className="flex-1 text-left min-w-0">
                <p className="text-[15px] font-bold text-foreground group-hover:premium-rainbow-text transition-all truncate">
                  Log in to another account
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Create new or login another account
                </p>
              </div>

              <div className="w-7 h-7 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Pixelgram Branding with Official Pixelgram PNG Logo and Dynamic Rainbow Text */}
        <div className="py-3 px-4 border-t border-border/30 flex items-center justify-center gap-2 select-none bg-muted/20">
          <img
            src="/icon-192.png"
            alt="Pixelgram"
            className="w-5 h-5 rounded-md object-contain shadow-xs shrink-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/favicon.png';
            }}
          />
          <span className="text-[14px] font-black tracking-wide premium-rainbow-text">
            Pixelgram
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FacebookSwitchAccountModal;
