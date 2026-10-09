import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Group, GroupMember, GroupMedia, GroupPinnedMessage, GroupPermissions } from '@/types/groups';
import type { Profile } from '@/types/types';

// Theme Presets exactly from the HTML
export const MESSENGER_THEMES = [
  { id: 'Pixel', name: 'Pixel', preview: 'from-[#FF3D7F] to-[#7C5CFF]', bubble: 'bg-gradient-to-r from-[#FF3D7F] to-[#7C5CFF] text-white', accent: '#FF3D7F', a1: '#FF3D7F', a2: '#7C5CFF' },
  { id: 'Ocean', name: 'Ocean', preview: 'from-[#22D3EE] to-[#3B82F6]', bubble: 'bg-gradient-to-r from-[#22D3EE] to-[#3B82F6] text-white', accent: '#22D3EE', a1: '#22D3EE', a2: '#3B82F6' },
  { id: 'Sunset', name: 'Sunset', preview: 'from-[#FF8A00] to-[#EF4444]', bubble: 'bg-gradient-to-r from-[#FF8A00] to-[#EF4444] text-white', accent: '#FF8A00', a1: '#FF8A00', a2: '#EF4444' },
  { id: 'Mint', name: 'Mint', preview: 'from-[#10B981] to-[#06B6D4]', bubble: 'bg-gradient-to-r from-[#10B981] to-[#06B6D4] text-white', accent: '#10B981', a1: '#10B981', a2: '#06B6D4' },
  { id: 'Gold', name: 'Gold', preview: 'from-[#FBBF24] to-[#F97316]', bubble: 'bg-gradient-to-r from-[#FBBF24] to-[#F97316] text-white', accent: '#FBBF24', a1: '#FBBF24', a2: '#F97316' },
  { id: 'Orchid', name: 'Orchid', preview: 'from-[#D946EF] to-[#8B5CF6]', bubble: 'bg-gradient-to-r from-[#D946EF] to-[#8B5CF6] text-white', accent: '#D946EF', a1: '#D946EF', a2: '#8B5CF6' },
  // Compatibility fallbacks
  { id: 'default', name: 'Pixelgram Neon', preview: 'from-[#FF3D7F] to-[#7C5CFF]', bubble: 'bg-gradient-to-r from-[#FF3D7F] to-[#7C5CFF] text-white', accent: '#FF3D7F', a1: '#FF3D7F', a2: '#7C5CFF' },
  { id: 'blue', name: 'Messenger Blue', preview: 'from-[#0084FF] to-[#00C6FF]', bubble: 'bg-[#0084FF] text-white', accent: '#0084FF', a1: '#0084FF', a2: '#00C6FF' },
  { id: 'berry', name: 'Berry', preview: 'from-pink-500 to-purple-600', bubble: 'bg-gradient-to-r from-pink-500 to-purple-600 text-white', accent: '#D946EF', a1: '#D946EF', a2: '#8B5CF6' },
  { id: 'cyberpunk', name: 'Neon Cyberpunk', preview: 'from-fuchsia-500 to-cyan-500', bubble: 'bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-white', accent: '#06B6D4', a1: '#06B6D4', a2: '#7C5CFF' },
  { id: 'emerald', name: 'Emerald', preview: 'from-emerald-500 to-teal-600', bubble: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white', accent: '#10B981', a1: '#10B981', a2: '#06B6D4' },
  { id: 'royal', name: 'Royal Indigo', preview: 'from-indigo-600 to-violet-600', bubble: 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white', accent: '#6366F1', a1: '#6366F1', a2: '#8B5CF6' },
  { id: 'monochrome', name: 'Dark Monochrome', preview: 'from-neutral-700 to-neutral-900', bubble: 'bg-neutral-800 text-white', accent: '#71717A', a1: '#71717A', a2: '#27272A' },
];

export const POPULAR_EMOJIS = ['👍', '❤️', '😂', '🔥', '😍', '🎉', '💯', '😎', '🙏', '✨', '👏', '🤩'];

export const PERMISSION_LABELS: Array<{ key: keyof GroupPermissions; label: string }> = [
  { key: 'send_messages', label: 'Send messages' },
  { key: 'add_members', label: 'Add members' },
  { key: 'edit_info', label: 'Edit group info' },
  { key: 'create_invites', label: 'Generate invite links' },
  { key: 'pin_messages', label: 'Pin messages' },
  { key: 'start_calls', label: 'Start group audio/video calls' },
];

const WALL_PRESETS: Array<[string, string]> = [
  ['Default', ''],
  ['Aurora', 'linear-gradient(160deg,#3B1C7A,#0E8F8F)'],
  ['Dusk', 'linear-gradient(160deg,#7A1C4B,#2A1C7A)'],
  ['Ember', 'linear-gradient(160deg,#7A3B1C,#7A1C3B)'],
  ['Forest', 'linear-gradient(160deg,#0F5132,#0E2F5A)'],
  ['Midnight', 'linear-gradient(160deg,#101030,#2A2050)'],
];

const AV_COLORS = [
  ['#FF8A00', '#E8175D'],
  ['#7C5CFF', '#2F8BFF'],
  ['#00B894', '#2F8BFF'],
  ['#D946EF', '#FF3D7F'],
  ['#F59E0B', '#EF4444'],
  ['#06B6D4', '#7C5CFF'],
];

const IC: Record<string, string> = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  video: '<rect x="2" y="6" width="13" height="12" rx="3"/><path d="M15 10l6-3v10l-6-3"/>',
  userplus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  bell: '<path d="M18 16V11a6 6 0 0 0-12 0v5l-2 2h16zM10 21h4"/>',
  bellOff: '<path d="M18 16V11a6 6 0 0 0-9-5.2M6 11v5l-2 2h13M10 21h4M3 3l18 18"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="15.5" cy="10" r="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14a4.5 4.5 0 0 0 8 0M9 9.5h.01M15 9.5h.01"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7"/>',
  clip: '<path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 5 5l-9 9a1.7 1.7 0 0 1-2.5-2.5l8-8"/>',
  msgoff: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14M3 3l18 18"/>',
  leave: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  down: '<path d="M12 4v11m-5-4l5 5 5-5M5 20h14"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  share: '<path d="M12 15V3m-4 4l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  at: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    dangerouslySetInnerHTML={{ __html: IC[name] || '' }}
  />
);

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
  groupWallpaper?: string | null;
  onWallpaperChange?: (url: string | null) => void;
  nicknames: Record<string, string>;
  onNicknameChange: (userId: string, nickname: string) => void;
  memberQuery: string;
  setMemberQuery: (q: string) => void;
  memberResults: Profile[];
  messages?: Array<{ id: string; sender_id: string; content: string; created_at: string; media_url?: string | null }>;
  groupNumericUid?: string;
}

