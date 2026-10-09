import { useGroupCall } from "@/contexts/GroupCallContext";
import { useCall } from "@/contexts/CallContext";
import {
  ArrowLeft,
  BadgeCheck,
  Info,
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
  searchProfiles,
} from "@/services/api";
import { getActiveGroupCallsForUser, getMyGroups, createGroup, addGroupMember } from "@/services/groups";
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
  const [showNewChatDrawer, setShowNewChatDrawer] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Profile[]>([]);
  const [peopleSearchQuery, setPeopleSearchQuery] = useState("");
  const [allContacts, setAllContacts] = useState<Profile[]>([]);
  const [searchedProfiles, setSearchedProfiles] = useState<Profile[]>([]);
  const [isSearchingPeople, setIsSearchingPeople] = useState(false);
  const [isCreatingChatOrGroup, setIsCreatingChatOrGroup] = useState(false);

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
        10000,
        [[], [], []]
      );

      setGroups(groupList);

      // Fetch active calls for all user groups
      try {
        const callsMap = await getActiveGroupCallsForUser(user.id);
        setActiveGroupCalls(callsMap);
      } catch (err) {
        console.warn("Could not fetch active group calls:", err);
      }

      // Combine profiles without duplicates
      const seen = new Set<string>();
      const combined: Profile[] = [];

      for (const p of [...messaged, ...mutuals]) {
        if (!seen.has(p.id) && p.id !== user.id) {
          seen.add(p.id);
          combined.push(p);
        }
      }
      setAllContacts(combined);

      // Load last message and unread count for each profile
      const convs: ConversationItem[] = await Promise.all(
        combined.map(async (p) => {
          let lastMessage: Message | null = null;
          let unreadCount = 0;
          try {
            const msgs = await getMessages(user.id, p.user_id);
            if (msgs.length > 0) {
              lastMessage = msgs[msgs.length - 1];
            }
            unreadCount = await getUnreadCount(user.id, p.user_id);
          } catch {
            /* ignore individual errors */
          }
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

  // Realtime subscription for users online/offline presence
  useEffect(() => {
    const channel = supabase
      .channel("chat-list-online-status-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "online_status" },
        (payload) => {
          const row = payload.new as any;
          if (row && row.user_id) {
            setOnlineStatuses((prev) => ({
              ...prev,
              [row.user_id]: {
                is_online: Boolean(row.is_online),
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

  // Realtime subscription for group call start/end
  useEffect(() => {
    const channel = supabase
      .channel("chatlist-group-calls-events")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_calls" },
        (payload) => {
          const updatedCall = payload.new as GroupCall;
          if (!updatedCall || !updatedCall.group_id) return;
          if (payload.eventType === "DELETE" || updatedCall.status === "ended") {
            setActiveGroupCalls((prev) => {
              const next = { ...prev };
              delete next[updatedCall.group_id];
              return next;
            });
          } else if (updatedCall.status === "active") {
            setActiveGroupCalls((prev) => ({
              ...prev,
              [updatedCall.group_id]: updatedCall,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Realtime subscription for new messages to update list
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("chat-list-incoming-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const activeGroups = useMemo(() => {
    return groups.filter((g) => !ignoredGroupIds.includes(g.group.id));
  }, [groups, ignoredGroupIds]);

  const requestedGroups = useMemo(() => {
    return groups.filter((g) => ignoredGroupIds.includes(g.group.id));
  }, [groups, ignoredGroupIds]);

  const handleUnignoreGroup = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = ignoredGroupIds.filter((id) => id !== groupId);
    setIgnoredGroupIds(updated);
    try {
      localStorage.setItem("ignored_group_ids", JSON.stringify(updated));
    } catch {}
    toast.success("Group moved back to active chats");
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.profile.username.toLowerCase().includes(q) ||
        (c.profile.full_name && c.profile.full_name.toLowerCase().includes(q))
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

    friendNotes.forEach((n) => {
      if (n.profile && !seen.has(n.profile.user_id)) {
        seen.add(n.profile.user_id);
        const presence = formatUserPresence(n.profile.user_id);
        list.push({ profile: n.profile, note: n, isOnline: presence.isOnline });
      }
    });

    conversations.forEach((c) => {
      if (!seen.has(c.profile.user_id)) {
        const presence = formatUserPresence(c.profile.user_id);
        if (presence.isOnline) {
          seen.add(c.profile.user_id);
          list.push({ profile: c.profile, isOnline: true });
        }
      }
    });

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
          --bg: #0E0820;
          --s1: #1A1233;
          --s2: #2A2050;
          --ink: #F7F3FF;
          --mute: #A99FD2;
          --line: rgba(255,255,255,.09);
          --pink: #FF3D7F;
          --vio: #7C5CFF;
          --green: #22D3A0;
          --grad: linear-gradient(135deg,#FF3D7F,#7C5CFF);
          color-scheme: dark;
        }
        .msg-root-body {
          background: var(--bg);
          color: var(--ink);
          font-family: "Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif;
          line-height: 1.35;
          -webkit-font-smoothing: antialiased;
          min-height: 100vh;
          position: relative;
        }
        .msg-root-body::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(520px 320px at 85% -60px, rgba(255,61,127,.24), transparent 70%),
                      radial-gradient(460px 300px at -5% 120px, rgba(124,92,255,.22), transparent 70%);
          z-index: 0;
        }
        .wrap {
          position: relative;
          max-width: 580px;
          margin: 0 auto;
          padding-bottom: 70px;
          z-index: 1;
        }
        header {
          position: sticky;
          top: 0;
          z-index: 10;
          padding: 18px 16px 14px;
          background: linear-gradient(to bottom, rgba(14,8,32,.94) 70%, rgba(14,8,32,0));
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .top .back-btn {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          background: rgba(255,255,255,.07);
          display: grid;
          place-items: center;
          flex: none;
          cursor: pointer;
          border: 0;
          color: var(--ink);
          transition: transform .15s, background .15s;
        }
        .top .back-btn:active {
          transform: scale(.92);
          background: rgba(255,255,255,.12);
        }
        h1 {
          font-size: 34px;
          font-weight: 800;
          letter-spacing: -.045em;
          line-height: 1;
          color: var(--ink);
        }
        #count {
          min-width: 32px;
          height: 32px;
          padding: 0 10px;
          border-radius: 99px;
          background: var(--grad);
          color: #fff;
          font-weight: 800;
          font-size: 15px;
          display: grid;
          place-items: center;
          box-shadow: 0 6px 20px rgba(255,61,127,.45);
        }
        .new {
          margin-left: auto;
          width: 46px;
          height: 46px;
          border-radius: 16px;
          background: var(--grad);
          display: grid;
          place-items: center;
          box-shadow: 0 8px 22px rgba(124,92,255,.45);
          transition: transform .15s;
          cursor: pointer;
          border: 0;
          color: #fff;
        }
        .new:active {
          transform: scale(.92) rotate(-6deg);
        }
        .new svg {
          width: 20px;
          height: 20px;
          stroke: #fff;
          stroke-width: 2.3;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .search {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255,255,255,.06);
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 0 16px;
          height: 50px;
          transition: border-color .2s, background .2s;
        }
        .search:focus-within {
          border-color: var(--pink);
          background: rgba(255,255,255,.09);
        }
        .search svg {
          width: 18px;
          height: 18px;
          stroke: var(--mute);
          stroke-width: 2.2;
          fill: none;
          stroke-linecap: round;
        }
        .search input {
          flex: 1;
          min-width: 0;
          background: none;
          border: 0;
          outline: 0;
          font-size: 15.5px;
          color: var(--ink);
        }
        .search input::placeholder {
          color: var(--mute);
        }
        .chips {
          display: flex;
          gap: 4px;
          margin-top: 12px;
          padding: 4px;
          background: rgba(255,255,255,.06);
          border: 1px solid var(--line);
          border-radius: 18px;
        }
        .chip {
          flex: 1;
          padding: 10px 6px;
          border-radius: 14px;
          color: var(--mute);
          font-weight: 600;
          font-size: 14.5px;
          text-align: center;
          transition: background .2s, color .2s;
          border: 0;
          background: none;
          cursor: pointer;
        }
        .chip[aria-pressed="true"] {
          background: var(--grad);
          color: #fff;
          box-shadow: 0 6px 16px rgba(255,61,127,.35);
        }
        .chip i {
          font-style: normal;
          margin-left: 6px;
          opacity: .75;
          font-weight: 800;
        }
        .act {
          display: flex;
          gap: 16px;
          padding: 6px 18px 10px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .act::-webkit-scrollbar {
          display: none;
        }
        .act button {
          flex: none;
          width: 66px;
          text-align: center;
          font-size: 12.5px;
          color: var(--mute);
          font-weight: 600;
          cursor: pointer;
          border: 0;
          background: none;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .act .av {
          margin: 0 auto 6px;
        }
        .act .av::before,
        .row.unread > .av::before {
          content: "";
          position: absolute;
          inset: -3.5px;
          border-radius: 50%;
          background: var(--grad);
          z-index: 0;
        }
        .av {
          position: relative;
          flex: none;
          border-radius: 50%;
          width: 52px;
          height: 52px;
        }
        .act .av {
          width: 56px;
          height: 56px;
        }
        .av .ph {
          position: relative;
          z-index: 1;
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
          border: 2.5px solid var(--bg);
          background: var(--s1);
        }
        .av .ph img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .av svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .dot {
          position: absolute;
          z-index: 2;
          right: -1px;
          bottom: -1px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--green);
          border: 3px solid var(--bg);
          box-shadow: 0 0 10px var(--green);
        }
        .grp {
          position: relative;
          flex: none;
        }
        .grp .av {
          position: absolute;
        }
        .grp .av .ph {
          border-width: 3px;
        }
        .rows {
          padding: 4px 12px;
        }
        .row {
          display: flex;
          align-items: center;
          gap: 15px;
          width: 100%;
          padding: 13px 14px;
          margin-bottom: 8px;
          border-radius: 24px;
          text-align: left;
          background: rgba(255,255,255,.04);
          border: 1px solid var(--line);
          transition: background .2s, transform .15s, border-color .2s;
          cursor: pointer;
          color: inherit;
          text-decoration: none;
        }
        .row:hover {
          background: rgba(255,255,255,.08);
        }
        .row:active {
          transform: scale(.985);
        }
        .row.unread {
          background: linear-gradient(135deg, rgba(255,61,127,.16), rgba(124,92,255,.14));
          border-color: rgba(255,61,127,.38);
        }
        .mid {
          flex: 1;
          min-width: 0;
        }
        .nm {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 16.5px;
          font-weight: 600;
          color: var(--ink);
        }
        .nm span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lm {
          font-size: 14.5px;
          color: var(--mute);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 3px;
        }
        .lm em {
          font-style: normal;
          color: var(--green);
          font-weight: 700;
        }
        .row.unread .nm {
          font-weight: 800;
        }
        .row.unread .lm {
          color: var(--ink);
          font-weight: 600;
        }
        .meta {
          flex: none;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 7px;
          font-size: 12.5px;
          color: var(--mute);
          font-weight: 600;
        }
        .row.unread .meta > span:first-child {
          color: var(--pink);
          font-weight: 700;
        }
        .badge {
          min-width: 24px;
          height: 24px;
          padding: 0 8px;
          border-radius: 99px;
          background: var(--grad);
          color: #fff;
          font-weight: 800;
          font-size: 13px;
          display: grid;
          place-items: center;
          box-shadow: 0 4px 14px rgba(255,61,127,.5);
        }
        .row-action-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,.06);
          display: grid;
          place-items: center;
          color: var(--mute);
          transition: background .15s, color .15s;
          border: 0;
          cursor: pointer;
        }
        .row-action-btn:hover {
          background: rgba(255,61,127,.2);
          color: #fff;
        }
        .empty {
          text-align: center;
          padding: 80px 30px;
          color: var(--mute);
        }
        .empty p {
          font-size: 19px;
          font-weight: 800;
          color: var(--ink);
          margin-bottom: 4px;
        }
        #newc {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: var(--bg);
          display: none;
          flex-direction: column;
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        #newc.open {
          display: flex;
        }
        .ch {
          max-width: 580px;
          width: 100%;
          margin: 0 auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          position: relative;
        }
        .chh {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--line);
          background: rgba(26,18,51,.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .chh .back {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          background: rgba(255,255,255,.07);
          display: grid;
          place-items: center;
          flex: none;
          color: var(--ink);
          border: 0;
          cursor: pointer;
        }
        .chh .t {
          flex: 1;
          min-width: 0;
        }
        .chh .t b {
          display: block;
          font-size: 17.5px;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--ink);
        }
        .chh .t small {
          color: var(--mute);
          font-size: 13px;
        }
        .go {
          flex: none;
          padding: 11px 20px;
          border-radius: 99px;
          background: var(--grad);
          color: #fff;
          font-weight: 800;
          font-size: 15px;
          box-shadow: 0 6px 18px rgba(255,61,127,.4);
          border: 0;
          cursor: pointer;
          transition: opacity .15s;
        }
        .go:disabled {
          background: var(--s2);
          color: var(--mute);
          box-shadow: none;
          cursor: default;
          opacity: .6;
        }
        .npad {
          padding: 14px 14px 4px;
        }
        .sel {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .sel button {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 5px 13px 5px 5px;
          border-radius: 99px;
          background: rgba(255,61,127,.16);
          border: 1px solid rgba(255,61,127,.4);
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          cursor: pointer;
        }
        .sel button span {
          opacity: .8;
          font-size: 14px;
          line-height: 1;
        }
      `}</style>

      <PullToRefresh onRefresh={load}>
        <div className="msg-root-body">
          <div className="wrap">
            {/* EXACT HTML HEADER */}
            <header>
              <div className="top">
                <button
                  type="button"
                  onClick={goBack}
                  className="back-btn"
                  aria-label="Back"
                  title="Back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <h1>Messages</h1>

                <div id="count">
                  {totalUnreadCount > 0
                    ? totalUnreadCount
                    : (conversations.length + activeGroups.length) || 0}
                </div>

                {/* NEW COMPOSE BUTTON (Pen icon from HTML) */}
                <div className="relative ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowNewChatDrawer(true)}
                    className="new"
                    aria-label="New chat or group"
                    title="New chat or group"
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>

                  {/* Dropdown for compose */}
                  {showComposeMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowComposeMenu(false)}
                      />
                      <div className="absolute top-14 right-0 w-52 rounded-2xl border border-white/10 bg-[#1A1233]/95 backdrop-blur-xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
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

              {/* SEARCH BAR (.search) */}
              <div className="search">
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search messages..."
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

              {/* CHIPS FILTER (.chips) */}
              <div className="chips">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={chatFilter === "all"}
                  onClick={() => setChatFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={chatFilter === "unread"}
                  onClick={() => setChatFilter("unread")}
                >
                  Unread
                  {unreadConversations.length > 0 && <i>{unreadConversations.length}</i>}
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={chatFilter === "groups"}
                  onClick={() => setChatFilter("groups")}
                >
                  Groups
                  {filteredGroups.length > 0 && <i>{filteredGroups.length}</i>}
                </button>
                {requestedGroups.length > 0 && (
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={chatFilter === "requests"}
                    onClick={() => setChatFilter("requests")}
                  >
                    Requests
                    <i>{requestedGroups.length}</i>
                  </button>
                )}
              </div>
            </header>

            {/* ACTIVE STORIES / CONTACTS RAIL (.act) */}
            {!searchQuery && (
              <div className="act">
                {/* Current User Note / Story */}
                <button
                  type="button"
                  onClick={() => {
                    if (myNote) {
                      handleOpenNote(myNote);
                    } else {
                      setCreateNoteOpen(true);
                    }
                  }}
                >
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

                  <div className={`av ${myNote ? "ring" : ""}`}>
                    <div className="ph">
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
                  <span className="truncate w-full mt-1">{myNote ? "Your note" : "Create"}</span>
                </button>

                {/* Friend Contacts Rail */}
                {railUsers.map(({ profile, note, isOnline }) => (
                  <button
                    key={profile.user_id}
                    type="button"
                    onClick={() => {
                      if (note) {
                        handleOpenNote(note);
                      } else {
                        navigate(`/chat/${profile.user_id}`);
                      }
                    }}
                  >
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

                    <div className="av">
                      <div className="ph">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.username} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#7C5CFF] font-bold text-base">
                            {profile.username?.[0]?.toUpperCase() || "U"}
                          </div>
                        )}
                      </div>
                      {isOnline && <span className="dot" />}
                    </div>
                    <span className="truncate w-full mt-1">{profile.username}</span>
                  </button>
                ))}
              </div>
            )}

            {/* EXACT HTML ROWS (.rows -> .row) */}
            <div className="rows">
              {/* REQUESTS VIEW */}
              {chatFilter === "requests" ? (
                <div>
                  {requestedGroups.length === 0 ? (
                    <div className="empty">
                      <p>No message requests</p>
                      <span>You have no ignored groups right now.</span>
                    </div>
                  ) : (
                    requestedGroups.map(({ group, member_count }) => (
                      <div
                        key={group.id}
                        className="row"
                        onClick={() => navigate(`/messages/t/${getGroupNumericUid(group.id)}`)}
                      >
                        <div className="av">
                          <div className="ph">
                            {group.avatar_url ? (
                              <img src={group.avatar_url} alt={group.name} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#7C5CFF]">
                                <Users className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mid">
                          <div className="nm">
                            <span>{group.name}</span>
                          </div>
                          <div className="lm">
                            {member_count} members · Ignored
                          </div>
                        </div>

                        <div className="meta">
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
                /* GROUPS TAB VIEW */
                <div>
                  {loading && filteredGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <div className="w-9 h-9 rounded-full border-3 border-[#FF3D7F]/30 border-t-[#FF3D7F] animate-spin" />
                      <span className="text-xs text-[#A99FD2] font-medium">Loading groups...</span>
                    </div>
                  ) : filteredGroups.length === 0 ? (
                    <div className="empty">
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
                          className="row"
                          onClick={() => navigate(`/messages/t/${groupUid}`)}
                        >
                          <div className="av">
                            <div className="ph">
                              {group.avatar_url ? (
                                <img src={group.avatar_url} alt={group.name} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#7C5CFF]">
                                  <Users className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            {(isCurrentUserInThisCall || !!activeCall) && (
                              <span className="dot animate-ping" />
                            )}
                          </div>

                          <div className="mid">
                            <div className="nm">
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
                            <div className="lm">{member_count} members</div>
                          </div>

                          <div className="meta">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="row-action-btn"
                                title="Group audio call"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void groupCall.startCall(group.id, group.name, group.avatar_url, [], 'audio');
                                }}
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                className="row-action-btn"
                                title="Group video call"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void groupCall.startCall(group.id, group.name, group.avatar_url, [], 'video');
                                }}
                              >
                                <Video className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                className="row-action-btn"
                                title="Group info"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/messages/t/${groupUid}?info=1`);
                                }}
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* ALL & UNREAD VIEW */
                <div>
                  {loading && filteredConversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <div className="w-9 h-9 rounded-full border-3 border-[#FF3D7F]/30 border-t-[#FF3D7F] animate-spin" />
                      <span className="text-xs text-[#A99FD2] font-medium">Loading messages...</span>
                    </div>
                  ) : (chatFilter === "unread" ? unreadConversations : filteredConversations).length === 0 ? (
                    <div className="empty">
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
                      ({ profile, lastMessage, unreadCount }, idx) => {
                        const presence = formatUserPresence(profile.user_id);
                        const isUnread = unreadCount > 0;

                        return (
                          <div
                            key={profile.id}
                            className={`row ${isUnread ? "unread" : ""}`}
                            style={{ ["--d" as any]: idx }}
                            onClick={() => navigate(`/chat/${profile.user_id}`)}
                          >
                            {/* Avatar with gradient ring when unread */}
                            <div className="av">
                              <div className="ph">
                                {profile.avatar_url ? (
                                  <img src={profile.avatar_url} alt={profile.username} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[#FF3D7F] font-bold text-base">
                                    {profile.username?.[0]?.toUpperCase() || "U"}
                                  </div>
                                )}
                              </div>
                              {presence.isOnline && <span className="dot" />}
                            </div>

                            {/* Middle Information */}
                            <div className="mid">
                              <div className="nm">
                                <span>{profile.full_name || profile.username}</span>
                                {profile.is_verified && (
                                  <BadgeCheck className="w-4 h-4 text-[#7C5CFF] fill-[#7C5CFF]/20 shrink-0" />
                                )}
                              </div>
                              <div className="lm">
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

                            {/* Meta & Unread Badge & Action shortcut */}
                            <div className="meta">
                              <span>
                                {lastMessage ? formatMessageTime(lastMessage.created_at) : ""}
                              </span>

                              {unreadCount > 0 ? (
                                <div className="badge">{unreadCount}</div>
                              ) : (
                                <button
                                  type="button"
                                  className="row-action-btn"
                                  title="Open chat"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/chat/${profile.user_id}`);
                                  }}
                                >
                                  <Video className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )
                  )}

                  {/* Also show Groups in 'All' tab if there are active groups */}
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
                            className="row"
                            onClick={() => navigate(`/messages/t/${groupUid}`)}
                          >
                            <div className="av">
                              <div className="ph">
                                {group.avatar_url ? (
                                  <img src={group.avatar_url} alt={group.name} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[#7C5CFF]">
                                    <Users className="w-5 h-5" />
                                  </div>
                                )}
                              </div>
                              {(isCurrentUserInThisCall || !!activeCall) && (
                                <span className="dot animate-ping" />
                              )}
                            </div>

                            <div className="mid">
                              <div className="nm">
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
                              <div className="lm">{member_count} members</div>
                            </div>

                            <div className="meta">
                              <button
                                type="button"
                                className="row-action-btn"
                                title="Open group"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/messages/t/${groupUid}`);
                                }}
                              >
                                <Video className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

  
            {/* NEW MESSAGE / CREATE GROUP DRAWER (#newc) */}
            <section id="newc" className={showNewChatDrawer ? "open" : ""} aria-hidden={!showNewChatDrawer}>
              <div className="ch">
                <div className="chh">
                  <button
                    type="button"
                    className="back"
                    onClick={() => {
                      setShowNewChatDrawer(false);
                      setSelectedPeople([]);
                      setPeopleSearchQuery("");
                    }}
                    aria-label="Close"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5">
                      <path d="M19 12H5M12 19l-7-7 7-7" strokeWidth="2.6" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="t">
                    <b>New message</b>
                    <small id="subt">
                      {selectedPeople.length === 0
                        ? "Select people to start a chat"
                        : selectedPeople.length === 1
                        ? `${selectedPeople[0].full_name || selectedPeople[0].username} selected`
                        : `${selectedPeople.length} people selected - Group chat`}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="go"
                    id="goBtn"
                    disabled={selectedPeople.length === 0 || isCreatingChatOrGroup}
                    onClick={handleStartChatOrGroup}
                  >
                    {selectedPeople.length > 1 ? "Create Group" : "Chat"}
                  </button>
                </div>
                <div className="npad">
                  <div className="search">
                    <svg viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      id="nSearch"
                      value={peopleSearchQuery}
                      onChange={(e) => setPeopleSearchQuery(e.target.value)}
                      placeholder="Search people..."
                    />
                    {peopleSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setPeopleSearchQuery("")}
                        className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[#A99FD2] hover:text-[#F7F3FF]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {selectedPeople.length > 0 && (
                    <div className="sel" id="selectedChips">
                      {selectedPeople.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => toggleSelectPerson(p)}
                          title={`Remove ${p.username}`}
                        >
                          <div className="w-5 h-5 rounded-full overflow-hidden bg-[#2A2050] shrink-0">
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-white font-bold bg-[#FF3D7F]">
                                {(p.full_name || p.username || "U").charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span>@{p.username}</span>
                          <span className="text-white/60 hover:text-white ml-0.5">✕</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rows" id="peopleRows" style={{ overflowY: "auto", flex: 1 }}>
                  {isSearchingPeople ? (
                    <div className="empty">
                      <p>Searching...</p>
                    </div>
                  ) : filteredPeopleList.length === 0 ? (
                    <div className="empty">
                      <p>No people found</p>
                      <span>Try searching by username or name</span>
                    </div>
                  ) : (
                    filteredPeopleList.map((p, idx) => {
                      const isSelected = selectedPeople.some((s) => s.id === p.id);
                      return (
                        <div
                          key={p.id}
                          className={`row ${isSelected ? "unread" : ""}`}
                          style={{ ["--d" as any]: idx }}
                          onClick={() => toggleSelectPerson(p)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="av" style={{ width: 44, height: 44 }}>
                            <div className="ph">
                              {p.avatar_url ? (
                                <img src={p.avatar_url} alt={p.username} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center font-bold text-white bg-gradient-to-tr from-[#FF3D7F] to-[#7C5CFF]">
                                  {(p.full_name || p.username || "U").charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mid">
                            <div className="nm">
                              <span>{p.full_name || p.username}</span>
                              {p.is_verified && <BadgeCheck className="w-4 h-4 text-[#FF3D7F]" />}
                            </div>
                            <div className="lm">@{p.username}</div>
                          </div>
                          <div className="meta">
                            <div
                              className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                                isSelected
                                  ? "bg-[#FF3D7F] border-[#FF3D7F] text-white"
                                  : "border-white/20 bg-white/5"
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

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
