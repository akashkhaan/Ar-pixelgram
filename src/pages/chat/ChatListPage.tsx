import React, { useState, useEffect, useCallback, useMemo } from 'react';
import MobileLayout from '@/components/layouts/MobileLayout';
import PullToRefresh from '@/components/common/PullToRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { withTimeout } from '@/lib/withTimeout';
import { getMutualFollows, getMessages, getUnreadCount, getMessagedProfiles } from '@/services/api';
import { getMyGroups, getActiveGroupCallsForUser } from '@/services/groups';
import { supabase } from '@/db/supabase';
import type { GroupCall } from '@/types/groups';
import type { Profile, Message } from '@/types/types';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Loader2, BadgeCheck, ArrowLeft, Plus, Users, Phone, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConversationItem {
  profile: Profile;
  lastMessage: Message | null;
  unreadCount: number;
}

const ChatListPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof getMyGroups>>>([]);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [activeGroupCalls, setActiveGroupCalls] = useState<Record<string, GroupCall>>({});

  // Ignored / Filtered groups (Messenger style)
  const [ignoredGroupIds, setIgnoredGroupIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ignored_group_ids') || '[]');
    } catch {
      return [];
    }
  });
  const [chatTab, setChatTab] = useState<'chats' | 'requests'>('chats');

  // Keep ignored IDs synchronized across tabs / actions
  useEffect(() => {
    const handleStorage = () => {
      try {
        setIgnoredGroupIds(JSON.parse(localStorage.getItem('ignored_group_ids') || '[]'));
      } catch {}
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [mutuals, messaged, groupList] = await withTimeout(
        Promise.all([
          getMutualFollows(user.id),
          getMessagedProfiles(user.id),
          getMyGroups(user.id).catch(() => []),
        ]),
        20000
      );
      setGroups(groupList);
      const groupIds = groupList.map(g => g.group.id);
      if (groupIds.length > 0) {
        const calls = await getActiveGroupCallsForUser(groupIds).catch(() => ({}));
        setActiveGroupCalls(calls);
      }
      const seen = new Set<string>();
      const combined: Profile[] = [];
      for (const p of [...mutuals, ...messaged]) {
        if (p && !seen.has(p.user_id)) {
          seen.add(p.user_id);
          combined.push(p);
        }
      }
      const convs = await Promise.all(
        combined.map(async p => {
          const msgs = await getMessages(user.id, p.user_id);
          const lastMessage = msgs[msgs.length - 1] || null;
          const unreadCount = await getUnreadCount(user.id, p.user_id);
          return { profile: p, lastMessage, unreadCount };
        })
      );
      setConversations(
        convs.sort((a, b) => {
          if (!a.lastMessage && !b.lastMessage) return 0;
          if (!a.lastMessage) return 1;
          if (!b.lastMessage) return -1;
          return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
        })
      );
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription for group call status updates
  useEffect(() => {
    if (!groups.length) return;
    const channel = supabase.channel('chat-list-group-calls');
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_calls' },
        () => {
          const groupIds = groups.map(g => g.group.id);
          if (groupIds.length > 0) {
            void getActiveGroupCallsForUser(groupIds).then(setActiveGroupCalls).catch(() => {});
          }
        }
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [groups]);

  const activeGroups = useMemo(
    () => groups.filter(({ group }) => !ignoredGroupIds.includes(group.id)),
    [groups, ignoredGroupIds]
  );

  const requestedGroups = useMemo(
    () => groups.filter(({ group }) => ignoredGroupIds.includes(group.id)),
    [groups, ignoredGroupIds]
  );

  const handleUnignoreGroup = (groupId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = ignoredGroupIds.filter(id => id !== groupId);
    setIgnoredGroupIds(next);
    localStorage.setItem('ignored_group_ids', JSON.stringify(next));
    toast.success('Group restored to main chats');
    if (next.length === 0) setChatTab('chats');
  };

  return (
    <MobileLayout hideHeader hideNav>
      <PullToRefresh onRefresh={load}>
        <div className="page-transition">
          {/* Header */}
          <div className="sticky top-0 z-30 flex items-center justify-between px-3 py-3 bg-background/95 backdrop-blur border-b border-border">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/home')}
                aria-label="Back"
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/60 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
              <h2 className="text-xl font-bold text-foreground">Messages</h2>
            </div>
          </div>

          {/* Messenger Style Filter Tabs (Chats vs Message Requests) */}
          {requestedGroups.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => setChatTab('chats')}
                className={`px-3 py-1.5 rounded-full transition-all ${
                  chatTab === 'chats'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Chats ({conversations.length + activeGroups.length})
              </button>

              <button
                type="button"
                onClick={() => setChatTab('requests')}
                className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                  chatTab === 'requests'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>Message Requests</span>
                <span className="rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.2 text-[10px] font-bold">
                  {requestedGroups.length}
                </span>
              </button>
            </div>
          )}

          {/* MAIN CHATS TAB CONTENT */}
          {chatTab === 'chats' && (
            <>
              {/* Groups List */}
              {activeGroups.length > 0 && (
                <div className="border-b border-border divide-y divide-border/40">
                  {activeGroups.map(({ group, member_count }) => {
                    const activeCall = activeGroupCalls[group.id];
                    return (
                      <div
                        key={group.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors"
                      >
                        <Link to={'/group/' + group.id} className="relative shrink-0">
                          {group.avatar_url ? (
                            <img src={group.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                              <Users className="h-5 w-5" />
                            </div>
                          )}
                          {activeCall && (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center">
                              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping absolute" />
                              <span className="h-3.5 w-3.5 rounded-full bg-emerald-600 ring-2 ring-background relative flex items-center justify-center">
                                <Phone className="h-2 w-2 text-white" />
                              </span>
                            </span>
                          )}
                        </Link>
                        <Link to={'/group/' + group.id} className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
                            {activeCall && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {activeCall.kind === 'video' ? 'Video call' : 'Audio call'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{member_count} members</p>
                        </Link>
                        {activeCall && (
                          <button
                            type="button"
                            onClick={() => navigate('/group/' + group.id + '?autoJoin=1&kind=' + activeCall.kind)}
                            className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1 text-xs font-semibold shadow-sm transition-transform active:scale-95 shrink-0"
                          >
                            Join
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Direct Conversations List */}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : conversations.length === 0 && activeGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <MessageCircle className="w-16 h-16 text-muted-foreground mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">No messages yet</h3>
                  <p className="text-sm text-muted-foreground text-pretty">
                    Follow someone and have them follow back to start chatting.
                  </p>
                </div>
              ) : (
                <div>
                  {conversations.map(({ profile, lastMessage, unreadCount }) => (
                    <Link
                      key={profile.id}
                      to={`/chat/${profile.user_id}`}
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 transition-colors border-b border-border/50"
                    >
                      <div className="shrink-0 relative">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.username}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-primary font-bold text-lg">
                              {profile.username[0]?.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-semibold text-sm text-foreground truncate">{profile.username}</span>
                            {profile.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </div>
                          {lastMessage && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {new Date(lastMessage.created_at).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                            {lastMessage ? lastMessage.content : 'Start a conversation'}
                          </p>
                          {unreadCount > 0 && (
                            <span className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-bold">
                              {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {/* MESSAGE REQUESTS / FILTERED TAB CONTENT */}
          {chatTab === 'requests' && (
            <div className="divide-y divide-border/40">
              <div className="p-4 bg-muted/20 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-0.5">Filtered Conversations</p>
                <p>
                  You won&apos;t receive notifications from these groups. You can open them to read or un-ignore them anytime.
                </p>
              </div>

              {requestedGroups.map(({ group, member_count }) => (
                <div
                  key={group.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors"
                >
                  <Link to={'/group/' + group.id} className="relative shrink-0">
                    {group.avatar_url ? (
                      <img src={group.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Users className="h-5 w-5" />
                      </div>
                    )}
                  </Link>
                  <Link to={'/group/' + group.id} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{member_count} members · Ignored</p>
                  </Link>
                  <button
                    type="button"
                    onClick={e => handleUnignoreGroup(group.id, e)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold shrink-0 transition-colors"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <span>Un-ignore</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Create Group Floating Button */}
          <div className="fixed bottom-6 right-4 z-40">
            <button
              type="button"
              onClick={() => setShowGroupMenu(value => !value)}
              aria-label="Create group"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background hover:bg-primary/90"
            >
              <Plus className="h-5 w-5" />
            </button>
            {showGroupMenu && (
              <div className="absolute bottom-14 right-0 w-44 rounded-xl border border-border bg-card p-1 shadow-xl">
                <Link
                  to="/groups/new"
                  onClick={() => setShowGroupMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
                >
                  <Users className="h-4 w-4" />
                  Create group
                </Link>
              </div>
            )}
          </div>
        </div>
      </PullToRefresh>
    </MobileLayout>
  );
};

export default ChatListPage;
