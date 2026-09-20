import {
  ArrowLeft,
  Check,
  Info,
  Loader2,
  Paperclip,
  Phone,
  Pin,
  Reply,
  Search,
  Send,
  Smile,
  Users,
  Video,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import GroupCallPanel, { GroupCallPanelHandle } from '@/components/call/GroupCallPanel';
import MessengerGroupSettings, { MESSENGER_THEMES } from '@/components/chat/MessengerGroupSettings';
import MobileLayout from '@/components/layouts/MobileLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import useGoBack from '@/hooks/use-go-back';
import {
  addGroupMember,
  getActiveGroupCall,
  getGroup,
  getGroupMedia,
  getGroupMembers,
  getGroupMessages,
  getGroupPermissions,
  getGroupPinnedMessages,
  leaveGroup,
  pinGroupMessage,
  removeGroupMember,
  searchGroupUsers,
  sendGroupFileMessage,
  sendGroupMessage,
  toggleGroupReaction,
  unpinGroupMessage,
  updateGroup,
  updateGroupPermissions,
  uploadGroupAvatar,
} from '@/services/groups';
import type {
  Group,
  GroupCall,
  GroupMedia,
  GroupMember,
  GroupMessage,
  GroupPermissions,
  GroupPinnedMessage,
} from '@/types/groups';
import type { Profile } from '@/types/types';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🙏'];

const Avatar: React.FC<{ profile?: Profile | null; size?: string }> = ({ profile, size = 'w-9 h-9' }) => (
  profile?.avatar_url ? (
    <img src={profile.avatar_url} alt="" className={size + ' rounded-full object-cover shrink-0'} />
  ) : (
    <div className={size + ' rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold shrink-0'}>
      {(profile?.username?.[0] || '?').toUpperCase()}
    </div>
  )
);

const renderMessageContent = (text: string, mine: boolean, myUsername?: string) => {
  const parts = text.split(/((?:^|\s)@[A-Za-z0-9_.-]+)/g);
  return parts.map((part, index) => {
    const trimmed = part.trim();
    if (trimmed.startsWith('@')) {
      const uname = trimmed.slice(1).toLowerCase();
      const isMe = myUsername && uname === myUsername.toLowerCase();
      return (
        <span
          key={index}
          className={
            'inline-flex items-center rounded px-1 py-0.5 font-semibold text-xs ' +
            (isMe
              ? mine
                ? 'bg-white/30 text-white font-bold ring-1 ring-white/50'
                : 'bg-primary/25 text-primary font-bold ring-1 ring-primary/40'
              : mine
              ? 'bg-white/20 text-white'
              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400')
          }
        >
          {part}
        </span>
      );
    }
    return part;
  });
};

const GroupChatPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { user, profile: myProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [mediaItems, setMediaItems] = useState<GroupMedia[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<GroupPinnedMessage[]>([]);
  const [permissions, setPermissions] = useState<GroupPermissions | null>(null);
  const [messageQuery, setMessageQuery] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<Profile[]>([]);
  const [reactionMessage, setReactionMessage] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeGroupCall, setActiveGroupCall] = useState<GroupCall | null>(null);

  // Messenger customization states
  const [groupTheme, setGroupTheme] = useState<string>(() => {
    return (groupId && localStorage.getItem(`group_theme_${groupId}`)) || 'default';
  });
  const [groupEmoji, setGroupEmoji] = useState<string>(() => {
    return (groupId && localStorage.getItem(`group_emoji_${groupId}`)) || '👍';
  });
  const [nicknames, setNicknames] = useState<Record<string, string>>(() => {
    try {
      return groupId ? JSON.parse(localStorage.getItem(`group_nicknames_${groupId}`) || '{}') : {};
    } catch {
      return {};
    }
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const callPanelRef = useRef<GroupCallPanelHandle>(null);

  const goBack = useGoBack('/chat');
  const handleBack = () => { goBack(); };

  const currentMember = useMemo(() => members.find(member => member.user_id === user?.id), [members, user]);
  const canManage = currentMember?.role === 'owner' || currentMember?.role === 'admin';
  const profileMap = useMemo(() => new Map(members.map(member => [member.user_id, member.profile])), [members]);
  const activeTheme = useMemo(() => MESSENGER_THEMES.find(t => t.id === groupTheme) || MESSENGER_THEMES[0], [groupTheme]);

  const visibleMessages = useMemo(() => {
    const query = messageQuery.trim().toLowerCase();
    if (!query) return messages;
    return messages.filter(
      message =>
        message.content.toLowerCase().includes(query) ||
        (profileMap.get(message.sender_id)?.username || '').toLowerCase().includes(query)
    );
  }, [messageQuery, messages, profileMap]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter(member => member.user_id !== user?.id)
      .filter(
        member =>
          !q ||
          (member.profile?.username || '').toLowerCase().includes(q) ||
          (member.profile?.full_name || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [mentionQuery, members, user?.id]);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const [nextGroup, nextMembers, nextMessages] = await Promise.all([
        getGroup(groupId),
        getGroupMembers(groupId),
        getGroupMessages(groupId),
      ]);
      setGroup(nextGroup);
      setMembers(nextMembers);
      setMessages(nextMessages);
      try {
        const [nextMedia, nextPinned] = await Promise.all([
          getGroupMedia(groupId),
          getGroupPinnedMessages(groupId),
        ]);
        setMediaItems(nextMedia);
        setPinnedMessages(nextPinned);
      } catch {
        setMediaItems([]);
        setPinnedMessages([]);
      }
      try {
        setPermissions(await getGroupPermissions(groupId));
      } catch {
        setPermissions(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load group');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  // Realtime call tracking
  useEffect(() => {
    if (!groupId) return;
    void getActiveGroupCall(groupId).then(setActiveGroupCall).catch(() => {});
    const channel = supabase
      .channel('group-call-' + groupId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_calls', filter: 'group_id=eq.' + groupId }, () => {
        void getActiveGroupCall(groupId).then(setActiveGroupCall).catch(() => {});
      })
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [groupId]);

  // Realtime message updates
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel('group-chat-' + groupId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages', filter: 'group_id=eq.' + groupId }, () => {
        void getGroupMessages(groupId).then(setMessages).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: 'group_id=eq.' + groupId }, () => {
        void getGroupMembers(groupId).then(setMembers).catch(() => {});
      })
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [groupId]);

  // Auto-scroll on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // Auto-join call if navigated with autoJoin=1
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('autoJoin') === '1' && group && callPanelRef.current) {
      const callKind = (params.get('kind') as 'audio' | 'video') || 'audio';
      navigate(location.pathname, { replace: true, state: location.state });
      void callPanelRef.current.startCall(callKind);
    }
  }, [location.search, group, location.pathname, location.state, navigate]);

  const handleStartCall = useCallback(async (kind: 'audio' | 'video') => {
    setShowInfo(false);
    toast.loading(`Starting group ${kind} call...`, { id: 'starting-call-toast', duration: 3000 });
    try {
      if (callPanelRef.current) {
        await callPanelRef.current.startCall(kind);
        toast.dismiss('starting-call-toast');
      } else {
        toast.error('Call panel is connecting, please tap again in a moment.', { id: 'starting-call-toast' });
      }
    } catch (err: any) {
      console.error('Call start failed:', err);
      toast.error(err?.message || 'Call start nahi hui', { id: 'starting-call-toast' });
    }
  }, []);

  // Member search for adding
  useEffect(() => {
    const query = memberQuery.trim();
    if (!query) { setMemberResults([]); return; }
    const timer = setTimeout(() => {
      const existingIds = members.map(m => m.user_id);
      searchGroupUsers(query, existingIds)
        .then(results => {
          setMemberResults(results);
        })
        .catch(() => setMemberResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [memberQuery, members]);

  const handleContentChange = (value: string) => {
    setContent(value);
    const atIndex = value.lastIndexOf('@');
    if (atIndex === -1) { setMentionQuery(null); return; }
    const prevChar = atIndex > 0 ? value[atIndex - 1] : ' ';
    if (/\s/.test(prevChar)) {
      const textAfter = value.slice(atIndex + 1);
      if (!/\s/.test(textAfter)) { setMentionQuery(textAfter); return; }
    }
    setMentionQuery(null);
  };

  const insertMention = (profile: Profile) => {
    const atIndex = content.lastIndexOf('@');
    if (atIndex === -1) return;
    setContent(content.slice(0, atIndex) + '@' + profile.username + ' ');
    setMentionQuery(null);
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanContent = content.trim();
    if ((!cleanContent && !uploading) || !groupId || sending) return;
    setSending(true);
    try {
      await sendGroupMessage(groupId, cleanContent, replyTo?.id);
      setContent('');
      setReplyTo(null);
      setMentionQuery(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const handleQuickSendEmoji = async (emojiToSend: string) => {
    if (!groupId || sending) return;
    setSending(true);
    try {
      await sendGroupMessage(groupId, emojiToSend);
      await load();
    } catch {
      toast.error('Could not send reaction');
    } finally {
      setSending(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !groupId || uploading) return;
    setUploading(true);
    try {
      await sendGroupFileMessage(groupId, file);
      await load();
      toast.success('File shared');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleReaction = async (message: GroupMessage, reaction: string) => {
    const mine = message.reactions?.find(item => item.user_id === user?.id);
    try {
      await toggleGroupReaction(message.id, reaction, mine);
      setReactionMessage(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reaction update failed');
    }
  };

  const handleAdd = async (profile: Profile) => {
    if (!groupId) return;
    try {
      await addGroupMember(groupId, profile.user_id);
      setMemberQuery('');
      await load();
      toast.success(profile.username + ' added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add member');
    }
  };

  const handlePermissionChange = async (key: keyof GroupPermissions, value: 'everyone' | 'admins') => {
    if (!groupId || !permissions || !canManage) return;
    const previous = permissions;
    const next = { ...permissions, [key]: value };
    setPermissions(next);
    try {
      await updateGroupPermissions(groupId, { [key]: value });
      toast.success('Permissions updated');
    } catch (error) {
      setPermissions(previous);
      toast.error(error instanceof Error ? error.message : 'Could not update permissions');
    }
  };

  const copyInvite = async () => {
    if (!group) return;
    const link = window.location.origin + '/group/join/' + group.invite_token;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied');
    } catch {
      toast.error('Could not copy invite link');
    }
  };

  if (loading) {
    return (
      <MobileLayout hideHeader hideNav>
        <div className="flex min-h-[100dvh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </MobileLayout>
    );
  }

  if (!group || !currentMember) {
    return (
      <MobileLayout hideHeader hideNav>
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center">
          <Users className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium">Group unavailable</p>
          <Button onClick={() => navigate('/chat')}>Back to messages</Button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout hideHeader hideNav>
      <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
        {/* CHAT HEADER (Messenger Style: Back, Group info button, Call 📞, Video 📹, Info ⓘ) */}
        <header className="z-20 flex shrink-0 items-center gap-1 sm:gap-2 border-b border-border bg-card/95 px-2 py-2 backdrop-blur">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full p-2 hover:bg-muted text-foreground transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Center: Tap to open Messenger Group Details */}
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-90 transition-opacity"
          >
            <Avatar profile={group.avatar_url ? ({ avatar_url: group.avatar_url, username: group.name } as Profile) : null} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">{group.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {members.length} members · Active recently
              </span>
            </span>
          </button>

          {/* Call button 📞 */}
          <button
            type="button"
            onClick={() => void handleStartCall('audio')}
            className={`rounded-full p-2 transition-all ${
              activeGroupCall?.kind === 'audio'
                ? 'bg-emerald-500/20 text-emerald-500 ring-2 ring-emerald-500 animate-pulse'
                : 'hover:bg-muted text-sky-500'
            }`}
            aria-label="Audio call"
            title="Start audio call"
          >
            <Phone className="h-5 w-5 fill-sky-500/20" />
          </button>

          {/* Video button 📹 */}
          <button
            type="button"
            onClick={() => void handleStartCall('video')}
            className={`rounded-full p-2 transition-all ${
              activeGroupCall?.kind === 'video'
                ? 'bg-emerald-500/20 text-emerald-500 ring-2 ring-emerald-500 animate-pulse'
                : 'hover:bg-muted text-sky-500'
            }`}
            aria-label="Video call"
            title="Start video call"
          >
            <Video className="h-5 w-5 fill-sky-500/20" />
          </button>

          {/* Messenger Info Button (ⓘ) - Exact Match to Video */}
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="rounded-full p-2 hover:bg-muted text-sky-500 transition-colors"
            aria-label="Conversation details"
            title="Conversation details"
          >
            <Info className="h-5 w-5" />
          </button>
        </header>

        {/* IN-CONVERSATION SEARCH BAR */}
        {showMessageSearch && (
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 animate-in slide-in-from-top-2 duration-150">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={messageQuery}
              onChange={e => setMessageQuery(e.target.value)}
              placeholder="Search in conversation..."
              className="h-8 rounded-lg text-xs bg-background"
            />
            <button
              type="button"
              onClick={() => { setShowMessageSearch(false); setMessageQuery(''); }}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* GROUP CALL CONTROLLER */}
        <GroupCallPanel
          ref={callPanelRef}
          groupId={group.id}
          groupName={group.name}
          groupAvatarUrl={group.avatar_url}
          members={members}
        />

        {/* ACTIVE CALL BANNER */}
        {activeGroupCall && (
          <div className="z-10 flex shrink-0 items-center justify-between gap-3 border-b border-emerald-500/30 bg-emerald-950/40 px-3.5 py-2 backdrop-blur text-emerald-200 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-3 w-3 items-center justify-center shrink-0">
                <span className="absolute h-3 w-3 rounded-full bg-emerald-400 animate-ping opacity-75" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-100 truncate">
                  Group {activeGroupCall.kind === 'video' ? 'video' : 'audio'} call active
                </p>
                <p className="text-[11px] text-emerald-300/80 truncate">
                  Tap Join to connect with group members
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => void handleStartCall(activeGroupCall.kind)}
              className="h-7.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 shadow-sm shadow-emerald-500/30 shrink-0"
            >
              Join
            </Button>
          </div>
        )}

        {/* MESSAGES LIST */}
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-3">
          <div className="mx-auto max-w-sm rounded-xl bg-primary/8 px-3 py-2 text-center text-xs text-muted-foreground">
            Messages in this group are visible only to its members.
          </div>

          {visibleMessages.map(message => {
            const mine = message.sender_id === user?.id;
            const sender = profileMap.get(message.sender_id);
            const replied = message.reply_to_id ? messages.find(item => item.id === message.reply_to_id) : null;
            const displayName = nicknames[message.sender_id] || sender?.username || 'Member';
            const isSingleEmoji = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})$/u.test(message.content.trim());

            return (
              <div key={message.id} className={'group flex items-end gap-2 ' + (mine ? 'justify-end' : 'justify-start')}>
                {!mine && <Avatar profile={sender} size="w-7 h-7" />}
                <div className="relative max-w-[82%]">
                  {!mine && <p className="mb-0.5 px-1 text-[11px] font-medium text-primary">{displayName}</p>}

                  {isSingleEmoji ? (
                    <div id={'group-message-' + message.id} className="text-4xl py-1 px-2 select-none">
                      {message.content.trim()}
                    </div>
                  ) : (
                    <div
                      className={
                        'rounded-2xl px-3 py-2 text-sm ' +
                        (mine ? `rounded-br-sm ${activeTheme.bubble}` : 'rounded-bl-sm bg-muted text-foreground')
                      }
                    >
                      {replied && (
                        <button
                          type="button"
                          onClick={() => document.getElementById('group-message-' + replied.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                          className={
                            'mb-1 block w-full rounded border-l-2 px-2 py-1 text-left text-xs ' +
                            (mine ? 'border-primary-foreground/60 bg-primary-foreground/10' : 'border-primary bg-background/50')
                          }
                        >
                          <span className="block font-medium">Reply</span>
                          <span className="block truncate opacity-75">{replied.content}</span>
                        </button>
                      )}

                      {message.content.startsWith('📎 ') ? (
                        <a
                          id={'group-message-' + message.id}
                          href={message.content.split('\n')[1]}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 break-all underline"
                        >
                          <Paperclip className="h-4 w-4 shrink-0" />
                          {message.content.split('\n')[0].replace('📎 ', '')}
                        </a>
                      ) : (
                        <p id={'group-message-' + message.id} className="break-words">
                          {renderMessageContent(message.content, mine, myProfile?.username)}
                        </p>
                      )}

                      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                        <span>
                          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {message.edited_at && <span>edited</span>}
                        {mine && <Check className="h-3 w-3" />}
                      </div>
                    </div>
                  )}

                  {(message.reactions?.length || 0) > 0 && (
                    <div className="-mt-2 ml-2 flex w-fit gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-xs shadow-sm">
                      {message.reactions?.map(reaction => (
                        <span key={reaction.user_id}>{reaction.reaction}</span>
                      ))}
                    </div>
                  )}

                  {reactionMessage === message.id && (
                    <div className="absolute bottom-full right-0 z-10 mb-1 flex gap-1 rounded-full border border-border bg-card p-1 shadow-xl animate-in zoom-in-95">
                      {REACTIONS.map(reaction => (
                        <button
                          type="button"
                          key={reaction}
                          onClick={() => void handleReaction(message, reaction)}
                          className="rounded-full p-1.5 text-base hover:bg-muted active:scale-125 transition-transform"
                        >
                          {reaction}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-0.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setReplyTo(message)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label="Reply"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReactionMessage(reactionMessage === message.id ? null : message.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label="React"
                    >
                      <Smile className="h-3.5 w-3.5" />
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void (message.id ? pinGroupMessage(group.id, message.id).then(load).catch(error => toast.error(error.message)) : null)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        aria-label="Pin"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* MENTIONS SUGGESTION POPUP */}
        {mentionSuggestions.length > 0 && (
          <div className="z-20 border-t border-border bg-card p-2 shadow-lg">
            <div className="flex gap-2 overflow-x-auto">
              {mentionSuggestions.map(member => (
                <button
                  type="button"
                  key={member.user_id}
                  onClick={() => member.profile && insertMention(member.profile)}
                  className="flex items-center gap-2 rounded-full border border-border px-3 py-1 hover:bg-muted shrink-0 text-xs font-medium"
                >
                  <Avatar profile={member.profile} size="w-5 h-5" />
                  <span>@{member.profile?.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* REPLY PREVIEW BAR */}
        {replyTo && (
          <div className="z-20 flex items-center justify-between border-t border-border bg-muted/60 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1 truncate pr-2">
              <span className="font-semibold text-primary">
                Replying to @{profileMap.get(replyTo.sender_id)?.username || 'Member'}:{' '}
              </span>
              <span className="text-muted-foreground truncate">{replyTo.content}</span>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="rounded p-1 hover:bg-muted text-muted-foreground"
              aria-label="Cancel reply"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* BOTTOM MESSAGE INPUT BAR (Messenger Style with Quick Emoji) */}
        <form
          onSubmit={handleSend}
          className="z-20 flex shrink-0 items-center gap-2 border-t border-border bg-card/95 px-3 py-2 backdrop-blur"
        >
          <label
            className="cursor-pointer rounded-full p-2 hover:bg-muted text-sky-500 hover:text-sky-600 transition-colors"
            title="Attach file"
          >
            <Paperclip className="h-5 w-5" />
            <input type="file" className="hidden" onChange={handleFile} disabled={uploading || sending} />
          </label>

          <div className="relative flex-1">
            <Input
              value={content}
              onChange={event => handleContentChange(event.target.value)}
              placeholder="Type a message..."
              maxLength={2000}
              className="h-10 rounded-full bg-muted/60 border-none px-4 text-sm focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          {content.trim() || uploading ? (
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 rounded-full shrink-0 bg-sky-500 hover:bg-sky-600 text-white shadow-sm"
              disabled={(!content.trim() && !uploading) || sending || uploading}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => void handleQuickSendEmoji(groupEmoji)}
              className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted active:scale-125 transition-transform text-2xl select-none"
              title={`Send ${groupEmoji}`}
            >
              {groupEmoji}
            </button>
          )}
        </form>

        {/* 5. MESSENGER GROUP SETTINGS MODAL / PAGE (Exact Replica of Video 00:09) */}
        <MessengerGroupSettings
          isOpen={showInfo}
          onClose={() => setShowInfo(false)}
          group={group}
          members={members}
          currentMember={currentMember}
          pinnedMessages={pinnedMessages}
          mediaItems={mediaItems}
          permissions={permissions}
          onStartCall={handleStartCall}
          onUpdateGroup={async updates => {
            if (!groupId) return;
            await updateGroup(groupId, updates);
            setGroup(curr => (curr ? { ...curr, ...updates } : curr));
          }}
          onAvatarUpload={async file => {
            if (!groupId) return;
            const url = await uploadGroupAvatar(groupId, file);
            setGroup(curr => (curr ? { ...curr, avatar_url: url } : curr));
            toast.success('Group photo updated');
          }}
          onAddMember={handleAdd}
          onRemoveMember={async userId => {
            if (!groupId) return;
            await removeGroupMember(groupId, userId);
            await load();
            toast.success('Member removed');
          }}
          onPermissionChange={handlePermissionChange}
          onUnpinMessage={async messageId => {
            await unpinGroupMessage(messageId);
            await load();
            toast.success('Message unpinned');
          }}
          onLeaveGroup={async () => {
            if (!groupId) return;
            await leaveGroup(groupId);
            navigate('/chat');
          }}
          onCopyInvite={copyInvite}
          onJumpToMessage={id => {
            document.getElementById('group-message-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onStartSearch={() => {
            setShowMessageSearch(true);
          }}
          groupTheme={groupTheme}
          onThemeChange={key => {
            setGroupTheme(key);
            if (groupId) localStorage.setItem(`group_theme_${groupId}`, key);
            toast.success('Theme updated');
          }}
          groupEmoji={groupEmoji}
          onEmojiChange={emoji => {
            setGroupEmoji(emoji);
            if (groupId) localStorage.setItem(`group_emoji_${groupId}`, emoji);
            toast.success(`Quick reaction set to ${emoji}`);
          }}
          nicknames={nicknames}
          onNicknameChange={(userId, nick) => {
            setNicknames(prev => {
              const updated = { ...prev, [userId]: nick };
              if (groupId) localStorage.setItem(`group_nicknames_${groupId}`, JSON.stringify(updated));
              return updated;
            });
            toast.success('Nickname updated');
          }}
          memberQuery={memberQuery}
          setMemberQuery={setMemberQuery}
          memberResults={memberResults}
        />
      </div>
    </MobileLayout>
  );
};

export default GroupChatPage;
