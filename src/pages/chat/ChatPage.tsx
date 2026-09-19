// चैट पेज — seen status, block/unblock, online status, avatar→profile click, Messenger settings & theme
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layouts/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMessages,
  sendMessage,
  markConversationSeen,
  getProfile,
  blockUser,
  unblockUser,
  isBlocked,
  getOnlineStatus,
  setOnlineStatus,
  createNotification,
} from '@/services/api';
import { supabase } from '@/db/supabase';
import type { Message, Profile } from '@/types/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Send,
  BadgeCheck,
  Smile,
  Phone,
  Video,
  MoreVertical,
  Ban,
  ShieldOff,
  Info,
  Search,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCall } from '@/contexts/CallContext';
import MessengerDirectSettings from '@/components/chat/MessengerDirectSettings';
import { MESSENGER_THEMES } from '@/components/chat/MessengerGroupSettings';

const EMOJI_LIST = ['😀', '😂', '❤️', '👍', '🎉', '😍', '🔥', '✨', '😎', '🙏', '💯', '🤔', '😭', '😘', '💪'];

const ChatPage: React.FC = () => {
  const { receiverId } = useParams<{ receiverId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { startCall } = useCall();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [onlineStatusState, setOnlineStatusState] = useState<{ is_online: boolean; last_seen: string | null } | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);

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
    // Cleanup: set offline on unmount
    return () => { setOnlineStatus(user.id, false); };
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
    if (!content.trim() || !user || !receiverId || sending || blocked || blockedByOther) return;

    setSending(true);
    try {
      const newMsg = await sendMessage(user.id, receiverId, content.trim());
      setMessages(prev => [...prev, newMsg]);
      setContent('');
      setShowEmoji(false);
      // Notify receiver
      createNotification(receiverId, user.id, 'message', undefined, undefined, content.trim().slice(0, 50));
    } catch {
      toast.error('मैसेज नहीं भेजा जा सका');
    } finally {
      setSending(false);
    }
  };

  const handleSendQuickEmoji = async (emojiToSend: string) => {
    if (!user || !receiverId || sending || blocked || blockedByOther) return;
    setSending(true);
    try {
      const newMsg = await sendMessage(user.id, receiverId, emojiToSend);
      setMessages(prev => [...prev, newMsg]);
      createNotification(receiverId, user.id, 'message', undefined, undefined, emojiToSend);
    } catch {
      toast.error('Could not send emoji');
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

  const statusText = onlineStatusState?.is_online ? 'Active now' : formatLastSeen(onlineStatusState?.last_seen || null);
  const displayName = nickname || otherProfile?.username;

  const visibleMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return messages;
    return messages.filter(m => m.content.toLowerCase().includes(query));
  }, [messages, searchQuery]);

  return (
    <MobileLayout hideHeader hideNav>
      <div className="flex flex-col h-[100dvh] bg-background">
        {/* Top bar (Messenger Style) */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card shrink-0">
          <button
            onClick={() => navigate('/chat')}
            className="p-1 rounded-full hover:bg-muted text-foreground transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>

          {/* Avatar & Name — click opens details */}
          <button
            onClick={() => setShowDetails(true)}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-90 transition-opacity"
          >
            {otherProfile?.avatar_url ? (
              <img src={otherProfile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold text-sm">
                  {otherProfile?.username?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-sm text-foreground truncate">{displayName}</span>
                {otherProfile?.is_verified && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" />}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {otherTyping ? 'Typing…' : statusText}
              </p>
            </div>
          </button>

          {/* Audio Call button 📞 */}
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-sky-500 shrink-0"
            onClick={() => { if (receiverId) startCall(receiverId, 'audio'); }}
            disabled={blocked || blockedByOther}
            title="Audio call"
            aria-label="Audio call"
          >
            <Phone className="w-4.5 h-4.5 fill-sky-500/20" />
          </button>

          {/* Video Call button 📹 */}
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-sky-500 shrink-0"
            onClick={() => { if (receiverId) startCall(receiverId, 'video'); }}
            disabled={blocked || blockedByOther}
            title="Video call"
            aria-label="Video call"
          >
            <Video className="w-4.5 h-4.5 fill-sky-500/20" />
          </button>

          {/* Messenger Info button ⓘ */}
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted text-sky-500 transition-colors shrink-0"
            onClick={() => setShowDetails(true)}
            title="Conversation details"
            aria-label="Conversation details"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>

        {/* IN-CONVERSATION SEARCH BAR */}
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 animate-in slide-in-from-top-2 duration-150 shrink-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search in conversation..."
              className="h-8 rounded-lg text-xs bg-background"
            />
            <button
              type="button"
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Blocked banner */}
        {(blocked || blockedByOther) && (
          <div className="shrink-0 bg-destructive/10 text-destructive text-sm text-center py-2 px-4">
            {blocked ? `You have blocked ${otherProfile?.username}` : 'You cannot message this user'}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {visibleMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-muted-foreground text-sm">
                {searchQuery ? 'No matching messages found' : `Say hi to ${displayName}!`}
              </p>
            </div>
          )}
          {visibleMessages.map((msg, idx) => {
            const isMe = msg.sender_id === user?.id;
            const prevMsg = visibleMessages[idx - 1];
            const showTime = !prevMsg || new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60 * 1000;
            const isSingleEmoji = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})$/u.test(msg.content.trim());

            return (
              <React.Fragment key={msg.id}>
                {showTime && (
                  <p className="text-center text-xs text-muted-foreground my-2">{formatTime(msg.created_at)}</p>
                )}
                <div className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                  {isSingleEmoji ? (
                    <div className="text-4xl py-1 px-2 select-none">
                      {msg.content.trim()}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'max-w-[75%] px-3.5 py-2 rounded-2xl text-sm shadow-sm',
                        isMe
                          ? cn('rounded-br-sm text-white', activeTheme.bubble)
                          : 'bg-muted text-foreground rounded-bl-sm'
                      )}
                    >
                      <p className="break-words">{msg.content}</p>
                      <div className={cn('flex items-center gap-1 justify-end mt-0.5 text-[10px]', isMe ? 'text-white/75' : 'text-muted-foreground')}>
                        <span>{formatTime(msg.created_at)}</span>
                        {isMe && (
                          <span>
                            {msg.seen ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-sm">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Emoji picker drawer */}
        {showEmoji && (
          <div className="shrink-0 border-t border-border bg-card px-4 py-3">
            <div className="flex flex-wrap gap-3">
              {EMOJI_LIST.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { setContent(p => p + emoji); setShowEmoji(false); }}
                  className="text-2xl hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar (Messenger Style) */}
        <form
          onSubmit={handleSend}
          className="flex shrink-0 items-center gap-2 px-3 py-2.5 border-t border-border bg-card"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom,0px),10px)' }}
        >
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="p-2 rounded-full hover:bg-muted text-sky-500 transition-colors shrink-0"
          >
            <Smile className={cn('w-5 h-5 transition-colors', showEmoji ? 'text-sky-600' : 'text-sky-500')} />
          </button>

          <Input
            placeholder={blocked || blockedByOther ? 'Message unavailable' : 'Message…'}
            value={content}
            onChange={e => { setContent(e.target.value); handleTyping(); }}
            className="flex-1 h-10 rounded-full bg-muted/60 border-none px-4 text-sm focus-visible:ring-1 focus-visible:ring-sky-500"
            maxLength={500}
            disabled={blocked || blockedByOther}
          />

          {content.trim() ? (
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 rounded-full shrink-0 bg-sky-500 hover:bg-sky-600 text-white shadow-sm"
              disabled={!content.trim() || sending || blocked || blockedByOther}
            >
              <Send className="w-4 h-4" />
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSendQuickEmoji(chatEmoji)}
              className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted active:scale-125 transition-transform text-2xl select-none shrink-0"
              title={`Send ${chatEmoji}`}
              disabled={blocked || blockedByOther}
            >
              {chatEmoji}
            </button>
          )}
        </form>

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
    </MobileLayout>
  );
};

export default ChatPage;
