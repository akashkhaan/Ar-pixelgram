import ChatWallpaperModal from '@/components/chat/ChatWallpaperModal';
import { ChatMediaRenderer, isMediaMessage } from '@/components/chat/ChatMediaRenderer';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { CallMessageCard, isCallEventMessage } from '@/components/chat/CallMessageCard';
import { InstagramSharedCard, parseSharedContent } from '@/components/chat/InstagramSharedCard';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Camera,
  Image as ImageIcon,
  Info,
  Mic,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Send,
  ShieldOff,
  Smile,
  Video,
  X,
} from 'lucide-react';
// चैट पेज — seen status, block/unblock, online status, avatar→profile click, Messenger settings & theme
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import MessengerDirectSettings from '@/components/chat/MessengerDirectSettings';
import { MESSENGER_THEMES } from '@/components/chat/MessengerGroupSettings';
import MobileLayout from '@/components/layouts/MobileLayout';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useCall } from '@/contexts/CallContext';
import { supabase } from '@/db/supabase';
import useGoBack from '@/hooks/use-go-back';
import { cn } from '@/lib/utils';
import {
  blockUser,
  createNotification,
  getMessages,
  getOnlineStatus,
  getProfile,
  isBlocked,
  markConversationSeen,
  sendMessage,
  setOnlineStatus,
  unblockUser,
  uploadChatMedia,
  uploadImage,
} from '@/services/api';
import type { Message, Profile } from '@/types/types';

const EMOJI_LIST = ['😀', '😂', '❤️', '👍', '🎉', '😍', '🔥', '✨', '😎', '🙏', '💯', '🤔', '😭', '😘', '💪'];

