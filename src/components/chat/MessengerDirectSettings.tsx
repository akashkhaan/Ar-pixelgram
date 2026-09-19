import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  User,
  Bell,
  BellOff,
  ChevronRight,
  Search,
  ShieldOff,
  Ban,
  Flag,
  Trash2,
  Check,
  X,
  BadgeCheck,
} from 'lucide-react';
import type { Profile } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MESSENGER_THEMES, POPULAR_EMOJIS } from './MessengerGroupSettings';
import { toast } from 'sonner';

interface MessengerDirectSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  statusText: string;
  blocked: boolean;
  onToggleBlock: () => void;
  onStartCall: (kind: 'audio' | 'video') => void;
  onStartSearch: () => void;
  chatTheme: string;
  onThemeChange: (theme: string) => void;
  chatEmoji: string;
  onEmojiChange: (emoji: string) => void;
  nickname: string;
  onNicknameChange: (nick: string) => void;
}

export const MessengerDirectSettings: React.FC<MessengerDirectSettingsProps> = ({
  isOpen,
  onClose,
  profile,
  statusText,
  blocked,
  onToggleBlock,
  onStartCall,
  onStartSearch,
  chatTheme,
  onThemeChange,
  chatEmoji,
  onEmojiChange,
  nickname,
  onNicknameChange,
}) => {
  const navigate = useNavigate();

  const [showThemeDialog, setShowThemeDialog] = useState(false);
  const [showEmojiDialog, setShowEmojiDialog] = useState(false);
  const [showNicknameDialog, setShowNicknameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [tempNick, setTempNick] = useState(nickname);
  const [reportReason, setReportReason] = useState('');

  const [isMuted, setIsMuted] = useState(() => {
    try {
      if (!profile) return false;
      const mutedList = JSON.parse(localStorage.getItem('muted_direct_ids') || '[]');
      return mutedList.includes(profile.user_id);
    } catch {
      return false;
    }
  });

  if (!isOpen || !profile) return null;

  const handleToggleMute = () => {
    try {
      const mutedList: string[] = JSON.parse(localStorage.getItem('muted_direct_ids') || '[]');
      let updated: string[];
      if (isMuted) {
        updated = mutedList.filter(id => id !== profile.user_id);
        setIsMuted(false);
        toast.success('Chat unmuted');
      } else {
        updated = [...mutedList, profile.user_id];
        setIsMuted(true);
        toast.success('Chat muted');
      }
      localStorage.setItem('muted_direct_ids', JSON.stringify(updated));
    } catch {
      setIsMuted(!isMuted);
    }
  };

  const activeTheme = MESSENGER_THEMES.find(t => t.id === chatTheme) || MESSENGER_THEMES[0];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground overflow-y-auto animate-in fade-in duration-200 select-none">
      {/* 1. TOP BAR */}
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-muted text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Conversation Details
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full p-2 hover:bg-muted text-foreground transition-colors"
              aria-label="More options"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5 shadow-2xl border-border bg-card">
            <DropdownMenuItem
              onClick={() => { onClose(); navigate(`/profile/${profile.user_id}`); }}
              className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl"
            >
              View profile
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl text-destructive focus:text-destructive"
            >
              Delete conversation
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1" />

            <DropdownMenuItem
              onClick={onToggleBlock}
              className={`cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl ${
                blocked ? 'text-green-600 focus:text-green-600' : 'text-destructive focus:text-destructive'
              }`}
            >
              {blocked ? 'Unblock user' : 'Block user'}
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setShowReportDialog(true)}
              className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl"
            >
              Report user
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* 2. PROFILE HERO */}
      <div className="flex flex-col items-center px-4 pt-6 pb-4 text-center">
        <div
          onClick={() => { onClose(); navigate(`/profile/${profile.user_id}`); }}
          className="relative cursor-pointer group"
        >
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover shadow-xl ring-4 ring-background border border-border"
            />
          ) : (
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-3xl shadow-xl ring-4 ring-background border border-border">
              {profile.username?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-3">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            {nickname || profile.username}
          </h1>
          {profile.is_verified && <BadgeCheck className="h-5 w-5 text-sky-500 shrink-0" />}
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground font-medium">
          {statusText || 'Active now'}
        </p>

        {/* 4 ACTION BUTTONS */}
        <div className="mt-5 grid grid-cols-4 gap-4 w-full max-w-xs">
          <button
            type="button"
            onClick={() => { onClose(); onStartCall('audio'); }}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-muted/80 group-hover:bg-muted group-active:scale-95 flex items-center justify-center transition-all shadow-sm border border-border/50">
              <Phone className="h-5 w-5 text-sky-500 fill-sky-500/20" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Audio</span>
          </button>

          <button
            type="button"
            onClick={() => { onClose(); onStartCall('video'); }}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-muted/80 group-hover:bg-muted group-active:scale-95 flex items-center justify-center transition-all shadow-sm border border-border/50">
              <Video className="h-5 w-5 text-sky-500 fill-sky-500/20" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Video</span>
          </button>

          <button
            type="button"
            onClick={() => { onClose(); navigate(`/profile/${profile.user_id}`); }}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-muted/80 group-hover:bg-muted group-active:scale-95 flex items-center justify-center transition-all shadow-sm border border-border/50">
              <User className="h-5 w-5 text-sky-500" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Profile</span>
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-muted/80 group-hover:bg-muted group-active:scale-95 flex items-center justify-center transition-all shadow-sm border border-border/50">
              {isMuted ? (
                <BellOff className="h-5 w-5 text-red-500" />
              ) : (
                <Bell className="h-5 w-5 text-sky-500 fill-sky-500/20" />
              )}
            </div>
            <span className="text-[11px] font-medium text-foreground">
              {isMuted ? 'Unmute' : 'Mute'}
            </span>
          </button>
        </div>
      </div>

      {/* 3. SETTINGS ROWS */}
      <div className="px-4 pb-12 max-w-lg mx-auto w-full space-y-5">
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40 shadow-sm">
          {/* Theme */}
          <button
            type="button"
            onClick={() => setShowThemeDialog(true)}
            className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="text-sm font-medium text-foreground">Theme</span>
            <div className="flex items-center gap-2">
              <span
                className={`h-5 w-5 rounded-full bg-gradient-to-tr ${activeTheme.preview} shadow-sm ring-1 ring-black/10`}
              />
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>

          {/* Emoji */}
          <button
            type="button"
            onClick={() => setShowEmojiDialog(true)}
            className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="text-sm font-medium text-foreground">Emoji</span>
            <div className="flex items-center gap-2">
              <span className="text-xl leading-none">{chatEmoji}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>

          {/* Nickname */}
          <button
            type="button"
            onClick={() => { setTempNick(nickname); setShowNicknameDialog(true); }}
            className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
          >
            <div>
              <p className="text-sm font-medium text-foreground">Nickname</p>
              <p className="text-xs text-muted-foreground">
                {nickname ? `"${nickname}"` : 'Set nickname'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* More Actions */}
        <div className="space-y-1.5">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            More Actions
          </p>
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40 shadow-sm">
            <button
              type="button"
              onClick={() => { onClose(); onStartSearch(); }}
              className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
            >
              <span className="text-sm font-medium text-foreground">Search in Conversation</span>
              <Search className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Privacy */}
        <div className="space-y-1.5">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Privacy & Support
          </p>
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40 shadow-sm">
            <div className="flex w-full items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-foreground">Notifications</p>
                <p className="text-xs text-muted-foreground">{isMuted ? 'Muted' : 'On'}</p>
              </div>
              <Switch checked={!isMuted} onCheckedChange={handleToggleMute} />
            </div>

            <button
              type="button"
              onClick={onToggleBlock}
              className={`flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left ${
                blocked ? 'text-green-600' : 'text-destructive'
              }`}
            >
              <div>
                <p className="text-sm font-semibold">{blocked ? 'Unblock user' : 'Block user'}</p>
                <p className="text-xs text-muted-foreground">
                  {blocked ? 'Allow messages & calls' : 'Stop messages & calls'}
                </p>
              </div>
              {blocked ? <ShieldOff className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* DIALOGS */}
      <Dialog open={showThemeDialog} onOpenChange={setShowThemeDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Choose Chat Theme</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2.5 py-3">
            {MESSENGER_THEMES.map(theme => (
              <button
                key={theme.id}
                type="button"
                onClick={() => { onThemeChange(theme.id); setShowThemeDialog(false); }}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                  chatTheme === theme.id ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-border hover:bg-muted'
                }`}
              >
                <span className={`h-6 w-6 rounded-full bg-gradient-to-tr ${theme.preview} shrink-0 shadow-sm`} />
                <span className="text-xs font-semibold text-foreground truncate">{theme.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmojiDialog} onOpenChange={setShowEmojiDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Choose Quick Emoji</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-2 py-3 text-2xl justify-items-center">
            {POPULAR_EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onEmojiChange(emoji); setShowEmojiDialog(false); }}
                className={`h-11 w-11 rounded-xl flex items-center justify-center transition-transform hover:scale-125 active:scale-95 ${
                  chatEmoji === emoji ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNicknameDialog} onOpenChange={setShowNicknameDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Edit Nickname</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Only you will see this nickname in your chat
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={tempNick}
              onChange={e => setTempNick(e.target.value)}
              placeholder="Enter nickname..."
              className="rounded-xl"
              maxLength={24}
            />
          </div>
          <DialogFooter className="flex-row justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowNicknameDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onNicknameChange(tempNick.trim());
                setShowNicknameDialog(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-6 bg-card border-border shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              This will remove this conversation from your chat list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row items-center justify-end gap-3 mt-4">
            <AlertDialogCancel className="border-none bg-transparent text-muted-foreground font-semibold">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDeleteDialog(false);
                toast.success('Conversation deleted');
                onClose();
                navigate('/chat');
              }}
              className="bg-destructive hover:bg-destructive/90 text-white font-bold"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Report User</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder="Describe the issue..."
              className="rounded-xl"
            />
          </div>
          <DialogFooter className="flex-row justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowReportDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowReportDialog(false);
                toast.success('Report submitted. Thank you for your feedback.');
              }}
              disabled={!reportReason.trim()}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessengerDirectSettings;
