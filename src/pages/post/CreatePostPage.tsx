import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layouts/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createPost, type ReelMusic } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  ImagePlus,
  Film,
  X,
  Loader2,
  Music2,
  Volume2,
  VolumeX,
  Pencil,
  Play,
  Pause,
} from 'lucide-react';
import MusicPickerSheet from '@/components/reels/MusicPickerSheet';
import MusicTrimmer from '@/components/reels/MusicTrimmer';
import type { MusicTrack } from '@/services/music';
import { uploadMediaWithProgress } from '@/services/mediaUpload';
import { finishUpload, startUpload, updateUpload } from '@/services/uploadManager';

const CreatePostPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);

  // Video preview sound
  const [isVideoSoundOn, setIsVideoSoundOn] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Music integration
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trimTrack, setTrimTrack] = useState<MusicTrack | null>(null);
  const [track, setTrack] = useState<MusicTrack | null>(null);
  const [startMs, setStartMs] = useState(0);
  const [muteOriginal, setMuteOriginal] = useState(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Hidden inputs refs
  const anyInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

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

  const handleFileProcess = (file: File) => {
    const isVid = file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|m4v)$/i.test(file.name);
    if (isVid) {
      if (file.size > 100 * 1024 * 1024) {
        toast.error('Video must be under 100MB');
        return;
      }
      setMediaType('video');
    } else {
      if (file.size > 15 * 1024 * 1024) {
        toast.error('Photo must be under 15MB');
        return;
      }
      setMediaType('image');
    }

    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileProcess(file);
    e.target.value = '';
  };

  const handleRemoveMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
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

  const handleDoneTrim = ({
    startMs: chosenStart,
    muteOriginal: nextMuteOriginal,
  }: {
    startMs: number;
    muteOriginal: boolean;
  }) => {
    if (trimTrack) {
      setTrack(trimTrack);
      setStartMs(chosenStart);
      setMuteOriginal(nextMuteOriginal);
      setIsPlayingAudio(true);
      toast.success(`Music added: ${trimTrack.title}`);
    }
    setTrimTrack(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaFile || !user) {
      toast.error('Please select a photo or video');
      return;
    }

    const uploadId = startUpload(
      'post',
      mediaType === 'video' ? 'Video post upload' : 'Photo post upload',
      mediaPreview || undefined
    );
    setLoading(true);

    try {
      // 1 to 100% upload progress to Supabase posts bucket
      const mediaUrl = await uploadMediaWithProgress('posts', mediaFile, user.id, (progress) => {
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
            mute_original: muteOriginal,
          }
        : null;

      await createPost(mediaUrl, caption.trim() || null, music);
      finishUpload(uploadId);
      toast.success(mediaType === 'video' ? 'Video post shared! 🎬✨' : 'Post shared! 📷✨');
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
      <div className="p-4 max-w-lg mx-auto pb-24">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Create Post</h1>
            <p className="text-xs text-muted-foreground">Photo ya video upload karein aur gana jodein</p>
          </div>
          {mediaPreview && (
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
          {/* Media selector & preview */}
          <div className="relative">
            {mediaPreview ? (
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-black border border-border shadow-sm flex items-center justify-center">
                {mediaType === 'video' ? (
                  <video
                    ref={previewVideoRef}
                    src={mediaPreview}
                    className="w-full h-full object-contain bg-black"
                    autoPlay
                    loop
                    playsInline
                    muted={track ? true : !isVideoSoundOn}
                  />
                ) : (
                  <img src={mediaPreview} alt="Preview" className="w-full h-full object-cover" />
                )}

                {/* Badge: Photo or Video */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1.5 shadow">
                  {mediaType === 'video' ? (
                    <>
                      <Film className="w-3.5 h-3.5 text-primary" />
                      <span>Video Post</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-3.5 h-3.5 text-primary" />
                      <span>Photo Post</span>
                    </>
                  )}
                </div>

                {/* Video Sound Toggle (if video and no music track selected yet) */}
                {mediaType === 'video' && !track && (
                  <button
                    type="button"
                    onClick={() => setIsVideoSoundOn((v) => !v)}
                    className="absolute top-3 right-13 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors shadow"
                    title={isVideoSoundOn ? 'Mute preview' : 'Unmute preview'}
                  >
                    {isVideoSoundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                )}

                {/* Remove button */}
                <button
                  type="button"
                  onClick={handleRemoveMedia}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors shadow"
                  aria-label="Remove media"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Music overlay tag on media */}
                {track && (
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/70 backdrop-blur-md rounded-xl p-2.5 text-white z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      {track.artwork ? (
                        <img src={track.artwork} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-primary/30 flex items-center justify-center shrink-0">
                          <Music2 className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate leading-tight">{track.title}</p>
                        <p className="text-[10px] text-white/70 truncate">{track.artist}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                        className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:scale-95"
                      >
                        {isPlayingAudio ? (
                          <Pause className="w-3.5 h-3.5 fill-white" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                        )}
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
                        onClick={() => {
                          setTrack(null);
                          setIsPlayingAudio(false);
                        }}
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
              <div className="space-y-3">
                {/* Unified Drag / Drop / Tap card */}
                <div
                  onClick={() => anyInputRef.current?.click()}
                  className="flex flex-col items-center justify-center aspect-square rounded-2xl border-2 border-dashed border-border bg-muted/40 cursor-pointer hover:bg-muted/70 transition-colors p-6 text-center"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <ImagePlus className="w-6 h-6" />
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Film className="w-6 h-6" />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    Tap to select Photo or Video
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Photo (JPG, PNG) ya Video (MP4, MOV, WebM)
                  </span>

                  {/* Quick Action Buttons inside */}
                  <div className="flex items-center gap-2.5 mt-5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        photoInputRef.current?.click();
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-muted border border-border text-foreground hover:bg-muted/80 text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                    >
                      <ImagePlus className="w-3.5 h-3.5 text-primary" />
                      <span>Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        videoInputRef.current?.click();
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-muted border border-border text-foreground hover:bg-muted/80 text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                    >
                      <Film className="w-3.5 h-3.5 text-primary" />
                      <span>Video</span>
                    </button>
                  </div>
                </div>

                {/* Hidden Inputs */}
                <input
                  ref={anyInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleMediaSelect}
                />
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleMediaSelect}
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleMediaSelect}
                />
              </div>
            )}
          </div>

          {/* Music Button if media chosen but no music yet */}
          {mediaPreview && !track && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <Music2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-foreground">Add Music / गाना जोड़ें 🎵</p>
                  <p className="text-[11px] text-muted-foreground">Select and crop favorite song portion</p>
                </div>
              </div>
              <span className="text-xs font-bold text-primary px-3 py-1.5 bg-primary/15 rounded-full">
                Choose Song
              </span>
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
            disabled={loading || !mediaFile}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Sharing {mediaType === 'video' ? 'Video Post' : 'Post'}…
              </>
            ) : (
              `Share ${mediaType === 'video' ? 'Video Post' : 'Post'}`
            )}
          </Button>
        </form>

        {/* Hidden Audio element for preview */}
        {track && (
          <audio
            ref={audioRef}
            src={track.previewUrl}
            loop
            onEnded={() => setIsPlayingAudio(false)}
          />
        )}

        {/* Music Picker Sheet */}
        <MusicPickerSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleTrackSelect}
        />

        {/* Music Trimmer Modal */}
        {trimTrack && mediaPreview && (
          <MusicTrimmer
            track={trimTrack}
            videoUrl={mediaPreview}
            mediaType={mediaType}
            initialStartMs={startMs}
            initialMuteOriginal={muteOriginal}
            onBack={() => setTrimTrack(null)}
            onDone={handleDoneTrim}
          />
        )}
      </div>
    </MobileLayout>
  );
};

export default CreatePostPage;
