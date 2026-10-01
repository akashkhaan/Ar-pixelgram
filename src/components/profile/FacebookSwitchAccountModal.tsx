import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Loader2, X, Trash2 } from 'lucide-react';
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
  const { user, profile } = useAuth();
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
      toast.error('Session expired. Please log in to this account again.');
      // Remove invalid session or redirect
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Facebook Bottom Sheet (Exact replica of user screenshot) */}
      <div
        className="relative z-10 w-full max-w-md bg-card dark:bg-[#242526] rounded-t-[28px] shadow-2xl border-t border-border/40 pb-5 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Drag Indicator */}
        <div className="pt-3 pb-2 flex justify-center">
          <div className="w-10 h-1.2 rounded-full bg-muted-foreground/35" />
        </div>

        {/* Title Header */}
        <div className="relative px-6 py-2 text-center border-b border-border/40">
          <h2 className="text-[17px] font-bold text-foreground tracking-tight">
            Switch accounts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-2 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saved Accounts List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {accounts.map((acc) => {
            const isCurrent = acc.user_id === currentUserId;
            const isSwitching = switchingId === acc.user_id;

            return (
              <div
                key={acc.user_id}
                onClick={() => !isSwitching && handleSelectAccount(acc)}
                className={cn(
                  'group flex items-center justify-between gap-3.5 p-3 rounded-2xl hover:bg-muted/70 active:bg-muted transition-all cursor-pointer select-none',
                  isCurrent && 'bg-muted/40'
                )}
              >
                {/* Left: Avatar + Details */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {acc.avatar_url ? (
                      <img
                        src={acc.avatar_url}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover ring-1 ring-border/50"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted/80 dark:bg-zinc-800 flex items-center justify-center text-foreground font-semibold text-lg border border-border/40">
                        {acc.full_name?.[0]?.toUpperCase() || acc.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}

                    {isSwitching && (
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Name + Notifications / Username */}
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-[15px] font-semibold text-foreground truncate">
                      {acc.full_name || acc.username}
                    </p>
                    {acc.notifications_count && acc.notifications_count > 0 ? (
                      <p className="text-xs text-red-500 font-medium flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>{acc.notifications_count} notifications</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        @{acc.username}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Checkmark for Active account OR Remove option */}
                <div className="flex items-center gap-2 shrink-0">
                  {isCurrent ? (
                    /* Facebook Blue Circle with Checkmark (exact from screenshot) */
                    <div className="w-6 h-6 rounded-full bg-[#0866FF] flex items-center justify-center text-white shadow-xs">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveAccount(e, acc.user_id, acc.full_name || acc.username)}
                      className="opacity-0 group-hover:opacity-100 p-2 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      title="Remove from saved accounts"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Row: Log in to another account (exact from screenshot) */}
          <div
            onClick={handleAddAccount}
            className="flex items-center gap-3.5 p-3 rounded-2xl hover:bg-muted/70 active:bg-muted transition-all cursor-pointer select-none mt-1"
          >
            {/* Circular Plus Button */}
            <div className="w-12 h-12 rounded-full bg-muted/80 dark:bg-zinc-800 border border-border/50 flex items-center justify-center text-foreground shrink-0 shadow-2xs">
              <Plus className="w-6 h-6 stroke-[2.2]" />
            </div>

            <p className="text-[15px] font-semibold text-foreground">
              Log in to another account
            </p>
          </div>
        </div>

        {/* Bottom Meta Branding (from screenshot bottom) */}
        <div className="pt-3 border-t border-border/30 flex items-center justify-center gap-1.5 text-muted-foreground select-none">
          <svg className="w-4.5 h-4.5 fill-[#0866FF]" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.07 13.91c-1.32.96-3.08 1.09-4.53.33-1.63-.85-2.4-2.8-1.78-4.56.57-1.6 2.15-2.68 3.86-2.68 1.48 0 2.87.81 3.58 2.08l-1.38.79c-.43-.77-1.25-1.26-2.2-1.26-1.06 0-2.02.66-2.38 1.66-.4 1.12.08 2.37 1.13 2.91.95.49 2.09.4 2.94-.23l.76.96zm4.84.09h-1.64V8h1.64v8z" />
          </svg>
          <span className="text-[13px] font-bold tracking-tight text-foreground/80">
            Meta
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FacebookSwitchAccountModal;
