import useGoBack from '@/hooks/use-go-back';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  X,
  Loader2,
  ArrowLeft,
  Music2,
  VolumeX,
  Volume2,
  Pencil,
  Image as ImageIcon,
  Play,
  Pause,
  Check,
  ChevronRight,
  Sparkles,
  Camera,
  RotateCw,
  Film,
  Scissors,
  SlidersHorizontal,
  Flame,
  Zap,
  Sun,
  Video as VideoIcon,
  ImagePlus,
  Plus,
  Clock,
  Send,
  UploadCloud,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createReel, createPost, createStory, uploadImage, type ReelMusic } from '@/services/api';
import { createVideo, uploadVideoFile, uploadVideoThumbnail } from '@/services/videos';
import type { MusicTrack } from '@/services/music';
import MusicPickerSheet from '@/components/reels/MusicPickerSheet';
import MusicTrimmer from '@/components/reels/MusicTrimmer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { uploadMediaWithProgress } from '@/services/mediaUpload';
import { finishUpload, startUpload, updateUpload } from '@/services/uploadManager';
import {
  sendBrowserPushNotification,
  requestNotificationPermission,
} from '@/lib/browserPushNotification';

type Mode = 'post' | 'story' | 'reel' | 'video';
type Step = 'camera' | 'edit' | 'details';

interface CameraEffect {
  id: string;
  name: string;
  filter: string;
  iconBg: string;
  badge: string;
}

const EFFECTS: CameraEffect[] = [
  { id: 'none', name: 'Normal', filter: 'none', iconBg: 'bg-zinc-800', badge: '⚪' },
  { id: 'film_burn', name: 'Film burn II', filter: 'contrast(125%) saturate(145%) sepia(30%) hue-rotate(-10deg)', iconBg: 'bg-amber-600', badge: '🔥' },
  { id: 'lovit', name: 'Lovit ✨', filter: 'brightness(110%) contrast(108%) saturate(140%)', iconBg: 'bg-pink-600', badge: '💖' },
  { id: 'bw_glitch', name: 'B&W GLITCH', filter: 'grayscale(100%) contrast(170%) brightness(105%)', iconBg: 'bg-black border border-white', badge: '🏁' },
  { id: 'police_light', name: 'Police Light', filter: 'hue-rotate(185deg) saturate(220%)', iconBg: 'bg-blue-600', badge: '🚨' },
  { id: 'golden_hour', name: 'Golden Hour', filter: 'sepia(45%) saturate(175%) brightness(108%) contrast(110%)', iconBg: 'bg-yellow-500', badge: '🌅' },
  { id: 'vhs', name: 'VHS 90s', filter: 'contrast(120%) saturate(85%) sepia(20%)', iconBg: 'bg-purple-600', badge: '📼' },
  { id: 'cyberpunk', name: 'Cyberpunk', filter: 'hue-rotate(245deg) saturate(230%) contrast(120%)', iconBg: 'bg-cyan-600', badge: '⚡' },
  { id: 'noir', name: 'Noir 📽️', filter: 'grayscale(100%) contrast(210%) brightness(88%)', iconBg: 'bg-zinc-900 border border-zinc-500', badge: '🎬' },
];

const CreateReelPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack('/reels');
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Mode: Post | Story | Reel | Video
  const initialMode = (searchParams.get('mode') as Mode) || 'reel';
  const [activeMode, setActiveMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>('camera');

  // Camera & recording states
  const videoStreamRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [frontCamera, setFrontCamera] = useState(true);
  const [selectedEffect, setSelectedEffect] = useState<CameraEffect>(EFFECTS[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [maxRecordDuration, setMaxRecordDuration] = useState(30); // 15, 30, 60s
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Gallery inputs
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Selected media
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('video');

  // Video trimming
  const editVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(true);

  // Music state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trimTrack, setTrimTrack] = useState<MusicTrack | null>(null);
  const [track, setTrack] = useState<MusicTrack | null>(null);
  const [startMs, setStartMs] = useState(0);
  const [muteOriginal, setMuteOriginal] = useState(true);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);

  // Details / share fields
  const [caption, setCaption] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoVisibility, setVideoVisibility] = useState<'public' | 'private'>('public');

  // Cover / thumbnail
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Upload progress
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  // Cleanup previews
  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      stopCamera();
    };
  }, []);

  // Request browser push notification permission proactively
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  // Audio passed from Song page
  useEffect(() => {
    const passed = (location.state as { track?: MusicTrack } | null)?.track;
    if (passed?.previewUrl) {
      setTrack(passed);
      setStartMs(0);
    }
  }, [location.state]);

  // Start Camera Stream
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: frontCamera ? 'user' : 'environment',
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoStreamRef.current) {
        videoStreamRef.current.srcObject = stream;
      }
      setHasCameraPermission(true);
    } catch (err) {
      console.warn('Camera permission denied or camera not found:', err);
      setHasCameraPermission(false);
    }
  }, [frontCamera]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Camera management on step changes
  useEffect(() => {
    if (step === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [step, frontCamera, startCamera, stopCamera]);

  // Handle Recording start / stop
  const startRecording = () => {
    if (!streamRef.current || isRecording) return;
    recordedChunksRef.current = [];

    let mimeType = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }
    }

    try {
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(streamRef.current, options);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || 'video/mp4' });
        const file = new File([blob], `recording_${Date.now()}.mp4`, { type: blob.type || 'video/mp4' });
        handleMediaLoaded(file, 'video');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordDuration(0);

      const startTimestamp = Date.now();
      recordTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimestamp) / 1000;
        setRecordDuration(elapsed);
        if (elapsed >= maxRecordDuration) {
          stopRecording();
        }
      }, 100);
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      toast.error('Recording start nahi ho paayi. Gallery se video select karein.');
    }
  };

  const stopRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Flip camera
  const toggleCameraFlip = () => {
    setFrontCamera((prev) => !prev);
  };

  // Media loaded from Camera or Gallery
  const handleMediaLoaded = (file: File, type: 'image' | 'video') => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaType(type);
    const url = URL.createObjectURL(file);
    setMediaPreview(url);

    if (type === 'video') {
      // Create temporary video element to read duration
      const tempV = document.createElement('video');
      tempV.src = url;
      tempV.onloadedmetadata = () => {
        const d = tempV.duration || 15;
        setVideoDuration(d);
        setTrimStart(0);
        setTrimEnd(d);
        // Default cover at 0.5s
        captureCoverFromTime(tempV, Math.min(0.5, d));
      };
      setStep('edit');
    } else {
      setStep('edit');
    }
  };

  // Gallery Picker
  const handleGalleryClick = () => {
    if (!galleryInputRef.current) return;
    galleryInputRef.current.click();
  };

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVid = file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|m4v)$/i.test(file.name);
    if (activeMode === 'reel' || activeMode === 'video') {
      if (!isVid) {
        toast.error('Kripya video file select karein');
        return;
      }
    }

    if (isVid && file.size > 150 * 1024 * 1024) {
      toast.error('Video 150MB se chhota hona chahiye');
      return;
    }

    handleMediaLoaded(file, isVid ? 'video' : 'image');
    e.target.value = '';
  };

  // Video preview looping between trimStart and trimEnd
  useEffect(() => {
    const v = editVideoRef.current;
    if (!v || mediaType !== 'video') return;

    const handleTimeUpdate = () => {
      if (trimEnd > 0 && v.currentTime >= trimEnd) {
        v.currentTime = trimStart;
        if (isPlayingPreview) void v.play().catch(() => {});
      }
    };
    v.addEventListener('timeupdate', handleTimeUpdate);
    return () => v.removeEventListener('timeupdate', handleTimeUpdate);
  }, [trimStart, trimEnd, isPlayingPreview, mediaType]);

  // Sync background music with video preview
  useEffect(() => {
    const a = audioPreviewRef.current;
    if (!a || !track?.previewUrl) return;

    a.currentTime = startMs / 1000;
    if (isPlayingPreview && step === 'edit') {
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [track, startMs, isPlayingPreview, step]);

  // Capture cover image from video at specified time
  const captureCoverFromTime = (videoEl: HTMLVideoElement, timeSec: number) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 720;
      canvas.height = videoEl.videoHeight || 1280;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          if (coverPreview) URL.revokeObjectURL(coverPreview);
          setCoverBlob(blob);
          setCoverPreview(URL.createObjectURL(blob));
        },
        'image/jpeg',
        0.85
      );
    } catch (e) {
      console.warn('Cover capture error:', e);
    }
  };

  const handleCustomCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Photo select karein');
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverBlob(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  // Music handlers
  const handleTrackSelect = (selected: MusicTrack) => {
    setPickerOpen(false);
    setTrimTrack(selected);
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
      toast.success(`Music added: ${trimTrack.title}`);
    }
    setTrimTrack(null);
  };

  // Upload and Share
  const handlePublish = async () => {
    if (!user) {
      toast.error('Pehle login karein');
      return;
    }
    if (!mediaFile) {
      toast.error('Media select karein');
      return;
    }

    setUploading(true);
    setUploadPercent(0);

    const uploadId = startUpload(
      activeMode,
      `${activeMode.toUpperCase()} upload`,
      mediaPreview || undefined
    );

    try {
      const musicPayload: ReelMusic | null = track
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

      if (activeMode === 'reel') {
        // Upload video file
        const videoUrl = await uploadMediaWithProgress('reels', mediaFile, user.id, (p) => {
          setUploadPercent(p);
          updateUpload(uploadId, p);
        });

        // Upload cover if captured
        let coverUrl: string | null = null;
        if (coverBlob) {
          try {
            const coverFile = new File([coverBlob], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
            coverUrl = await uploadImage('posts', coverFile, user.id);
          } catch {
            coverUrl = null;
          }
        }

        await createReel(user.id, videoUrl, caption.trim() || '', coverUrl || undefined, musicPayload);
        finishUpload(uploadId);
        toast.success('Reel share ho gayi! 🎬✨');
        void sendBrowserPushNotification('Pixelgram', 'Aapka Reel successfully share ho gaya! 🎬');
        navigate('/reels');
      } else if (activeMode === 'story') {
        const mediaUrl = await uploadMediaWithProgress('stories', mediaFile, user.id, (p) => {
          setUploadPercent(p);
          updateUpload(uploadId, p);
        });
        await createStory(mediaUrl, caption.trim() || null, musicPayload);
        finishUpload(uploadId);
        toast.success('Story share ho gayi! 🌟✨');
        void sendBrowserPushNotification('Pixelgram', 'Aapki Story successfully add ho gayi! 🌟');
        navigate('/stories');
      } else if (activeMode === 'post') {
        const mediaUrl = await uploadMediaWithProgress('posts', mediaFile, user.id, (p) => {
          setUploadPercent(p);
          updateUpload(uploadId, p);
        });
        await createPost(mediaUrl, caption.trim() || null, musicPayload);
        finishUpload(uploadId);
        toast.success('Post share ho gaya! 📷✨');
        void sendBrowserPushNotification('Pixelgram', 'Aapka Post successfully share ho gaya! 📷');
        navigate('/stories');
      } else if (activeMode === 'video') {
        if (!videoTitle.trim()) {
          toast.error('Video ka title likhein');
          setUploading(false);
          return;
        }
        const videoUrl = await uploadVideoFile(mediaFile, user.id, (p) => {
          setUploadPercent(p);
          updateUpload(uploadId, p);
        });

        let thumbUrl: string | null = null;
        if (coverBlob) {
          try {
            thumbUrl = await uploadVideoThumbnail(coverBlob, user.id);
          } catch {
            thumbUrl = null;
          }
        }

        await createVideo({
          userId: user.id,
          title: videoTitle.trim(),
          description: videoDescription.trim() || undefined,
          videoUrl,
          thumbnailUrl: thumbUrl,
          durationSec: videoDuration ? Math.round(videoDuration) : null,
          visibility: videoVisibility,
        });

        finishUpload(uploadId);
        toast.success('Video upload ho gaya! 🎥✨');
        void sendBrowserPushNotification('Pixelgram', 'Aapka Video successfully upload ho gaya! 🎥');
        navigate('/videos');
      }
    } catch (err) {
      console.error('Publish failed:', err);
      finishUpload(uploadId, 'Upload failed');
      toast.error('Upload fail ho gaya. Kripya dobara try karein.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black text-white select-none overflow-hidden flex flex-col z-[100]">
      {/* ========================================================================= */}
      {/* 1. CAMERA VIEW (Shutter, Effects Wheel, Gallery, Mode Switcher) */}
      {/* ========================================================================= */}
      {step === 'camera' && (
        <div className="relative w-full h-full flex flex-col justify-between">
          {/* Viewfinder Video */}
          <div className="absolute inset-0 overflow-hidden bg-zinc-950 flex items-center justify-center">
            {hasCameraPermission === false ? (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-xs">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/80">
                  <Camera className="w-8 h-8" />
                </div>
                <p className="text-sm font-semibold text-white">Camera access nahi mila ya available nahi hai</p>
                <p className="text-xs text-white/60">Aap device gallery se video/photo select karke direct upload kar sakte hain.</p>
                <button
                  type="button"
                  onClick={handleGalleryClick}
                  className="px-5 py-2.5 rounded-full bg-primary text-white text-xs font-bold shadow-lg active:scale-95 transition-all"
                >
                  Gallery se select karein 📁
                </button>
              </div>
            ) : (
              <video
                ref={videoStreamRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transition-all duration-300"
                style={{
                  filter: selectedEffect.filter,
                  transform: frontCamera ? 'scaleX(-1)' : 'none',
                }}
              />
            )}
          </div>

          {/* Top Bar: Close, Sound/Audio pill, Duration, Flip */}
          <div className="relative z-20 flex items-center justify-between p-4 pt-6 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
            <button
              onClick={goBack}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 active:scale-90"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Add Audio Pill */}
            <button
              onClick={() => setPickerOpen(true)}
              className="px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center gap-2 text-xs font-semibold hover:bg-black/70 active:scale-95"
            >
              <Music2 className="w-3.5 h-3.5 text-primary" />
              <span className="truncate max-w-[130px]">
                {track ? track.title : 'Add audio'}
              </span>
            </button>

            {/* Max Duration Toggle (15s / 30s / 60s) */}
            <button
              onClick={() => setMaxRecordDuration((prev) => (prev === 15 ? 30 : prev === 30 ? 60 : 15))}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-xs font-bold text-white hover:bg-black/60 active:scale-90"
              title="Change duration limit"
            >
              {maxRecordDuration}s
            </button>
          </div>

          {/* Left Side Floating Tools */}
          <div className="relative z-20 flex flex-col gap-4 pl-4 pointer-events-auto">
            <button
              onClick={toggleCameraFlip}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 active:scale-95"
              title="Flip camera"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom Area: Active Effect Badge, Effects Carousel & Shutter, Mode Tabs */}
          <div className="relative z-20 flex flex-col items-center pb-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-6 space-y-4">
            {/* Selected Effect Badge Pill */}
            {selectedEffect.id !== 'none' && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-xs font-bold text-white shadow animate-in fade-in">
                <span>{selectedEffect.badge}</span>
                <span>{selectedEffect.name}</span>
                <button
                  onClick={() => setSelectedEffect(EFFECTS[0])}
                  className="ml-1 text-white/60 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Shutter & Effects Wheel Container */}
            <div className="w-full flex items-center justify-between px-6">
              {/* Bottom-left: Gallery picker icon */}
              <button
                type="button"
                onClick={handleGalleryClick}
                className="w-12 h-12 rounded-2xl border-2 border-white/80 overflow-hidden bg-zinc-800 flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg group"
                title="Open Gallery"
              >
                <ImageIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
              </button>

              {/* Center: Instagram-Style Shutter Button with Effects Wheel */}
              <div className="flex items-center gap-3 overflow-x-auto max-w-[220px] no-scrollbar py-1">
                {EFFECTS.map((eff) => {
                  const isSelected = selectedEffect.id === eff.id;
                  return (
                    <button
                      key={eff.id}
                      type="button"
                      onClick={() => setSelectedEffect(eff)}
                      className={`relative shrink-0 rounded-full transition-all duration-200 flex items-center justify-center ${
                        isSelected
                          ? 'w-18 h-18 ring-4 ring-white shadow-2xl scale-105'
                          : 'w-12 h-12 opacity-70 hover:opacity-100 ring-1 ring-white/30'
                      } ${eff.iconBg}`}
                    >
                      {/* Center Shutter Ring for selected effect */}
                      {isSelected ? (
                        <div
                          onPointerDown={startRecording}
                          onPointerUp={stopRecording}
                          onClick={() => {
                            if (isRecording) stopRecording();
                            else startRecording();
                          }}
                          className="w-14 h-14 rounded-full bg-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
                        >
                          <div
                            className={`w-6 h-6 rounded-full transition-all ${
                              isRecording ? 'bg-red-600 rounded-sm scale-90' : 'bg-red-500'
                            }`}
                          />
                        </div>
                      ) : (
                        <span className="text-xs">{eff.badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Bottom-right: Flip Camera icon */}
              <button
                type="button"
                onClick={toggleCameraFlip}
                className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg"
                title="Flip Camera"
              >
                <RotateCw className="w-6 h-6" />
              </button>
            </div>

            {/* Recording Timer Indicator */}
            {isRecording && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>REC {recordDuration.toFixed(1)}s / {maxRecordDuration}s</span>
              </div>
            )}

            {/* Bottom 4 Modes Switcher: POST | STORY | REEL | VIDEO */}
            <div className="flex items-center justify-center gap-6 pt-2 text-xs font-bold tracking-wider">
              {(['post', 'story', 'reel', 'video'] as Mode[]).map((m) => {
                const isActive = activeMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setActiveMode(m)}
                    className={`uppercase transition-all duration-200 py-1 px-2.5 rounded-full ${
                      isActive
                        ? 'text-white bg-white/20 shadow-sm font-extrabold scale-110'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hidden File Input for Gallery */}
          <input
            ref={galleryInputRef}
            type="file"
            accept={activeMode === 'reel' || activeMode === 'video' ? 'video/*' : 'image/*,video/*'}
            className="hidden"
            onChange={handleGalleryChange}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. EDIT / TRIM & MUSIC STEP */}
      {/* ========================================================================= */}
      {step === 'edit' && (
        <div className="relative w-full h-full flex flex-col justify-between bg-black">
          {/* Top Bar: Back, Add Music, Continue/Next */}
          <div className="relative z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <button
              onClick={() => setStep('camera')}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Music Button */}
            <button
              onClick={() => setPickerOpen(true)}
              className="px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center gap-1.5 text-xs font-bold text-white hover:bg-black/80"
            >
              <Music2 className="w-3.5 h-3.5 text-primary" />
              <span>{track ? track.title : 'Add Music'}</span>
            </button>

            {/* Next / Continue */}
            <button
              onClick={() => setStep('details')}
              className="px-4 py-1.5 rounded-full bg-primary text-white text-xs font-bold flex items-center gap-1 shadow-lg active:scale-95"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Media Center Preview */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden px-2">
            {mediaType === 'video' && mediaPreview ? (
              <video
                ref={editVideoRef}
                src={mediaPreview}
                className="max-h-[68vh] w-auto aspect-[9/16] object-cover rounded-2xl shadow-2xl bg-black"
                autoPlay
                playsInline
                loop
                muted={track ? true : false}
                onClick={() => {
                  const v = editVideoRef.current;
                  if (!v) return;
                  if (v.paused) {
                    void v.play();
                    setIsPlayingPreview(true);
                  } else {
                    v.pause();
                    setIsPlayingPreview(false);
                  }
                }}
              />
            ) : mediaPreview ? (
              <img
                src={mediaPreview}
                alt="Preview"
                className="max-h-[68vh] w-auto aspect-square object-cover rounded-2xl shadow-2xl"
              />
            ) : null}
          </div>

          {/* Video Trimmer & Controls ("video ko edit karke chhota kar sakein") */}
          <div className="p-4 bg-zinc-950 border-t border-zinc-800 space-y-3">
            {mediaType === 'video' && videoDuration > 0 && (
              <div className="space-y-1.5 bg-zinc-900 p-3 rounded-2xl border border-zinc-800">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-primary" />
                    <span>Trim / Chhota karein</span>
                  </span>
                  <span className="text-zinc-400">
                    {(trimEnd - trimStart).toFixed(1)}s / {videoDuration.toFixed(1)}s
                  </span>
                </div>

                {/* Range Sliders for Start & End Time */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[10px] text-zinc-400">Start: {trimStart.toFixed(1)}s</label>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, trimEnd - 1)}
                      step={0.5}
                      value={trimStart}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setTrimStart(val);
                        if (editVideoRef.current) editVideoRef.current.currentTime = val;
                      }}
                      className="w-full accent-primary h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">End: {trimEnd.toFixed(1)}s</label>
                    <input
                      type="range"
                      min={trimStart + 1}
                      max={videoDuration}
                      step={0.5}
                      value={trimEnd}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setTrimEnd(val);
                        if (editVideoRef.current) editVideoRef.current.currentTime = val;
                      }}
                      className="w-full accent-primary h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Music Preview Pill */}
            {track && (
              <div className="flex items-center justify-between bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-800 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {track.artwork ? (
                    <img src={track.artwork} alt="" className="w-7 h-7 rounded-lg object-cover" />
                  ) : (
                    <Music2 className="w-4 h-4 text-primary" />
                  )}
                  <span className="font-semibold truncate max-w-[150px]">{track.title}</span>
                </div>
                <button
                  onClick={() => setTrimTrack(track)}
                  className="text-primary font-bold hover:underline"
                >
                  Edit audio
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DETAILS & SHARE STEP */}
      {/* ========================================================================= */}
      {step === 'details' && (
        <div className="relative w-full h-full flex flex-col justify-between bg-zinc-950 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-20 flex items-center justify-between p-4 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
            <button
              onClick={() => setStep('edit')}
              className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Share to {activeMode}
            </h2>
            <div className="w-9" />
          </div>

          {/* Form Content */}
          <div className="p-4 space-y-5 flex-1 max-w-lg mx-auto w-full">
            {/* VIDEO MODE: Title, Description, Visibility */}
            {activeMode === 'video' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-300">Video Title *</label>
                  <Input
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder="Enter video title…"
                    className="bg-zinc-900 border-zinc-800 text-white mt-1 h-11 rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300">Description</label>
                  <Textarea
                    value={videoDescription}
                    onChange={(e) => setVideoDescription(e.target.value)}
                    placeholder="Tell viewers about your video…"
                    rows={3}
                    className="bg-zinc-900 border-zinc-800 text-white mt-1 rounded-xl resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300">Visibility</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setVideoVisibility('public')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                        videoVisibility === 'public'
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      <span>Public</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoVisibility('private')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                        videoVisibility === 'private'
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      <span>Private</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* REEL / STORY / POST: Caption */
              <div>
                <label className="text-xs font-bold text-zinc-300">Write a caption…</label>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={`Write about your ${activeMode}… #pixelgram`}
                  rows={3}
                  className="bg-zinc-900 border-zinc-800 text-white mt-1 rounded-xl resize-none"
                />
              </div>
            )}

            {/* Thumbnail / Cover Selection (for Reel or Video) */}
            {(activeMode === 'reel' || activeMode === 'video') && (
              <div className="bg-zinc-900 p-3.5 rounded-2xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200">Thumbnail / Cover</span>
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>Upload photo</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-24 rounded-xl overflow-hidden bg-black border border-zinc-700 shrink-0 flex items-center justify-center">
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-zinc-500" />
                    )}
                  </div>
                  <div className="flex-1 text-xs text-zinc-400 space-y-1">
                    <p className="font-semibold text-zinc-300">Default frame captured</p>
                    <p className="text-[11px]">Aap gallery se custom thumbnail photo bhi upload kar sakte hain.</p>
                  </div>
                </div>

                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCustomCoverPick}
                />
              </div>
            )}
          </div>

          {/* Bottom Share Button */}
          <div className="p-4 bg-zinc-950 border-t border-zinc-800 max-w-lg mx-auto w-full">
            <Button
              onClick={handlePublish}
              disabled={uploading}
              className="w-full h-12 rounded-2xl font-bold text-sm text-white shadow-xl active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, hsl(var(--p1)), hsl(var(--p2)))' }}
            >
              {uploading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading {uploadPercent}%…</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  <span>Share {activeMode.toUpperCase()}</span>
                </div>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Hidden Audio element for preview */}
      {track && (
        <audio
          ref={audioPreviewRef}
          src={track.previewUrl}
          loop
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
  );
};

export default CreateReelPage;
