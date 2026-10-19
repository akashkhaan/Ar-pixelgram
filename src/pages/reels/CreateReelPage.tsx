import useGoBack from '@/hooks/use-go-back';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  Search,
  Wand2,
  Check,
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
import { savePersistentJob, deletePersistentJob, updatePersistentJobProgress, markJobActive, unmarkJobActive } from '@/services/persistentUploadQueue';
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
  category: 'trending' | 'beauty' | 'retro' | 'cinematic' | 'cyber' | 'mood';
  filter: string;
  badge: string;
  gradient: string;
  tag: string;
}

const EFFECTS: CameraEffect[] = [
  // ── INSTAGRAM CLASSICS ──
  { id: 'none', name: 'Normal', category: 'trending', filter: 'none', badge: '\u26aa', gradient: 'from-zinc-700 to-zinc-900', tag: 'Original' },
  { id: 'clarendon', name: 'Clarendon', category: 'trending', filter: 'contrast(120%) saturate(125%)', badge: '\ud83c\udf0a', gradient: 'from-sky-400 to-blue-600', tag: 'Instagram' },
  { id: 'juno', name: 'Juno', category: 'trending', filter: 'contrast(115%) saturate(140%) sepia(10%)', badge: '\ud83c\udf3b', gradient: 'from-amber-400 to-rose-500', tag: 'Instagram' },
  { id: 'lark', name: 'Lark', category: 'trending', filter: 'brightness(110%) contrast(95%) saturate(115%)', badge: '\ud83d\udc26', gradient: 'from-teal-300 to-sky-500', tag: 'Instagram' },
  { id: 'gingham', name: 'Gingham', category: 'trending', filter: 'brightness(105%) sepia(15%) contrast(95%) saturate(90%)', badge: '\ud83e\ude75', gradient: 'from-stone-300 to-amber-400', tag: 'Instagram' },
  { id: 'valencia', name: 'Valencia', category: 'trending', filter: 'sepia(25%) brightness(110%) contrast(108%) saturate(110%)', badge: '\ud83c\udf4a', gradient: 'from-orange-300 to-amber-500', tag: 'Instagram' },
  { id: 'xpro2', name: 'X-Pro II', category: 'trending', filter: 'contrast(135%) saturate(130%) sepia(30%)', badge: '\ud83c\udfad', gradient: 'from-rose-600 to-purple-700', tag: 'Instagram' },
  { id: 'lofi', name: 'Lo-Fi', category: 'trending', filter: 'contrast(140%) saturate(140%)', badge: '\ud83c\udf1e', gradient: 'from-amber-500 to-red-600', tag: 'Instagram' },
  { id: 'reyes', name: 'Reyes', category: 'retro', filter: 'sepia(22%) brightness(110%) contrast(85%) saturate(75%)', badge: '\ud83c\udf3e', gradient: 'from-amber-200 to-stone-400', tag: 'Instagram' },
  { id: 'perpetua', name: 'Perpetua', category: 'trending', filter: 'contrast(105%) saturate(110%) hue-rotate(185deg) brightness(105%)', badge: '\ud83d\udc99', gradient: 'from-cyan-400 to-teal-600', tag: 'Instagram' },
  { id: 'slumber', name: 'Slumber', category: 'mood', filter: 'saturate(66%) brightness(105%) sepia(15%)', badge: '\ud83c\udf19', gradient: 'from-indigo-300 to-slate-500', tag: 'Instagram' },
  { id: 'aden', name: 'Aden', category: 'retro', filter: 'hue-rotate(-20deg) contrast(90%) saturate(85%) brightness(120%)', badge: '\ud83c\udf38', gradient: 'from-rose-200 to-amber-300', tag: 'Instagram' },
  { id: 'inkwell', name: 'Inkwell', category: 'cinematic', filter: 'grayscale(100%) contrast(110%) brightness(105%)', badge: '\ud83d\udd8b\ufe0f', gradient: 'from-zinc-400 to-zinc-800', tag: 'Instagram' },
  { id: 'moon', name: 'Moon', category: 'cinematic', filter: 'grayscale(100%) brightness(110%) contrast(105%)', badge: '\ud83c\udf11', gradient: 'from-slate-300 to-slate-600', tag: 'Instagram' },
  { id: 'willow', name: 'Willow', category: 'retro', filter: 'grayscale(60%) sepia(20%) contrast(95%) brightness(105%)', badge: '\ud83c\udf3f', gradient: 'from-stone-400 to-stone-600', tag: 'Instagram' },
  { id: 'crema', name: 'Crema', category: 'beauty', filter: 'sepia(20%) contrast(105%) brightness(108%) saturate(105%)', badge: '\u2615', gradient: 'from-amber-200 to-orange-300', tag: 'Instagram' },
  { id: 'ludwig', name: 'Ludwig', category: 'cinematic', filter: 'contrast(105%) saturate(80%) brightness(105%) sepia(10%)', badge: '\ud83c\udfdb\ufe0f', gradient: 'from-neutral-300 to-neutral-500', tag: 'Instagram' },
  { id: 'hefe', name: 'Hefe', category: 'retro', filter: 'contrast(130%) saturate(140%) sepia(40%) hue-rotate(-10deg)', badge: '\ud83c\udf05', gradient: 'from-orange-500 to-red-700', tag: 'Instagram' },
  { id: 'hudson', name: 'Hudson', category: 'cinematic', filter: 'contrast(120%) brightness(110%) saturate(110%) hue-rotate(190deg) sepia(15%)', badge: '\ud83c\udf0b', gradient: 'from-blue-400 to-indigo-600', tag: 'Instagram' },
  { id: 'sierra', name: 'Sierra', category: 'mood', filter: 'sepia(20%) contrast(95%) brightness(108%) saturate(95%)', badge: '\ud83c\udf04', gradient: 'from-teal-200 to-emerald-500', tag: 'Instagram' },
  { id: 'mayfair', name: 'Mayfair', category: 'beauty', filter: 'contrast(110%) saturate(110%) sepia(15%) brightness(105%)', badge: '\ud83d\udc8e', gradient: 'from-pink-300 to-rose-400', tag: 'Instagram' },
  { id: 'rise', name: 'Rise', category: 'beauty', filter: 'brightness(108%) sepia(25%) saturate(110%) contrast(100%)', badge: '\ud83c\udf05', gradient: 'from-yellow-200 to-orange-400', tag: 'Instagram' },
  { id: 'amaro', name: 'Amaro', category: 'beauty', filter: 'brightness(115%) contrast(95%) saturate(115%) sepia(10%)', badge: '\u2728', gradient: 'from-amber-300 to-rose-300', tag: 'Instagram' },
  { id: 'brannan', name: 'Brannan', category: 'retro', filter: 'sepia(50%) contrast(140%) brightness(100%)', badge: '\ud83e\uddb8', gradient: 'from-yellow-700 to-stone-800', tag: 'Instagram' },
  { id: 'earlybird', name: 'Earlybird', category: 'retro', filter: 'sepia(40%) contrast(115%) saturate(105%) brightness(105%)', badge: '\ud83d\udc26', gradient: 'from-amber-400 to-orange-600', tag: 'Instagram' },
  { id: 'sutro', name: 'Sutro', category: 'cinematic', filter: 'sepia(40%) contrast(120%) saturate(90%) brightness(95%)', badge: '\ud83c\udf32', gradient: 'from-emerald-700 to-stone-800', tag: 'Instagram' },
  { id: 'toaster', name: 'Toaster', category: 'retro', filter: 'sepia(50%) contrast(150%) brightness(95%) saturate(110%)', badge: '\ud83c\udf5e', gradient: 'from-orange-600 to-red-800', tag: 'Instagram' },
  { id: 'walden', name: 'Walden', category: 'mood', filter: 'brightness(110%) hue-rotate(-10deg) sepia(30%) saturate(160%)', badge: '\ud83c\udf3e', gradient: 'from-lime-300 to-amber-500', tag: 'Instagram' },
  { id: 'n1977', name: '1977', category: 'retro', filter: 'sepia(30%) brightness(110%) saturate(130%) contrast(100%)', badge: '\ud83d\udcf7', gradient: 'from-rose-300 to-amber-400', tag: 'Instagram' },
  { id: 'kelvin', name: 'Kelvin', category: 'mood', filter: 'sepia(35%) saturate(180%) contrast(110%) brightness(105%)', badge: '\u2600\ufe0f', gradient: 'from-yellow-400 to-orange-600', tag: 'Instagram' },
  { id: 'nashville', name: 'Nashville', category: 'retro', filter: 'sepia(35%) contrast(120%) brightness(105%) saturate(120%) hue-rotate(-15deg)', badge: '\ud83e\udd20', gradient: 'from-amber-500 to-rose-600', tag: 'Instagram' },
  { id: 'stinson', name: 'Stinson', category: 'mood', filter: 'brightness(110%) saturate(80%) contrast(100%) sepia(10%)', badge: '\ud83c\udfd6\ufe0f', gradient: 'from-sky-200 to-stone-400', tag: 'Instagram' },
  { id: 'vesper', name: 'Vesper', category: 'cinematic', filter: 'contrast(115%) saturate(105%) sepia(20%) brightness(100%) hue-rotate(10deg)', badge: '\ud83c\udf07', gradient: 'from-orange-400 to-purple-600', tag: 'Instagram' },
  { id: 'maven', name: 'Maven', category: 'cinematic', filter: 'contrast(115%) saturate(90%) brightness(100%) sepia(25%)', badge: '\ud83c\udfd9\ufe0f', gradient: 'from-stone-500 to-amber-700', tag: 'Instagram' },
  { id: 'ginza', name: 'Ginza', category: 'mood', filter: 'sepia(15%) brightness(108%) contrast(105%) saturate(105%)', badge: '\ud83c\udfef', gradient: 'from-amber-200 to-rose-400', tag: 'Instagram' },
  { id: 'skyline', name: 'Skyline', category: 'mood', filter: 'saturate(135%) brightness(105%) contrast(105%)', badge: '\ud83c\udf06', gradient: 'from-blue-300 to-indigo-500', tag: 'Instagram' },
  { id: 'dogpatch', name: 'Dogpatch', category: 'cinematic', filter: 'contrast(125%) saturate(75%) brightness(100%)', badge: '\ud83d\udc15', gradient: 'from-neutral-400 to-neutral-700', tag: 'Instagram' },
  { id: 'brooklyn', name: 'Brooklyn', category: 'mood', filter: 'contrast(105%) brightness(110%) saturate(100%) sepia(15%)', badge: '\ud83c\udf0c', gradient: 'from-teal-300 to-amber-400', tag: 'Instagram' },
  { id: 'helena', name: 'Helena', category: 'beauty', filter: 'sepia(20%) saturate(120%) contrast(105%) brightness(108%) hue-rotate(-5deg)', badge: '\ud83c\udf39', gradient: 'from-rose-300 to-amber-300', tag: 'Instagram' },
  { id: 'ashby', name: 'Ashby', category: 'beauty', filter: 'sepia(30%) contrast(105%) brightness(110%) saturate(110%)', badge: '\ud83c\udf3a', gradient: 'from-amber-300 to-orange-400', tag: 'Instagram' },
  { id: 'charmes', name: 'Charmes', category: 'mood', filter: 'contrast(110%) saturate(130%) sepia(10%) hue-rotate(5deg)', badge: '\ud83d\udc9c', gradient: 'from-purple-300 to-pink-500', tag: 'Instagram' },
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
  // Effects & Filters Shelf toggle (Open by default like Instagram/Snapchat)
  const [showEffectsShelf, setShowEffectsShelf] = useState(true);
  const [selectedEffect, setSelectedEffect] = useState<CameraEffect>(EFFECTS[0]);
  const [showEffectsSearchModal, setShowEffectsSearchModal] = useState(false);
  const [effectSearchQuery, setEffectSearchQuery] = useState('');
  const [effectActiveTab, setEffectActiveTab] = useState<'all' | 'trending' | 'beauty' | 'retro' | 'cinematic' | 'cyber' | 'mood'>('all');

  // Instagram Reel Duration Modal state (User can customize any length)
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [customDurationInput, setCustomDurationInput] = useState(30);

  // Filtered effects list based on category & search query
  const filteredEffectsList = useMemo(() => {
    let list = EFFECTS;
    if (effectActiveTab !== 'all') {
      list = list.filter((e) => e.category === effectActiveTab);
    }
    if (effectSearchQuery.trim()) {
      const q = effectSearchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.tag.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [effectActiveTab, effectSearchQuery]);

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
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: false,
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
  const startRecording = async () => {
    if (!streamRef.current || isRecording) return;
    recordedChunksRef.current = [];
    try {
      if (streamRef.current.getAudioTracks().length === 0) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getAudioTracks().forEach((t) => streamRef.current?.addTrack(t));
      }
    } catch {
      // Audio optional
    }

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
    if (activeMode === 'video') {
      stopCamera();
      galleryInputRef.current?.click();
      return;
    }
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

  // Gallery Picker (Instant 0ms trigger)
  const handleGalleryClick = () => {
    stopCamera();
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

    const persistentJobId = `upload_${currentMode}_${Date.now()}`;
    markJobActive(persistentJobId);
    void savePersistentJob({
      id: persistentJobId,
      kind: currentMode,
      label: `${modeLabel} Upload`,
      fileBlob: currentFile,
      fileName: currentFile.name,
      fileType: currentFile.type,
      coverBlob: currentCoverBlob,
      userId: currentUserId,
      caption: currentCaption,
      videoTitle: currentTitle,
      videoDescription: currentDesc,
      videoVisibility: currentVis,
      videoDuration: currentDur,
      musicPayload,
      progress: 0,
      status: 'uploading',
      createdAt: Date.now(),
    });

    toast.success(`${modeLabel} upload shuru ho gaya... (1 se 100% count upar dekhein) 🚀`);
    navigate(currentMode === 'video' ? '/videos' : currentMode === 'reel' ? '/reels' : '/stories');

    runBackgroundUpload({
      kind: currentMode,
      label: `${modeLabel} Upload`,
      thumbnailUrl: coverPreview || mediaPreview || undefined,
      task: async (updateProgress) => {
        if (currentMode === 'reel') {
          const videoUrl = await uploadMediaWithProgress('reels', currentFile, currentUserId, (p) => {
            setUploadPercent(p);
            updateProgress(p);
            void updatePersistentJobProgress(persistentJobId, p);
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
            void updatePersistentJobProgress(persistentJobId, p);
          });
          await createStory(mediaUrl, currentCaption.trim() || null, musicPayload);
        } else if (currentMode === 'post') {
          const mediaUrl = await uploadMediaWithProgress('posts', currentFile, currentUserId, (p) => {
            setUploadPercent(p);
            updateProgress(p);
            void updatePersistentJobProgress(persistentJobId, p);
          });
          await createPost(mediaUrl, currentCaption.trim() || null, musicPayload);
        } else if (currentMode === 'video') {
          const videoUrl = await uploadVideoFile(currentFile, currentUserId, (p) => {
            setUploadPercent(p);
            updateProgress(p);
            void updatePersistentJobProgress(persistentJobId, p);
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
        unmarkJobActive(persistentJobId);
        void deletePersistentJob(persistentJobId);
        toast.success(`${modeLabel} successfully upload ho gaya! 🎉`);
      },
      onError: (err) => {
        unmarkJobActive(persistentJobId);
        toast.error('Upload fail ho gaya. Kripya dobara try karein.');
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
          <div className="relative z-30 flex items-center justify-between px-4 pt-5 pb-10 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
            {/* Close / Back button */}
            <button
              type="button"
              onClick={goBack}
              className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:bg-white/20 active:scale-90 transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Add Audio Pill */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="group relative px-[2px] py-[2px] rounded-full bg-gradient-to-r from-fuchsia-500 via-pink-500 to-amber-400 shadow-[0_8px_30px_rgba(236,72,153,0.35)] active:scale-95 transition-transform"
            >
              <span className="flex items-center gap-2 px-4 h-9 rounded-full bg-black/75 backdrop-blur-xl text-xs font-semibold text-white">
                <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-fuchsia-500 to-amber-400 flex items-center justify-center">
                  <Music2 className={`w-3 h-3 text-white ${track ? 'animate-spin [animation-duration:3s]' : ''}`} />
                </span>
                <span className="truncate max-w-[130px] font-semibold tracking-tight">
                  {track ? track.title : 'Add audio'}
                </span>
              </span>
            </button>

            {/* Reel Duration button (Tap to customize seconds) */}
            <button
              type="button"
              onClick={() => {
                setCustomDurationInput(maxRecordDuration);
                setShowDurationModal(true);
              }}
              className="px-3.5 h-11 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center gap-1.5 text-xs font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:bg-white/20 active:scale-95 transition-all"
              title="Reel Duration Limit (Tap to customize)"
            >
              <Clock className="w-4 h-4 text-amber-300" />
              <span className="tabular-nums">{maxRecordDuration >= 180 ? '3m' : `${maxRecordDuration}s`}</span>
            </button>
          </div>

          {/* LEFT SIDE TOOLBAR (glass rail) */}
          <div className="relative z-30 ml-3 w-14 pointer-events-auto">
            <div className="flex flex-col items-center gap-3 p-2 rounded-[28px] bg-white/[0.07] backdrop-blur-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
              {/* Effects Toggle button */}
              <button
                type="button"
                onClick={() => setShowEffectsShelf((prev) => !prev)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  showEffectsShelf || selectedEffect.id !== 'none'
                    ? 'bg-gradient-to-tr from-fuchsia-600 via-pink-500 to-amber-400 text-white shadow-[0_0_24px_rgba(236,72,153,0.7)] scale-110'
                    : 'bg-white/10 text-white hover:bg-white/20 active:scale-90'
                }`}
                title="Effects / Filters"
              >
                <Sparkles className="w-5 h-5" />
              </button>

              {/* Search Effects button */}
              <button
                type="button"
                onClick={() => setShowEffectsSearchModal(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white hover:bg-white/20 active:scale-90 transition-all"
                title="Search & Explore Filters"
              >
                <Search className="w-[18px] h-[18px]" />
              </button>

              <div className="w-6 h-px bg-white/15" />

              {/* Countdown timer toggle (0s, 3s, 10s) */}
              <button
                type="button"
                onClick={() => setCountdownTimer((prev) => (prev === 0 ? 3 : prev === 3 ? 10 : 0))}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 ${
                  countdownTimer > 0
                    ? 'bg-amber-400 text-black shadow-[0_0_20px_rgba(251,191,36,0.6)] scale-110'
                    : 'bg-white/10 text-white hover:bg-white/20 active:scale-90'
                }`}
                title="Countdown Timer"
              >
                {countdownTimer > 0 ? `${countdownTimer}s` : <Clock className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* BOTTOM CONTROLS & SHUTTER DOCK */}
          <div className="relative z-30 flex flex-col items-center pb-6 pt-16 bg-gradient-to-t from-black via-black/75 to-transparent space-y-4">

            {/* Selected Effect Badge Pill */}
            {selectedEffect.id !== 'none' && (
              <div className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 text-xs font-semibold text-white shadow-lg animate-in fade-in zoom-in-95">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br ${selectedEffect.gradient}`}>
                  {selectedEffect.badge}
                </span>
                <span className="tracking-tight">{selectedEffect.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedEffect(EFFECTS[0])}
                  className="ml-0.5 w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/25"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* HORIZONTAL EFFECTS CAROUSEL */}
            {showEffectsShelf && (
              <div className="w-full flex items-center justify-center animate-in fade-in slide-in-from-bottom-3 duration-300">
                <div className="flex items-end gap-3.5 overflow-x-auto px-4 py-2 no-scrollbar max-w-full snap-x">
                  {/* Search / Browse Lens Button */}
                  <button
                    type="button"
                    onClick={() => setShowEffectsSearchModal(true)}
                    className="flex flex-col items-center gap-1.5 shrink-0 snap-center group transition-transform active:scale-90"
                    title="Search & Browse All Filters"
                  >
                    <div
                      className="rounded-full p-[2px] bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-amber-400 shadow-[0_0_20px_rgba(236,72,153,0.5)]"
                      style={{ width: '52px', height: '52px' }}
                    >
                      <div className="w-full h-full rounded-full bg-black/70 backdrop-blur-xl flex items-center justify-center">
                        <Search className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <span className="text-[10px] text-white font-bold tracking-tight">Search</span>
                  </button>

                  {/* Filters */}
                  {EFFECTS.map((eff) => {
                    const isSelected = selectedEffect.id === eff.id;
                    return (
                      <button
                        key={eff.id}
                        type="button"
                        onClick={() => setSelectedEffect(eff)}
                        className="flex flex-col items-center gap-1.5 shrink-0 snap-center group transition-transform active:scale-90"
                      >
                        <div
                          className={`rounded-full p-[2px] transition-all duration-300 ${
                            isSelected
                              ? 'bg-white shadow-[0_0_22px_rgba(255,255,255,0.55)] scale-110 -translate-y-1'
                              : 'bg-white/20'
                          }`}
                          style={{ width: '52px', height: '52px' }}
                        >
                          <div
                            className={`w-full h-full rounded-full flex items-center justify-center bg-gradient-to-br ${eff.gradient} ${
                              isSelected ? '' : 'opacity-80 group-hover:opacity-100'
                            }`}
                          >
                            <span className="text-lg drop-shadow">{eff.badge}</span>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] max-w-[58px] truncate text-center tracking-tight ${
                            isSelected ? 'text-white font-bold' : 'text-white/60'
                          }`}
                        >
                          {eff.name}
                        </span>
                      </button>
                    );
                  })}

                  {/* Browse More */}
                  <button
                    type="button"
                    onClick={() => setShowEffectsSearchModal(true)}
                    className="flex flex-col items-center gap-1.5 shrink-0 snap-center group transition-transform active:scale-90"
                    title="Browse 40+ more filters"
                  >
                    <div
                      className="rounded-full flex items-center justify-center bg-white/10 border border-dashed border-white/30 text-white/80 group-hover:bg-white/20"
                      style={{ width: '52px', height: '52px' }}
                    >
                      <Wand2 className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[10px] text-white/60">More</span>
                  </button>
                </div>
              </div>
            )}

            {/* SHUTTER ROW: Gallery left, Shutter center, Flip right */}
            <div className="w-full max-w-sm px-8 flex items-center justify-between">
              {/* Gallery Button */}
              <label
                htmlFor="creator-gallery-input"
                onClick={stopCamera}
                className="w-12 h-12 rounded-2xl p-[2px] bg-gradient-to-br from-white/80 to-white/30 active:scale-90 transition-transform shadow-lg cursor-pointer group"
                title="Open Gallery"
              >
                <span className="w-full h-full rounded-[14px] bg-zinc-900/90 backdrop-blur-xl flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 group-hover:scale-110 transition-transform text-white" />
                </span>
              </label>

              {/* Shutter Button */}
              <div className="relative flex items-center justify-center">
                {/* Ambient glow */}
                <div
                  className={`absolute w-24 h-24 rounded-full blur-2xl transition-opacity duration-500 pointer-events-none bg-gradient-to-tr from-fuchsia-600 via-pink-500 to-amber-400 ${
                    isRecording ? 'opacity-70 animate-pulse' : 'opacity-35'
                  }`}
                />
                {/* Circular Progress while recording */}
                {isRecording && (
                  <svg className="absolute -inset-2 w-[88px] h-[88px] -rotate-90 pointer-events-none">
                    <defs>
                      <linearGradient id="reelProgressGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#d946ef" />
                        <stop offset="50%" stopColor="#ec4899" />
                        <stop offset="100%" stopColor="#fbbf24" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="44"
                      cy="44"
                      r="39"
                      stroke="url(#reelProgressGrad)"
                      strokeWidth="4"
                      strokeLinecap="round"
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
                  className={`relative rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 ${
                    isRecording ? 'scale-110' : ''
                  }`}
                  style={{
                    width: '76px',
                    height: '76px',
                    padding: '4px',
                    background: isRecording
                      ? 'rgba(255,255,255,0.15)'
                      : 'linear-gradient(135deg, #d946ef, #ec4899 50%, #fbbf24)',
                  }}
                >
                  <span className="w-full h-full rounded-full bg-black/80 flex items-center justify-center">
                    {/* Center Dot */}
                    <span
                      className={`transition-all duration-300 bg-gradient-to-br from-rose-500 to-red-600 shadow-[0_0_18px_rgba(239,68,68,0.7)] ${
                        isRecording ? 'w-7 h-7 rounded-lg' : 'w-[58px] h-[58px] rounded-full'
                      }`}
                    />
                  </span>
                </button>
              </div>

              {/* Flip Camera Button */}
              <button
                type="button"
                onClick={toggleCameraFlip}
                className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center text-white active:scale-90 active:rotate-180 transition-all duration-500 shadow-lg hover:bg-white/20"
                title="Flip Camera"
              >
                <RotateCw className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Recording duration indicator */}
            {isRecording ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-600/90 backdrop-blur-xl text-white text-xs font-bold shadow-[0_0_20px_rgba(220,38,38,0.6)]">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span className="tabular-nums">REC {recordDuration.toFixed(1)}s / {maxRecordDuration}s</span>
              </div>
            ) : (
              <p className="text-[11px] text-white/55 tracking-tight">
                Hold karke ya tap karke video banayein
              </p>
            )}

            {/* MODES SWITCHER: POST | STORY | REELS | VIDEO */}
            <div className="w-full flex items-center justify-center pt-1">
              <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.07] backdrop-blur-2xl border border-white/10 text-[11px] font-bold tracking-widest uppercase">
                {(['post', 'story', 'reel', 'video'] as Mode[]).map((m) => {
                  const isActive = activeMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setActiveMode(m)}
                      className={`relative px-4 py-2 rounded-full transition-all duration-300 ${
                        isActive
                          ? 'bg-white text-black shadow-[0_4px_20px_rgba(255,255,255,0.35)]'
                          : 'text-white/50 hover:text-white'
                      }`}
                    >
                      <span>{m === 'reel' ? 'REELS' : m}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
      {/* 1. INSTAGRAM REEL DURATION PICKER MODAL (User sets any length) */}
      {/* ========================================================================= */}
      {showDurationModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="fixed inset-0"
            onClick={() => setShowDurationModal(false)}
          />
          <div className="relative z-10 w-full sm:max-w-md bg-zinc-900 border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
            {/* Mobile handle */}
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-white">Reel Duration Limit</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDurationModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/60 mb-5">
              Instagram Reels style: Choose standard length or set exact custom seconds for your video.
            </p>

            {/* Preset Buttons */}
            <div className="grid grid-cols-5 gap-2 mb-6">
              {[
                { label: '15s', sec: 15 },
                { label: '30s', sec: 30 },
                { label: '60s', sec: 60 },
                { label: '90s', sec: 90 },
                { label: '3 min', sec: 180 },
              ].map((item) => {
                const isSelected = customDurationInput === item.sec;
                return (
                  <button
                    key={item.sec}
                    type="button"
                    onClick={() => {
                      setCustomDurationInput(item.sec);
                    }}
                    className={`py-3 rounded-2xl flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-gradient-to-tr from-violet-600 to-pink-500 text-white font-bold shadow-lg shadow-pink-500/25 ring-2 ring-white/40 scale-105'
                        : 'bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 font-semibold active:scale-95'
                    }`}
                  >
                    <span className="text-sm">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Duration Slider */}
            <div className="bg-black/40 border border-white/10 rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white/70">Custom length:</span>
                <span className="text-base font-extrabold text-primary">
                  {customDurationInput} seconds {customDurationInput >= 60 ? `(${(customDurationInput / 60).toFixed(1)}m)` : ''}
                </span>
              </div>

              <input
                type="range"
                min={5}
                max={180}
                step={5}
                value={customDurationInput}
                onChange={(e) => setCustomDurationInput(Number(e.target.value))}
                className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />

              <div className="flex justify-between text-[10px] text-white/40 mt-1 font-mono">
                <span>5s</span>
                <span>30s</span>
                <span>60s</span>
                <span>90s</span>
                <span>120s</span>
                <span>180s (3m)</span>
              </div>
            </div>

            {/* Confirm button */}
            <Button
              type="button"
              onClick={() => {
                setMaxRecordDuration(customDurationInput);
                setShowDurationModal(false);
                toast.success(`Video duration set to ${customDurationInput} seconds`);
              }}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold text-sm shadow-lg shadow-primary/25 hover:opacity-95 active:scale-98 transition-all"
            >
              Set Duration ({customDurationInput}s)
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SNAPCHAT & INSTAGRAM EFFECTS SEARCH & EXPLORER MODAL */}
      {/* ========================================================================= */}
      {showEffectsSearchModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div
            className="fixed inset-0"
            onClick={() => setShowEffectsSearchModal(false)}
          />
          <div className="relative z-10 w-full sm:max-w-lg max-h-[88vh] bg-zinc-950 border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-200">
            {/* Mobile handle */}
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-pink-500 flex items-center justify-center text-white shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Camera Effects & Filters</h3>
                  <p className="text-[11px] text-white/60">Snapchat & Instagram Trending AR Filters</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEffectsSearchModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="relative flex items-center mb-3">
              <Search className="w-4 h-4 text-white/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={effectSearchQuery}
                onChange={(e) => setEffectSearchQuery(e.target.value)}
                placeholder="Search effects by name, glow, vintage, neon, anime..."
                className="w-full h-10 pl-10 pr-9 rounded-2xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500"
                autoFocus
              />
              {effectSearchQuery && (
                <button
                  type="button"
                  onClick={() => setEffectSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 rounded-full bg-white/20 flex items-center justify-center text-white text-xs hover:bg-white/30"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5 mb-2 shrink-0">
              {[
                { id: 'all', label: 'All Effects' },
                { id: 'trending', label: '🔥 Trending' },
                { id: 'beauty', label: '🌸 Glow & Beauty' },
                { id: 'retro', label: '📼 Retro & VHS' },
                { id: 'cinematic', label: '🎬 Cinematic' },
                { id: 'cyber', label: '⚡ Cyber & Glitch' },
                { id: 'mood', label: '🌈 Color Mood' },
              ].map((tab) => {
                const isActive = effectActiveTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEffectActiveTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-md shadow-pink-500/20'
                        : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Filtered Effects Grid */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-[260px] max-h-[50vh] no-scrollbar">
              {filteredEffectsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 mb-2">
                    <Search className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-white/80">No effects found</p>
                  <p className="text-xs text-white/50">Try searching for "glow", "retro", "noir", or "film"</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pb-2">
                  {filteredEffectsList.map((eff) => {
                    const isSelected = selectedEffect.id === eff.id;
                    return (
                      <button
                        key={eff.id}
                        type="button"
                        onClick={() => {
                          setSelectedEffect(eff);
                          setShowEffectsSearchModal(false);
                          toast.success(`"${eff.name}" effect applied!`);
                        }}
                        className={`p-2 rounded-2xl flex flex-col items-center gap-1.5 transition-all group ${
                          isSelected
                            ? 'bg-white/15 ring-2 ring-pink-500 shadow-lg shadow-pink-500/20'
                            : 'bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10'
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br transition-transform group-hover:scale-105 shadow-md ${eff.gradient}`}
                        >
                          <span className="text-xl">{eff.badge}</span>
                        </div>
                        <div className="w-full text-center">
                          <p className={`text-xs truncate font-semibold ${isSelected ? 'text-pink-400 font-bold' : 'text-white'}`}>
                            {eff.name}
                          </p>
                          <span className="text-[10px] text-white/50 block truncate">
                            {eff.tag}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom count footer */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
              <span>Showing {filteredEffectsList.length} camera filters</span>
              {selectedEffect.id !== 'none' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEffect(EFFECTS[0]);
                    setShowEffectsSearchModal(false);
                    toast('Effect reset to Normal');
                  }}
                  className="text-pink-400 hover:underline font-semibold"
                >
                  Reset to Normal ⚪
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input for Gallery */}
          <input
            id="creator-gallery-input"
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
