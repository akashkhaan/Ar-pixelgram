import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layouts/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createPost, type ReelMusic } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ImagePlus, X, Loader2, Music2, Volume2, VolumeX, Pencil, Play, Pause } from 'lucide-react';
import MusicPickerSheet from '@/components/reels/MusicPickerSheet';
import MusicTrimmer from '@/components/reels/MusicTrimmer';
import type { MusicTrack } from '@/services/music';
import { uploadMediaWithProgress } from '@/services/mediaUpload';
import { finishUpload, startUpload, updateUpload } from '@/services/uploadManager';

const CreatePostPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);

  // Music integration
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trimTrack, setTrimTrack] = useState<MusicTrack | null>(null);
  const [track, setTrack] = useState<MusicTrack | null>(null);
  const [startMs, setStartMs] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Handle audio preview play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track?.previewUrl) return;
    audio.currentTime = startMs / 1000;
    if (isPlayingAudio) {
      audio.play().catch(() => setIsPlayingAudio(false));
    } else {
      audio.pause();
    }
  }, [track, startMs, isPlayingAudio]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast.error('Image must be under 15MB'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setTrack(null);
    setTrimTrack(null);
    setStartMs(0);
    setIsPlayingAudio(false);
  };

  const handleTrackSelect = (selectedTrack: MusicTrack) => {
    setPickerOpen(false);
    // Open trimmer directly so user can preview and choose the best portion
    setTrimTrack(selectedTrack);
  };

  const handleDoneTrim = ({ startMs: chosenStart }: { startMs: number }) => {
    if (trimTrack) {
      setTrack(trimTrack);
      setStartMs(chosenStart);
      setIsPlayingAudio(true);
      toast.success(`Music added: ${trimTrack.title}`);
    }
    setTrimTrack(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile || !user) { toast.error('Please select an image'); return; }

    const uploadId = startUpload('post', 'Post upload', imagePreview || undefined);
    setLoading(true);

    try {
      // 1 to 100% upload progress
      const imageUrl = await uploadMediaWithProgress('posts', imageFile, user.id, (progress) => {
        updateUpload(uploadId, progress);
      });

      const music: ReelMusic | null = track
        ? {
            track_id: track.id,
            title: track.title,
            artist: track.artist,
            artwork_url: track.artwork,
            preview_url: track.previewUrl,
            start_ms: startMs,
            duration_ms: track.durationMs,
            mute_original: false,
          }
        : null;

      await createPost(imageUrl, caption.trim() || null, music);
      finishUpload(uploadId);
      toast.success('Post shared successfully! ✨');
      navigate('/stories');
    } catch (err) {
      console.error('Post upload failed:', err);
      finishUpload(uploadId, 'Post upload fail hua');
      toast.error('Failed to create post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileLayout>
      <div className="p-4 page-transition max-w-lg mx-auto pb-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Create New Post</h2>
          {imagePreview && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="h-8 px-3 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all"
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>{track ? 'Change Music' : 'Add Music'}</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Image selector */}
          <div className="relative">
            {imagePreview ? (
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted border border-border shadow-sm">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors shadow"
                  aria-label="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Music overlay tag on image */}
                {track && (
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/60 backdrop-blur-md rounded-xl p-2 text-white">
                    <div className="flex items-center gap-2 min-w-0">
                      {track.artwork ? (
                        <img src={track.artwork} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-primary/30 flex items-center justify-center shrink-0">
                          <Music2 className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate leading-tight">{track.title}</p>
                        <p className="text-[10px] text-white/70 truncate">{track.artist}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                        className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:scale-95"
                      >
                        {isPlayingAudio ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrimTrack(track)}
                        className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:scale-95"
                        title="Crop / Trim music"
                      >
                        <Pencil className="w-3.5 h-3.5 text-white" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTrack(null); setIsPlayingAudio(false); }}
                        className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:scale-95"
                        title="Remove music"
                      >
                        <X className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center aspect-square rounded-2xl border-2 border-dashed border-border bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors">
                <ImagePlus className="w-12 h-12 text-muted-foreground mb-3" />
                <span className="text-sm font-medium text-muted-foreground">Tap to select photo</span>
                <span className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, WebP (Max 15MB)</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </label>
            )}
          </div>

          {/* Music Button if image chosen but no music yet */}
          {imagePreview && !track && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <Music2 className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-foreground">Add Music / गाना जोड़ें</p>
                  <p className="text-[11px] text-muted-foreground">Select and crop favorite song portion</p>
                </div>
              </div>
              <span className="text-xs font-bold text-primary px-3 py-1 bg-primary/10 rounded-full">Choose</span>
            </button>
          )}

          {/* Caption */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Caption</label>
            <Textarea
              placeholder="Write a caption…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              maxLength={500}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{caption.length}/500</p>
          </div>

          <Button
            type="submit"
            className="w-full h-11 font-semibold text-white shadow-md active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, hsl(var(--p1)), hsl(var(--p2)))' }}
            disabled={loading || !imageFile}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Sharing Post…
              </>
            ) : (
              'Share Post'
            )}
          </Button>
        </form>

        {/* Hidden Audio element for preview */}
        {track && <audio ref={audioRef} src={track.previewUrl} loop onEnded={() => setIsPlayingAudio(false)} />}

        {/* Music Picker Sheet */}
        <MusicPickerSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleTrackSelect}
        />

        {/* Music Trimmer Modal */}
        {trimTrack && imagePreview && (
          <MusicTrimmer
            track={trimTrack}
            videoUrl={imagePreview}
            mediaType="image"
            initialStartMs={startMs}
            initialMuteOriginal={false}
            onBack={() => setTrimTrack(null)}
            onDone={handleDoneTrim}
          />
        )}
      </div>
    </MobileLayout>
  );
};

export default CreatePostPage;