interface Particle {
  id: number;
  char: string;
  left: string;
  delay: string;
  rot: string;
  size: string;
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
  groupWallpaper,
  onWallpaperChange,
  nicknames,
  onNicknameChange,
  memberQuery,
  setMemberQuery,
  memberResults,
  messages = [],
  groupNumericUid,
}) => {
  // Theme state: defaults to matching HTML Pixel theme (#FF3D7F, #7C5CFF)
  const currentThemeIdx = useMemo(() => {
    const found = MESSENGER_THEMES.findIndex(t => t.id.toLowerCase() === (groupTheme || 'pixel').toLowerCase());
    return found >= 0 ? (found % 6) : 0;
  }, [groupTheme]);

  const [activeThemeIdx, setActiveThemeIdx] = useState<number>(currentThemeIdx);
  useEffect(() => {
    setActiveThemeIdx(currentThemeIdx);
  }, [currentThemeIdx]);

  const activeThemeColors = useMemo(() => {
    const t = MESSENGER_THEMES[activeThemeIdx] || MESSENGER_THEMES[0];
    return [t.name, t.a1, t.a2];
  }, [activeThemeIdx]);

  // Wallpaper index: 0 = default, 1..5 = presets, -1 = custom
  const [wallIdx, setWallIdx] = useState<number>(() => {
    if (!groupWallpaper) return 0;
    const pIdx = WALL_PRESETS.findIndex(p => p[1] === groupWallpaper);
    return pIdx >= 0 ? pIdx : -1;
  });
  const [customWallImg, setCustomWallImg] = useState<string>(() => {
    if (groupWallpaper && !WALL_PRESETS.some(p => p[1] === groupWallpaper)) {
      return groupWallpaper;
    }
    return '';
  });

  // Settings states from HTML
  const [approval, setApproval] = useState<boolean>(false);
  const [disappearing, setDisappearing] = useState<string>('Off');
  const [sendPerm, setSendPerm] = useState<string>(permissions?.send_messages === 'admins' ? 'Only admins' : 'Everyone');
  const [editPerm, setEditPerm] = useState<string>(permissions?.edit_info === 'admins' ? 'Only admins' : 'All members');
  const [receipts, setReceipts] = useState<boolean>(true);
  const [mentionsOnly, setMentionsOnly] = useState<boolean>(false);
  const [messageSound, setMessageSound] = useState<string>('Pixel');
  const [autoDownload, setAutoDownload] = useState<string>('Wi-Fi only');
  const [chatLock, setChatLock] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isIgnored, setIsIgnored] = useState<boolean>(false);
  const [hasLeft, setHasLeft] = useState<boolean>(false);

  // Bottom sheet state
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  const [sheetTitle, setSheetTitle] = useState<string>('');
  const [sheetContent, setSheetContent] = useState<React.ReactNode>(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  }, []);

  // Floating Particles
  const [particles, setParticles] = useState<Particle[]>([]);
  const burst = useCallback((char: string) => {
    const newItems: Particle[] = Array.from({ length: 16 }).map((_, i) => ({
      id: Date.now() + i + Math.random(),
      char,
      left: `${8 + Math.random() * 84}%`,
      delay: `${(Math.random() * 0.5).toFixed(2)}s`,
      rot: `${Math.round(Math.random() * 80 - 40)}deg`,
      size: `${20 + Math.random() * 22}px`,
    }));
    setParticles(prev => [...prev, ...newItems]);
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newItems.some(n => n.id === p.id)));
    }, 2500);
  }, []);

  // Parallax 3D tilt on avatar ref
  const gavRef = useRef<HTMLDivElement>(null);
  const handlePointerMoveGav = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || !gavRef.current) return;
    const rect = gavRef.current.getBoundingClientRect();
    const c = (v: number) => Math.max(-1.2, Math.min(1.2, v));
    const x = c((e.clientX - rect.left - rect.width / 2) / rect.width);
    const y = c((e.clientY - rect.top - rect.height / 2) / rect.height);
    gavRef.current.style.transform = `perspective(600px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
  }, []);

  const handlePointerLeaveGav = useCallback(() => {
    if (gavRef.current) {
      gavRef.current.style.transform = '';
    }
  }, []);

  // Drag-to-dismiss sheet gesture
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetDragRef = useRef<{ startY: number | null; dy: number }>({ startY: null, dy: 0 });

  const handlePointerDownGrab = (e: React.PointerEvent) => {
    sheetDragRef.current.startY = e.clientY;
    sheetDragRef.current.dy = 0;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  };

  const handlePointerMoveSheet = (e: React.PointerEvent) => {
    if (sheetDragRef.current.startY === null || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - sheetDragRef.current.startY);
    sheetDragRef.current.dy = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };

  const handlePointerUpSheet = () => {
    if (sheetDragRef.current.startY === null || !sheetRef.current) return;
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = '';
    if (sheetDragRef.current.dy > 110) {
      closeSheet();
    }
    sheetDragRef.current.startY = null;
    sheetDragRef.current.dy = 0;
  };

  const openSheet = useCallback((title: string, content: React.ReactNode) => {
    setSheetTitle(title);
    setSheetContent(content);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  // Hidden File Inputs
  const photoInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onAvatarUpload(file);
      showToast('Group photo updated');
      burst('✨');
    } catch {
      showToast('Failed to update group photo');
    }
    e.target.value = '';
  };

  const handleWallpaperFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setWallIdx(-1);
      setCustomWallImg(result);
      onWallpaperChange?.(result);
      showToast('Wallpaper set');
      burst('✨');
      closeSheet();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    showToast(`${files.length} file(s) selected`);
    burst('📸');
    e.target.value = '';
  };

  // Wall background value for header/hero
  const currentWallStyle = useMemo(() => {
    if (wallIdx === -1 && customWallImg) {
      return { backgroundImage: `url(${customWallImg})` };
    }
    if (wallIdx > 0 && WALL_PRESETS[wallIdx]) {
      return { backgroundImage: WALL_PRESETS[wallIdx][1] };
    }
    return {};
  }, [wallIdx, customWallImg]);

  const wallLabel = useMemo(() => {
    if (wallIdx === -1) return 'Custom';
    return WALL_PRESETS[wallIdx]?.[0] || 'Default';
  }, [wallIdx]);

  // Invite Link
  const inviteLink = useMemo(() => {
    const id = groupNumericUid || group.id;
    return `${window.location.origin}/join/${id}`;
  }, [groupNumericUid, group.id]);

  const handleCopyInviteLink = () => {
    onCopyInvite();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteLink).then(
        () => showToast('Invite link copied'),
        () => showToast('Invite link copied')
      );
    } else {
      showToast('Invite link copied');
    }
  };

  // Search in conversation state
  const [searchQuery, setSearchQuery] = useState('');
  const [localPinned, setLocalPinned] = useState<string[]>(() => pinnedMessages.map(p => p.id));

  // Modals & sub-sheets handlers
  const handleOpenThemeSheet = () => {
    openSheet(
      'Theme',
      <div className="grid">
        {MESSENGER_THEMES.slice(0, 6).map((t, idx) => (
          <button
            key={t.id}
            type="button"
            className={`cell dot ${activeThemeIdx === idx ? 'sel' : ''}`}
            onClick={() => {
              burst('✨');
              setActiveThemeIdx(idx);
              onThemeChange(t.id);
              showToast(`Theme changed to ${t.name}`);
            }}
            style={{ background: `linear-gradient(135deg, ${t.a1}, ${t.a2})` }}
          >
            <small>{t.name}</small>
          </button>
        ))}
      </div>
    );
  };

  const handleOpenWallpaperSheet = () => {
    openSheet(
      'Wallpaper',
      <div>
        <div className="grid">
          {WALL_PRESETS.map(([name, bg], idx) => (
            <button
              key={name}
              type="button"
              className={`cell dot ${wallIdx === idx ? 'sel' : ''}`}
              onClick={() => {
                setWallIdx(idx);
                onWallpaperChange?.(bg || null);
                showToast(`Wallpaper set to ${name}`);
                closeSheet();
              }}
              style={{ background: bg || 'var(--s2)' }}
            >
              <small>{name}</small>
            </button>
          ))}
          <button
            type="button"
            className={`cell ${wallIdx === -1 ? 'sel' : ''}`}
            onClick={() => wallpaperInputRef.current?.click()}
            style={{ fontSize: 12, fontWeight: 700, padding: 6 }}
          >
            <Icon name="image" className="w-5 h-5 mx-auto mb-1 text-[#FF3D7F]" />
            <small>Gallery</small>
          </button>
        </div>
      </div>
    );
  };

  const handleOpenEmojiSheet = () => {
    openSheet(
      'Emoji',
      <div className="grid">
        {POPULAR_EMOJIS.map(em => (
          <button
            key={em}
            type="button"
            className={`cell ${groupEmoji === em ? 'sel' : ''}`}
            onClick={() => {
              onEmojiChange(em);
              burst(em);
              showToast(`Emoji changed ${em}`);
              closeSheet();
            }}
          >
            {em}
          </button>
        ))}
      </div>
    );
  };

  const [tempNicks, setTempNicks] = useState<Record<string, string>>(nicknames);
  useEffect(() => {
    setTempNicks(nicknames);
  }, [nicknames]);

  const handleOpenNicknamesSheet = () => {
    openSheet(
      'Nicknames',
      <div>
        {members.map(m => {
          const profile = m.profiles;
          const uname = profile?.username || profile?.full_name || 'Member';
          return (
            <div key={m.user_id} className="mrow">
              <div className="av">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                  renderAvatarSvg(uname, m.user_id)
                )}
              </div>
              <div className="nm">
                {uname}
                <input
                  className="in"
                  defaultValue={tempNicks[m.user_id] || ''}
                  onChange={e => {
                    const val = e.target.value.trim();
                    setTempNicks(prev => ({ ...prev, [m.user_id]: val }));
                  }}
                  placeholder="Set nickname"
                  maxLength={20}
                  style={{ margin: '6px 0 0', height: 42 }}
                />
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="btn"
          onClick={() => {
            Object.entries(tempNicks).forEach(([uid, nick]) => {
              onNicknameChange(uid, nick);
            });
            closeSheet();
            showToast('Nicknames saved');
          }}
        >
          Save
        </button>
      </div>
    );
  };

  const [addSelected, setAddSelected] = useState<string[]>([]);
  const handleOpenAddPeopleSheet = () => {
    setAddSelected([]);
    openSheet(
      'Add people',
      <div>
        <input
          className="in"
          value={memberQuery}
          onChange={e => setMemberQuery(e.target.value)}
          placeholder="Search people..."
          autoFocus
        />
        {memberResults.length > 0 ? (
          <div>
            {memberResults.map(p => {
              const isSelected = addSelected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="mrow cursor-pointer"
                  onClick={() => {
                    setAddSelected(prev => (prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]));
                  }}
                >
                  <div className="av">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      renderAvatarSvg(p.username || 'User', p.id)
                    )}
                  </div>
                  <div className="nm">
                    {p.username || p.full_name}
                    {p.full_name && <small>{p.full_name}</small>}
                  </div>
                  <span className={`ck ${isSelected ? 'on' : ''}`}>
                    <Icon name="check" />
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className="btn"
              disabled={addSelected.length === 0}
              onClick={async () => {
                burst('🎉');
                for (const uid of addSelected) {
                  const targetProf = memberResults.find(p => p.id === uid);
                  if (targetProf) await onAddMember(targetProf);
                }
                showToast(`${addSelected.length} added`);
                setAddSelected([]);
                closeSheet();
              }}
            >
              Add {addSelected.length || ''}
            </button>
          </div>
        ) : (
          <div className="none">
            <b>{memberQuery ? 'No users found' : 'Search users to add'}</b>
            <p className="text-xs text-[#A99FD2] mt-1">Type username or name above</p>
          </div>
        )}
      </div>
    );
  };

  const handleOpenMembersSheet = () => {
    openSheet(
      `${members.length} Members`,
      <div>
        <button
          type="button"
          className="ap"
          onClick={() => {
            setApproval(!approval);
            showToast(!approval ? 'Approval requests on' : 'Approval requests off');
          }}
        >
          <b>
            Approval requests
            <small>Admins approve new members</small>
          </b>
          <span className={`tg ${approval ? 'on' : ''}`}></span>
        </button>

        <button
          type="button"
          className="mrow"
          style={{ color: 'var(--a1)', fontWeight: 800 }}
          onClick={handleOpenAddPeopleSheet}
        >
          <span className="ti" style={{ width: 46, height: 46, borderRadius: '50%', background: 'color-mix(in srgb, var(--a1) 18%, transparent)' }}>
            <Icon name="userplus" className="w-5 h-5 text-[#FF3D7F]" />
          </span>
          Add people
        </button>

        {members.map(m => {
          const profile = m.profiles;
          const uname = profile?.username || profile?.full_name || 'Member';
          const isCurrentUser = m.user_id === currentMember?.user_id;
          const isAdmin = m.role === 'admin';
          const canRemove = (currentMember?.role === 'admin' && !isCurrentUser) || isCurrentUser;
          const nick = nicknames[m.user_id];

          return (
            <div key={m.user_id} className="mrow">
              <div className="av">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                  renderAvatarSvg(uname, m.user_id)
                )}
              </div>
              <div className="nm">
                {nick || uname}
                {isAdmin && <span className="tag">Admin</span>}
                {nick && <small>{uname}</small>}
              </div>
              {canRemove && !isCurrentUser && (
                <button
                  type="button"
                  className="x"
                  aria-label="Remove"
                  onClick={async () => {
                    await onRemoveMember(m.user_id);
                    showToast(`${uname} removed`);
                  }}
                >
                  <Icon name="x" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const handleOpenInviteSheet = () => {
    openSheet(
      'Share Invite Link',
      <div>
        <div className="link">{inviteLink}</div>
        <button type="button" className="btn" onClick={handleCopyInviteLink}>
          Copy link
        </button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            type="button"
            className="btn alt"
            onClick={() => {
              navigator.share({ title: group.name, url: inviteLink }).catch(() => {});
            }}
          >
            Share…
          </button>
        )}
      </div>
    );
  };

  const handleOpenSearchSheet = () => {
    openSheet(
      'Search in Conversation',
      <div>
        <input
          className="in"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search messages..."
          autoFocus
        />
        {messages.length > 0 ? (
          <div>
            {messages
              .filter(m => (m.content || '').toLowerCase().includes(searchQuery.toLowerCase()))
              .slice(0, 20)
              .map(msg => {
                const isPinned = localPinned.includes(msg.id);
                return (
                  <div key={msg.id} className="msg">
                    <div
                      className="cursor-pointer"
                      onClick={() => {
                        onJumpToMessage(msg.id);
                        closeSheet();
                        onClose();
                      }}
                    >
                      <b>Message</b>
                      {msg.content}
                    </div>
                    <button
                      type="button"
                      className={isPinned ? 'on' : ''}
                      onClick={async () => {
                        if (isPinned) {
                          await onUnpinMessage(msg.id);
                          setLocalPinned(prev => prev.filter(x => x !== msg.id));
                          showToast('Message unpinned');
                        } else {
                          setLocalPinned(prev => [...prev, msg.id]);
                          showToast('Message pinned');
                        }
                      }}
                    >
                      <Icon name="pin" />
                    </button>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="none">
            <b>No messages found</b>
            <p className="text-xs text-[#A99FD2] mt-1">Try another keyword</p>
          </div>
        )}
      </div>
    );
  };

  const handleOpenPinnedSheet = () => {
    openSheet(
      'Pinned Messages',
      <div>
        {pinnedMessages.length > 0 ? (
          <div>
            {pinnedMessages.map(p => (
              <div key={p.id} className="msg">
                <div
                  className="cursor-pointer"
                  onClick={() => {
                    onJumpToMessage(p.message_id);
                    closeSheet();
                    onClose();
                  }}
                >
                  <b>Pinned Message</b>
                  {p.content}
                </div>
                <button
                  type="button"
                  className="on"
                  onClick={async () => {
                    await onUnpinMessage(p.id);
                    showToast('Message unpinned');
                  }}
                >
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="none">
            <b>0 pinned</b>
            <p className="text-xs text-[#A99FD2] mt-1">Pin messages from the chat or search</p>
          </div>
        )}
      </div>
    );
  };

  const handleOpenMediaSheet = () => {
    openSheet(
      'Shared media & files',
      <div>
        {mediaItems.length > 0 ? (
          <div className="mg">
            {mediaItems.map(m => (
              <div
                key={m.id}
                style={{
                  backgroundImage: m.media_url ? `url(${m.media_url})` : undefined,
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                }}
              >
                {!m.media_url && (m.file_name || 'File')}
              </div>
            ))}
          </div>
        ) : (
          <div className="none">
            <b>0 items</b>
            <p className="text-xs text-[#A99FD2] mt-1">Photos and files shared in this group show here.</p>
          </div>
        )}
        <button type="button" className="btn" onClick={() => mediaInputRef.current?.click()}>
          Add photos / files
        </button>
      </div>
    );
  };

  const handleOpenPicker = (
    title: string,
    options: string[],
    currentVal: string,
    onSelect: (val: string) => void
  ) => {
    openSheet(
      title,
      <div>
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            className="mrow cursor-pointer"
            onClick={() => {
              onSelect(opt);
              showToast(`${title} updated`);
              closeSheet();
            }}
          >
            <span className="nm">{opt}</span>
            <span className={`ck ${currentVal === opt ? 'on' : ''}`}>
              <Icon name="check" />
            </span>
          </button>
        ))}
      </div>
    );
  };

  const handleOpenRenameSheet = () => {
    let newName = group.name;
    openSheet(
      'Group name',
      <div>
        <input
          className="in"
          defaultValue={group.name}
          maxLength={30}
          autoFocus
          onChange={e => {
            newName = e.target.value.trim();
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (newName) {
              await onUpdateGroup({ name: newName });
              showToast('Group name updated');
              burst('✨');
              closeSheet();
            }
          }}
        >
          Save
        </button>
      </div>
    );
  };

  const handleOpenMenu = () => {
    openSheet(
      'Options',
      <div>
        <button type="button" className="btn alt" onClick={handleOpenRenameSheet}>
          Edit group name
        </button>
        <button
          type="button"
          className="btn alt"
          onClick={() => {
            openSheet(
              'Clear chat?',
              <div>
                <p style={{ color: 'var(--mute)', margin: '0 4px 16px' }}>
                  All messages will be removed for you.
                </p>
                <button
                  type="button"
                  className="btn red"
                  onClick={() => {
                    closeSheet();
                    showToast('Chat cleared');
                  }}
                >
                  Clear chat
                </button>
                <button type="button" className="btn alt" onClick={closeSheet}>
                  Cancel
                </button>
              </div>
            );
          }}
        >
          Clear chat
        </button>
        <button
          type="button"
          className="btn alt"
          style={{ color: 'var(--red)' }}
          onClick={() => {
            openSheet(
              'Report group?',
              <div>
                <p style={{ color: 'var(--mute)', margin: '0 4px 16px' }}>
                  We'll review this group. Members won't be told.
                </p>
                <button
                  type="button"
                  className="btn red"
                  onClick={() => {
                    closeSheet();
                    showToast('Report sent');
                  }}
                >
                  Report
                </button>
                <button type="button" className="btn alt" onClick={closeSheet}>
                  Cancel
                </button>
              </div>
            );
          }}
        >
          Report group
        </button>
      </div>
    );
  };

  const handleConfirmLeave = () => {
    openSheet(
      'Leave group?',
      <div>
        <p style={{ color: 'var(--mute)', margin: '0 4px 16px' }}>
          You won't get new messages from {group.name}.
        </p>
        <button
          type="button"
          className="btn red"
          onClick={async () => {
            closeSheet();
            setHasLeft(true);
            await onLeaveGroup();
          }}
        >
          Leave group
        </button>
        <button type="button" className="btn alt" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="group-details-root fixed inset-0 z-50 overflow-y-auto overscroll-contain select-none"
      style={
        {
          '--bg': '#0E0820',
          '--s1': '#1A1233',
          '--s2': '#2A2050',
          '--ink': '#F7F3FF',
          '--mute': '#A99FD2',
          '--line': 'rgba(255,255,255,.09)',
          '--green': '#22D3A0',
          '--red': '#FF5470',
          '--a1': activeThemeColors[1],
          '--a2': activeThemeColors[2],
          '--grad': `linear-gradient(135deg, ${activeThemeColors[1]}, ${activeThemeColors[2]})`,
          backgroundColor: 'var(--bg)',
          color: 'var(--ink)',
          fontFamily: '"Bricolage Grotesque", system-ui, -apple-system, sans-serif',
        } as React.CSSProperties
      }
    >
      <style>{`
        .group-details-root * { box-sizing: border-box; }
        .group-details-root {
          min-height: 100vh;
          position: fixed;
          inset: 0;
          overflow-y: auto;
          background: var(--bg);
          color: var(--ink);
        }
        .group-details-root::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: -1;
          background: radial-gradient(520px 340px at 50% -80px, color-mix(in srgb, var(--a1) 28%, transparent), transparent 70%),
                      radial-gradient(420px 300px at 100% 380px, color-mix(in srgb, var(--a2) 18%, transparent), transparent 70%);
        }
        .group-details-root::after {
          content: "";
          position: fixed;
          z-index: -1;
          pointer-events: none;
          width: 440px;
          height: 440px;
          border-radius: 50%;
          left: -140px;
          bottom: -140px;
          background: radial-gradient(circle, color-mix(in srgb, var(--a2) 34%, transparent), transparent 70%);
          animation: drift 14s ease-in-out infinite alternate;
        }
        @keyframes drift { to { transform: translate(180px, -140px) scale(1.25); } }
        .group-details-root .wrap {
          position: relative;
          max-width: 560px;
          margin: 0 auto;
          padding-bottom: 48px;
        }
        .group-details-root header {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 14px 10px;
          background: rgba(14, 8, 32, .88);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--line);
        }
        .group-details-root header h1 {
          font-size: 14px;
          letter-spacing: .14em;
          font-weight: 800;
          color: var(--mute);
          margin: 0;
        }
        .group-details-root .ib {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          background: rgba(255, 255, 255, .07);
          display: grid;
          place-items: center;
          cursor: pointer;
          border: 0;
          color: inherit;
          transition: background .2s;
        }
        .group-details-root .ib:hover {
          background: rgba(255, 255, 255, .12);
        }
        .group-details-root .ib svg { width: 20px; height: 20px; }
        .group-details-root .hero {
          text-align: center;
          padding: 22px 16px 6px;
          position: relative;
          isolation: isolate;
        }
        .group-details-root .cover {
          position: absolute;
          z-index: -1;
          left: 0;
          right: 0;
          top: -72px;
          height: 300px;
          background: linear-gradient(135deg, var(--a1), var(--a2));
          background-size: cover;
          background-position: center;
          opacity: .55;
          -webkit-mask-image: linear-gradient(#000 35%, transparent);
          mask-image: linear-gradient(#000 35%, transparent);
        }
        .group-details-root .cover::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255, 255, 255, .22) 1.3px, transparent 1.5px);
          background-size: 18px 18px;
        }
        .group-details-root .gav {
          position: relative;
          width: 138px;
          height: 138px;
          margin: 0 auto;
          transition: transform .2s ease-out;
          transform-style: preserve-3d;
        }
        .group-details-root .gav::before {
          content: "";
          position: absolute;
          inset: -7px;
          border-radius: 50%;
          background: conic-gradient(var(--a1), var(--a2), var(--a1));
          filter: blur(14px);
          opacity: .75;
          animation: spin 6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .group-details-root .ring {
          position: relative;
          z-index: 1;
          width: 138px;
          height: 138px;
          border-radius: 50%;
          padding: 4px;
          background: var(--grad);
          box-shadow: 0 12px 40px color-mix(in srgb, var(--a1) 45%, transparent);
          overflow: hidden;
        }
        .group-details-root .ring > img, .group-details-root .ring > svg {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          display: block;
          object-fit: cover;
          border: 4px solid var(--bg);
        }
        .group-details-root .cam {
          position: absolute;
          right: 0;
          bottom: 2px;
          z-index: 2;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: var(--grad);
          display: grid;
          place-items: center;
          border: 3px solid var(--bg);
          color: #fff;
          cursor: pointer;
        }
        .group-details-root .hero h2 {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -.03em;
          margin-top: 16px;
          margin-bottom: 0;
          background: linear-gradient(90deg, #fff 0, #fff 35%, color-mix(in srgb, var(--a1) 55%, #fff) 50%, #fff 65%, #fff 100%);
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shim 5s linear infinite;
        }
        @keyframes shim {
          from { background-position: 100% 0; }
          to { background-position: -100% 0; }
        }
        .group-details-root .hero .sub {
          color: var(--mute);
          font-size: 15px;
          margin-top: 3px;
        }
        .group-details-root .stack {
          display: inline-flex;
          margin-top: 14px;
          padding: 4px 8px 4px 18px;
          border-radius: 99px;
          background: rgba(255, 255, 255, .05);
          border: 1px solid var(--line);
          cursor: pointer;
        }
        .group-details-root .sa {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 3px solid var(--bg);
          margin-left: -10px;
          overflow: hidden;
          display: block;
          flex: none;
        }
        .group-details-root .sa svg { width: 100%; height: 100%; display: block; }
        .group-details-root .sa.more {
          background: var(--grad);
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 800;
          color: #fff;
        }
        .group-details-root .qa {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin: 22px 0 4px;
        }
        .group-details-root .qa button {
          text-align: center;
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          border: 0;
          background: none;
          cursor: pointer;
        }
        .group-details-root .qa i {
          display: grid;
          place-items: center;
          width: 62px;
          height: 62px;
          margin: 0 auto 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, .07);
          border: 1px solid var(--line);
          color: var(--a1);
          transition: transform .15s;
          box-shadow: 0 8px 20px rgba(0, 0, 0, .25);
        }
        .group-details-root .qa button:active i { transform: scale(.9); }
        .group-details-root .qa i svg { width: 25px; height: 25px; }
        .group-details-root .qa .on i {
          background: var(--grad);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 8px 22px color-mix(in srgb, var(--a1) 50%, transparent);
        }
        .group-details-root .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin: 18px 4px 0;
        }
        .group-details-root .stats button {
          text-align: center;
          padding: 13px 4px;
          border-radius: 20px;
          background: rgba(255, 255, 255, .05);
          border: 1px solid var(--line);
          font-size: 13px;
          color: var(--mute);
          font-weight: 600;
          cursor: pointer;
          transition: transform .15s;
        }
        .group-details-root .stats button:active { transform: scale(.95); }
        .group-details-root .stats b {
          display: block;
          font-size: 24px;
          font-weight: 800;
          line-height: 1.1;
          background: var(--grad);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .group-details-root h4 {
          font-size: 13px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--mute);
          font-weight: 800;
          padding: 24px 22px 9px;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .group-details-root h4::before {
          content: "";
          width: 4px;
          height: 14px;
          border-radius: 4px;
          background: var(--grad);
        }
        .group-details-root .card {
          margin: 0 12px;
          border-radius: 26px;
          background: rgba(255, 255, 255, .045);
          border: 1px solid var(--line);
          overflow: hidden;
          position: relative;
          box-shadow: 0 14px 40px rgba(0, 0, 0, .25);
        }
        .group-details-root .card::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          pointer-events: none;
          background: linear-gradient(160deg, color-mix(in srgb, var(--a1) 60%, transparent), transparent 38%, color-mix(in srgb, var(--a2) 50%, transparent));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        .group-details-root .card.first { margin-top: 18px; }
        .group-details-root .row {
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
          border-top: 0;
          border-left: 0;
          border-right: 0;
          background: none;
          color: inherit;
          text-align: left;
          cursor: pointer;
          transition: background .2s;
        }
        .group-details-root .row:last-child { border-bottom: 0; }
        .group-details-root .row:hover { background: rgba(255, 255, 255, .05); }
        .group-details-root .row:active { background: rgba(255, 255, 255, .09); }
        .group-details-root .ti {
          flex: none;
          width: 42px;
          height: 42px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          color: var(--c);
          background: color-mix(in srgb, var(--c) 17%, transparent);
          background-size: cover;
          box-shadow: 0 6px 16px color-mix(in srgb, var(--c) 22%, transparent);
          transition: transform .25s cubic-bezier(.34, 1.56, .64, 1);
        }
        .group-details-root .row:hover .ti { transform: scale(1.1) rotate(-5deg); }
        .group-details-root .ti svg { width: 21px; height: 21px; }
        .group-details-root .tx { flex: 1; min-width: 0; }
        .group-details-root .tx b { display: block; font-size: 16.5px; font-weight: 600; }
        .group-details-root .tx small { display: block; color: var(--mute); font-size: 14px; margin-top: 1px; }
        .group-details-root .row.danger .tx b { color: var(--red); }
        .group-details-root .ch {
          color: var(--mute);
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          flex: none;
        }
        .group-details-root .ch svg { width: 18px; height: 18px; }
        .group-details-root .sw {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--grad);
        }
        .group-details-root .em { font-size: 24px; }
        .group-details-root .pill {
          padding: 6px 14px;
          border-radius: 99px;
          background: var(--grad);
          color: #fff;
          font-weight: 800;
          font-size: 13px;
          flex: none;
        }
        .group-details-root .tg {
          flex: none;
          width: 52px;
          height: 30px;
          border-radius: 99px;
          background: var(--s2);
          position: relative;
          transition: background .2s;
        }
        .group-details-root .tg::after {
          content: "";
          position: absolute;
          top: 3px;
          left: 3px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #fff;
          transition: transform .35s cubic-bezier(.34, 1.56, .64, 1);
        }
        .group-details-root .tg.on { background: var(--grad); }
        .group-details-root .tg.on::after { transform: translateX(22px); }
        .group-details-root .left {
          text-align: center;
          padding: 120px 30px;
          color: var(--mute);
        }
        .group-details-root .left b {
          display: block;
          color: var(--ink);
          font-size: 24px;
          margin-bottom: 8px;
        }

        /* Bottom Sheet & Backdrop */
        .group-details-root #ov {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(5, 2, 14, .75);
          opacity: 0;
          pointer-events: none;
          transition: opacity .25s;
        }
        .group-details-root #ov.open { opacity: 1; pointer-events: auto; }
        .group-details-root #sheet {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 61;
          max-width: 560px;
          margin: 0 auto;
          max-height: 84vh;
          display: flex;
          flex-direction: column;
          background: var(--s1);
          border: 1px solid var(--line);
          border-bottom: 0;
          border-radius: 28px 28px 0 0;
          transform: translateY(105%);
          transition: transform .3s cubic-bezier(.2, .8, .2, 1);
          padding-bottom: env(safe-area-inset-bottom, 16px);
        }
        .group-details-root #sheet.open { transform: none; }
        .group-details-root .grab {
          flex: none;
          padding: 12px 0 6px;
          background: none;
          position: relative;
          cursor: grab;
          touch-action: none;
        }
        .group-details-root .grab::after {
          content: "";
          display: block;
          width: 42px;
          height: 5px;
          border-radius: 9px;
          background: var(--s2);
          margin: 0 auto;
        }
        .group-details-root #st {
          font-size: 20px;
          font-weight: 800;
          padding: 4px 20px 12px;
          flex: none;
          margin: 0;
        }
        .group-details-root #sb {
          overflow-y: auto;
          padding: 0 16px 24px;
        }
        .group-details-root .in {
          width: 100%;
          height: 50px;
          border-radius: 16px;
          background: rgba(255, 255, 255, .07);
          border: 1px solid var(--line);
          padding: 0 16px;
          font-size: 16px;
          outline: 0;
          color: inherit;
          margin-bottom: 12px;
        }
        .group-details-root .in:focus { border-color: var(--a1); }
        .group-details-root .btn {
          display: block;
          width: 100%;
          padding: 14px;
          border-radius: 16px;
          background: var(--grad);
          color: #fff;
          font-weight: 800;
          font-size: 16px;
          text-align: center;
          margin-top: 6px;
          border: 0;
          cursor: pointer;
        }
        .group-details-root .btn.alt { background: rgba(255, 255, 255, .08); }
        .group-details-root .btn.red { background: var(--red); }
        .group-details-root .btn:disabled { opacity: .4; cursor: not-allowed; }
        .group-details-root .grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .group-details-root .cell {
          aspect-ratio: 1;
          border-radius: 18px;
          display: grid;
          place-items: center;
          font-size: 30px;
          border: 2px solid transparent;
          background: rgba(255, 255, 255, .06);
          position: relative;
          text-align: center;
          color: inherit;
          cursor: pointer;
        }
        .group-details-root .cell.sel { border-color: var(--a1); }
        .group-details-root .cell small {
          position: absolute;
          bottom: 5px;
          font-size: 11px;
          font-weight: 600;
          color: #fff;
          text-shadow: 0 1px 3px #000;
        }
        .group-details-root .cell.dot { font-size: 0; }
        .group-details-root .mrow {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 9px 4px;
          width: 100%;
          border: 0;
          background: none;
          color: inherit;
          text-align: left;
        }
        .group-details-root .mrow .av {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          overflow: hidden;
          flex: none;
        }
        .group-details-root .mrow .av svg { width: 100%; height: 100%; display: block; }
        .group-details-root .mrow .nm { flex: 1; min-width: 0; font-weight: 600; font-size: 16px; }
        .group-details-root .mrow .nm small { display: block; color: var(--mute); font-size: 13px; font-weight: 400; }
        .group-details-root .mrow .x {
          color: var(--mute);
          padding: 8px;
          border: 0;
          background: none;
          cursor: pointer;
        }
        .group-details-root .mrow .x svg { width: 18px; height: 18px; }
        .group-details-root .ck {
          flex: none;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 2px solid var(--mute);
          display: grid;
          place-items: center;
          color: #fff;
        }
        .group-details-root .ck svg { width: 13px; height: 13px; stroke-width: 3.4; opacity: 0; }
        .group-details-root .ck.on { background: var(--grad); border-color: transparent; }
        .group-details-root .ck.on svg { opacity: 1; }
        .group-details-root .tag {
          font-size: 11px;
          font-weight: 800;
          color: var(--a1);
          background: color-mix(in srgb, var(--a1) 16%, transparent);
          padding: 2px 8px;
          border-radius: 99px;
          margin-left: 6px;
        }
        .group-details-root .msg {
          padding: 11px 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, .06);
          margin-bottom: 8px;
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .group-details-root .msg div { flex: 1; font-size: 15px; }
        .group-details-root .msg b { display: block; font-size: 13px; color: var(--a1); }
        .group-details-root .msg button {
          color: var(--mute);
          padding: 6px;
          border: 0;
          background: none;
          cursor: pointer;
        }
        .group-details-root .msg button.on { color: var(--a1); }
        .group-details-root .msg svg { width: 18px; height: 18px; }
        .group-details-root .none {
          text-align: center;
          color: var(--mute);
          padding: 34px 10px;
        }
        .group-details-root .none b { display: block; color: var(--ink); font-size: 18px; margin-bottom: 4px; }
        .group-details-root .link {
          padding: 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, .06);
          border: 1px dashed var(--mute);
          font-size: 14.5px;
          word-break: break-all;
          margin-bottom: 10px;
        }
        .group-details-root .mg {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }
        .group-details-root .mg div {
          aspect-ratio: 1;
          border-radius: 14px;
          background: var(--s2) center/cover;
          display: grid;
          place-items: center;
          font-size: 12px;
          padding: 6px;
          text-align: center;
          overflow: hidden;
        }
        .group-details-root .ap {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 4px 16px;
          width: 100%;
          border-bottom: 1px solid var(--line);
          border-top: 0;
          border-left: 0;
          border-right: 0;
          background: none;
          color: inherit;
          margin-bottom: 6px;
          text-align: left;
          cursor: pointer;
        }
        .group-details-root .ap b { flex: 1; font-size: 16px; }
        .group-details-root .ap small { display: block; color: var(--mute); font-weight: 400; font-size: 13px; }
        .group-details-root #toast {
          position: fixed;
          left: 50%;
          bottom: calc(26px + env(safe-area-inset-bottom, 0px));
          transform: translate(-50%, 30px);
          opacity: 0;
          background: var(--ink);
          color: var(--bg);
          padding: 12px 20px;
          border-radius: 99px;
          font-size: 14px;
          font-weight: 800;
          pointer-events: none;
          transition: .25s;
          z-index: 70;
          white-space: nowrap;
        }
        .group-details-root #toast.show {
          transform: translate(-50%, 0);
          opacity: 1;
        }
        .group-details-root .fl {
          position: fixed;
          bottom: -40px;
          z-index: 75;
          pointer-events: none;
          animation: fly 1.9s ease-out var(--d) forwards;
        }
        @keyframes fly {
          to {
            transform: translateY(-78vh) rotate(var(--r));
            opacity: 0;
          }
        }
      `}</style>

      {/* Main Wrap */}
      <div className="wrap">
        {/* Header */}
        <header>
          <button type="button" className="ib" onClick={onClose} aria-label="Back">
            <Icon name="back" />
          </button>
          <h1>GROUP DETAILS</h1>
          <button type="button" className="ib" onClick={handleOpenMenu} aria-label="More options">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ width: 20, height: 20 }}>
              <circle cx="12" cy="5" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="12" cy="19" r="1.7" />
            </svg>
          </button>
        </header>

        {/* Rejoin screen if left */}
        {hasLeft ? (
          <div className="left">
            <b>You left {group.name}</b>
            You won't get new messages from this group.
            <button
              type="button"
              className="btn"
              style={{ marginTop: 22 }}
              onClick={() => {
                burst('👋');
                setHasLeft(false);
                showToast('Welcome back!');
              }}
            >
              Rejoin group
            </button>
          </div>
        ) : (
          <main id="app">
            {/* Hero */}
            <section className="hero">
              <div className="cover" style={currentWallStyle}></div>
              <div
                className="gav"
                ref={gavRef}
                onPointerMove={handlePointerMoveGav}
                onPointerLeave={handlePointerLeaveGav}
              >
                <div className="ring">
                  {group.avatar_url ? (
                    <img src={group.avatar_url} alt="" />
                  ) : (
                    <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}>
                      <defs>
                        <linearGradient id="lg_main" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="var(--a1)" />
                          <stop offset="1" stopColor="var(--a2)" />
                        </linearGradient>
                      </defs>
                      <rect width="120" height="120" fill="#0B0616" />
                      <text x="60" y="70" textAnchor="middle" fontSize="48" fontWeight="800" fill="url(#lg_main)" letterSpacing="-2">
                        AR
                      </text>
                      <text x="60" y="90" textAnchor="middle" fontSize="9" letterSpacing="3" fontWeight="700" fill="url(#lg_main)">
                        PIXELGRAM
                      </text>
                    </svg>
                  )}
                </div>
                <button
                  type="button"
                  className="cam"
                  onClick={() => photoInputRef.current?.click()}
                  aria-label="Change group photo"
                >
                  <Icon name="camera" />
                </button>
              </div>

              <h2>{group.name}</h2>
              <p className="sub">Active now · {members.length} members</p>

              {/* Members Stack */}
              <button
                type="button"
                className="stack"
                onClick={handleOpenMembersSheet}
                aria-label="View members"
              >
                {members.slice(0, 5).map((m, idx) => {
                  const p = m.profiles;
                  const uname = p?.username || p?.full_name || 'Member';
                  return (
                    <span key={m.user_id || idx} className="sa">
                      {p?.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        renderAvatarSvg(uname, m.user_id || String(idx))
                      )}
                    </span>
                  );
                })}
                {members.length > 5 && <span className="sa more">+{members.length - 5}</span>}
              </button>

              {/* Quick Actions (QA) */}
              <div className="qa">
                <button
                  type="button"
                  onClick={() => {
                    showToast(`Calling ${group.name}…`);
                    onStartCall('audio');
                  }}
                >
                  <i>
                    <Icon name="phone" />
                  </i>
                  Audio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    showToast('Starting video call…');
                    onStartCall('video');
                  }}
                >
                  <i>
                    <Icon name="video" />
                  </i>
                  Video
                </button>
                <button type="button" onClick={handleOpenAddPeopleSheet}>
                  <i>
                    <Icon name="userplus" />
                  </i>
                  Add
                </button>
                <button
                  type="button"
                  className={isMuted ? 'on' : ''}
                  onClick={() => {
                    setIsMuted(!isMuted);
                    showToast(!isMuted ? 'Group muted' : 'Group unmuted');
                  }}
                >
                  <i>
                    <Icon name={isMuted ? 'bellOff' : 'bell'} />
                  </i>
                  {isMuted ? 'Unmute' : 'Mute'}
                </button>
              </div>

              {/* Stats */}
              <div className="stats">
                <button type="button" onClick={handleOpenMembersSheet}>
                  <b>{members.length}</b>Members
                </button>
                <button type="button" onClick={handleOpenPinnedSheet}>
                  <b>{pinnedMessages.length}</b>Pinned
                </button>
                <button type="button" onClick={handleOpenMediaSheet}>
                  <b>{mediaItems.length}</b>Media
                </button>
              </div>
            </section>

            {/* CARD 1 (FIRST) */}
            <div className="card first">
              <button
                type="button"
                className="row"
                onClick={handleOpenThemeSheet}
                style={{ ['--c' as string]: activeThemeColors[1] }}
              >
                <span className="ti">
                  <Icon name="palette" />
                </span>
                <span className="tx">
                  <b>Theme</b>
                </span>
                <span className="ch">
                  <span className="sw"></span>
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={handleOpenWallpaperSheet}
                style={{ ['--c' as string]: '#9B7BFF' }}
              >
                <span
                  className="ti"
                  style={currentWallStyle.backgroundImage ? currentWallStyle : undefined}
                >
                  {!currentWallStyle.backgroundImage && <Icon name="image" />}
                </span>
                <span className="tx">
                  <b>Group Wallpaper / Background Image</b>
                  <small>Gallery ya wallpaper se photo lagayein</small>
                </span>
                <span className="ch">
                  {wallLabel}
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={handleOpenEmojiSheet}
                style={{ ['--c' as string]: '#FBBF24' }}
              >
                <span className="ti">
                  <Icon name="smile" />
                </span>
                <span className="tx">
                  <b>Emoji</b>
                </span>
                <span className="ch">
                  <span className="em">{groupEmoji}</span>
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={handleOpenNicknamesSheet}
                style={{ ['--c' as string]: '#22D3EE' }}
              >
                <span className="ti">
                  <Icon name="tag" />
                </span>
                <span className="tx">
                  <b>Nicknames</b>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={handleOpenMembersSheet}
                style={{ ['--c' as string]: '#22D3A0' }}
              >
                <span className="ti">
                  <Icon name="users" />
                </span>
                <span className="tx">
                  <b>Members</b>
                  <small>
                    {members.length} members · Approval requests {approval ? 'on' : 'off'}
                  </small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={handleOpenInviteSheet}
                style={{ ['--c' as string]: '#60A5FA' }}
              >
                <span className="ti">
                  <Icon name="link" />
                </span>
                <span className="tx">
                  <b>Share Invite Link</b>
                </span>
                <span className="pill">Copy</span>
              </button>
            </div>

            {/* CARD 2: MORE ACTIONS */}
            <h4>More actions</h4>
            <div className="card">
              <button
                type="button"
                className="row"
                onClick={handleOpenSearchSheet}
                style={{ ['--c' as string]: '#22D3EE' }}
              >
                <span className="ti">
                  <Icon name="search" />
                </span>
                <span className="tx">
                  <b>Search in Conversation</b>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={handleOpenPinnedSheet}
                style={{ ['--c' as string]: '#FF6B9A' }}
              >
                <span className="ti">
                  <Icon name="pin" />
                </span>
                <span className="tx">
                  <b>Pinned Messages</b>
                  <small>{pinnedMessages.length} pinned</small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={handleOpenMediaSheet}
                style={{ ['--c' as string]: '#FF9F43' }}
              >
                <span className="ti">
                  <Icon name="clip" />
                </span>
                <span className="tx">
                  <b>Shared media &amp; files</b>
                  <small>{mediaItems.length} items</small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>
            </div>

            {/* CARD 3: GROUP SETTINGS */}
            <h4>Group settings</h4>
            <div className="card">
              <button
                type="button"
                className="row"
                onClick={() =>
                  handleOpenPicker('Disappearing messages', ['Off', '24 hours', '7 days', '90 days'], disappearing, setDisappearing)
                }
                style={{ ['--c' as string]: '#38BDF8' }}
              >
                <span className="ti">
                  <Icon name="clock" />
                </span>
                <span className="tx">
                  <b>Disappearing messages</b>
                  <small>{disappearing}</small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={() =>
                  handleOpenPicker(
                    'Who can send messages',
                    ['Everyone', 'Only admins'],
                    sendPerm,
                    async val => {
                      setSendPerm(val);
                      await onPermissionChange('send_messages', val === 'Only admins' ? 'admins' : 'everyone');
                    }
                  )
                }
                style={{ ['--c' as string]: '#22D3A0' }}
              >
                <span className="ti">
                  <Icon name="shield" />
                </span>
                <span className="tx">
                  <b>Who can send messages</b>
                  <small>{sendPerm}</small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={() =>
                  handleOpenPicker(
                    'Who can edit group info',
                    ['All members', 'Only admins'],
                    editPerm,
                    async val => {
                      setEditPerm(val);
                      await onPermissionChange('edit_info', val === 'Only admins' ? 'admins' : 'everyone');
                    }
                  )
                }
                style={{ ['--c' as string]: '#FBBF24' }}
              >
                <span className="ti">
                  <Icon name="pen" />
                </span>
                <span className="tx">
                  <b>Who can edit group info</b>
                  <small>{editPerm}</small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                role="switch"
                aria-checked={receipts}
                onClick={() => {
                  setReceipts(!receipts);
                  showToast(!receipts ? 'Read receipts on' : 'Read receipts off');
                }}
                style={{ ['--c' as string]: '#9B7BFF' }}
              >
                <span className="ti">
                  <Icon name="eye" />
                </span>
                <span className="tx">
                  <b>Read receipts</b>
                  <small>{receipts ? 'Members can see when you read' : 'Off'}</small>
                </span>
                <span className={`tg ${receipts ? 'on' : ''}`}></span>
              </button>

              <button
                type="button"
                className="row"
                onClick={() =>
                  handleOpenPicker('Message sound', ['Pixel', 'Pop', 'Chime', 'Silent'], messageSound, setMessageSound)
                }
                style={{ ['--c' as string]: '#FF6B9A' }}
              >
                <span className="ti">
                  <Icon name="music" />
                </span>
                <span className="tx">
                  <b>Message sound</b>
                  <small>{messageSound}</small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                onClick={() =>
                  handleOpenPicker(
                    'Auto-download media',
                    ['Never', 'Wi-Fi only', 'Wi-Fi & mobile data'],
                    autoDownload,
                    setAutoDownload
                  )
                }
                style={{ ['--c' as string]: '#38BDF8' }}
              >
                <span className="ti">
                  <Icon name="down" />
                </span>
                <span className="tx">
                  <b>Auto-download media</b>
                  <small>{autoDownload}</small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row"
                role="switch"
                aria-checked={chatLock}
                onClick={() => {
                  setChatLock(!chatLock);
                  showToast(!chatLock ? 'Chat locked' : 'Chat lock off');
                }}
                style={{ ['--c' as string]: '#22D3A0' }}
              >
                <span className="ti">
                  <Icon name="lock" />
                </span>
                <span className="tx">
                  <b>Chat lock</b>
                  <small>{chatLock ? 'Face ID / PIN needed to open' : 'Off'}</small>
                </span>
                <span className={`tg ${chatLock ? 'on' : ''}`}></span>
              </button>

              <button
                type="button"
                className="row"
                role="switch"
                aria-checked={mentionsOnly}
                onClick={() => {
                  setMentionsOnly(!mentionsOnly);
                  showToast(!mentionsOnly ? 'Mentions only on' : 'Mentions only off');
                }}
                style={{ ['--c' as string]: '#FF6B9A' }}
              >
                <span className="ti">
                  <Icon name="at" />
                </span>
                <span className="tx">
                  <b>Mentions only</b>
                  <small>{mentionsOnly ? 'Notify only when someone @mentions you' : 'Off'}</small>
                </span>
                <span className={`tg ${mentionsOnly ? 'on' : ''}`}></span>
              </button>
            </div>

            {/* CARD 4: PRIVACY */}
            <h4>Privacy</h4>
            <div className="card">
              <button
                type="button"
                className="row"
                role="switch"
                aria-checked={!isMuted}
                onClick={() => {
                  setIsMuted(!isMuted);
                  showToast(!isMuted ? 'Group muted' : 'Group unmuted');
                }}
                style={{ ['--c' as string]: '#9B7BFF' }}
              >
                <span className="ti">
                  <Icon name="bell" />
                </span>
                <span className="tx">
                  <b>Notifications</b>
                  <small>{isMuted ? 'Off' : 'On'}</small>
                </span>
                <span className={`tg ${!isMuted ? 'on' : ''}`}></span>
              </button>

              <button
                type="button"
                className="row"
                onClick={() => {
                  if (isIgnored) {
                    setIsIgnored(false);
                    showToast('Group unignored');
                  } else {
                    openSheet(
                      'Ignore group?',
                      <div>
                        <p style={{ color: 'var(--mute)', margin: '0 4px 16px' }}>
                          This group's messages will move to Filtered Messages.
                        </p>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setIsIgnored(true);
                            closeSheet();
                            showToast('Moved to Filtered Messages');
                          }}
                        >
                          Ignore group
                        </button>
                        <button type="button" className="btn alt" onClick={closeSheet}>
                          Cancel
                        </button>
                      </div>
                    );
                  }
                }}
                style={{ ['--c' as string]: '#A99FD2' }}
              >
                <span className="ti">
                  <Icon name="msgoff" />
                </span>
                <span className="tx">
                  <b>{isIgnored ? 'Unignore group' : 'Ignore group'}</b>
                  <small>{isIgnored ? 'In Filtered Messages' : 'Move to Filtered Messages'}</small>
                </span>
                <span className="ch">
                  <Icon name="chev" />
                </span>
              </button>

              <button
                type="button"
                className="row danger"
                onClick={handleConfirmLeave}
                style={{ ['--c' as string]: '#FF5470' }}
              >
                <span className="ti">
                  <Icon name="leave" />
                </span>
                <span className="tx">
                  <b>Leave group</b>
                </span>
              </button>
            </div>
          </main>
        )}
      </div>

      {/* Floating Bottom Sheet */}
      <div id="ov" className={sheetOpen ? 'open' : ''} onClick={closeSheet} />
      <div
        id="sheet"
        ref={sheetRef}
        className={sheetOpen ? 'open' : ''}
        role="dialog"
        aria-modal="true"
        onPointerMove={handlePointerMoveSheet}
        onPointerUp={handlePointerUpSheet}
        onPointerCancel={handlePointerUpSheet}
      >
        <div className="grab" onPointerDown={handlePointerDownGrab} />
        <h3 id="st">{sheetTitle}</h3>
        <div id="sb">{sheetContent}</div>
      </div>

      {/* Toast Notification */}
      <div id="toast" className={toastVisible ? 'show' : ''} role="status">
        {toastMessage}
      </div>

      {/* Floating Particles */}
      {particles.map(p => (
        <span
          key={p.id}
          className="fl"
          style={
            {
              left: p.left,
              ['--d' as string]: p.delay,
              ['--r' as string]: p.rot,
              fontSize: p.size,
            } as React.CSSProperties
          }
        >
          {p.char}
        </span>
      ))}

      {/* Hidden File Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handlePhotoFileChange}
      />
      <input
        ref={wallpaperInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleWallpaperFileChange}
      />
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        hidden
        onChange={handleMediaFileChange}
      />
    </div>
  );
};

function renderAvatarSvg(name: string, idSuffix: string) {
  let h = 0;
  for (const c of name) h += c.charCodeAt(0);
  const colorPair = AV_COLORS[Math.abs(h) % 6];
  const gradId = `av_g_${idSuffix.replace(/[^a-zA-Z0-9]/g, '_')}_${Math.abs(h) % 6}`;

  return (
    <svg viewBox="0 0 56 56" className="w-full h-full block">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colorPair[0]} />
          <stop offset="1" stopColor={colorPair[1]} />
        </linearGradient>
      </defs>
      <rect width="56" height="56" fill={`url(#${gradId})`} />
      <circle cx="28" cy="22" r="9.5" fill="#fff" fillOpacity="0.92" />
      <path d="M8 56c0-12 8.5-20 20-20s20 8 20 20z" fill="#fff" fillOpacity="0.92" />
    </svg>
  );
}

export default MessengerGroupSettings;
