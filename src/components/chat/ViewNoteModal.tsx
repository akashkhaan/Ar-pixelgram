import React, { useState, useEffect } from "react";
import {
  X,
  Heart,
  Music2,
  Play,
  Pause,
  Eye,
  Trash2,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { UserNote } from "@/services/notes";
import {
  toggleNoteLike,
  isNoteLiked,
  recordNoteView,
  getNoteViewersAndLikers,
  deleteUserNote,
  NoteAudioManager,
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
}

export const ViewNoteModal: React.FC<Props> = ({
  open,
  onClose,
  note,
  currentUserId,
  isOwnNote,
  onNoteDeleted,
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

    // Subscribe to audio manager state
    const unsubscribe = NoteAudioManager.subscribe((playing) => {
      setIsPlaying(playing);
    });

    // Auto-play music if attached and not already playing
    if (note.music_track?.preview_url) {
      if (!NoteAudioManager.isPlaying() || NoteAudioManager.getCurrentUrl() !== note.music_track.preview_url) {
        NoteAudioManager.play(
          note.music_track.preview_url,
          note.music_track.start_ms || 0
        );
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
    }
  };

  const handleLike = async () => {
    if (!note) return;
    const prev = liked;
    setLiked(!prev);
    setLikesCount((c) => Math.max(0, c + (prev ? -1 : 1)));

    try {
      await toggleNoteLike(note, currentUserId, prev);
    } catch {
      setLiked(prev);
      setLikesCount((c) => Math.max(0, c + (prev ? 1 : -1)));
      toast.error("Like update nahi ho paya");
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-card border border-border/80 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-card/90">
          <div
            onClick={() => {
              if (note.profile?.username) {
                handleClose();
                navigate(`/${note.profile.username}`);
              }
            }}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-muted ring-1 ring-border">
              {note.profile?.avatar_url ? (
                <img
                  src={note.profile.avatar_url}
                  alt={note.profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-xs font-bold text-primary bg-primary/10">
                  {note.profile?.username?.[0]?.toUpperCase() || "U"}
                </span>
              )}
            </div>
            <span className="text-sm font-bold text-foreground group-hover:underline">
              {note.profile?.username || "User"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {isOwnNote && (
              <button
                type="button"
                onClick={handleDelete}
                className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete note"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Note Content Display (Bubble + Avatar + Music) */}
        <div className="p-6 flex flex-col items-center justify-center bg-gradient-to-b from-primary/10 via-transparent to-transparent">
          {/* Bubble (Instagram Thought Bubble style) */}
          <div className="relative mb-5 px-5 py-3.5 bg-card border border-border/80 rounded-2xl shadow-md max-w-[260px] text-center">
            {/* Thought tail dots */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-card border-r border-b border-border/80 rotate-45" />

            {/* Song pill in note bubble */}
            {note.music_track && (
              <div
                onClick={togglePlayAudio}
                role="button"
                tabIndex={0}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-2.5 cursor-pointer transition-all shadow-xs select-none ${
                  isPlaying
                    ? "bg-primary text-primary-foreground shadow-primary/25 shadow-md"
                    : "bg-primary/15 text-primary hover:bg-primary/25"
                }`}
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
                  <div className="absolute inset-0 m-auto w-1 h-1 rounded-full bg-background" />
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
              </div>
            )}

            {/* Note text */}
            <p className="text-base font-semibold text-foreground text-pretty break-words leading-snug">
              {note.text}
            </p>
          </div>

          {/* Tap-to-play banner if autoplay was restricted by device gesture policy */}
          {!isPlaying && note.music_track && (
            <button
              type="button"
              onClick={togglePlayAudio}
              className="mb-4 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-md animate-bounce"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Tap to play song 🎵</span>
            </button>
          )}

          {/* Large Avatar with music pulsation ring */}
          <div
            onClick={() => {
              if (note.profile?.username) {
                handleClose();
                navigate(`/${note.profile.username}`);
              }
            }}
            className={`relative w-20 h-20 rounded-full overflow-hidden bg-muted flex items-center justify-center shadow-lg cursor-pointer hover:opacity-95 transition-all ${
              isPlaying
                ? "ring-4 ring-primary shadow-primary/30"
                : "ring-4 ring-primary/20"
            }`}
          >
            {note.profile?.avatar_url ? (
              <img
                src={note.profile.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-primary">
                {note.profile?.username?.[0]?.toUpperCase() || "U"}
              </span>
            )}
          </div>

          {/* Audio controls indicator */}
          {note.music_track && (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={togglePlayAudio}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {isPlaying ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[11px] text-primary font-medium">Playing music</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Music paused</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Like button & count for viewers */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleLike}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border transition-all ${
                liked
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                  : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Heart className={`w-4 h-4 ${liked ? "fill-rose-500" : ""}`} />
              <span className="text-xs font-semibold">{likesCount}</span>
            </button>

            {isOwnNote && (
              <button
                type="button"
                onClick={() => setShowViewersSheet(!showViewersSheet)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground transition-colors text-xs font-semibold"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{viewers.length} views</span>
              </button>
            )}
          </div>
        </div>

        {/* Viewers & Likers Sheet for Owner */}
        {isOwnNote && showViewersSheet && (
          <div className="border-t border-border/40 p-4 max-h-56 overflow-y-auto bg-muted/15">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
              Seen by ({viewers.length})
            </h4>
            {loadingViewers ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading views...</p>
            ) : viewers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No one has seen this yet</p>
            ) : (
              <div className="space-y-2">
                {viewers.map((v, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      handleClose();
                      navigate(`/${v.profile.username}`);
                    }}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-muted ring-1 ring-border">
                        {v.profile.avatar_url ? (
                          <img
                            src={v.profile.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-xs font-bold text-primary">
                            {v.profile.username?.[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {v.profile.full_name || v.profile.username}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          @{v.profile.username}
                        </p>
                      </div>
                    </div>
                    {v.liked && (
                      <Heart className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reply Box if viewer is someone else */}
        {!isOwnNote && (
          <form
            onSubmit={handleSendReply}
            className="p-3 border-t border-border/40 bg-card flex items-center gap-2"
          >
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Send message to ${note.profile?.username || "user"}...`}
              className="flex-1 bg-muted/60 text-sm text-foreground placeholder:text-muted-foreground rounded-full px-4 py-2 outline-none focus:ring-1 focus:ring-border"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || sendingReply}
              className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-all shadow-xs"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ViewNoteModal;
