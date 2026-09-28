import { useGroupCall } from "@/contexts/GroupCallContext";
import {
  ArrowLeft,
  BadgeCheck,
  Copy,
  Edit3,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  Music2,
  Phone,
  Plus,
  Search,
  Undo2,
  UserPlus,
  Users,
  Video,
  X,
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
  copyGroupFacebookUrlToClipboard,
  copyGroupUidToClipboard,
  getGroupNumericUid,
} from "@/services/groupUid";
import {
  getFeedNotes,
  NoteAudioManager,
  resolveNoteTrackPreview,
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

  const handleOpenNote = (note: UserNote) => {
    setActiveViewingNote(note);
    if (note.music_track) {
      if (note.music_track.preview_url) {
        NoteAudioManager.play(
          note.music_track.preview_url,
          note.music_track.start_ms || 0
        );
      } else {
        // Resolve immediately and start playback
        resolveNoteTrackPreview(note.music_track).then((res) => {
          if (res.previewUrl) {
            note.music_track!.preview_url = res.previewUrl;
            if (res.artwork) note.music_track!.artwork = res.artwork;
            NoteAudioManager.play(
              res.previewUrl,
              note.music_track?.start_ms || 0
            );
          }
        });
      }
    } else {
      NoteAudioManager.stop();
    }
  };

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
          handleOpenNote(mine);
        } else {
          const found = friends.find((fn) => fn.id === targetNoteId);
          if (found) handleOpenNote(found);
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
          width: 52px !important;
          height: 52px !important;
          min-width: 52px !important;
          max-width: 52px !important;
          min-height: 52px !important;
          max-height: 52px !important;
          border-radius: 9999px !important;
          overflow: hidden !important;
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        .msg-avatar-container img {
          width: 52px !important;
          height: 52px !important;
          min-width: 52px !important;
          max-width: 52px !important;
          min-height: 52px !important;
          max-height: 52px !important;
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
        <div className="page-transition pb-24 bg-background min-h-screen">
          {/* Top Header (Glassmorphic & Sleek) */}
          <div className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border/40 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Back"
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/80 active:scale-95 transition-all text-foreground"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-foreground">
                    {myProfile?.username || "Messages"}
                  </h1>
                  {myProfile?.is_verified && (
                    <BadgeCheck className="w-4 h-4 text-sky-500 fill-sky-500/20" />
                  )}
                </div>
              </div>

              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGroupMenu((v) => !v)}
                  aria-label="New chat or group"
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-all text-foreground ${
                    showGroupMenu
                      ? "bg-primary/20 text-primary scale-105 shadow-xs"
                      : "hover:bg-muted/80 active:scale-95"
                  }`}
                >
                  <Edit3 className="w-5 h-5" />
                </button>
                {showGroupMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowGroupMenu(false)}
                    />
                    <div className="absolute top-11 right-0 w-52 rounded-2xl border border-border/70 bg-card/95 backdrop-blur-xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                      <Link
                        to="/people"
                        onClick={() => setShowGroupMenu(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                          <UserPlus className="h-4 w-4" />
                        </div>
                        <span>New chat</span>
                      </Link>
                      <Link
                        to="/groups/new"
                        onClick={() => setShowGroupMenu(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                          <Users className="h-4 w-4" />
                        </div>
                        <span>Create group</span>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Modern Search Bar */}
            <div className="mt-3 relative flex items-center bg-muted/50 hover:bg-muted/70 focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 border border-border/40 rounded-2xl transition-all duration-200">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages or friends..."
                className="w-full h-9.5 pl-10 pr-9 rounded-2xl bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Instagram-Style Notes & Friends Rail */}
          {!searchQuery && (
            <div className="px-4 py-3.5 border-b border-border/30 overflow-x-auto no-scrollbar flex items-start gap-4 bg-muted/10">
              {/* My Note Item */}
              <div className="flex flex-col items-center shrink-0 w-[78px] text-center cursor-pointer group">
                <div
                  className="relative flex flex-col items-center"
                  onClick={() => {
                    if (myNote) {
                      handleOpenNote(myNote);
                    } else {
                      setCreateNoteOpen(true);
                    }
                  }}
                >
                  {/* Thought bubble if note exists, otherwise prompt badge */}
                  {myNote ? (
                    <div className="relative mb-2.5 px-3 py-1.5 bg-card/95 backdrop-blur-md border border-border/70 rounded-[18px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] max-w-[88px] text-center transform transition-transform group-hover:scale-105">
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-card border-r border-b border-border/70 rotate-45" />
                      {myNote.music_track && (
                        <div className="flex items-center justify-center gap-1 text-[9px] text-primary font-bold truncate mb-0.5">
                          <Music2 className="w-2.5 h-2.5 shrink-0 animate-pulse text-pink-500" />
                          <span className="truncate max-w-[62px]">{myNote.music_track.title}</span>
                        </div>
                      )}
                      <p className="text-[11px] font-medium text-foreground truncate max-w-[76px] leading-tight">
                        {myNote.text}
                      </p>
                    </div>
                  ) : (
                    <div className="relative mb-2.5 px-2.5 py-1 rounded-full bg-card/90 backdrop-blur-xs border border-border/60 text-[10px] text-muted-foreground font-medium shadow-2xs truncate max-w-[84px] group-hover:border-primary/50 transition-colors">
                      Share a thought...
                    </div>
                  )}
                  {/* Avatar */}
                  <div className="relative">
                    <div className="rail-avatar-container ring-2 ring-border/50 group-hover:ring-primary/60 transition-all bg-muted shadow-xs">
                      {myProfile?.avatar_url ? (
                        <img
                          src={myProfile.avatar_url}
                          alt="You"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-violet-500/20 to-pink-500/20 flex items-center justify-center">
                          <span className="text-primary font-bold text-base">
                            {myProfile?.username?.[0]?.toUpperCase() || "Y"}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Plus badge if no note */}
                    {!myNote && (
                      <span className="absolute bottom-0 right-0 w-4.5 h-4.5 rounded-full bg-gradient-to-tr from-violet-600 to-pink-500 text-white flex items-center justify-center text-xs ring-2 ring-background font-bold shadow-xs">
                        +
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground truncate w-full mt-1.5 font-medium">
                  Your note
                </span>
              </div>

              {/* Friend Notes */}
              {friendNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => handleOpenNote(note)}
                  className="flex flex-col items-center shrink-0 w-[78px] text-center cursor-pointer group"
                >
                  <div className="relative flex flex-col items-center">
                    {/* Note Bubble */}
                    <div className="relative mb-2.5 px-3 py-1.5 bg-card/95 backdrop-blur-md border border-border/70 rounded-[18px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] max-w-[88px] text-center transform transition-transform group-hover:scale-105">
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-card border-r border-b border-border/70 rotate-45" />
                      {note.music_track && (
                        <div className="flex items-center justify-center gap-1 text-[9px] text-primary font-bold truncate mb-0.5">
                          <Music2 className="w-2.5 h-2.5 shrink-0 animate-pulse text-pink-500" />
                          <span className="truncate max-w-[62px]">{note.music_track.title}</span>
                        </div>
                      )}
                      <p className="text-[11px] font-medium text-foreground truncate max-w-[76px] leading-tight">
                        {note.text}
                      </p>
                    </div>
                    {/* Avatar with Story gradient ring */}
                    <div className="rail-avatar-container ring-2 ring-primary/40 group-hover:ring-primary transition-all bg-muted shadow-xs">
                      {note.profile?.avatar_url ? (
                        <img
                          src={note.profile.avatar_url}
                          alt={note.profile?.username || "Friend"}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-violet-500/20 to-pink-500/20 flex items-center justify-center">
                          <span className="text-primary font-bold text-base">
                            {note.profile?.username?.[0]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-foreground font-medium truncate w-full mt-1.5">
                    {note.profile?.username}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Segmented Pill Navigation Tabs */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 text-sm font-semibold">
            <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setChatTab("primary")}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  chatTab === "primary"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Chats
              </button>
              <button
                type="button"
                onClick={() => setChatTab("general")}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  chatTab === "general"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                General
              </button>
            </div>
            {requestedGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setChatTab("requests")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  chatTab === "requests"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>Requests</span>
                <span className="rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white px-1.5 py-0.2 text-[10px] font-bold shadow-xs">
                  {requestedGroups.length}
                </span>
              </button>
            )}
          </div>

          {/* MAIN CHATS CONTENT */}
          {chatTab !== "requests" && (
            <div className="pt-1">
              {/* Groups List */}
              {filteredGroups.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span>Groups</span>
                  </div>
                  <div className="space-y-1">
                    {filteredGroups.map(({ group, member_count }) => {
                      const activeCall = activeGroupCalls[group.id];
                      const isCurrentUserInThisCall =
                        groupCall.active && groupCall.groupId === group.id;
                      const groupUid = getGroupNumericUid(group.id);
                      const groupUrl = `/messages/t/${groupUid}`;
                      return (
                        <div
                          key={group.id}
                          className="flex items-center gap-3.5 px-4 py-3 mx-2 rounded-2xl hover:bg-muted/50 active:bg-muted/70 transition-all duration-150 group"
                        >
                          <Link to={groupUrl} className="relative shrink-0">
                            <div className="msg-avatar-container ring-1 ring-border/50 bg-muted shadow-xs">
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
                          <Link to={groupUrl} className="min-w-0 flex-1">
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
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>{member_count} members</span>
                              <span>·</span>
                              <span
                                onClick={(e) => copyGroupUidToClipboard(group.id, e)}
                                className="inline-flex items-center gap-1 font-mono text-[10px] text-sky-500 bg-sky-500/10 hover:bg-sky-500/20 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                title="Click to copy Facebook Group UID"
                              >
                                <span>UID: {groupUid}</span>
                                <Copy className="w-2.5 h-2.5" />
                              </span>
                            </div>
                          </Link>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => copyGroupUidToClipboard(group.id, e)}
                              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-sky-500 transition-colors"
                              title="Copy Group UID"
                              aria-label="Copy Group UID"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => copyGroupFacebookUrlToClipboard(group.id, e)}
                              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                              title="Copy Facebook Group URL"
                              aria-label="Copy Facebook Group URL"
                            >
                              <LinkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Direct Messages List */}
              {loading && filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <div className="w-10 h-10 rounded-full border-3 border-primary/30 border-t-primary animate-spin" />
                  <span className="text-xs text-muted-foreground font-medium">Loading messages...</span>
                </div>
              ) : filteredConversations.length === 0 && filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <div className="w-18 h-18 rounded-3xl bg-gradient-to-tr from-violet-500/15 via-primary/10 to-pink-500/15 flex items-center justify-center mb-4 text-primary shadow-sm border border-primary/20">
                    <MessageCircle className="w-9 h-9" />
                  </div>
                  <h3 className="font-bold text-base text-foreground mb-1">No messages yet</h3>
                  <p className="text-sm text-muted-foreground text-pretty max-w-xs mb-5">
                    Start a conversation with your friends, share reels, photos, or audio notes.
                  </p>
                  <Link
                    to="/people"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 text-white font-semibold text-sm shadow-md shadow-primary/25 hover:opacity-95 active:scale-95 transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Find friends</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredConversations.map(({ profile, lastMessage, unreadCount }) => (
                    <Link
                      key={profile.id}
                      to={`/chat/${profile.user_id}`}
                      className="flex items-center gap-3.5 px-4 py-3 mx-2 rounded-2xl hover:bg-muted/50 active:bg-muted/70 transition-all duration-150 group"
                    >
                      {/* Avatar */}
                      <div className="shrink-0 relative">
                        <div className="msg-avatar-container ring-1 ring-border/50 bg-muted shadow-xs">
                          {profile.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt={profile.username}
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-tr from-violet-500/20 to-pink-500/20 flex items-center justify-center">
                              <span className="text-primary font-bold text-base">
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
                                  : "font-semibold text-foreground/95"
                              }`}
                            >
                              {profile.full_name || profile.username}
                            </span>
                            {profile.is_verified && (
                              <BadgeCheck className="w-3.5 h-3.5 text-sky-500 shrink-0 fill-sky-500/20" />
                            )}
                          </div>
                          {lastMessage && (
                            <span className="text-[11px] text-muted-foreground/80 shrink-0 font-medium">
                              {formatMessageTime(lastMessage.created_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`text-xs truncate flex-1 min-w-0 ${
                              unreadCount > 0
                                ? "font-bold text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {lastMessage ? lastMessage.content : "Sent a message"}
                          </p>
                          {unreadCount > 0 && (
                            <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 shadow-xs shadow-primary/40" />
                          )}
                        </div>
                      </div>

                      {/* Camera / Video action icon */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/chat/${profile.user_id}`);
                        }}
                        className="text-muted-foreground/70 hover:text-primary shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-primary/10 transition-colors"
                        title="Send photo or video"
                      >
                        <Video className="w-4.5 h-4.5" />
                      </button>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REQUESTS TAB CONTENT */}
          {chatTab === "requests" && (
            <div className="pt-1">
              {requestedGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                    <MessageCircle className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">No message requests</p>
                  <p className="text-xs text-muted-foreground">You don't have any ignored group requests right now.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {requestedGroups.map(({ group, member_count }) => (
                    <div
                      key={group.id}
                      className="flex items-center gap-3.5 px-4 py-3 mx-2 rounded-2xl hover:bg-muted/50 transition-colors"
                    >
                      <Link to={"/group/" + group.id} className="relative shrink-0">
                        <div className="msg-avatar-container ring-1 ring-border/50 bg-muted shadow-xs">
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
                  ))}
                </div>
              )}
            </div>
          )}

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
              onClose={() => {
                NoteAudioManager.stop();
                setActiveViewingNote(null);
              }}
              note={activeViewingNote}
              currentUserId={user.id}
              isOwnNote={activeViewingNote?.user_id === user.id}
              onNoteDeleted={() => {
                NoteAudioManager.stop();
                setActiveViewingNote(null);
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
