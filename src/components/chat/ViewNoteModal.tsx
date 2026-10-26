import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Heart,
  Music2,
  Eye,
  Trash2,
  Send,
  Volume2,
  VolumeX,
  Edit3,
} from "lucide-react";
import type { UserNote } from "@/services/notes";
import {
  toggleNoteLike,
  isNoteLiked,
  recordNoteView,
  getNoteViewersAndLikers,
  deleteUserNote,
  NoteAudioManager,
  resolveNoteTrackPreview,
} from "@/services/notes";
import { sendMessage } from "@/services/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  note: UserNote | null;
  currentUserId: string;
  isOwnNote: boolean;
  onNoteDeleted?: () => void;
  onEditNote?: () => void;
}

export const ViewNoteModal: React.FC<Props> = ({
  open,
  onClose,
  note,
  currentUserId,
  isOwnNote,
  onNoteDeleted,
  onEditNote,
}) => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [showViewersSheet, setShowViewersSheet] = useState(false);

  useEffect(() => {
    if (!open || !note) {
      NoteAudioManager.stop();
      setIsPlaying(false);
      return;
    }

    setLikesCount(note.likes_count || 0);

    // Record view
    recordNoteView(note.id, currentUserId).catch(() => {});

    // Check if liked
    isNoteLiked(note.id, currentUserId)
      .then((isLiked) => setLiked(isLiked))
      .catch(() => {});

    // If own note, load viewers and likers
    if (isOwnNote) {
      setLoadingViewers(true);
      getNoteViewersAndLikers(note.id)
        .then((res) => {
          setViewers(res.viewers);
          setLikesCount(res.likesCount);
        })
        .catch(() => {})
        .finally(() => setLoadingViewers(false));
    }

    // Subscribe to audio state
    const unsubscribe = NoteAudioManager.subscribe((playing) => {
      setIsPlaying(playing);
    });

    // Auto-play music instantly if present
    if (note.music_track) {
      if (note.music_track.preview_url) {
        NoteAudioManager.play(
          note.music_track.preview_url,
          note.music_track.start_ms || 0
        );
      } else {
        // Resolve on the fly and immediately auto-play
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

    return () => {
      unsubscribe();
      NoteAudioManager.stop();
      setIsPlaying(false);
    };
  }, [open, note, currentUserId, isOwnNote]);

  const handleClose = () => {
    NoteAudioManager.stop();
    setIsPlaying(false);
    onClose();
  };

  const togglePlayAudio = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!note?.music_track) return;

    if (NoteAudioManager.isPlaying()) {
      NoteAudioManager.stop();
    } else if (note.music_track.preview_url) {
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
  };

  const handleLike = async () => {
    if (!note || !currentUserId) return;
    const prev = liked;
    setLiked(!prev);
    setLikesCount((c) => Math.max(0, c + (prev ? -1 : 1)));

    try {
      await toggleNoteLike(note, currentUserId, prev);
    } catch (e) {
      console.warn("Could not sync note like:", e);
    }
  };

  const handleDelete = async () => {
    if (!note) return;
    try {
      NoteAudioManager.stop();
      await deleteUserNote(note.id);
      toast.success("Note deleted");
      if (onNoteDeleted) onNoteDeleted();
      handleClose();
    } catch {
      toast.error("Could not delete note");
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !note) return;

    setSendingReply(true);
    try {
      const musicInfo = note.music_track
        ? ` 🎵 ${note.music_track.title} - ${note.music_track.artist}`
        : "";
      const textWithContext = `Replying to your note "${note.text}"${musicInfo}: ${replyText.trim()}`;

      await sendMessage({
        sender_id: currentUserId,
        receiver_id: note.user_id,
        content: textWithContext,
      });

      toast.success("Reply bheja gaya! 💬");
      setReplyText("");
      handleClose();
    } catch {
      toast.error("Reply bhejne me dikkat aayi");
    } finally {
      setSendingReply(false);
    }
  };

  if (!open || !note) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-[#1A1233] text-[#F7F3FF] border border-white/15 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#1A1233]">
          <div
            onClick={() => {
              if (note.profile?.username) {
                handleClose();
                navigate(`/${note.profile.username}`);
              }
            }}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#261C47] ring-1 ring-white/20">
              {note.profile?.avatar_url ? (
                <img
                  src={note.profile.avatar_url}
                  alt={note.profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-xs font-bold text-[#FF3D7F] bg-[#FF3D7F]/10">
                  {note.profile?.username?.[0]?.toUpperCase() || "U"}
                </span>
              )}
            </div>
            <span className="text-sm font-bold text-[#F7F3FF] group-hover:underline">
              {note.profile?.username || "User"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {isOwnNote && onEditNote && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onEditNote();
                }}
                className="p-1.5 rounded-full text-white/60 hover:text-[#7C5CFF] hover:bg-white/10 transition-colors cursor-pointer"
                title="Edit note"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            {isOwnNote && (
              <button
                type="button"
                onClick={handleDelete}
                className="p-1.5 rounded-full text-white/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                title="Delete note"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Note Content Display (Bubble + Avatar + Music) */}
        <div className="p-6 flex flex-col items-center justify-center bg-gradient-to-b from-[#7C5CFF]/15 via-transparent to-transparent">
          {/* Bubble (Instagram Thought Bubble style) */}
          <div className="relative mb-5 px-5 py-3.5 bg-[#261C47] border border-white/20 rounded-2xl shadow-xl max-w-[260px] text-center">
            {/* Thought tail dots */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#261C47] border-r border-b border-white/20 rotate-45" />

            {/* Song pill in note bubble */}
            {note.music_track && (
              <div
                onClick={togglePlayAudio}
                role="button"
                tabIndex={0}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-2.5 cursor-pointer transition-all shadow-md select-none ${
                  isPlaying
                    ? "bg-gradient-to-r from-[#FF3D7F] to-[#7C5CFF] text-white shadow-[#FF3D7F]/30"
                    : "bg-[#1A1233] text-[#FF3D7F] border border-[#FF3D7F]/30 hover:border-[#FF3D7F]"
                }`}
                title={isPlaying ? "Tap to pause music" : "Tap to play music"}
              >
                {/* Vinyl / Disc icon */}
                <div
                  className={`relative w-4 h-4 rounded-full overflow-hidden border border-current shrink-0 ${
                    isPlaying ? "animate-spin" : ""
                  }`}
                  style={{ animationDuration: "3s" }}
                >
                  {note.music_track.artwork ? (
                    <img
                      src={note.music_track.artwork}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-current/20 flex items-center justify-center">
                      <Music2 className="w-2.5 h-2.5" />
                    </div>
                  )}
                  <div className="absolute inset-0 m-auto w-1 h-1 rounded-full bg-[#1A1233]" />
                </div>

                {/* Animated Equalizer Wave Bars */}
                <div className="flex items-end gap-0.5 h-3 px-0.5">
                  <span
                    className={`w-0.5 rounded-full bg-current transition-all duration-300 ${
                      isPlaying ? "h-3 animate-pulse" : "h-1"
                    }`}
                    style={{ animationDuration: "350ms" }}
                  />
                  <span
                    className={`w-0.5 rounded-full bg-current transition-all duration-300 ${
                      isPlaying ? "h-3.5 animate-pulse" : "h-1.5"
                    }`}
                    style={{ animationDuration: "550ms" }}
                  />
                  <span
                    className={`w-0.5 rounded-full bg-current transition-all duration-300 ${
                      isPlaying ? "h-2.5 animate-pulse" : "h-1"
                    }`}
                    style={{ animationDuration: "450ms" }}
                  />
                </div>

                <span className="truncate max-w-[130px]">
                  {note.music_track.title}
                </span>
                <span className="text-[10px] opacity-80 truncate max-w-[80px]">
                  · {note.music_track.artist}
                </span>
                {isPlaying ? (
                  <Volume2 className="w-3 h-3 ml-0.5 shrink-0 opacity-90" />
                ) : (
                  <VolumeX className="w-3 h-3 ml-0.5 shrink-0 opacity-70" />
                )}
              </div>
            )}

            {/* Note text */}
            <p className="text-base font-semibold text-[#F7F3FF] text-pretty break-words leading-snug">
              {note.text}
            </p>
          </div>

          {/* Large Avatar with music pulsation ring */}
          <div
            onClick={() => {
              if (note.profile?.username) {
                handleClose();
                navigate(`/${note.profile.username}`);
              }
            }}
            className={`relative w-20 h-20 rounded-full overflow-hidden bg-[#261C47] flex items-center justify-center shadow-lg cursor-pointer hover:opacity-95 transition-all ${
              isPlaying
                ? "ring-4 ring-[#FF3D7F] shadow-[#FF3D7F]/40 scale-105"
                : "ring-4 ring-[#7C5CFF]/40"
            }`}
          >
            {note.profile?.avatar_url ? (
              <img
                src={note.profile.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-[#FF3D7F]">
                {note.profile?.username?.[0]?.toUpperCase() || "U"}
              </span>
            )}
          </div>

          {/* Like button & count for viewers */}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={handleLike}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border transition-all cursor-pointer ${
                liked
                  ? "bg-rose-500/20 border-rose-500/50 text-rose-400"
                  : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <Heart className={`w-4 h-4 ${liked ? "fill-rose-500" : ""}`} />
              <span className="text-xs font-semibold">{likesCount}</span>
            </button>

            {isOwnNote && (
              <button
                type="button"
                onClick={() => setShowViewersSheet(!showViewersSheet)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/70 hover:text-white text-xs font-medium transition-all cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{viewers.length} views</span>
              </button>
            )}
          </div>

          {/* Viewers list for own note */}
          {isOwnNote && showViewersSheet && (
            <div className="w-full mt-4 p-3 bg-[#120B24] border border-white/10 rounded-2xl max-h-48 overflow-y-auto">
              <div className="text-xs font-bold text-white/60 mb-2 px-1">
                Seen by ({viewers.length})
              </div>
              {loadingViewers ? (
                <div className="text-center text-xs text-white/50 py-2">
                  Loading viewers...
                </div>
              ) : viewers.length === 0 ? (
                <div className="text-center text-xs text-white/50 py-2">
                  No views yet
                </div>
              ) : (
                <div className="space-y-1.5">
                  {viewers.map((v, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        handleClose();
                        navigate(`/${v.profile.username}`);
                      }}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-[#261C47]">
                          {v.profile.avatar_url ? (
                            <img
                              src={v.profile.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-[#FF3D7F]">
                              {v.profile.username?.[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-[#F7F3FF]">
                          {v.profile.username}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40">
                        {new Date(v.viewed_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reply Box if viewer is someone else */}
        {!isOwnNote && (
          <form
            onSubmit={handleSendReply}
            className="p-3 border-t border-white/10 bg-[#120B24] flex items-center gap-2"
          >
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Send message to ${note.profile?.username || "user"}...`}
              className="flex-1 bg-[#261C47] border border-white/15 rounded-full px-4 py-2 text-sm text-[#F7F3FF] placeholder:text-[#A99FD2] focus:outline-none focus:border-[#7C5CFF] transition-colors"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || sendingReply}
              className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FF3D7F] to-[#7C5CFF] text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4 -rotate-45" />
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ViewNoteModal;
