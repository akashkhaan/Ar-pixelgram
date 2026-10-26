import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Music2,
  Play,
  Pause,
  Trash2,
  Share2,
} from "lucide-react";
import MusicPickerSheet from "@/components/reels/MusicPickerSheet";
import MusicTrimmer from "@/components/reels/MusicTrimmer";
import type { MusicTrack } from "@/services/music";
import type { UserNote } from "@/services/notes";
import { postUserNote, deleteUserNote } from "@/services/notes";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  myProfile: any;
  existingNote: UserNote | null;
  onNoteCreated: (note: UserNote | null) => void;
}

export const CreateNoteModal: React.FC<Props> = ({
  open,
  onClose,
  currentUserId,
  myProfile,
  existingNote,
  onNoteCreated,
}) => {
  const [text, setText] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [musicStartMs, setMusicStartMs] = useState(0);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [trimTrack, setTrimTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (open) {
      if (existingNote) {
        setText(existingNote.text || "");
        if (existingNote.music_track) {
          setSelectedTrack({
            id: existingNote.music_track.id,
            title: existingNote.music_track.title,
            artist: existingNote.music_track.artist,
            preview_url: existingNote.music_track.preview_url,
            artwork_url: existingNote.music_track.artwork || null,
            duration: 30,
          });
          setMusicStartMs(existingNote.music_track.start_ms || 0);
        } else {
          setSelectedTrack(null);
          setMusicStartMs(0);
        }
      } else {
        setText("");
        setSelectedTrack(null);
        setMusicStartMs(0);
      }
      setIsPlaying(false);
    } else {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = "";
        } catch {}
      }
      setIsPlaying(false);
    }
  }, [open, existingNote]);

  // Audio preview playback for attached song
  useEffect(() => {
    const preview = selectedTrack?.preview_url || (selectedTrack as any)?.previewUrl;
    if (!preview) {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch {}
      }
      setIsPlaying(false);
      return;
    }

    const audio = new Audio(preview);
    (audio as any).playsInline = true;
    audioRef.current = audio;
    audio.currentTime = (musicStartMs || 0) / 1000;
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);

    return () => {
      try {
        audio.pause();
        audio.src = "";
      } catch {}
      audioRef.current = null;
    };
  }, [selectedTrack, musicStartMs]);

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = (musicStartMs || 0) / 1000;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleDismiss = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch {}
    }
    setIsPlaying(false);
    onClose();
  };

  const handleShare = async () => {
    if (!text.trim() && !selectedTrack) {
      toast.error("Kuch likhein ya gaana add karein");
      return;
    }

    setSubmitting(true);
    try {
      const note = await postUserNote(
        currentUserId,
        text.trim(),
        selectedTrack
          ? {
              track: selectedTrack,
              startMs: musicStartMs,
            }
          : null
      );
      toast.success("Note share ho gaya! ✨");
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch {}
      }
      onNoteCreated(note);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Note share karne me error aaya");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingNote) return;
    setSubmitting(true);
    try {
      await deleteUserNote(existingNote.id);
      toast.success("Note delete ho gaya");
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch {}
      }
      onNoteCreated(null);
      onClose();
    } catch {
      toast.error("Note delete nahi ho paya");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-[#1A1233] text-[#F7F3FF] border border-white/15 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#1A1233]">
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[#F7F3FF]">
            {existingNote ? "Edit note" : "New note"}
          </h2>
          <button
            type="button"
            disabled={submitting || (!text.trim() && !selectedTrack)}
            onClick={handleShare}
            className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#FF3D7F] to-[#7C5CFF] text-white font-semibold text-xs disabled:opacity-40 shadow-md hover:opacity-90 transition-all flex items-center gap-1 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>
        </div>

        {/* Note Bubble Center Preview (Instagram Style) */}
        <div className="p-6 flex flex-col items-center justify-center bg-gradient-to-b from-[#7C5CFF]/15 via-transparent to-transparent">
          {/* Circular Avatar + Speech Bubble */}
          <div className="relative flex flex-col items-center mb-6">
            {/* Thought Bubble with text and song badge */}
            <div className="relative mb-3.5 px-4 py-3 bg-[#261C47] border border-white/20 rounded-2xl shadow-xl max-w-[240px] text-center">
              {/* Triangular / Bubble tails */}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#261C47] border-r border-b border-white/20 rotate-45" />

              {/* Music pill inside bubble if selected */}
              {selectedTrack && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A1233] border border-white/15 text-[11px] font-medium text-white mb-1.5 max-w-full truncate shadow-sm">
                  <Music2 className="w-3 h-3 text-[#FF3D7F] shrink-0 animate-pulse" />
                  <span className="truncate font-semibold">{selectedTrack.title}</span>
                  <span className="text-white/60 text-[10px] truncate">· {selectedTrack.artist}</span>
                </div>
              )}

              {/* Note Text Input / Display */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 60))}
                placeholder="Share a thought..."
                rows={2}
                className="w-full text-center text-sm font-medium bg-transparent text-[#F7F3FF] placeholder:text-[#A99FD2] outline-none resize-none"
                autoFocus
              />
              <div className="text-[10px] text-white/50 text-right mt-0.5">
                {text.length}/60
              </div>
            </div>

            {/* Profile Avatar */}
            <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-[#7C5CFF]/60 bg-[#261C47] flex items-center justify-center shadow-lg">
              {myProfile?.avatar_url ? (
                <img
                  src={myProfile.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-[#FF3D7F]">
                  {myProfile?.username?.[0]?.toUpperCase() || "Y"}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-[#A99FD2] text-center">
            Followers and people you follow can see this note for 24 hours.
          </p>
        </div>

        {/* Music Action Section */}
        <div className="p-4 border-t border-white/10 bg-[#120B24] flex flex-col gap-3">
          {selectedTrack ? (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#261C47] border border-white/15 shadow-sm">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Artwork / Music Icon with Play Button */}
                <div
                  onClick={togglePlayAudio}
                  className="relative w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-tr from-[#7C5CFF]/30 to-[#FF3D7F]/30 flex items-center justify-center shrink-0 cursor-pointer group"
                >
                  {selectedTrack.artwork_url ? (
                    <img
                      src={selectedTrack.artwork_url}
                      alt={selectedTrack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music2 className="w-5 h-5 text-[#FF3D7F]" />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity">
                    {isPlaying ? (
                      <Pause className="w-5 h-5 text-white" />
                    ) : (
                      <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#F7F3FF] truncate">
                    {selectedTrack.title}
                  </p>
                  <p className="text-[11px] text-[#A99FD2] truncate">
                    {selectedTrack.artist}
                  </p>
                  <p className="text-[10px] text-[#22D3A0] font-medium mt-0.5">
                    Starts at {Math.floor(musicStartMs / 1000)}s
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setTrimTrack(selectedTrack)}
                  className="px-2.5 py-1 text-xs font-semibold text-[#7C5CFF] hover:bg-[#7C5CFF]/15 rounded-lg transition-colors cursor-pointer"
                >
                  Trim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTrack(null);
                    setMusicStartMs(0);
                    if (audioRef.current) {
                      try {
                        audioRef.current.pause();
                        audioRef.current.src = "";
                      } catch {}
                    }
                    setIsPlaying(false);
                  }}
                  className="p-1.5 text-white/50 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMusicPickerOpen(true)}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-white/20 hover:border-[#FF3D7F]/60 bg-[#261C47]/50 hover:bg-[#261C47] transition-all text-sm font-semibold text-[#F7F3FF] group cursor-pointer"
            >
              <Music2 className="w-4 h-4 text-[#FF3D7F] group-hover:scale-110 transition-transform" />
              <span>Add music to note</span>
            </button>
          )}

          {/* Delete Note Option if existing note */}
          {existingNote && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleDelete}
              className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete active note
            </button>
          )}
        </div>
      </div>

      {/* Music Picker Sheet */}
      <MusicPickerSheet
        open={musicPickerOpen}
        onClose={() => setMusicPickerOpen(false)}
        onSelect={(track) => {
          setMusicPickerOpen(false);
          setTrimTrack(track);
        }}
      />

      {/* Music Trimmer for picking start time */}
      {trimTrack && (
        <MusicTrimmer
          track={trimTrack}
          videoUrl={trimTrack.previewUrl || (trimTrack as any).preview_url}
          mediaType="video"
          initialStartMs={musicStartMs}
          onBack={() => setTrimTrack(null)}
          onDone={({ startMs }) => {
            const pUrl = trimTrack.previewUrl || (trimTrack as any).preview_url || "";
            const art = (trimTrack as any).artwork || (trimTrack as any).artwork_url || "";
            setSelectedTrack({
              ...trimTrack,
              preview_url: pUrl,
              previewUrl: pUrl,
              artwork_url: art,
              artwork: art,
            });
            setMusicStartMs(startMs);
            setTrimTrack(null);
            toast.success("Gaana select ho gaya! 🎵");
          }}
        />
      )}
    </div>,
    document.body
  );
};

export default CreateNoteModal;
