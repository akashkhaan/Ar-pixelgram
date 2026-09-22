import { useGroupCall } from "@/contexts/GroupCallContext";
import {
  ArrowLeft,
  BadgeCheck,
  Edit3,
  Loader2,
  MessageCircle,
  Music2,
  Phone,
  Plus,
  Search,
  Undo2,
  Users,
  Video,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import PullToRefresh from "@/components/common/PullToRefresh";
import MobileLayout from "@/components/layouts/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/db/supabase";
import useGoBack from "@/hooks/use-go-back";
import { withTimeout } from "@/lib/withTimeout";
import {
  getMessagedProfiles,
  getMessages,
  getMutualFollows,
  getUnreadCount,
} from "@/services/api";
import { getActiveGroupCallsForUser, getMyGroups } from "@/services/groups";
import {
  getFeedNotes,
  type UserNote,
} from "@/services/notes";
import CreateNoteModal from "@/components/chat/CreateNoteModal";
import ViewNoteModal from "@/components/chat/ViewNoteModal";
import type { GroupCall } from "@/types/groups";
import type { Message, Profile } from "@/types/types";

interface ConversationItem {
  profile: Profile;
  lastMessage: Message | null;
  unreadCount: number;
}

const ChatListPage: React.FC = () => {
  const { user, profile: myProfile } = useAuth();
  const groupCall = useGroupCall();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const goBack = useGoBack("/home");

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof getMyGroups>>>([]);
  const [activeGroupCalls, setActiveGroupCalls] = useState<Record<string, GroupCall>>({});
  const [chatTab, setChatTab] = useState<"primary" | "general" | "requests">("primary");
  const [searchQuery, setSearchQuery] = useState("");
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  // Instagram Notes state
  const [myNote, setMyNote] = useState<UserNote | null>(null);
  const [friendNotes, setFriendNotes] = useState<UserNote[]>([]);
  const [createNoteOpen, setCreateNoteOpen] = useState(false);
  const [activeViewingNote, setActiveViewingNote] = useState<UserNote | null>(null);

  const [ignoredGroupIds, setIgnoredGroupIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("ignored_group_ids") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleStorage = () => {
      try {
        setIgnoredGroupIds(JSON.parse(localStorage.getItem("ignored_group_ids") || "[]"));
      } catch {}
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    try {
      const { myNote: mine, friendNotes: friends } = await getFeedNotes(user.id);
      setMyNote(mine);
      setFriendNotes(friends);

      // Deep link support if opened via notification ?noteId=xyz
      const targetNoteId = searchParams.get("noteId");
      if (targetNoteId) {
        if (mine && mine.id === targetNoteId) {
          setActiveViewingNote(mine);
        } else {
          const found = friends.find((fn) => fn.id === targetNoteId);
          if (found) setActiveViewingNote(found);
        }
      }
    } catch (e) {
      console.warn("Could not load notes", e);
    }
  }, [user, searchParams]);

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
      const groupIds = groupList.map((g) => g.group.id);
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
        combined.map(async (p) => {
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
          return (
            new Date(b.lastMessage.created_at).getTime() -
            new Date(a.lastMessage.created_at).getTime()
          );
        })
      );

      // Load notes
      loadNotes();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [user, loadNotes]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription for group call status updates
  useEffect(() => {
    if (!groups.length) return;
    const channel = supabase.channel("chat-list-group-calls");
    groups.forEach(({ group }) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_calls",
          filter: `group_id=eq.${group.id}`,
        },
        async () => {
          const groupIds = groups.map((g) => g.group.id);
          const calls = await getActiveGroupCallsForUser(groupIds).catch(() => ({}));
          setActiveGroupCalls(calls);
        }
      );
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groups]);

  // Active vs Requested groups
  const activeGroups = useMemo(
    () => groups.filter((g) => !ignoredGroupIds.includes(g.group.id)),
    [groups, ignoredGroupIds]
  );
  const requestedGroups = useMemo(
    () => groups.filter((g) => ignoredGroupIds.includes(g.group.id)),
    [groups, ignoredGroupIds]
  );

  const handleUnignoreGroup = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = ignoredGroupIds.filter((id) => id !== groupId);
    setIgnoredGroupIds(next);
    localStorage.setItem("ignored_group_ids", JSON.stringify(next));
    toast.success("Group restored to main chats");
    if (next.length === 0) setChatTab("primary");
  };

  // Filter conversations & groups by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.profile.username?.toLowerCase().includes(q) ||
        c.profile.full_name?.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return activeGroups;
    const q = searchQuery.toLowerCase();
    return activeGroups.filter((g) => g.group.name?.toLowerCase().includes(q));
  }, [activeGroups, searchQuery]);

  const formatMessageTime = (dateStr?: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <MobileLayout hideHeader hideNav>
      <style>{`
        .msg-avatar-container {
          width: 50px !important;
          height: 50px !important;
          min-width: 50px !important;
          max-width: 50px !important;
          min-height: 50px !important;
          max-height: 50px !important;
          border-radius: 9999px !important;
          overflow: hidden !important;
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        .msg-avatar-container img {
          width: 50px !important;
          height: 50px !important;
          min-width: 50px !important;
          max-width: 50px !important;
          min-height: 50px !important;
          max-height: 50px !important;
          object-fit: cover !important;
          border-radius: 9999px !important;
          display: block !important;
        }
        .rail-avatar-container {
          width: 56px !important;
          height: 56px !important;
          min-width: 56px !important;
          max-width: 56px !important;
          min-height: 56px !important;
          max-height: 56px !important;
          border-radius: 9999px !important;
          overflow: hidden !important;
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        .rail-avatar-container img {
          width: 56px !important;
          height: 56px !important;
          min-width: 56px !important;
          max-width: 56px !important;
          min-height: 56px !important;
          max-height: 56px !important;
          object-fit: cover !important;
          border-radius: 9999px !important;
          display: block !important;
        }
      `}</style>
      <PullToRefresh onRefresh={load}>
        <div className="page-transition pb-20 bg-background min-h-screen">
          {/* Top Header */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Back"
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-foreground"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xl font-bold tracking-tight text-foreground">
                    {myProfile?.username || "Messages"}
                  </h1>
                  {myProfile?.is_verified && (
                    <BadgeCheck className="w-4 h-4 text-primary fill-primary/20" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/people")}
                  aria-label="New message"
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-foreground"
                >
                  <Edit3 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messenger-style Search Bar */}
            <div className="mt-3 relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full h-9 pl-10 pr-4 rounded-xl bg-muted/60 hover:bg-muted/80 focus:bg-muted/90 text-sm text-foreground placeholder:text-muted-foreground transition-all outline-none focus:ring-1 focus:ring-border"
              />
            </div>
          </div>

          {/* Instagram-Style Notes & Friends Rail */}
          {!searchQuery && (
            <div className="px-4 py-3 border-b border-border/30 overflow-x-auto no-scrollbar flex items-start gap-4">
              {/* My Note Item */}
              <div className="flex flex-col items-center shrink-0 w-18 text-center cursor-pointer group">
                <div
                  className="relative flex flex-col items-center"
                  onClick={() => {
                    if (myNote) {
                      setActiveViewingNote(myNote);
                    } else {
                      setCreateNoteOpen(true);
                    }
                  }}
                >
                  {/* Thought bubble if note exists, otherwise prompt badge */}
                  {myNote ? (
                    <div className="relative mb-2 px-2.5 py-1 bg-card border border-border/80 rounded-2xl shadow-xs max-w-[84px] text-center">
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-card border-r border-b border-border/80 rotate-45" />
                      {myNote.music_track && (
                        <div className="flex items-center justify-center gap-1 text-[9px] text-primary font-bold truncate">
                          <Music2 className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{myNote.music_track.title}</span>
                        </div>
                      )}
                      <p className="text-[11px] font-medium text-foreground truncate max-w-[76px] leading-tight">
                        {myNote.text}
                      </p>
                    </div>
                  ) : (
                    <div className="relative mb-2 px-2 py-0.5 rounded-full bg-card border border-border/60 text-[10px] text-muted-foreground font-medium shadow-xs truncate max-w-[76px]">
                      Share a thought...
                    </div>
                  )}

                  {/* Avatar */}
                  <div className="relative">
                    <div className="rail-avatar-container ring-2 ring-border/50 bg-muted">
                      {myProfile?.avatar_url ? (
                        <img
                          src={myProfile.avatar_url}
                          alt="You"
                        />
                      ) : (
                        <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                          <span className="text-primary font-bold text-base">
                            {myProfile?.username?.[0]?.toUpperCase() || "Y"}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Plus badge if no note */}
                    {!myNote && (
                      <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs ring-2 ring-background font-bold shadow-xs">
                        +
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground truncate w-full mt-1">
                  Your note
                </span>
              </div>

              {/* Friend Notes (Followers / Following who have posted a note) */}
              {friendNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => setActiveViewingNote(note)}
                  className="flex flex-col items-center shrink-0 w-18 text-center cursor-pointer group"
                >
                  <div className="relative flex flex-col items-center">
                    {/* Note Bubble */}
                    <div className="relative mb-2 px-2.5 py-1 bg-card border border-border/80 rounded-2xl shadow-xs max-w-[84px] text-center">
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-card border-r border-b border-border/80 rotate-45" />
                      {note.music_track && (
                        <div className="flex items-center justify-center gap-1 text-[9px] text-primary font-bold truncate">
                          <Music2 className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{note.music_track.title}</span>
                        </div>
                      )}
                      <p className="text-[11px] font-medium text-foreground truncate max-w-[76px] leading-tight">
                        {note.text}
                      </p>
                    </div>

                    {/* Avatar */}
                    <div className="rail-avatar-container ring-2 ring-primary/40 group-hover:ring-primary transition-all bg-muted">
                      {note.profile?.avatar_url ? (
                        <img
                          src={note.profile.avatar_url}
                          alt={note.profile.username}
                        />
                      ) : (
                        <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                          <span className="text-primary font-bold text-base">
                            {note.profile?.username?.[0]?.toUpperCase() || "?"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] text-foreground/80 font-medium truncate w-full mt-1">
                    {note.profile?.username}
                  </span>
                </div>
              ))}

              {/* Regular mutual friends who haven't posted a note */}
              {conversations
                .filter(
                  ({ profile }) =>
                    !friendNotes.some((fn) => fn.user_id === profile.user_id)
                )
                .slice(0, 6)
                .map(({ profile }) => (
                  <div
                    key={profile.id}
                    onClick={() => navigate(`/chat/${profile.user_id}`)}
                    className="flex flex-col items-center shrink-0 w-16 text-center cursor-pointer group mt-6"
                  >
                    <div className="rail-avatar-container ring-2 ring-transparent group-hover:ring-primary/40 transition-all bg-muted">
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.username}
                        />
                      ) : (
                        <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                          <span className="text-primary font-bold text-base">
                            {profile.username?.[0]?.toUpperCase() || "?"}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-foreground/80 truncate w-full mt-1">
                      {profile.username}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Tab Navigation (Primary, General, Requests) */}
          <div className="flex items-center justify-between px-4 border-b border-border/40 text-sm font-semibold">
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => setChatTab("primary")}
                className={`py-3 relative transition-colors ${
                  chatTab === "primary"
                    ? "text-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>Chats</span>
                {chatTab === "primary" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setChatTab("general")}
                className={`py-3 relative transition-colors ${
                  chatTab === "general"
                    ? "text-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>General</span>
                {chatTab === "general" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
                )}
              </button>
            </div>

            {requestedGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setChatTab("requests")}
                className={`py-3 relative transition-colors flex items-center gap-1.5 ${
                  chatTab === "requests"
                    ? "text-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>Requests</span>
                <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.2 text-[10px] font-bold">
                  {requestedGroups.length}
                </span>
                {chatTab === "requests" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
                )}
              </button>
            )}
          </div>

          {/* MAIN CHATS CONTENT */}
          {chatTab !== "requests" && (
            <div>
              {/* Groups (Messenger style list item) */}
              {filteredGroups.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Groups
                  </div>
                  <div className="divide-y divide-border/30">
                    {filteredGroups.map(({ group, member_count }) => {
                      const activeCall = activeGroupCalls[group.id];
                      const isCurrentUserInThisCall =
                        groupCall.active && groupCall.groupId === group.id;

                      return (
                        <div
                          key={group.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                        >
                          <Link to={"/group/" + group.id} className="relative shrink-0">
                            <div className="msg-avatar-container ring-1 ring-border/40 bg-muted">
                              {group.avatar_url ? (
                                <img
                                  src={group.avatar_url}
                                  alt={group.name}
                                />
                              ) : (
                                <div className="w-full h-full bg-primary/15 text-primary flex items-center justify-center">
                                  <Users className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            {(isCurrentUserInThisCall || !!activeCall) && (
                              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center z-10">
                                <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping absolute" />
                                <span className="h-3.5 w-3.5 rounded-full bg-emerald-600 ring-2 ring-background relative flex items-center justify-center">
                                  <Phone className="h-2 w-2 text-white" />
                                </span>
                              </span>
                            )}
                          </Link>
                          <Link to={"/group/" + group.id} className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {group.name}
                              </p>
                              {isCurrentUserInThisCall ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-500 animate-pulse">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  In call
                                </span>
                              ) : activeCall ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  {activeCall.kind === "video" ? "Video call" : "Audio call"}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {member_count} members
                            </p>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Direct Messages List */}
              {loading && filteredConversations.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredConversations.length === 0 && filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <MessageCircle className="w-16 h-16 text-muted-foreground/60 mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">No messages yet</h3>
                  <p className="text-sm text-muted-foreground text-pretty max-w-xs">
                    Search for friends or tap the edit icon above to start chatting.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {filteredConversations.map(({ profile, lastMessage, unreadCount }) => (
                    <Link
                      key={profile.id}
                      to={`/chat/${profile.user_id}`}
                      className="flex items-center gap-3.5 px-4 py-3 hover:bg-muted/40 transition-colors group"
                    >
                      {/* Avatar */}
                      <div className="shrink-0 relative">
                        <div className="msg-avatar-container ring-1 ring-border/40 bg-muted">
                          {profile.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt={profile.username}
                            />
                          ) : (
                            <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                              <span className="text-primary font-bold text-lg">
                                {profile.username[0]?.toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Info & Last Message */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-sm truncate ${
                                unreadCount > 0
                                  ? "font-bold text-foreground"
                                  : "font-semibold text-foreground"
                              }`}
                            >
                              {profile.full_name || profile.username}
                            </span>
                            {profile.is_verified && (
                              <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0 fill-primary/20" />
                            )}
                          </div>
                          {lastMessage && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatMessageTime(lastMessage.created_at)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`text-xs truncate flex-1 min-w-0 ${
                              unreadCount > 0
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {lastMessage ? lastMessage.content : "Sent a message"}
                          </p>
                          {unreadCount > 0 && (
                            <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>

                      {/* Video action icon */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/chat/${profile.user_id}`);
                        }}
                        className="text-muted-foreground/70 hover:text-foreground shrink-0 p-2 rounded-full hover:bg-muted/60 transition-colors"
                        title="Send photo"
                      >
                        <Video className="w-5 h-5" />
                      </button>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REQUESTS TAB CONTENT */}
          {chatTab === "requests" && (
            <div className="divide-y divide-border/30">
              {requestedGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <p className="text-sm text-muted-foreground">No message requests</p>
                </div>
              ) : (
                requestedGroups.map(({ group, member_count }) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <Link to={"/group/" + group.id} className="relative shrink-0">
                      <div className="msg-avatar-container ring-1 ring-border/40 bg-muted">
                        {group.avatar_url ? (
                          <img
                            src={group.avatar_url}
                            alt={group.name}
                          />
                        ) : (
                          <div className="w-full h-full bg-primary/15 text-primary flex items-center justify-center">
                            <Users className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                    </Link>
                    <Link to={"/group/" + group.id} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {group.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member_count} members · Ignored
                      </p>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => handleUnignoreGroup(group.id, e)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold shrink-0 transition-colors"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      <span>Un-ignore</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Floating Action Button for Create Group */}
          <div className="fixed bottom-6 right-4 z-40">
            <button
              type="button"
              onClick={() => setShowGroupMenu((v) => !v)}
              aria-label="Create group"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background hover:bg-primary/90 active:scale-95 transition-all"
            >
              <Plus className="h-5 w-5" />
            </button>
            {showGroupMenu && (
              <div className="absolute bottom-14 right-0 w-44 rounded-xl border border-border bg-card p-1 shadow-xl">
                <Link
                  to="/groups/new"
                  onClick={() => setShowGroupMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <Users className="h-4 w-4" />
                  Create group
                </Link>
              </div>
            )}
          </div>

          {/* Create Note Modal */}
          {user && (
            <CreateNoteModal
              open={createNoteOpen}
              onClose={() => setCreateNoteOpen(false)}
              currentUserId={user.id}
              myProfile={myProfile}
              existingNote={myNote}
              onNoteCreated={(newNote) => {
                setMyNote(newNote);
                loadNotes();
              }}
            />
          )}

          {/* View Note Modal */}
          {user && (
            <ViewNoteModal
              open={!!activeViewingNote}
              onClose={() => setActiveViewingNote(null)}
              note={activeViewingNote}
              currentUserId={user.id}
              isOwnNote={activeViewingNote?.user_id === user.id}
              onNoteDeleted={() => {
                setMyNote(null);
                loadNotes();
              }}
            />
          )}
        </div>
      </PullToRefresh>
    </MobileLayout>
  );
};

export default ChatListPage;
