import useGoBack from '@/hooks/use-go-back';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  X,
  Loader2,
  ArrowLeft,
  Music2,
  Image as ImageIcon,
  Play,
  Pause,
  ChevronRight,
  Sparkles,
  Camera,
  RotateCw,
  Scissors,
  ImagePlus,
  Clock,
  Send,
  SlidersHorizontal,
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
import { finishUpload, startUpload, updateUpload, runBackgroundUpload, requestUploadNotifications } from '@/services/uploadManager';
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
  badge: string;
  gradient: string;
}

const EFFECTS: CameraEffect[] = [
  { id: 'none', name: 'Normal', filter: 'none', badge: '⚪', gradient: 'from-zinc-700 to-zinc-900' },
  { id: 'film_burn', name: 'Film Burn', filter: 'contrast(125%) saturate(145%) sepia(30%) hue-rotate(-10deg)', badge: '🔥', gradient: 'from-amber-500 to-red-600' },
  { id: 'lovit', name: 'Lovit Glow', filter: 'brightness(112%) contrast(108%) saturate(140%)', badge: '💖', gradient: 'from-pink-500 to-rose-600' },
  { id: 'bw_glitch', name: 'Noir B&W', filter: 'grayscale(100%) contrast(180%) brightness(105%)', badge: '🏁', gradient: 'from-zinc-400 to-black' },
  { id: 'golden_hour', name: 'Golden Hour', filter: 'sepia(40%) saturate(170%) brightness(108%) contrast(110%)', badge: '🌅', gradient: 'from-yellow-400 to-amber-600' },
  { id: 'vhs', name: '90s VHS', filter: 'contrast(120%) saturate(85%) sepia(25%)', badge: '📼', gradient: 'from-purple-500 to-indigo-700' },
  { id: 'cyberpunk', name: 'Cyberpunk', filter: 'hue-rotate(245deg) saturate(230%) contrast(120%)', badge: '⚡', gradient: 'from-cyan-400 to-blue-600' },
  { id: 'vintage_sepia', name: 'Sepia Vintage', filter: 'sepia(80%) contrast(115%) brightness(95%)', badge: '📜', gradient: 'from-amber-700 to-amber-950' },
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

  // Effects & Filters Shelf toggle
  const [showEffectsShelf, setShowEffectsShelf] = useState(false);
  const [selectedEffect, setSelectedEffect] = useState<CameraEffect>(EFFECTS[0]);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [maxRecordDuration, setMaxRecordDuration] = useState(30); // 15, 30, 60s
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingShutterRef = useRef(false);

  // Countdown timer (0, 3, 10s)
  const [countdownTimer, setCountdownTimer] = useState(0);
  const [countdownActive, setCountdownActive] = useState<number | null>(null);

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
      toast.error('Recording shuru nahi ho paayi. Gallery se select karein.');
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

  // Shutter press / hold logic
  const handlePointerDown = () => {
    isHoldingShutterRef.current = true;
    if (countdownTimer > 0) {
      let count = countdownTimer;
      setCountdownActive(count);
      const timer = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdownActive(count);
        } else {
          clearInterval(timer);
          setCountdownActive(null);
          startRecording();
        }
      }, 1000);
    } else {
      startRecording();
    }
  };

  const handlePointerUp = () => {
    if (isHoldingShutterRef.current) {
      isHoldingShutterRef.current = false;
      if (isRecording) {
        stopRecording();
      }
    }
  };

  const handleShutterClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (!isHoldingShutterRef.current) {
      if (countdownTimer > 0) {
        let count = countdownTimer;
        setCountdownActive(count);
        const timer = setInterval(() => {
          count -= 1;
          if (count > 0) {
            setCountdownActive(count);
          } else {
            clearInterval(timer);
            setCountdownActive(null);
            startRecording();
          }
        }, 1000);
      } else {
        startRecording();
      }
    }
  };

  // Media loaded from Camera or Gallery
  const handleMediaLoaded = (file: File, type: 'image' | 'video') => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaType(type);
    const url = URL.createObjectURL(file);
    setMediaPreview(url);

    if (type === 'video') {
      const tempV = document.createElement('video');
      tempV.src = url;
      tempV.onloadedmetadata = () => {
        const d = tempV.duration || 15;
        setVideoDuration(d);
        setTrimStart(0);
        setTrimEnd(d);
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

  // Upload and Share (Background resilient upload)
  const handlePublish = async () => {
    if (!user) {
      toast.error('Pehle login karein');
      return;
    }
    if (!mediaFile) {
      toast.error('Media select karein');
      return;
    }

    if (activeMode === 'video' && !videoTitle.trim()) {
      toast.error('Video ka title likhein');
      return;
    }

    // Proactively request browser push notifications on user tap
    void requestUploadNotifications();

    setUploading(true);
    setUploadPercent(0);

    const modeLabel = activeMode.toUpperCase();
    const currentMode = activeMode;
    const currentFile = mediaFile;
    const currentCoverBlob = coverBlob;
    const currentCaption = caption;
    const currentTitle = videoTitle;
    const currentDesc = videoDescription;
    const currentVis = videoVisibility;
    const currentDur = videoDuration;
    const currentTrack = track;
    const currentStartMs = startMs;
    const currentMute = muteOriginal;
    const currentUserId = user.id;

    const musicPayload: ReelMusic | null = currentTrack
      ? {
          track_id: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist,
          artwork_url: currentTrack.artwork,
          preview_url: currentTrack.previewUrl,
          start_ms: currentStartMs,
          duration_ms: currentTrack.durationMs,
          mute_original: currentMute,
        }
      : null;

    runBackgroundUpload({
      kind: currentMode,
      label: `${modeLabel} Upload`,
      thumbnailUrl: coverPreview || mediaPreview || undefined,
      task: async (updateProgress) => {
        if (currentMode === 'reel') {
          const videoUrl = await uploadMediaWithProgress('reels', currentFile, currentUserId, (p) => {
            setUploadPercent(p);
            updateProgress(p);
          });

          let coverUrl: string | null = null;
          if (currentCoverBlob) {
            try {
              const coverFile = new File([currentCoverBlob], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
              coverUrl = await uploadImage('posts', coverFile, currentUserId);
            } catch {
              coverUrl = null;
            }
          }

          await createReel(currentUserId, videoUrl, currentCaption.trim() || '', coverUrl || undefined, musicPayload);
        } else if (currentMode === 'story') {
          const mediaUrl = await uploadMediaWithProgress('stories', currentFile, currentUserId, (p) => {
            setUploadPercent(p);
            updateProgress(p);
          });
          await createStory(mediaUrl, currentCaption.trim() || null, musicPayload);
        } else if (currentMode === 'post') {
          const mediaUrl = await uploadMediaWithProgress('posts', currentFile, currentUserId, (p) => {
            setUploadPercent(p);
            updateProgress(p);
          });
          await createPost(mediaUrl, currentCaption.trim() || null, musicPayload);
        } else if (currentMode === 'video') {
          const videoUrl = await uploadVideoFile(currentFile, currentUserId, (p) => {
            setUploadPercent(p);
            updateProgress(p);
          });

          let thumbUrl: string | null = null;
          if (currentCoverBlob) {
            try {
              thumbUrl = await uploadVideoThumbnail(currentCoverBlob, currentUserId);
            } catch {
              thumbUrl = null;
            }
          }

          await createVideo({
            userId: currentUserId,
            title: currentTitle.trim(),
            description: currentDesc.trim() || undefined,
            videoUrl,
            thumbnailUrl: thumbUrl,
            durationSec: currentDur ? Math.round(currentDur) : null,
            visibility: currentVis,
          });
        }
      },
      onSuccess: () => {
        toast.success(`${modeLabel} successfully upload ho gaya! 🎉`);
        setUploading(false);
        navigate(currentMode === 'video' ? '/videos' : currentMode === 'reel' ? '/reels' : '/stories');
      },
      onError: (err) => {
        toast.error('Upload fail ho gaya. Kripya dobara try karein.');
        setUploading(false);
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black text-white select-none overflow-hidden flex flex-col z-[100]">
      {/* ========================================================================= */}
      {/* 1. CAMERA VIEW (Authentic Instagram Reels Camera Layout) */}
      {/* ========================================================================= */}
      {step === 'camera' && (
        <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-black">
          {/* Live Viewfinder */}
          <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center overflow-hidden">
            {hasCameraPermission === false ? (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-xs z-10">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/80">
                  <Camera className="w-8 h-8" />
                </div>
                <p className="text-sm font-semibold text-white">Camera access nahi mila ya band hai</p>
                <p className="text-xs text-white/60">Aap device gallery se video/photo select karke direct upload kar sakte hain.</p>
                <button
                  type="button"
                  onClick={handleGalleryClick}
                  className="px-5 py-2.5 rounded-full bg-primary text-white text-xs font-bold shadow-lg active:scale-95 transition-all flex items-center gap-2"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Gallery se select karein</span>
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

            {/* Red recording pulse border */}
            {isRecording && (
              <div className="absolute inset-0 border-4 border-red-500 pointer-events-none animate-pulse z-10" />
            )}

            {/* Countdown overlay */}
            {countdownActive !== null && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-40">
                <span className="text-8xl font-black text-white animate-ping">
                  {countdownActive}
                </span>
              </div>
            )}
          </div>

          {/* TOP BAR: Close, Audio pill, Duration toggle */}
          <div className="relative z-30 flex items-center justify-between p-4 pt-5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
            {/* Close / Back button */}
            <button
              type="button"
              onClick={goBack}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-transform"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Instagram-style Add Audio Pill */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="px-4 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center gap-2 text-xs font-semibold text-white shadow-md active:scale-95 transition-transform"
            >
              <Music2 className="w-3.5 h-3.5 text-primary" />
              <span className="truncate max-w-[130px] font-medium">
                {track ? track.title : 'Add audio'}
              </span>
            </button>

            {/* Duration pill (15s, 30s, 60s) */}
            <button
              type="button"
              onClick={() => setMaxRecordDuration((prev) => (prev === 15 ? 30 : prev === 30 ? 60 : 15))}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-xs font-bold text-white hover:bg-black/70 active:scale-90 transition-transform shadow-md"
              title="Duration limit"
            >
              {maxRecordDuration}s
            </button>
          </div>

          {/* LEFT SIDE TOOLBAR (Authentic Instagram tools drawer) */}
          <div className="relative z-30 flex flex-col gap-3.5 pl-4 w-12 pointer-events-auto">
            {/* Effects Toggle button */}
            <button
              type="button"
              onClick={() => setShowEffectsShelf((prev) => !prev)}
              className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                showEffectsShelf || selectedEffect.id !== 'none'
                  ? 'bg-primary text-white shadow-lg ring-2 ring-white/40 scale-105'
                  : 'bg-black/50 text-white hover:bg-black/70 active:scale-90 border border-white/10'
              }`}
              title="Effects / Filters"
            >
              <Sparkles className="w-5 h-5" />
            </button>

            {/* Countdown timer toggle (0s, 3s, 10s) */}
            <button
              type="button"
              onClick={() => setCountdownTimer((prev) => (prev === 0 ? 3 : prev === 3 ? 10 : 0))}
              className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center text-xs font-bold transition-all ${
                countdownTimer > 0
                  ? 'bg-primary text-white ring-2 ring-white/40 shadow-lg scale-105'
                  : 'bg-black/50 text-white hover:bg-black/70 active:scale-90 border border-white/10'
              }`}
              title="Countdown Timer"
            >
              {countdownTimer > 0 ? `${countdownTimer}s` : <Clock className="w-5 h-5" />}
            </button>
          </div>

          {/* BOTTOM CONTROLS & INSTAGRAM SHUTTER DOCK */}
          <div className="relative z-30 flex flex-col items-center pb-5 pt-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent space-y-4">
            
            {/* Selected Effect Badge Pill (if an effect is chosen) */}
            {selectedEffect.id !== 'none' && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-xs font-semibold text-white shadow-md animate-in fade-in">
                <span>{selectedEffect.badge}</span>
                <span>{selectedEffect.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedEffect(EFFECTS[0])}
                  className="ml-1 text-white/60 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* HORIZONTAL EFFECTS WHEEL / SHELF (Opens when ✨ is tapped) */}
            {showEffectsShelf && (
              <div className="w-full flex items-center justify-center px-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3 overflow-x-auto px-2 py-1 no-scrollbar max-w-full">
                  {EFFECTS.map((eff) => {
                    const isSelected = selectedEffect.id === eff.id;
                    return (
                      <button
                        key={eff.id}
                        type="button"
                        onClick={() => setSelectedEffect(eff)}
                        className="flex flex-col items-center gap-1 shrink-0 group transition-transform active:scale-95"
                      >
                        <div
                          className={`w-13 h-13 rounded-full flex items-center justify-center bg-gradient-to-br transition-all ${
                            isSelected
                              ? 'ring-3 ring-primary shadow-lg shadow-primary/40 scale-105'
                              : 'ring-1 ring-white/30 opacity-70 group-hover:opacity-100'
                          } ${eff.gradient}`}
                          style={{ width: '48px', height: '48px' }}
                        >
                          <span className="text-lg">{eff.badge}</span>
                        </div>
                        <span
                          className={`text-[10px] max-w-[55px] truncate text-center ${
                            isSelected ? 'text-primary font-bold' : 'text-white/70'
                          }`}
                        >
                          {eff.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* REAL INSTAGRAM SHUTTER ROW: Gallery on Left, Shutter in DEAD CENTER, Flip on Right */}
            <div className="w-full max-w-sm px-6 flex items-center justify-between">
              {/* 1. Gallery Button (Bottom Left) */}
              <button
                type="button"
                onClick={handleGalleryClick}
                className="w-12 h-12 rounded-2xl border-2 border-white/80 bg-zinc-900/80 backdrop-blur-md overflow-hidden flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg group"
                title="Open Gallery"
              >
                <ImageIcon className="w-6 h-6 group-hover:scale-110 transition-transform text-white/90" />
              </button>

              {/* 2. Instagram Shutter Button (DEAD CENTER, 80px ring + inner red recording dot) */}
              <div className="relative flex items-center justify-center">
                {/* SVG Circular Progress Bar while recording */}
                {isRecording && (
                  <svg className="absolute -inset-2 w-[88px] h-[88px] -rotate-90 pointer-events-none">
                    <circle
                      cx="44"
                      cy="44"
                      r="39"
                      stroke="#ef4444"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 39}
                      strokeDashoffset={2 * Math.PI * 39 * (1 - recordDuration / maxRecordDuration)}
                      className="transition-all duration-100 ease-linear"
                    />
                  </svg>
                )}

                <button
                  type="button"
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  onClick={handleShutterClick}
                  className={`relative w-18 h-18 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-95 shadow-2xl ${
                    isRecording ? 'scale-110 ring-2 ring-red-500/50' : ''
                  }`}
                  style={{
                    width: '74px',
                    height: '74px',
                    background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {/* Center Dot */}
                  <div
                    className={`transition-all duration-200 ${
                      isRecording
                        ? 'w-7 h-7 bg-red-600 rounded-md scale-95 shadow-md'
                        : 'w-14 h-14 bg-red-500 rounded-full'
                    }`}
                  />
                </button>
              </div>

              {/* 3. Flip Camera Button (Bottom Right) */}
              <button
                type="button"
                onClick={toggleCameraFlip}
                className="w-12 h-12 rounded-full border border-white/20 bg-black/50 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg hover:bg-black/70"
                title="Flip Camera"
              >
                <RotateCw className="w-5 h-5 text-white/90" />
              </button>
            </div>

            {/* Recording duration timer indicator */}
            {isRecording ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-600 text-white text-xs font-bold shadow-lg animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>REC {recordDuration.toFixed(1)}s / {maxRecordDuration}s</span>
              </div>
            ) : (
              <p className="text-[11px] text-white/60 tracking-tight">
                Hold karke ya tap karke video banayein
              </p>
            )}

            {/* BOTTOM 4 MODES CAROUSEL: POST | STORY | REELS | VIDEO */}
            <div className="w-full flex items-center justify-center pt-1">
              <div className="flex items-center gap-7 text-xs font-bold tracking-widest uppercase">
                {(['post', 'story', 'reel', 'video'] as Mode[]).map((m) => {
                  const isActive = activeMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setActiveMode(m)}
                      className={`relative py-1.5 transition-all duration-200 flex flex-col items-center ${
                        isActive
                          ? 'text-white font-extrabold scale-110'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      <span>{m === 'reel' ? 'REELS' : m}</span>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white mt-1 shadow-sm" />
                      )}
                    </button>
                  );
                })}
              </div>
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
              type="button"
              onClick={() => setStep('camera')}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Music Button */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center gap-1.5 text-xs font-bold text-white hover:bg-black/80 active:scale-95 transition-transform"
            >
              <Music2 className="w-3.5 h-3.5 text-primary" />
              <span className="truncate max-w-[140px]">{track ? track.title : 'Add Music'}</span>
            </button>

            {/* Next / Continue */}
            <button
              type="button"
              onClick={() => setStep('details')}
              className="px-5 py-2 rounded-full bg-primary text-white text-xs font-bold flex items-center gap-1 shadow-lg active:scale-95 transition-transform"
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

          {/* Video Trimmer & Controls */}
          <div className="p-4 bg-zinc-950 border-t border-zinc-800 space-y-3">
            {mediaType === 'video' && videoDuration > 0 && (
              <div className="space-y-1.5 bg-zinc-900 p-3.5 rounded-2xl border border-zinc-800">
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
              <div className="flex items-center justify-between bg-zinc-900 px-3.5 py-2.5 rounded-xl border border-zinc-800 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  {track.artwork ? (
                    <img src={track.artwork} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <Music2 className="w-4 h-4 text-primary" />
                  )}
                  <span className="font-semibold truncate max-w-[150px]">{track.title}</span>
                </div>
                <button
                  type="button"
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
              type="button"
              onClick={() => {
                if (uploading) {
                  toast.info('Upload background me jari hai 🚀 (Neeche progress bar dekhein)');
                  navigate(activeMode === 'video' ? '/videos' : activeMode === 'reel' ? '/reels' : '/stories');
                } else {
                  setStep('edit');
                }
              }}
              className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center text-white active:scale-90 transition-transform"
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
                    <p className="font-semibold text-zinc-300">Frame captured</p>
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

          {/* Live Background Upload Progress Overlay */}
          {uploading && (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-5 animate-in fade-in">
              <div className="relative w-28 h-28 flex items-center justify-center">
                {/* Outer SVG Circular Progress */}
                <svg className="w-28 h-28 -rotate-90">
                  <circle cx="56" cy="56" r="48" stroke="rgba(255,255,255,0.15)" strokeWidth="6" fill="none" />
                  <circle
                    cx="56"
                    cy="56"
                    r="48"
                    stroke="url(#uploadGradient)"
                    strokeWidth="6"
                    fill="none"
                    strokeDasharray={2 * Math.PI * 48}
                    strokeDashoffset={2 * Math.PI * 48 * (1 - uploadPercent / 100)}
                    className="transition-all duration-200 ease-out"
                  />
                  <defs>
                    <linearGradient id="uploadGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="hsl(var(--p1))" />
                      <stop offset="100%" stopColor="hsl(var(--p2))" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-black text-white tabular-nums tracking-tight">
                    {uploadPercent}%
                  </span>
                  <span className="text-[10px] text-primary font-bold uppercase tracking-wider">
                    {uploadPercent === 100 ? 'Saving' : 'Processing'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 max-w-xs">
                <h3 className="text-base font-bold text-white">
                  {uploadPercent === 100 ? 'Bas kuch pal… 🎉' : `${activeMode.toUpperCase()} Upload ho raha hai`}
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  {uploadPercent === 100
                    ? 'Aapka upload database me publish ho raha hai…'
                    : 'Aap back ja kar website browse kar sakte hain, upload background me chalta rahega!'}
                </p>
              </div>

              <div className="pt-2 w-full max-w-xs space-y-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    toast.info('Upload background me jari hai 🚀 (Neeche progress bar dekhein)');
                    navigate(activeMode === 'video' ? '/videos' : activeMode === 'reel' ? '/reels' : '/stories');
                  }}
                  className="w-full h-11 rounded-xl border-white/20 bg-white/10 text-white font-semibold text-xs hover:bg-white/20 active:scale-95"
                >
                  Website browse karein (Background me chalne dein)
                </Button>

                <p className="text-[11px] text-amber-400/90 font-medium">
                  ⚠️ Dhyan rahe: Website ya tab poori tarah band na karein.
                </p>
              </div>
            </div>
          )}

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
