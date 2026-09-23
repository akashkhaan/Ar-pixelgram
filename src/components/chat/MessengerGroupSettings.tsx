import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  UserPlus,
  Bell,
  BellOff,
  Palette,
  Smile,
  Users,
  Link as LinkIcon,
  Search,
  Pin,
  Paperclip,
  Shield,
  LogOut,
  Camera,
  Trash2,
  AlertTriangle,
  Flag,
  MessageSquareOff,
  ChevronRight,
  X,
  Check,
  Crown,
  Loader2,
  Copy,
} from 'lucide-react';
import type { Group, GroupMember, GroupMedia, GroupPinnedMessage, GroupPermissions } from '@/types/groups';
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
  DialogFooter,
  DialogDescription,
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
import { toast } from 'sonner';
import { firstFrameSrc } from '@/lib/mediaUrl';

export const MESSENGER_THEMES = [
  { id: 'default', name: 'Messenger Blue', preview: 'from-[#0084FF] to-[#00C6FF]', bubble: 'bg-[#0084FF] text-white', accent: '#0084FF' },
  { id: 'sunset', name: 'Sunset', preview: 'from-orange-500 to-pink-500', bubble: 'bg-gradient-to-r from-orange-500 to-pink-500 text-white', accent: '#FF6B6B' },
  { id: 'berry', name: 'Berry', preview: 'from-pink-500 to-purple-600', bubble: 'bg-gradient-to-r from-pink-500 to-purple-600 text-white', accent: '#D946EF' },
  { id: 'cyberpunk', name: 'Neon Cyberpunk', preview: 'from-fuchsia-500 to-cyan-500', bubble: 'bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-white', accent: '#06B6D4' },
  { id: 'emerald', name: 'Emerald', preview: 'from-emerald-500 to-teal-600', bubble: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white', accent: '#10B981' },
  { id: 'royal', name: 'Royal Indigo', preview: 'from-indigo-600 to-violet-600', bubble: 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white', accent: '#6366F1' },
  { id: 'monochrome', name: 'Dark Monochrome', preview: 'from-neutral-700 to-neutral-900', bubble: 'bg-neutral-800 text-white', accent: '#71717A' },
];

export const POPULAR_EMOJIS = ['👍', '🙏', '❤️', '🔥', '😂', '🎉', '💯', '😍', '✨', '👏', '🚀', '⭐', '😎', '👀', '💖', '💪', '🤝', '⚡'];

export const PERMISSION_LABELS: Array<{ key: keyof GroupPermissions; label: string }> = [
  { key: 'send_messages', label: 'Send messages' },
  { key: 'add_members', label: 'Add members' },
  { key: 'edit_info', label: 'Edit group info' },
  { key: 'create_invites', label: 'Generate invite links' },
  { key: 'pin_messages', label: 'Pin messages' },
  { key: 'start_calls', label: 'Start group audio/video calls' },
];

interface MessengerGroupSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  group: Group;
  members: GroupMember[];
  currentMember: GroupMember | null;
  pinnedMessages: GroupPinnedMessage[];
  mediaItems: GroupMedia[];
  permissions: GroupPermissions | null;
  onStartCall: (kind: 'audio' | 'video') => void;
  onUpdateGroup: (updates: Partial<Group>) => Promise<void>;
  onAvatarUpload: (file: File) => Promise<void>;
  onAddMember: (profile: Profile) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onPermissionChange: (key: keyof GroupPermissions, value: 'everyone' | 'admins') => Promise<void>;
  onUnpinMessage: (messageId: string) => Promise<void>;
  onLeaveGroup: () => Promise<void>;
  onCopyInvite: () => void;
  onJumpToMessage: (messageId: string) => void;
  onStartSearch: () => void;
  groupTheme: string;
  onThemeChange: (themeKey: string) => void;
  groupEmoji: string;
  onEmojiChange: (emoji: string) => void;
  nicknames: Record<string, string>;
  onNicknameChange: (userId: string, nickname: string) => void;
  memberQuery: string;
  setMemberQuery: (q: string) => void;
  memberResults: Profile[];
}

export const MessengerGroupSettings: React.FC<MessengerGroupSettingsProps> = ({
  isOpen,
  onClose,
  group,
  members,
  currentMember,
  pinnedMessages,
  mediaItems,
  permissions,
  onStartCall,
  onUpdateGroup,
  onAvatarUpload,
  onAddMember,
  onRemoveMember,
  onPermissionChange,
  onUnpinMessage,
  onLeaveGroup,
  onCopyInvite,
  onJumpToMessage,
  onStartSearch,
  groupTheme,
  onThemeChange,
  groupEmoji,
  onEmojiChange,
  nicknames,
  onNicknameChange,
  memberQuery,
  setMemberQuery,
  memberResults,
}) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals & sub-sheets
  const [showIgnoreDialog, setShowIgnoreDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showThemeDialog, setShowThemeDialog] = useState(false);
  const [showEmojiDialog, setShowEmojiDialog] = useState(false);
  const [showNicknamesDialog, setShowNicknamesDialog] = useState(false);
  const [showMembersSheet, setShowMembersSheet] = useState(false);
  const [showPinnedSheet, setShowPinnedSheet] = useState(false);
  const [showMediaSheet, setShowMediaSheet] = useState(false);
  const [showPermissionsSheet, setShowPermissionsSheet] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);

  // States
  const [newName, setNewName] = useState(group.name);
  const [reportReason, setReportReason] = useState('');
  const [editingNicknameUserId, setEditingNicknameUserId] = useState<string | null>(null);
  const [tempNickname, setTempNickname] = useState('');
  const [isMuted, setIsMuted] = useState(() => {
    try {
      const mutedList = JSON.parse(localStorage.getItem('muted_group_ids') || '[]');
      return mutedList.includes(group.id);
    } catch {
      return false;
    }
  });
  const [mediaTab, setMediaTab] = useState<'photo' | 'video' | 'file'>('photo');

  const canManage = currentMember?.role === 'owner' || currentMember?.role === 'admin';
  const canEditInfo = canManage || permissions?.edit_info !== 'admins';

  if (!isOpen) return null;

  // Toggle Mute
  const handleToggleMute = () => {
    try {
      const mutedList: string[] = JSON.parse(localStorage.getItem('muted_group_ids') || '[]');
      let updated: string[];
      if (isMuted) {
        updated = mutedList.filter(id => id !== group.id);
        setIsMuted(false);
        toast.success('Group unmuted');
      } else {
        updated = [...mutedList, group.id];
        setIsMuted(true);
        toast.success('Group muted');
      }
      localStorage.setItem('muted_group_ids', JSON.stringify(updated));
    } catch {
      setIsMuted(!isMuted);
    }
  };

  // Ignore Group Handler (matching video at 00:13)
  const handleConfirmIgnore = () => {
    try {
      const ignored: string[] = JSON.parse(localStorage.getItem('ignored_group_ids') || '[]');
      if (!ignored.includes(group.id)) {
        ignored.push(group.id);
        localStorage.setItem('ignored_group_ids', JSON.stringify(ignored));
      }
    } catch {
      /* ignore */
    }
    setShowIgnoreDialog(false);
    onClose();
    toast('This group has been moved to Message Requests', {
      duration: 3500,
    });
    navigate('/chat');
  };

  // Rename Handler
  const handleSaveRename = async () => {
    if (!newName.trim() || !canEditInfo) return;
    try {
      await onUpdateGroup({ name: newName.trim() });
      setShowRenameDialog(false);
      toast.success('Group name updated');
    } catch (e: any) {
      toast.error(e?.message || 'Could not update name');
    }
  };

  // Delete Conversation
  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    toast.success('Conversation deleted');
    onClose();
    navigate('/chat');
  };

  const activeTheme = MESSENGER_THEMES.find(t => t.id === groupTheme) || MESSENGER_THEMES[0];

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

        <div className="text-center min-w-0 px-2">
          <p className="text-xs font-semibold text-muted-foreground truncate uppercase tracking-wider">
            Group Details
          </p>
        </div>

        {/* 3-DOTS MENU (Messenger style popup) */}
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
          <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5 shadow-2xl border-border bg-card">
            <DropdownMenuItem
              onClick={() => toast.success('Open chat head enabled')}
              className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl"
            >
              Open chat head
            </DropdownMenuItem>

            {canEditInfo && (
              <DropdownMenuItem
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl"
              >
                Change group photo
              </DropdownMenuItem>
            )}

            {canEditInfo && (
              <DropdownMenuItem
                onClick={() => { setNewName(group.name); setShowRenameDialog(true); }}
                className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl"
              >
                Change name
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl text-destructive focus:text-destructive"
            >
              Delete conversation
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1" />

            <DropdownMenuItem
              onClick={() => setShowIgnoreDialog(true)}
              className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl"
            >
              Ignore group
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setShowLeaveDialog(true)}
              className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl text-destructive focus:text-destructive"
            >
              Leave group
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setShowReportDialog(true)}
              className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl"
            >
              Report a Problem
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Hidden File Input for Avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void onAvatarUpload(f);
          e.target.value = '';
        }}
      />

      {/* 2. HERO SECTION: Big Avatar, Name, Subtitle, 4 Quick Action Buttons */}
      <div className="flex flex-col items-center px-4 pt-6 pb-4 text-center">
        {/* AVATAR */}
        <div className="relative cursor-pointer group" onClick={() => canEditInfo && fileInputRef.current?.click()}>
          {group.avatar_url ? (
            <img
              src={group.avatar_url}
              alt={group.name}
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover shadow-xl ring-4 ring-background border border-border"
            />
          ) : (
            /* Multi-avatar collage identical to Messenger */
            <div className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-xl ring-4 ring-background border border-border overflow-hidden">
              {members.length >= 2 ? (
                <div className="relative w-full h-full">
                  {members[0]?.profile?.avatar_url ? (
                    <img
                      src={members[0].profile.avatar_url}
                      alt=""
                      className="absolute top-1 left-1 w-14 h-14 rounded-full object-cover ring-2 ring-white/30"
                    />
                  ) : (
                    <div className="absolute top-1 left-1 w-14 h-14 rounded-full bg-sky-700 flex items-center justify-center font-bold text-xs">
                      {members[0]?.profile?.username?.[0]?.toUpperCase() || 'A'}
                    </div>
                  )}
                  {members[1]?.profile?.avatar_url ? (
                    <img
                      src={members[1].profile.avatar_url}
                      alt=""
                      className="absolute bottom-1 right-1 w-14 h-14 rounded-full object-cover ring-2 ring-white/30"
                    />
                  ) : (
                    <div className="absolute bottom-1 right-1 w-14 h-14 rounded-full bg-blue-800 flex items-center justify-center font-bold text-xs">
                      {members[1]?.profile?.username?.[0]?.toUpperCase() || 'B'}
                    </div>
                  )}
                  {members.length > 2 && (
                    <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-1 ring-white/40">
                      +{members.length - 2}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-2xl font-bold">
                  {group.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          )}

          {canEditInfo && (
            <div className="absolute bottom-0 right-0 rounded-full bg-primary p-2 text-primary-foreground shadow-md ring-2 ring-background group-hover:scale-105 transition-transform">
              <Camera className="h-4 w-4" />
            </div>
          )}
        </div>

        {/* GROUP NAME */}
        <h1 className="mt-3 text-xl sm:text-2xl font-bold text-foreground tracking-tight">
          {group.name}
        </h1>

        {/* SUBTITLE */}
        <p className="mt-0.5 text-xs text-muted-foreground font-medium">
          Active 19 hours ago · {members.length} members
        </p>

        {/* 4 CIRCULAR ACTION BUTTONS: Audio, Video, Add, Mute */}
        <div className="mt-5 grid grid-cols-4 gap-4 w-full max-w-xs">
          {/* 1. Audio */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
              onStartCall('audio');
            }}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-muted/80 group-hover:bg-muted group-active:scale-95 flex items-center justify-center transition-all shadow-sm border border-border/50">
              <Phone className="h-5 w-5 text-sky-500 fill-sky-500/20" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Audio</span>
          </button>

          {/* 2. Video */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
              onStartCall('video');
            }}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-muted/80 group-hover:bg-muted group-active:scale-95 flex items-center justify-center transition-all shadow-sm border border-border/50">
              <Video className="h-5 w-5 text-sky-500 fill-sky-500/20" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Video</span>
          </button>

          {/* 3. Add */}
          <button
            type="button"
            onClick={() => setShowMembersSheet(true)}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-muted/80 group-hover:bg-muted group-active:scale-95 flex items-center justify-center transition-all shadow-sm border border-border/50">
              <UserPlus className="h-5 w-5 text-sky-500" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Add</span>
          </button>

          {/* 4. Mute */}
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

      {/* 3. SETTINGS SECTIONS (Messenger style rows) */}
      <div className="px-4 pb-12 max-w-lg mx-auto w-full space-y-5">
        {/* SECTION 1: CUSTOMIZATION */}
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
              <span className="text-xl leading-none">{groupEmoji}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>

          {/* Nicknames */}
          <button
            type="button"
            onClick={() => setShowNicknamesDialog(true)}
            className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="text-sm font-medium text-foreground">Nicknames</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          {/* Members */}
          <button
            type="button"
            onClick={() => setShowMembersSheet(true)}
            className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
          >
            <div className="min-w-0 pr-2">
              <p className="text-sm font-medium text-foreground">Members</p>
              <p className="text-xs text-muted-foreground truncate">
                {members.length} members · Approval requests off
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>

          {/* Share Link */}
          <button
            type="button"
            onClick={onCopyInvite}
            className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="text-sm font-medium text-foreground">Share Link</span>
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* SECTION 2: MORE ACTIONS */}
        <div className="space-y-1.5">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            More Actions
          </p>
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40 shadow-sm">
            {/* Search in Conversation */}
            <button
              type="button"
              onClick={() => { onClose(); onStartSearch(); }}
              className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
            >
              <span className="text-sm font-medium text-foreground">Search in Conversation</span>
              <Search className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Pinned Messages */}
            <button
              type="button"
              onClick={() => setShowPinnedSheet(true)}
              className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground">Pinned Messages</span>
                <p className="text-xs text-muted-foreground">{pinnedMessages.length} pinned</p>
              </div>
              <Pin className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Shared Media & Files */}
            <button
              type="button"
              onClick={() => setShowMediaSheet(true)}
              className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground">Shared media & files</span>
                <p className="text-xs text-muted-foreground">{mediaItems.length} items</p>
              </div>
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Admin Permissions */}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowPermissionsSheet(true)}
                className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
              >
                <span className="text-sm font-medium text-foreground">Admin permissions</span>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* SECTION 3: PRIVACY */}
        <div className="space-y-1.5">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Privacy
          </p>
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40 shadow-sm">
            {/* Notifications */}
            <div className="flex w-full items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-foreground">Notifications</p>
                <p className="text-xs text-muted-foreground">{isMuted ? 'Muted' : 'On'}</p>
              </div>
              <Switch checked={!isMuted} onCheckedChange={handleToggleMute} />
            </div>

            {/* Ignore group (Exact option from video) */}
            <button
              type="button"
              onClick={() => setShowIgnoreDialog(true)}
              className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-medium text-foreground">Ignore group</p>
                <p className="text-xs text-muted-foreground">Move to Filtered Messages</p>
              </div>
              <MessageSquareOff className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Leave group */}
            <button
              type="button"
              onClick={() => setShowLeaveDialog(true)}
              className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-destructive/10 transition-colors text-left"
            >
              <span className="text-sm font-semibold text-destructive">Leave group</span>
              <LogOut className="h-4 w-4 text-destructive" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. DIALOGS & SHEETS */}

      {/* A. "Ignore this group?" ALERT DIALOG (Exact Replica of Video 00:13) */}
      <AlertDialog open={showIgnoreDialog} onOpenChange={setShowIgnoreDialog}>
        <AlertDialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-6 bg-card border-border shadow-2xl">
          <AlertDialogHeader className="text-left space-y-2">
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              Ignore this group?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
              You won't be notified when someone messages this group, and the group will move to Filtered Messages. We won't tell anyone in the group that the messages have been ignored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row items-center justify-end gap-3 mt-4 sm:space-x-0">
            <AlertDialogCancel
              onClick={() => setShowIgnoreDialog(false)}
              className="border-none bg-transparent hover:bg-muted text-muted-foreground font-semibold px-4 py-2"
            >
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmIgnore}
              className="bg-transparent hover:bg-sky-500/10 text-sky-500 hover:text-sky-600 font-bold px-4 py-2 shadow-none"
            >
              IGNORE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* B. Leave Group Dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-6 bg-card border-border shadow-2xl">
          <AlertDialogHeader className="text-left space-y-2">
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              Leave this group?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              You won't receive any more messages from this group unless someone adds you back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row items-center justify-end gap-3 mt-4">
            <AlertDialogCancel className="border-none bg-transparent text-muted-foreground font-semibold">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowLeaveDialog(false); void onLeaveGroup(); }}
              className="bg-destructive hover:bg-destructive/90 text-white font-bold"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* C. Delete Conversation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-6 bg-card border-border shadow-2xl">
          <AlertDialogHeader className="text-left space-y-2">
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              Delete conversation?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              This will remove this group chat from your conversation list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row items-center justify-end gap-3 mt-4">
            <AlertDialogCancel className="border-none bg-transparent text-muted-foreground font-semibold">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-white font-bold"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* D. Rename Group Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Change Group Name</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              maxLength={80}
              placeholder="Group name"
              className="rounded-xl"
            />
          </div>
          <DialogFooter className="flex-row justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveRename()} disabled={!newName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E. Theme Picker Dialog */}
      <Dialog open={showThemeDialog} onOpenChange={setShowThemeDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Choose Chat Theme</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Customize the color palette for message bubbles and accents
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2.5 py-3">
            {MESSENGER_THEMES.map(theme => (
              <button
                key={theme.id}
                type="button"
                onClick={() => { onThemeChange(theme.id); setShowThemeDialog(false); }}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                  groupTheme === theme.id ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-border hover:bg-muted'
                }`}
              >
                <span className={`h-6 w-6 rounded-full bg-gradient-to-tr ${theme.preview} shrink-0 shadow-sm`} />
                <span className="text-xs font-semibold text-foreground truncate">{theme.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* F. Emoji Picker Dialog */}
      <Dialog open={showEmojiDialog} onOpenChange={setShowEmojiDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Choose Quick Emoji</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Set the default quick-send emoji for this conversation
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-2 py-3 text-2xl justify-items-center">
            {POPULAR_EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onEmojiChange(emoji); setShowEmojiDialog(false); }}
                className={`h-11 w-11 rounded-xl flex items-center justify-center transition-transform hover:scale-125 active:scale-95 ${
                  groupEmoji === emoji ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* G. Nicknames Dialog */}
      <Dialog open={showNicknamesDialog} onOpenChange={setShowNicknamesDialog}>
        <DialogContent className="max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Nicknames</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Set custom nicknames for members in this group
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto divide-y divide-border/40 py-2">
            {members.map(member => {
              const currentNick = nicknames[member.user_id] || '';
              const isEditing = editingNicknameUserId === member.user_id;

              return (
                <div key={member.user_id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {member.profile?.avatar_url ? (
                      <img
                        src={member.profile.avatar_url}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-bold text-xs shrink-0">
                        {member.profile?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {member.profile?.username || 'Member'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {currentNick ? `"${currentNick}"` : 'Set nickname'}
                      </p>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input
                        value={tempNickname}
                        onChange={e => setTempNickname(e.target.value)}
                        placeholder="Nickname"
                        className="h-8 w-24 text-xs"
                        maxLength={24}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onNicknameChange(member.user_id, tempNickname.trim());
                          setEditingNicknameUserId(null);
                        }}
                        className="p-1 rounded bg-primary text-primary-foreground"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNicknameUserId(null)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 text-primary"
                      onClick={() => {
                        setEditingNicknameUserId(member.user_id);
                        setTempNickname(currentNick);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* H. Members Sheet */}
      <Dialog open={showMembersSheet} onOpenChange={setShowMembersSheet}>
        <DialogContent className="max-w-md rounded-2xl p-5 bg-card border-border shadow-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Group Members ({members.length})</DialogTitle>
          </DialogHeader>

          {/* Add member search if canManage */}
          {canManage && (
            <div className="relative my-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={memberQuery}
                onChange={e => setMemberQuery(e.target.value)}
                placeholder="Search users to add..."
                className="pl-9 rounded-xl"
              />
              {memberResults.length > 0 && (
                <div className="absolute left-0 right-0 top-11 z-20 divide-y divide-border rounded-xl border border-border bg-card shadow-2xl max-h-48 overflow-y-auto">
                  {memberResults.map(p => (
                    <button
                      key={p.user_id}
                      type="button"
                      onClick={() => void onAddMember(p)}
                      className="flex w-full items-center gap-2.5 p-2.5 hover:bg-muted text-left"
                    >
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs">
                          {p.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="flex-1 truncate text-xs font-semibold">{p.username}</span>
                      <UserPlus className="h-4 w-4 text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-border/40 py-2">
            {members.map(m => (
              <div key={m.user_id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-bold text-xs">
                      {m.profile?.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {nicknames[m.user_id] || m.profile?.username || 'Member'}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {m.role === 'owner' ? (
                        <span className="text-amber-500 font-semibold flex items-center gap-0.5">
                          <Crown className="h-3 w-3" /> Owner
                        </span>
                      ) : m.role === 'admin' ? (
                        <span className="text-sky-500 font-semibold flex items-center gap-0.5">
                          <Shield className="h-3 w-3" /> Admin
                        </span>
                      ) : (
                        'Member'
                      )}
                    </p>
                  </div>
                </div>

                {canManage && m.role !== 'owner' && m.user_id !== currentMember?.user_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-destructive hover:bg-destructive/10 h-8"
                    onClick={() => void onRemoveMember(m.user_id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* I. Pinned Messages Sheet */}
      <Dialog open={showPinnedSheet} onOpenChange={setShowPinnedSheet}>
        <DialogContent className="max-w-md rounded-2xl p-5 bg-card border-border shadow-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Pinned Messages ({pinnedMessages.length})</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {pinnedMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No pinned messages yet</p>
            ) : (
              pinnedMessages.map(pin => (
                <div key={pin.message_id} className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPinnedSheet(false);
                      onClose();
                      onJumpToMessage(pin.message_id);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="line-clamp-2 text-xs font-medium text-foreground">{pin.message?.content}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{new Date(pin.pinned_at).toLocaleDateString()}</p>
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void onUnpinMessage(pin.message_id)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* J. Shared Media Sheet */}
      <Dialog open={showMediaSheet} onOpenChange={setShowMediaSheet}>
        <DialogContent className="max-w-md rounded-2xl p-5 bg-card border-border shadow-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Shared Media & Files</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b border-border pb-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMediaTab('photo')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${mediaTab === 'photo' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
            >
              Photos
            </button>
            <button
              type="button"
              onClick={() => setMediaTab('video')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${mediaTab === 'video' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
            >
              Videos
            </button>
            <button
              type="button"
              onClick={() => setMediaTab('file')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${mediaTab === 'file' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
            >
              Files
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-3">
            {mediaItems.filter(i => i.media_type === mediaTab).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No {mediaTab}s shared yet</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {mediaItems
                  .filter(i => i.media_type === mediaTab)
                  .map(item => (
                    <a
                      key={item.id}
                      href={item.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square rounded-xl overflow-hidden border border-border bg-muted/40 hover:opacity-90 transition-opacity"
                    >
                      {item.media_type === 'photo' ? (
                        <img src={item.public_url} alt="" className="w-full h-full object-cover" />
                      ) : item.media_type === 'video' ? (
                        <video src={firstFrameSrc(item.public_url)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                          <Paperclip className="h-6 w-6 text-primary mb-1" />
                          <span className="text-[10px] truncate max-w-full">{item.file_name}</span>
                        </div>
                      )}
                    </a>
                  ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* K. Permissions Sheet */}
      <Dialog open={showPermissionsSheet} onOpenChange={setShowPermissionsSheet}>
        <DialogContent className="max-w-md rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Admin Permissions</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Choose who can perform specific actions in this group
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            {permissions ? (
              PERMISSION_LABELS.map(p => (
                <div key={p.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">{p.label}</span>
                  <select
                    value={permissions[p.key]}
                    onChange={e => void onPermissionChange(p.key, e.target.value as 'everyone' | 'admins')}
                    className="rounded-lg border border-border bg-background px-2.5 py-1 font-semibold"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="admins">Admins only</option>
                  </select>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Permissions unavailable</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* L. Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl p-5 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Report a Problem</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Help us understand what's wrong with this group conversation
            </DialogDescription>
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
                toast.success('Report submitted. Thank you for keeping Pixelgram safe.');
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

export default MessengerGroupSettings;