const ChatPage: React.FC = () => {
  const { receiverId } = useParams<{ receiverId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack("/chat");
  const { startCall } = useCall();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [onlineStatusState, setOnlineStatusState] = useState<{ is_online: boolean; last_seen_at?: string; last_seen?: string | null } | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [selectedMsgTimeId, setSelectedMsgTimeId] = useState<string | null>(null);

  const renderMessageText = (text: string, isMe: boolean) => {
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts = text.split(urlPattern);
    return parts.map((part, i) => {
      if (/^https?:\/\/[^\s]+$/i.test(part) || /^www\.[^\s]+$/i.test(part)) {
        const href = part.startsWith('http') ? part : `https://${part}`;
        return (
          <a
            key={`link-${i}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'underline underline-offset-2 break-all font-semibold transition-opacity hover:opacity-85',
              isMe ? 'text-white underline-white' : 'text-sky-500 dark:text-sky-400'
            )}
          >
            {part}
          </a>
        );
      }
      return <span key={`txt-${i}`}>{part}</span>;
    });
  };

  // Messenger Settings & Theme States
  const [showDetails, setShowDetails] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [chatTheme, setChatTheme] = useState<string>(() => {
    return (receiverId && localStorage.getItem(`direct_theme_${receiverId}`)) || 'default';
  });
  const [chatEmoji, setChatEmoji] = useState<string>(() => {
    return (receiverId && localStorage.getItem(`direct_emoji_${receiverId}`)) || '👍';
  });
  const [nickname, setNickname] = useState<string>(() => {
    return (receiverId && localStorage.getItem(`direct_nickname_${receiverId}`)) || '';
  });
  const [wallpaper, setWallpaper] = useState<string | null>(() => {
    return (receiverId && localStorage.getItem(`chat_wallpaper_${receiverId}`)) || null;
  });
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  const handlePickMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !receiverId || uploadingImage) return;
    e.target.value = '';
    setUploadingImage(true);
    const isVideo = file.type.startsWith('video/');
    try {
      toast.info(isVideo ? 'Uploading video...' : 'Uploading photo...');
      const url = await uploadChatMedia(file, user.id, file.name);
      await handleSendCustom(url);
      toast.success(isVideo ? 'Video sent!' : 'Photo sent!');
    } catch (err) {
      console.error('Failed to upload media:', err);
      toast.error(isVideo ? 'Failed to send video' : 'Failed to send photo');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSendVoice = async (audioBlob: Blob, durationSecs: number) => {
    if (!user || !receiverId) return;
    try {
      setSending(true);
      toast.info('Sending voice message...');
      const url = await uploadChatMedia(audioBlob, user.id, `voice_${Date.now()}.webm`);
      const durationText = `${Math.floor(durationSecs / 60)}:${durationSecs % 60 < 10 ? '0' : ''}${durationSecs % 60}`;
      const content = `🎙️ Voice message (${durationText})\n${url}`;
      await handleSendCustom(content);
      setIsRecordingVoice(false);
      toast.success('Voice message sent!');
    } catch (err) {
      console.error('Failed to send voice message:', err);
      toast.error('Voice message failed');
    } finally {
      setSending(false);
    }
  };

  const handleSendCustom = async (customContent: string) => {
    const text = customContent.trim();
    if (!text || !user || !receiverId || sending || blocked || blockedByOther) return;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: receiverId,
      content: text,
      is_seen: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...(prev || []).filter(Boolean), optimisticMsg]);
    try {
      const newMsg = await sendMessage(receiverId, text);
      if (newMsg && newMsg.id) {
        setMessages(prev => (prev || []).filter(Boolean).map(m => (m.id === tempId ? newMsg : m)));
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleSelectWallpaper = (url: string | null) => {
    setWallpaper(url);
    if (receiverId) {
      if (url) localStorage.setItem(`chat_wallpaper_${receiverId}`, url);
      else localStorage.removeItem(`chat_wallpaper_${receiverId}`);
    }
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTheme = useMemo(
    () => MESSENGER_THEMES.find(t => t.id === chatTheme) || MESSENGER_THEMES[0],
    [chatTheme]
  );

  useEffect(() => {
    if (!receiverId || !user) return;
    // Set self online
    setOnlineStatus(user.id, true);
    // Load
    getProfile(receiverId).then(setOtherProfile);
    loadMessages();
    isBlocked(user.id, receiverId).then(setBlocked);
    isBlocked(receiverId, user.id).then(setBlockedByOther);
    getOnlineStatus(receiverId).then(setOnlineStatusState);
    // AuthContext manages online presence globally
  }, [receiverId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherTyping]);

  const loadMessages = async () => {
    if (!user || !receiverId) return;
    const msgs = await getMessages(user.id, receiverId);
    setMessages(msgs);
    await markConversationSeen(receiverId, user.id);
  };

  // Realtime subscription
  useEffect(() => {
    if (!user || !receiverId) return;
    const channel = supabase
      .channel(`chat-${user.id}-${receiverId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        payload => {
          const msg = payload.new as Message;
          if (msg.sender_id === receiverId) {
            setMessages(prev => [...prev, msg]);
            markConversationSeen(receiverId, user.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${user.id}` },
        payload => {
          const updated = payload.new as Message;
          setMessages(prev => prev.map(m => (m.id === updated.id ? updated : m)));
        }
      )
      .on('broadcast', { event: 'typing' }, payload => {
        if (payload.payload?.sender_id === receiverId) {
          setOtherTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2000);
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'online_status', filter: `user_id=eq.${receiverId}` },
        payload => {
          const row = payload.new as any;
          if (row) {
            setOnlineStatusState({
              is_online: row.is_online,
              last_seen_at: row.last_seen_at,
            });
          }
        }
      )
      .on('broadcast', { event: 'online_status' }, payload => {
        if (payload.payload?.user_id === receiverId) {
          setOnlineStatusState({
            is_online: payload.payload.is_online,
            last_seen: payload.payload.last_seen,
          });
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [user, receiverId]);

  const handleTyping = () => {
    if (!user || !receiverId) return;
    supabase
      .channel(`chat-${user.id}-${receiverId}`)
      .send({ type: 'broadcast', event: 'typing', payload: { sender_id: user.id } });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || !user || !receiverId || sending || blocked || blockedByOther) return;

    setSending(true);
    setContent('');
    setShowEmoji(false);

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: receiverId,
      content: text,
      is_seen: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...(prev || []).filter(Boolean), optimisticMsg]);

    try {
      const newMsg = await sendMessage(receiverId, text);
      if (newMsg && newMsg.id) {
        setMessages(prev => (prev || []).filter(Boolean).map(m => (m.id === tempId ? newMsg : m)));
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => (prev || []).filter(m => m && m.id !== tempId));
      toast.error('मैसेज नहीं भेजा जा सका');
    } finally {
      setSending(false);
    }
  };

  const handleSendQuickEmoji = async (emojiToSend: string) => {
    const text = emojiToSend.trim();
    if (!text || !user || !receiverId || sending || blocked || blockedByOther) return;

    setSending(true);

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: receiverId,
      content: text,
      is_seen: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...(prev || []).filter(Boolean), optimisticMsg]);

    try {
      const newMsg = await sendMessage(receiverId, text);
      if (newMsg && newMsg.id) {
        setMessages(prev => (prev || []).filter(Boolean).map(m => (m.id === tempId ? newMsg : m)));
      }
    } catch (err) {
      console.error('Failed to send emoji:', err);
      setMessages(prev => (prev || []).filter(m => m && m.id !== tempId));
      toast.error('Emoji nahi bheja ja saka');
    } finally {
      setSending(false);
    }
  };

  const handleBlock = async () => {
    if (!user || !receiverId) return;
    try {
      if (blocked) {
        await unblockUser(user.id, receiverId);
        setBlocked(false);
        toast.success(`${otherProfile?.username} को unblock किया`);
      } else {
        await blockUser(user.id, receiverId);
        setBlocked(true);
        toast.success(`${otherProfile?.username} को block किया`);
      }
    } catch {
      toast.error('कार्रवाई पूरी नहीं हो सकी');
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatLastSeen = (dateStr: string | null) => {
    if (!dateStr) return 'Offline';
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return 'अभी active';
    if (diff < 60) return `${diff} min पहले active`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours} hr पहले active`;
    return d.toLocaleDateString();
  };

  const statusText = onlineStatusState?.is_online
    ? 'Active now'
    : formatLastSeen(onlineStatusState?.last_seen_at || onlineStatusState?.last_seen || null);
  const displayName = nickname || otherProfile?.username;

  const visibleMessages = useMemo(() => {
    const cleanList = (messages || []).filter((m): m is Message => Boolean(m && m.id && typeof m.content === 'string'));
    const query = searchQuery.trim().toLowerCase();
    if (!query) return cleanList;
    return cleanList.filter(m => m.content.toLowerCase().includes(query));
  }, [messages, searchQuery]);

  return (
    <MobileLayout hideHeader hideNav noScroll>
      <div className="flex flex-col h-full w-full min-h-0 overflow-hidden bg-background">
        {/* Top bar (Glassmorphic & Modern Instagram Style) */}
        <div className="shrink-0 z-30 flex items-center gap-2 px-3 py-2.5 border-b border-border/50 bg-background/95 backdrop-blur-xl shadow-xs">
          <button
            onClick={goBack}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/80 active:scale-95 text-foreground transition-all shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>

          {/* Avatar & Name — click opens details */}
          <button
            onClick={() => setShowDetails(true)}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-90 active:scale-[0.99] transition-all"
          >
            <div className="relative shrink-0">
              {otherProfile?.avatar_url ? (
                <img
                  src={otherProfile.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-border/50 shadow-xs"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-500/20 to-pink-500/20 flex items-center justify-center ring-1 ring-border/50">
                  <span className="text-primary font-bold text-sm">
                    {otherProfile?.username?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              {onlineStatusState?.is_online && (
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-background shadow-xs" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-foreground truncate">{displayName}</span>
                {otherProfile?.is_verified && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0 fill-sky-500/20" />}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                {otherTyping ? (
                  <span className="text-primary font-semibold animate-pulse">Typing…</span>
                ) : onlineStatusState?.is_online ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active now
                  </span>
                ) : (
                  <span>{statusText}</span>
                )}
              </div>
            </div>
          </button>

          {/* Audio Call button 📞 */}
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/80 text-foreground/80 hover:text-sky-500 active:scale-95 transition-all shrink-0"
            onClick={() => { if (receiverId) startCall(receiverId, 'audio'); }}
            disabled={blocked || blockedByOther}
            title="Audio call"
            aria-label="Audio call"
          >
            <Phone className="w-4.5 h-4.5" />
          </button>

          {/* Video Call button 📹 */}
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/80 text-foreground/80 hover:text-sky-500 active:scale-95 transition-all shrink-0"
            onClick={() => { if (receiverId) startCall(receiverId, 'video'); }}
            disabled={blocked || blockedByOther}
            title="Video call"
            aria-label="Video call"
          >
            <Video className="w-4.5 h-4.5" />
          </button>

          {/* 3-dots DropdownMenu with Wallpaper & Details & Block */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/80 text-foreground/80 hover:text-primary active:scale-95 transition-all shrink-0"
                title="More options"
                aria-label="More options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5 shadow-2xl border-border bg-card">
              <DropdownMenuItem
                onClick={() => setShowWallpaperModal(true)}
                className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl gap-2.5"
              >
                <ImageIcon className="w-4 h-4 text-primary" />
                <span>Wallpaper (इमेज / फोटो)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDetails(true)}
                className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl gap-2.5"
              >
                <Info className="w-4 h-4 text-muted-foreground" />
                <span>Conversation details</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowSearch(true)}
                className="cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl gap-2.5"
              >
                <Search className="w-4 h-4 text-muted-foreground" />
                <span>Search messages</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleBlock}
                className={`cursor-pointer py-2.5 px-3 text-sm font-medium rounded-xl gap-2.5 ${
                  blocked ? 'text-green-600 focus:text-green-600' : 'text-destructive focus:text-destructive'
                }`}
              >
                {blocked ? <ShieldOff className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                <span>{blocked ? 'Unblock user' : 'Block user'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* IN-CONVERSATION SEARCH BAR */}
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 backdrop-blur-md px-3 py-2 animate-in slide-in-from-top-2 duration-150 shrink-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search in conversation..."
              className="h-8.5 rounded-xl text-xs bg-background/80 focus-visible:ring-1 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Blocked banner */}
        {(blocked || blockedByOther) && (
          <div className="shrink-0 bg-destructive/15 text-destructive font-medium text-xs text-center py-2 px-4 border-b border-destructive/20">
            {blocked ? `You have blocked ${otherProfile?.username}` : 'You cannot message this user'}
          </div>
        )}

        {/* Messages Canvas */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 py-4 space-y-2.5 relative bg-background/50"
          style={
            wallpaper
              ? {
                  backgroundImage: `url(${wallpaper})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }
              : undefined
          }
        >
          {wallpaper && (
            <div className="absolute inset-0 bg-background/50 dark:bg-background/70 backdrop-blur-[0.5px] pointer-events-none" />
          )}

          {/* Messenger Hero Profile Section (from Screenshot 2) */}
          {!searchQuery && (
            <div className="flex flex-col items-center justify-center pt-8 pb-5 text-center select-none animate-in fade-in duration-300">
              <div className="relative mb-3">
                {otherProfile?.avatar_url ? (
                  <img
                    src={otherProfile.avatar_url}
                    alt=""
                    className="w-24 h-24 rounded-full object-cover ring-2 ring-border/40 shadow-xl"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-violet-500/25 to-pink-500/25 flex items-center justify-center ring-2 ring-border/40 shadow-xl">
                    <span className="text-primary font-bold text-3xl">
                      {otherProfile?.username?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                {onlineStatusState?.is_online && (
                  <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-background shadow-xs" />
                )}
              </div>

              <h2 className="text-xl font-bold text-foreground tracking-tight">
                {displayName}
              </h2>

              <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                @{otherProfile?.username}
              </p>

              <p className="text-xs text-muted-foreground mt-1">
                You're connected on Pixelgram
              </p>
              {otherProfile?.bio && (
                <p className="text-xs text-muted-foreground/80 mt-0.5 max-w-xs truncate px-4">
                  {otherProfile.bio}
                </p>
              )}

              <Link
                to={`/profile/${otherProfile?.username || ''}`}
                className="mt-3.5 inline-flex items-center justify-center px-5 py-1.5 rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] text-white text-xs font-semibold shadow-xs transition-colors"
              >
                View Profile
              </Link>

              {/* End-to-End Encryption Notice (from Screenshot 2) */}
              <div className="mt-8 mb-2 max-w-xs px-2 text-center">
                <p className="text-[11px] text-muted-foreground/85 leading-relaxed">
                  🔒 Messages and calls are secured with end-to-end encryption. Only people in this chat can read, listen to or share them.{' '}
                  <button
                    type="button"
                    onClick={() => setShowDetails(true)}
                    className="text-[#0084FF] font-semibold hover:underline inline"
                  >
                    Learn more
                  </button>
                </p>
              </div>
            </div>
          )}
          {visibleMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
              {searchQuery ? (
                <p className="text-muted-foreground text-sm">No matching messages found</p>
              ) : (
                <div className="flex flex-col items-center max-w-xs animate-in fade-in duration-300">
                  <div className="relative mb-3">
                    {otherProfile?.avatar_url ? (
                      <img
                        src={otherProfile.avatar_url}
                        alt=""
                        className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/30 shadow-md"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-violet-500/25 to-pink-500/25 flex items-center justify-center ring-2 ring-primary/30 shadow-md">
                        <span className="text-primary font-bold text-2xl">
                          {otherProfile?.username?.[0]?.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-foreground mb-0.5">{displayName}</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    {otherProfile?.full_name ? `${otherProfile.full_name} · ` : ''}Pixelgram
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleSendQuickEmoji('👋')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-muted/70 hover:bg-muted font-medium text-xs text-foreground transition-all active:scale-95 shadow-2xs border border-border/40"
                  >
                    <span>Wave 👋 to start chatting</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {visibleMessages.map((msg, idx) => {
            if (!msg || !msg.content) return null;
            const isMe = msg.sender_id === user?.id;
            const prevMsg = visibleMessages[idx - 1];
            const showTime =
              !prevMsg ||
              (msg.created_at &&
                prevMsg?.created_at &&
                new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() >
                  5 * 60 * 1000);
            const isSingleEmoji = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})$/u.test(
              msg.content.trim()
            );
            const shareInfo = parseSharedContent(msg.content);

            return (
              <React.Fragment key={msg.id}>
                {showTime && (
                  <div className="flex items-center justify-center my-3">
                    <span className="text-[11px] font-medium text-muted-foreground/80 px-2.5 py-0.5 rounded-full bg-muted/40">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                )}
                {isCallEventMessage(msg.content) ? (
                    <CallMessageCard
                      content={msg.content}
                      timestamp={msg.created_at}
                      isMe={isMe}
                      onCallBack={(k) => { if (receiverId) startCall(receiverId, k); }}
                    />
                  ) : (
                    <div className={cn('flex items-end gap-1.5 w-full', isMe ? 'justify-end' : 'justify-start')}>
                      {isSingleEmoji ? (
                        <div className="text-5xl py-1 px-2 select-none hover:scale-110 active:scale-125 transition-transform">
                          {msg.content.trim()}
                        </div>
                      ) : shareInfo ? (
                        <div
                          className={cn(
                            'w-full max-w-[340px] p-1.5 rounded-[22px] text-sm shadow-sm transition-all',
                            isMe
                              ? cn('rounded-br-[5px] text-white', activeTheme.bubble)
                              : 'bg-muted/80 dark:bg-zinc-800/80 text-foreground rounded-bl-[5px] border border-border/40'
                          )}
                        >
                          <InstagramSharedCard shareInfo={shareInfo} isMe={isMe} />
                          <div
                            className={cn(
                              'flex items-center gap-1 justify-end px-2 pt-1 pb-0.5 text-[10px]',
                              isMe ? 'text-white/80' : 'text-muted-foreground'
                            )}
                          >
                            <span>{formatTime(msg.created_at)}</span>
                            {isMe && (
                              <span className={cn('font-bold', msg.is_seen ? 'text-sky-300' : 'text-white/70')}>
                                {msg.is_seen ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={cn('flex flex-col max-w-[78%] sm:max-w-[70%]', isMe ? 'items-end' : 'items-start')}>
                          {isMediaMessage(msg.content) ? (
                            <ChatMediaRenderer
                              content={msg.content}
                              isMe={isMe}
                              activeBubbleClass={activeTheme.bubble}
                            />
                          ) : (
                            <div
                              onClick={() => setSelectedMsgTimeId(prev => prev === msg.id ? null : msg.id)}
                              className={cn(
                                'w-fit max-w-full px-4 py-2 rounded-[20px] text-[15px] leading-snug shadow-2xs transition-all cursor-pointer select-text',
                                isMe
                                  ? cn('rounded-br-[4px] text-white', activeTheme.bubble)
                                  : 'bg-[#efefef] dark:bg-[#262626] text-foreground rounded-bl-[4px] border border-border/30 dark:border-transparent'
                              )}
                            >
                              <div className="whitespace-pre-wrap break-words [word-break:break-word] select-text">
                                {renderMessageText(msg.content, isMe)}
                              </div>
                            </div>
                          )}
                          {/* Show exact timestamp on tap */}
                          {selectedMsgTimeId === msg.id && (
                            <div className="text-[10px] text-muted-foreground/80 px-1 pt-0.5 select-none animate-in fade-in duration-150">
                              {formatTime(msg.created_at)}
                            </div>
                          )}
                          {/* Messenger Delivered indicator on latest sent message */}
                          {isMe && idx === visibleMessages.length - 1 && selectedMsgTimeId !== msg.id && (
                            <div className="text-[11px] text-muted-foreground/80 font-medium pr-1 pt-0.5 select-none">
                              {msg.is_seen ? 'Seen' : 'Delivered'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
              </React.Fragment>
            );
          })}

          {otherTyping && (
            <div className="flex justify-start items-center gap-2">
              <div className="bg-muted/80 dark:bg-zinc-800/80 border border-border/40 px-4 py-2.5 rounded-[20px] rounded-bl-[4px] shadow-2xs">
                <div className="flex gap-1.5 items-center h-3.5">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Emoji picker drawer */}
        {showEmoji && (
          <div className="shrink-0 border-t border-border/50 bg-card/95 backdrop-blur-xl px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex flex-wrap gap-3.5 justify-center">
              {EMOJI_LIST.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { setContent(p => p + emoji); setShowEmoji(false); }}
                  className="text-2xl hover:scale-125 active:scale-140 transition-transform p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Input bar (Messenger Style with Rainbow Voice Recorder, Photos & Videos) */}
        {isRecordingVoice ? (
          <div
            className="sticky bottom-0 z-20 flex shrink-0 items-center px-3 py-2 bg-background/95 backdrop-blur-xl border-t border-border/50"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom,0px),8px)' }}
          >
            <VoiceRecorder
              onSendAudio={handleSendVoice}
              onCancel={() => setIsRecordingVoice(false)}
              isSending={sending}
            />
          </div>
        ) : (
          <form
            onSubmit={handleSend}
            className="sticky bottom-0 z-20 flex shrink-0 items-center gap-1 sm:gap-2 px-2.5 py-2 bg-background/95 backdrop-blur-xl border-t border-border/50"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom,0px),8px)' }}
          >
            {/* Hidden file inputs for Camera and Gallery (Photos & Videos) */}
            <input
              type="file"
              ref={galleryInputRef}
              accept="image/*,video/*"
              className="hidden"
              onChange={handlePickMedia}
            />
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*,video/*"
              capture="environment"
              className="hidden"
              onChange={handlePickMedia}
            />

            {/* Left Action Buttons */}
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              {/* 1. Plus Button (+) */}
              <button
                type="button"
                onClick={() => setShowWallpaperModal(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-muted/80 text-[#0084FF] active:scale-90 transition-transform"
                title="Add Wallpaper / Custom Background"
              >
                <Plus className="w-5 h-5 text-[#0084FF]" />
              </button>

              {/* 2. Camera Button (📷) */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-muted/80 text-[#0084FF] active:scale-90 transition-transform"
                title="Camera (Photo/Video)"
                disabled={blocked || blockedByOther}
              >
                <Camera className="w-5 h-5 text-[#0084FF]" />
              </button>

              {/* 3. Gallery Button (🖼️) */}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-muted/80 text-[#0084FF] active:scale-90 transition-transform"
                title="Gallery (Photos & Videos)"
                disabled={blocked || blockedByOther}
              >
                <ImageIcon className="w-5 h-5 text-[#0084FF]" />
              </button>

              {/* 4. Mic Button (🎙️) */}
              <button
                type="button"
                onClick={() => setIsRecordingVoice(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-muted/80 text-[#0084FF] active:scale-90 transition-transform"
                title="Record voice message"
                disabled={blocked || blockedByOther}
              >
                <Mic className="w-5 h-5 text-[#0084FF]" />
              </button>
            </div>

            {/* Pill Message Input */}
            <div className="relative flex-1 min-w-0 flex items-center">
              <Input
                placeholder={blocked || blockedByOther ? 'Message unavailable' : 'Message…'}
                value={content}
                onChange={e => { setContent(e.target.value); handleTyping(); }}
                className="w-full h-10 rounded-full bg-[#242526] dark:bg-[#242526] bg-muted/70 text-foreground placeholder:text-muted-foreground/80 px-4 pr-10 text-sm border-none focus-visible:ring-1 focus-visible:ring-[#0084FF] transition-all"
                maxLength={500}
                disabled={blocked || blockedByOther}
              />
              <button
                type="button"
                onClick={() => setShowEmoji(!showEmoji)}
                className="absolute right-2.5 w-7 h-7 flex items-center justify-center text-[#0084FF] hover:scale-110 active:scale-95 transition-transform"
                title="Emoji"
              >
                <Smile className={cn('w-5 h-5 transition-transform', showEmoji ? 'text-sky-600 scale-110' : 'text-[#0084FF]')} />
              </button>
            </div>

            {/* Right Action Button (Send OR Quick Thumbs Up Emoji) */}
            {content.trim() ? (
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 rounded-full shrink-0 bg-[#0084FF] hover:bg-[#0073e6] text-white shadow-md active:scale-90 transition-all"
                disabled={!content.trim() || sending || blocked || blockedByOther}
              >
                <Send className="w-4 h-4" />
              </Button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSendQuickEmoji(chatEmoji)}
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted/80 active:scale-130 transition-transform text-2xl select-none shrink-0"
                title={`Send ${chatEmoji}`}
                disabled={blocked || blockedByOther}
              >
                {chatEmoji}
              </button>
            )}
          </form>
        )}

        {/* Messenger Direct Conversation Settings Sheet */}
        <MessengerDirectSettings
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
          profile={otherProfile}
          statusText={statusText}
          blocked={blocked}
          onToggleBlock={handleBlock}
          onStartCall={kind => {
            if (receiverId) startCall(receiverId, kind);
          }}
          onStartSearch={() => setShowSearch(true)}
          chatTheme={chatTheme}
          onThemeChange={theme => {
            setChatTheme(theme);
            if (receiverId) localStorage.setItem(`direct_theme_${receiverId}`, theme);
            toast.success('Theme updated');
          }}
          chatEmoji={chatEmoji}
          onEmojiChange={emoji => {
            setChatEmoji(emoji);
            if (receiverId) localStorage.setItem(`direct_emoji_${receiverId}`, emoji);
            toast.success(`Quick reaction set to ${emoji}`);
          }}
          nickname={nickname}
          onNicknameChange={nick => {
            setNickname(nick);
            if (receiverId) localStorage.setItem(`direct_nickname_${receiverId}`, nick);
            toast.success('Nickname updated');
          }}
        />
      </div>
            <ChatWallpaperModal
          open={showWallpaperModal}
          onOpenChange={setShowWallpaperModal}
          currentWallpaper={wallpaper}
          onSelectWallpaper={handleSelectWallpaper}
          title="Chat Wallpaper (बैकग्राउंड फोटो)"
        />
      </MobileLayout>
  );
};

export default ChatPage;
