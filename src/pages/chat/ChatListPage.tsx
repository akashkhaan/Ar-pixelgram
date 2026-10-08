import { useGroupCall } from "@/contexts/GroupCallContext";
import { useCall } from "@/contexts/CallContext";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCheck,
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
import { getGroupNumericUid } from "@/services/groupUid";
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
  const { startCall } = useCall();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const goBack = useGoBack("/home");

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof getMyGroups>>>([]);
  const [activeGroupCalls, setActiveGroupCalls] = useState<Record<string, GroupCall>>({});
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "groups" | "requests">("all");
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, { is_online: boolean; last_seen_at?: string }>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showComposeMenu, setShowComposeMenu] = useState(false);

  // Notes state
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

      // Fetch online presence for all conversation profiles
      const userIds = combined.map((p) => p.user_id);
      if (userIds.length > 0) {
        try {
          const { data: statusRows } = await supabase
            .from("online_status")
            .select("user_id, is_online, last_seen_at")
            .in("user_id", userIds);
          if (statusRows) {
            const statusMap: Record<string, { is_online: boolean; last_seen_at?: string }> = {};
            statusRows.forEach((r: any) => {
              statusMap[r.user_id] = { is_online: r.is_online, last_seen_at: r.last_seen_at };
            });
            setOnlineStatuses(statusMap);
          }
        } catch {
          /* ignore */
        }
      }

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

  // Realtime subscription for users online/offline presence
  useEffect(() => {
    const channel = supabase
      .channel("chat-list-online-status-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "online_status" },
        (payload) => {
          const row = payload.new as { user_id: string; is_online: boolean; last_seen_at?: string };
          if (row?.user_id) {
            setOnlineStatuses((prev) => ({
              ...prev,
              [row.user_id]: {
                is_online: row.is_online,
                last_seen_at: row.last_seen_at,
              },
            }));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    if (next.length === 0) setChatFilter("all");
  };

  // Filtered lists
  const filteredConversations = useMemo(() => {
    const valid = (conversations || []).filter((c) => c && c.lastMessage !== null);
    if (!searchQuery.trim()) return valid;
    const q = searchQuery.toLowerCase();
    return valid.filter(
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

  const unreadConversations = useMemo(
    () => filteredConversations.filter((c) => c.unreadCount > 0),
    [filteredConversations]
  );

  const totalUnreadCount = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
    [conversations]
  );

  const formatUserPresence = (userId?: string) => {
    if (!userId) return { isOnline: false, text: "" };
    const status = onlineStatuses[userId];
    if (!status) return { isOnline: false, text: "" };
    const now = Date.now();
    const lastSeen = status.last_seen_at ? new Date(status.last_seen_at).getTime() : 0;
    const isRecent = lastSeen > 0 ? now - lastSeen < 120 * 1000 : true;
    const isOnline = Boolean(status.is_online && isRecent);

    if (isOnline) return { isOnline: true, text: "Active now" };
    if (!status.last_seen_at) return { isOnline: false, text: "" };
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return { isOnline: false, text: "Active just now" };
    if (diffMins < 60) return { isOnline: false, text: `${diffMins}m ago` };
    if (diffHours < 24) return { isOnline: false, text: `${diffHours}h ago` };
    if (diffDays === 1) return { isOnline: false, text: "Yesterday" };
    return { isOnline: false, text: `${diffDays}d ago` };
  };

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

  // Contacts rail: Unique active users from notes & conversations
  const railUsers = useMemo(() => {
    const list: {
      profile: Profile;
      note?: UserNote;
      isOnline: boolean;
    }[] = [];
    const seen = new Set<string>();

    // Add friend notes first
    friendNotes.forEach((n) => {
      if (n.profile && !seen.has(n.profile.user_id)) {
        seen.add(n.profile.user_id);
        const presence = formatUserPresence(n.profile.user_id);
        list.push({ profile: n.profile, note: n, isOnline: presence.isOnline });
      }
    });

    // Add online conversation profiles
    conversations.forEach((c) => {
      if (!seen.has(c.profile.user_id)) {
        const presence = formatUserPresence(c.profile.user_id);
        if (presence.isOnline) {
          seen.add(c.profile.user_id);
          list.push({ profile: c.profile, isOnline: true });
        }
      }
    });

    // Add other recent conversation profiles up to 10
    conversations.forEach((c) => {
      if (!seen.has(c.profile.user_id) && list.length < 12) {
        seen.add(c.profile.user_id);
        const presence = formatUserPresence(c.profile.user_id);
        list.push({ profile: c.profile, isOnline: presence.isOnline });
      }
    });

    return list;
  }, [friendNotes, conversations, onlineStatuses]);

  return (
    <MobileLayout hideHeader hideNav>
      <style>{`
        :root {
          --msg-bg: #0E0820;
          --msg-s1: #1A1233;
          --msg-s2: #2A2050;
          --msg-ink: #F7F3FF;
          --msg-mute: #A99FD2;
          --msg-line: rgba(255,255,255,.09);
          --msg-pink: #FF3D7F;
          --msg-vio: #7C5CFF;
          --msg-green: #22D3A0;
          --msg-grad: linear-gradient(135deg,#FF3D7F,#7C5CFF);
        }
        .msg-page {
          background: var(--msg-bg);
          color: var(--msg-ink);
          font-family: "Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif;
          min-height: 100vh;
          position: relative;
        }
        .msg-page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(520px 320px at 85% -60px, rgba(255,61,127,.24), transparent 70%),
                      radial-gradient(460px 300px at -5% 120px, rgba(124,92,255,.22), transparent 70%);
          z-index: 0;
        }
        .msg-wrap {
          position: relative;
          max-width: 580px;
          margin: 0 auto;
          padding-bottom: 90px;
          z-index: 1;
        }
        .msg-header {
          position: sticky;
          top: 0;
          z-index: 20;
          padding: 18px 16px 14px;
          background: linear-gradient(to bottom, rgba(14,8,32,.95) 75%, rgba(14,8,32,0));
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .msg-top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .msg-back-btn {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          background: rgba(255,255,255,.07);
          display: grid;
          place-items: center;
          flex: none;
          color: var(--msg-ink);
          transition: background .15s, transform .15s;
        }
        .msg-back-btn:active {
          transform: scale(.92);
          background: rgba(255,255,255,.12);
        }
        .msg-title {
          font-size: 34px;
          font-weight: 800;
          letter-spacing: -.045em;
          line-height: 1;
          color: var(--msg-ink);
        }
        .msg-count-pill {
          min-width: 32px;
          height: 32px;
          padding: 0 10px;
          border-radius: 99px;
          background: var(--msg-grad);
          color: #fff;
          font-weight: 800;
          font-size: 15px;
          display: grid;
          place-items: center;
          box-shadow: 0 6px 20px rgba(255,61,127,.45);
        }
        .msg-new-btn {
          margin-left: auto;
          width: 44px;
          height: 44px;
          border-radius: 16px;
          background: var(--msg-grad);
          display: grid;
          place-items: center;
          box-shadow: 0 8px 22px rgba(124,92,255,.45);
          transition: transform .15s;
          color: #fff;
        }
        .msg-new-btn:active {
          transform: scale(.92) rotate(-6deg);
        }
        .msg-search-box {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255,255,255,.06);
          border: 1px solid var(--msg-line);
          border-radius: 18px;
          padding: 0 16px;
          height: 48px;
          transition: border-color .2s, background .2s;
        }
        .msg-search-box:focus-within {
          border-color: var(--msg-pink);
          background: rgba(255,255,255,.09);
        }
        .msg-chips-container {
          display: flex;
          gap: 4px;
          margin-top: 12px;
          padding: 4px;
          background: rgba(255,255,255,.06);
          border: 1px solid var(--msg-line);
          border-radius: 18px;
        }
        .msg-chip-item {
          flex: 1;
          padding: 9px 6px;
          border-radius: 14px;
          color: var(--msg-mute);
          font-weight: 600;
          font-size: 14px;
          text-align: center;
          transition: background .2s, color .2s;
          cursor: pointer;
          border: 0;
          background: none;
        }
        .msg-chip-item[aria-pressed="true"] {
          background: var(--msg-grad);
          color: #fff;
          box-shadow: 0 6px 16px rgba(255,61,127,.35);
        }
        .msg-chip-item i {
          font-style: normal;
          margin-left: 6px;
          opacity: .85;
          font-weight: 800;
        }
        .msg-act-rail {
          display: flex;
          gap: 16px;
          padding: 8px 18px 14px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .msg-act-rail::-webkit-scrollbar {
          display: none;
        }
        .msg-act-item {
          flex: none;
          width: 68px;
          text-align: center;
          font-size: 12px;
          color: var(--msg-mute);
          font-weight: 600;
          background: none;
          border: 0;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .msg-act-av {
          position: relative;
          flex: none;
          border-radius: 50%;
          width: 58px;
          height: 58px;
          margin: 0 auto 6px;
        }
        .msg-act-av.ring::before,
        .msg-row.unread .msg-av::before {
          content: "";
          position: absolute;
          inset: -3.5px;
          border-radius: 50%;
          background: var(--msg-grad);
          z-index: 0;
        }
        .msg-av-ph {
          position: relative;
          z-index: 1;
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
          border: 2.5px solid var(--msg-bg);
          background: var(--msg-s1);
        }
        .msg-av-ph img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .msg-online-dot {
          position: absolute;
          z-index: 2;
          right: -1px;
          bottom: -1px;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: var(--msg-green);
          border: 2.5px solid var(--msg-bg);
          box-shadow: 0 0 10px var(--msg-green);
        }
        .msg-rows-list {
          padding: 6px 14px;
        }
        .msg-row {
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
          padding: 13px 14px;
          margin-bottom: 9px;
          border-radius: 24px;
          text-align: left;
          background: rgba(255,255,255,.04);
          border: 1px solid var(--msg-line);
          transition: background .2s, transform .15s, border-color .2s;
          text-decoration: none;
          color: inherit;
        }
        .msg-row:hover {
          background: rgba(255,255,255,.08);
        }
        .msg-row:active {
          transform: scale(.985);
        }
        .msg-row.unread {
          background: linear-gradient(135deg, rgba(255,61,127,.16), rgba(124,92,255,.14));
          border-color: rgba(255,61,127,.38);
        }
        .msg-av {
          position: relative;
          flex: none;
          border-radius: 50%;
          width: 52px;
          height: 52px;
        }
        .msg-mid {
          flex: 1;
          min-width: 0;
        }
        .msg-nm {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 16px;
          font-weight: 600;
          color: var(--msg-ink);
        }
        .msg-nm span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .msg-row.unread .msg-nm {
          font-weight: 800;
        }
        .msg-lm {
          font-size: 14px;
          color: var(--msg-mute);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 3px;
        }
        .msg-lm em {
          font-style: normal;
          color: var(--msg-green);
          font-weight: 700;
        }
        .msg-row.unread .msg-lm {
          color: var(--msg-ink);
          font-weight: 600;
        }
        .msg-meta {
          flex: none;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 7px;
          font-size: 12px;
          color: var(--msg-mute);
          font-weight: 600;
        }
        .msg-row.unread .msg-meta > span:first-child {
          color: var(--msg-pink);
          font-weight: 700;
        }
        .msg-badge {
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 99px;
          background: var(--msg-grad);
          color: #fff;
          font-weight: 800;
          font-size: 12px;
          display: grid;
          place-items: center;
          box-shadow: 0 4px 14px rgba(255,61,127,.5);
        }
        .msg-call-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 2px;
        }
        .msg-call-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,.07);
          border: 1px solid var(--msg-line);
          display: grid;
          place-items: center;
          color: var(--msg-mute);
          transition: background .15s, color .15s, transform .15s;
        }
        .msg-call-btn:hover {
          background: rgba(255,61,127,.2);
          color: #fff;
          border-color: rgba(255,61,127,.4);
        }
        .msg-call-btn:active {
          transform: scale(.9);
        }
        .msg-empty {
          text-align: center;
          padding: 70px 24px;
          color: var(--msg-mute);
        }
        .msg-empty p {
          font-size: 19px;
          font-weight: 800;
          color: var(--msg-ink);
          margin-bottom: 6px;
        }
      `}</style>

      <PullToRefresh onRefresh={load}>
        <div className="msg-page">
          <div className="msg-wrap">
            {/* STICKY HEADER */}
            <header className="msg-header">
              <div className="msg-top">
                <button
                  type="button"
                  onClick={goBack}
                  className="msg-back-btn"
                  aria-label="Back to home"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <h1 className="msg-title">Messages</h1>

                <div id="count" className="msg-count-pill">
                  {totalUnreadCount > 0
                    ? totalUnreadCount
                    : (conversations.length + activeGroups.length) || 0}
                </div>

                {/* New chat / group compose button */}
                <div className="relative ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowComposeMenu((v) => !v)}
                    className="msg-new-btn"
                    aria-label="Compose message or group"
                    title="New chat or group"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5 stroke-current"
                      fill="none"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {showComposeMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowComposeMenu(false)}
                      />
                      <div className="absolute top-12 right-0 w-52 rounded-2xl border border-white/10 bg-[#1A1233]/95 backdrop-blur-xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                        <Link
                          to="/people"
                          onClick={() => setShowComposeMenu(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#F7F3FF] hover:bg-white/10 transition-colors"
                        >
                          <div className="w-7 h-7 rounded-lg bg-[#FF3D7F]/20 text-[#FF3D7F] flex items-center justify-center shrink-0">
                            <UserPlus className="h-4 w-4" />
                          </div>
                          <span>New chat</span>
                        </Link>
                        <Link
                          to="/groups/new"
                          onClick={() => setShowComposeMenu(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#F7F3FF] hover:bg-[#22D3A0]/10 hover:text-[#22D3A0] transition-colors"
                        >
                          <div className="w-7 h-7 rounded-lg bg-[#22D3A0]/20 text-[#22D3A0] flex items-center justify-center shrink-0">
                            <Users className="h-4 w-4" />
                          </div>
                          <span>Create group</span>
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* SEARCH BAR */}
              <div className="msg-search-box">
                <Search className="w-4.5 h-4.5 text-[#A99FD2] shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search messages..."
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15.5px] text-[#F7F3FF] placeholder:text-[#A99FD2]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[#A99FD2] hover:text-[#F7F3FF]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* FILTER CHIPS */}
              <div className="msg-chips-container">
                <button
                  type="button"
                  className="msg-chip-item"
                  aria-pressed={chatFilter === "all"}
                  onClick={() => setChatFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className="msg-chip-item"
                  aria-pressed={chatFilter === "unread"}
                  onClick={() => setChatFilter("unread")}
                >
                  Unread
                  {unreadConversations.length > 0 && <i>{unreadConversations.length}</i>}
                </button>
                <button
                  type="button"
                  className="msg-chip-item"
                  aria-pressed={chatFilter === "groups"}
                  onClick={() => setChatFilter("groups")}
                >
                  Groups
                  {filteredGroups.length > 0 && <i>{filteredGroups.length}</i>}
                </button>
                {requestedGroups.length > 0 && (
                  <button
                    type="button"
                    className="msg-chip-item"
                    aria-pressed={chatFilter === "requests"}
                    onClick={() => setChatFilter("requests")}
                  >
                    Requests
                    <i>{requestedGroups.length}</i>
                  </button>
                )}
              </div>
            </header>

            {/* ACTIVE FRIENDS & THOUGHTS RAIL (.act) */}
            {!searchQuery && (
              <div className="msg-act-rail">
                {/* Current User Note / Story */}
                <div
                  className="msg-act-item"
                  onClick={() => {
                    if (myNote) {
                      handleOpenNote(myNote);
                    } else {
                      setCreateNoteOpen(true);
                    }
                  }}
                >
                  {/* Thought Bubble Preview if exists */}
                  {myNote ? (
                    <div className="relative mb-2 px-2.5 py-1 bg-[#1A1233]/95 border border-white/10 rounded-2xl shadow-lg max-w-[84px] text-center">
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1A1233] border-r border-b border-white/10 rotate-45" />
                      {myNote.music_track && (
                        <div className="flex items-center justify-center gap-1 text-[8.5px] text-[#FF3D7F] font-bold truncate">
                          <Music2 className="w-2.5 h-2.5 shrink-0 animate-pulse" />
                          <span className="truncate max-w-[60px]">{myNote.music_track.title}</span>
                        </div>
                      )}
                      <p className="text-[10.5px] font-medium text-[#F7F3FF] truncate max-w-[70px] leading-tight">
                        {myNote.text}
                      </p>
                    </div>
                  ) : (
                    <div className="relative mb-2 px-2 py-0.5 rounded-full bg-white/6 border border-white/10 text-[9.5px] text-[#A99FD2] font-semibold truncate max-w-[74px]">
                      Share thought
                    </div>
                  )}

                  <div className={`msg-act-av ${myNote ? "ring" : ""}`}>
                    <div className="msg-av-ph">
                      {myProfile?.avatar_url ? (
                        <img src={myProfile.avatar_url} alt="You" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#FF3D7F] font-bold text-base">
                          {myProfile?.username?.[0]?.toUpperCase() || "Y"}
                        </div>
                      )}
                    </div>
                    {!myNote && (
                      <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-gradient-to-tr from-[#7C5CFF] to-[#FF3D7F] text-white flex items-center justify-center text-xs font-black shadow-md border border-[#0E0820]">
                        +
                      </span>
                    )}
                  </div>
                  <span className="truncate w-full">{myNote ? "Your note" : "Create"}</span>
                </div>

                {/* Rail active friends */}
                {railUsers.map(({ profile, note, isOnline }) => (
                  <div
                    key={profile.user_id}
                    className="msg-act-item"
                    onClick={() => {
                      if (note) {
                        handleOpenNote(note);
                      } else {
                        navigate(`/chat/${profile.user_id}`);
                      }
                    }}
                  >
                    {/* Note bubble if friend has note */}
                    {note && (
                      <div className="relative mb-2 px-2.5 py-1 bg-[#1A1233]/95 border border-white/10 rounded-2xl shadow-lg max-w-[84px] text-center">
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1A1233] border-r border-b border-white/10 rotate-45" />
                        {note.music_track && (
                          <div className="flex items-center justify-center gap-1 text-[8.5px] text-[#FF3D7F] font-bold truncate">
                            <Music2 className="w-2.5 h-2.5 shrink-0 animate-pulse" />
                            <span className="truncate max-w-[60px]">{note.music_track.title}</span>
                          </div>
                        )}
                        <p className="text-[10.5px] font-medium text-[#F7F3FF] truncate max-w-[70px] leading-tight">
                          {note.text}
                        </p>
                      </div>
                    )}

                    <div className={`msg-act-av ${note ? "ring" : ""}`}>
                      <div className="msg-av-ph">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.username} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#7C5CFF] font-bold text-base">
                            {profile.username?.[0]?.toUpperCase() || "U"}
                          </div>
                        )}
                      </div>
                      {isOnline && <span className="msg-online-dot" />}
                    </div>
                    <span className="truncate w-full">{profile.username}</span>
                  </div>
                ))}
              </div>
            )}

            {/* CHAT ROWS CONTENT */}
            <div className="msg-rows-list">
              {/* REQUESTS FILTER */}
              {chatFilter === "requests" ? (
                <div>
                  {requestedGroups.length === 0 ? (
                    <div className="msg-empty">
                      <p>No message requests</p>
                      <span>You have no ignored groups right now.</span>
                    </div>
                  ) : (
                    requestedGroups.map(({ group, member_count }) => (
                      <div
                        key={group.id}
                        className="msg-row"
                        onClick={() => navigate(`/messages/t/${getGroupNumericUid(group.id)}`)}
                      >
                        <div className="msg-av">
                          <div className="msg-av-ph">
                            {group.avatar_url ? (
                              <img src={group.avatar_url} alt={group.name} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#7C5CFF]">
                                <Users className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="msg-mid">
                          <div className="msg-nm">
                            <span>{group.name}</span>
                          </div>
                          <div className="msg-lm">
                            {member_count} members · Ignored
                          </div>
                        </div>

                        <div className="msg-meta">
                          <button
                            type="button"
                            onClick={(e) => handleUnignoreGroup(group.id, e)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF3D7F]/20 text-[#FF3D7F] text-xs font-bold transition-all hover:bg-[#FF3D7F]/30"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            <span>Un-ignore</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : chatFilter === "groups" ? (
                /* GROUPS ONLY FILTER */
                <div>
                  {loading && filteredGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <div className="w-9 h-9 rounded-full border-3 border-[#FF3D7F]/30 border-t-[#FF3D7F] animate-spin" />
                      <span className="text-xs text-[#A99FD2] font-medium">Loading groups...</span>
                    </div>
                  ) : filteredGroups.length === 0 ? (
                    <div className="msg-empty">
                      <p>No groups found</p>
                      <span>Create a group to start group audio and video calls.</span>
                      <div className="mt-5">
                        <Link
                          to="/groups/new"
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#FF3D7F] to-[#7C5CFF] text-white font-bold text-sm shadow-lg shadow-[#FF3D7F]/30"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create group</span>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    filteredGroups.map(({ group, member_count }) => {
                      const activeCall = activeGroupCalls[group.id];
                      const isCurrentUserInThisCall =
                        groupCall.active && groupCall.groupId === group.id;
                      const groupUid = getGroupNumericUid(group.id);

                      return (
                        <div
                          key={group.id}
                          className="msg-row"
                          onClick={() => navigate(`/messages/t/${groupUid}`)}
                        >
                          <div className="msg-av">
                            <div className="msg-av-ph">
                              {group.avatar_url ? (
                                <img src={group.avatar_url} alt={group.name} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#7C5CFF]">
                                  <Users className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            {(isCurrentUserInThisCall || !!activeCall) && (
                              <span className="msg-online-dot animate-ping" />
                            )}
                          </div>

                          <div className="msg-mid">
                            <div className="msg-nm">
                              <span>{group.name}</span>
                              {isCurrentUserInThisCall ? (
                                <span className="text-[10.5px] font-bold text-[#22D3A0] px-2 py-0.5 rounded-full bg-[#22D3A0]/15 border border-[#22D3A0]/30 animate-pulse">
                                  In call
                                </span>
                              ) : activeCall ? (
                                <span className="text-[10.5px] font-bold text-[#FF3D7F] px-2 py-0.5 rounded-full bg-[#FF3D7F]/15 border border-[#FF3D7F]/30">
                                  {activeCall.kind === "video" ? "📹 Video call" : "📞 Audio call"}
                                </span>
                              ) : null}
                            </div>
                            <div className="msg-lm">
                              {member_count} members
                            </div>
                          </div>

                          <div className="msg-meta">
                            <div className="msg-call-actions">
                              <button
                                type="button"
                                className="msg-call-btn"
                                title="Group audio call"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (groupCall.active && groupCall.groupId === group.id) {
                                    groupCall.setMinimized(false);
                                  } else {
                                    void groupCall.startCall(group.id, "audio");
                                  }
                                }}
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                className="msg-call-btn"
                                title="Group video call"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (groupCall.active && groupCall.groupId === group.id) {
                                    groupCall.setMinimized(false);
                                  } else {
                                    void groupCall.startCall(group.id, "video");
                                  }
                                }}
                              >
                                <Video className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* ALL & UNREAD FILTER */
                <div>
                  {loading && filteredConversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <div className="w-9 h-9 rounded-full border-3 border-[#FF3D7F]/30 border-t-[#FF3D7F] animate-spin" />
                      <span className="text-xs text-[#A99FD2] font-medium">Loading messages...</span>
                    </div>
                  ) : (chatFilter === "unread" ? unreadConversations : filteredConversations).length === 0 ? (
                    <div className="msg-empty">
                      <p>
                        {chatFilter === "unread"
                          ? "No unread messages"
                          : searchQuery
                          ? "No chats match your search"
                          : "No messages yet"}
                      </p>
                      <span>
                        {chatFilter === "unread"
                          ? "All your direct messages are caught up!"
                          : "Start a conversation with friends, share photos, or make calls."}
                      </span>
                      {chatFilter !== "unread" && !searchQuery && (
                        <div className="mt-5">
                          <Link
                            to="/people"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#FF3D7F] to-[#7C5CFF] text-white font-bold text-sm shadow-lg shadow-[#FF3D7F]/30"
                          >
                            <UserPlus className="w-4 h-4" />
                            <span>Find friends</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    (chatFilter === "unread" ? unreadConversations : filteredConversations).map(
                      ({ profile, lastMessage, unreadCount }) => {
                        const presence = formatUserPresence(profile.user_id);
                        const isUnread = unreadCount > 0;

                        return (
                          <div
                            key={profile.id}
                            className={`msg-row ${isUnread ? "unread" : ""}`}
                            onClick={() => navigate(`/chat/${profile.user_id}`)}
                          >
                            {/* Avatar */}
                            <div className="msg-av">
                              <div className="msg-av-ph">
                                {profile.avatar_url ? (
                                  <img src={profile.avatar_url} alt={profile.username} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[#FF3D7F] font-bold text-base">
                                    {profile.username?.[0]?.toUpperCase() || "U"}
                                  </div>
                                )}
                              </div>
                              {presence.isOnline && <span className="msg-online-dot" />}
                            </div>

                            {/* Middle Information */}
                            <div className="msg-mid">
                              <div className="msg-nm">
                                <span>{profile.full_name || profile.username}</span>
                                {profile.is_verified && (
                                  <BadgeCheck className="w-4 h-4 text-[#7C5CFF] fill-[#7C5CFF]/20 shrink-0" />
                                )}
                              </div>
                              <div className="msg-lm">
                                {lastMessage ? (
                                  lastMessage.sender_id === user?.id ? (
                                    <>You: {lastMessage.content}</>
                                  ) : (
                                    lastMessage.content
                                  )
                                ) : presence.isOnline ? (
                                  <em>Active now</em>
                                ) : (
                                  "Messages and calls are secured"
                                )}
                              </div>
                            </div>

                            {/* Meta, Time, Unread Badge & Call Shortcuts */}
                            <div className="msg-meta">
                              <span>
                                {lastMessage ? formatMessageTime(lastMessage.created_at) : ""}
                              </span>

                              {unreadCount > 0 ? (
                                <div className="msg-badge">{unreadCount}</div>
                              ) : (
                                <div className="msg-call-actions">
                                  <button
                                    type="button"
                                    className="msg-call-btn"
                                    title="Voice call"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void startCall(profile.user_id, "audio");
                                    }}
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="msg-call-btn"
                                    title="Video call"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void startCall(profile.user_id, "video");
                                    }}
                                  >
                                    <Video className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )
                  )}

                  {/* Also show Groups underneath in 'All' tab if there are active groups */}
                  {chatFilter === "all" && !searchQuery && filteredGroups.length > 0 && (
                    <div className="mt-6 mb-2">
                      <div className="flex items-center justify-between px-2 mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#A99FD2]">
                          Groups ({filteredGroups.length})
                        </span>
                        <Link
                          to="/groups/new"
                          className="text-xs font-bold text-[#FF3D7F] hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>New</span>
                        </Link>
                      </div>

                      {filteredGroups.map(({ group, member_count }) => {
                        const activeCall = activeGroupCalls[group.id];
                        const isCurrentUserInThisCall =
                          groupCall.active && groupCall.groupId === group.id;
                        const groupUid = getGroupNumericUid(group.id);

                        return (
                          <div
                            key={group.id}
                            className="msg-row"
                            onClick={() => navigate(`/messages/t/${groupUid}`)}
                          >
                            <div className="msg-av">
                              <div className="msg-av-ph">
                                {group.avatar_url ? (
                                  <img src={group.avatar_url} alt={group.name} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[#7C5CFF]">
                                    <Users className="w-5 h-5" />
                                  </div>
                                )}
                              </div>
                              {(isCurrentUserInThisCall || !!activeCall) && (
                                <span className="msg-online-dot animate-ping" />
                              )}
                            </div>

                            <div className="msg-mid">
                              <div className="msg-nm">
                                <span>{group.name}</span>
                                {isCurrentUserInThisCall ? (
                                  <span className="text-[10.5px] font-bold text-[#22D3A0] px-2 py-0.5 rounded-full bg-[#22D3A0]/15 border border-[#22D3A0]/30 animate-pulse">
                                    In call
                                  </span>
                                ) : activeCall ? (
                                  <span className="text-[10.5px] font-bold text-[#FF3D7F] px-2 py-0.5 rounded-full bg-[#FF3D7F]/15 border border-[#FF3D7F]/30">
                                    {activeCall.kind === "video" ? "📹 Video call" : "📞 Audio call"}
                                  </span>
                                ) : null}
                              </div>
                              <div className="msg-lm">{member_count} members</div>
                            </div>

                            <div className="msg-meta">
                              <div className="msg-call-actions">
                                <button
                                  type="button"
                                  className="msg-call-btn"
                                  title="Group audio call"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (groupCall.active && groupCall.groupId === group.id) {
                                      groupCall.setMinimized(false);
                                    } else {
                                      void groupCall.startCall(group.id, "audio");
                                    }
                                  }}
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="msg-call-btn"
                                  title="Group video call"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (groupCall.active && groupCall.groupId === group.id) {
                                      groupCall.setMinimized(false);
                                    } else {
                                      void groupCall.startCall(group.id, "video");
                                    }
                                  }}
                                >
                                  <Video className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modals for Instagram-style notes */}
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
        </div>
      </PullToRefresh>
    </MobileLayout>
  );
};

export default ChatListPage;
