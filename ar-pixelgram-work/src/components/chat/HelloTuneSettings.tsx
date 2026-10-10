import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, FC, PointerEvent } from 'react';
import {
  ArrowLeft,
  Check,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  decodeHelloTuneFile,
  HELLO_TUNE_MOODS,
  HELLO_TUNE_PRESETS,
  isHelloTuneActive,
  loadMyHelloTune,
  playCallerHelloTune,
  playHelloTuneBuffer,
  removeMyHelloTune,
  renderHelloTunePreset,
  saveMyHelloTune,
  type HelloTunePreset,
  type HelloTuneRecord,
} from '@/services/helloTunes';

interface HelloTuneSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentTune: HelloTuneRecord | null;
  onSaved: (tune: HelloTuneRecord | null) => void;
}

interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type TuneDraft = {
  source: { kind: 'preset'; trackId: string } | { kind: 'file'; file: File };
  title: string;
  artist: string;
  mood: string;
  colors: [string, string];
  buffer: AudioBuffer;
};

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 10 * 60;

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function remainingDays(expiresAt: string) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000)));
}

function findBestStart(buffer: AudioBuffer, clipLength: number) {
  const channel = buffer.getChannelData(0);
  const safeClipLength = Math.min(clipLength, buffer.duration);
  const samplesPerWindow = Math.max(1, Math.floor(safeClipLength * buffer.sampleRate));
  const stride = Math.max(1, Math.floor(buffer.sampleRate * 0.75));
  const sampleStep = Math.max(1, Math.floor(buffer.sampleRate / 1000));
  let bestStart = 0;
  let bestEnergy = -1;

  for (let start = 0; start + samplesPerWindow <= channel.length; start += stride) {
    let sum = 0;
    let count = 0;
    for (let i = start; i < start + samplesPerWindow; i += sampleStep) {
      sum += channel[i] * channel[i];
      count++;
    }
    const energy = count ? sum / count : 0;
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = start / buffer.sampleRate;
    }
  }
  return Math.max(0, Math.min(bestStart, buffer.duration - safeClipLength));
}

function Waveform({
  buffer,
  start,
  length,
  onSeek,
}: {
  buffer: AudioBuffer;
  start: number;
  length: number;
  onSeek: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, rect.width, rect.height);
      const data = buffer.getChannelData(0);
      const barCount = Math.max(24, Math.floor(rect.width / 5));
      const samplesPerBar = Math.max(1, Math.floor(data.length / barCount));
      const barWidth = Math.max(2, rect.width / barCount - 2);
      const selectedStart = (start / buffer.duration) * rect.width;
      const selectedEnd = ((start + length) / buffer.duration) * rect.width;

      for (let bar = 0; bar < barCount; bar++) {
        const from = bar * samplesPerBar;
        const to = Math.min(data.length, from + samplesPerBar);
        let peak = 0;
        const scanStep = Math.max(4, Math.floor(samplesPerBar / 120));
        for (let i = from; i < to; i += scanStep) peak = Math.max(peak, Math.abs(data[i]));
        const height = Math.max(5, peak * rect.height * 0.9);
        const x = bar * (rect.width / barCount);
        const y = (rect.height - height) / 2;
        const chosen = x + barWidth >= selectedStart && x <= selectedEnd;
        const gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, chosen ? '#FF63A2' : '#6650B7');
        gradient.addColorStop(1, chosen ? '#8E65FF' : '#3B2B68');
        context.fillStyle = gradient;
        context.beginPath();
        context.roundRect(x, y, barWidth, height, 3);
        context.fill();
      }

      context.strokeStyle = 'rgba(245, 238, 255, .75)';
      context.lineWidth = 1.5;
      context.strokeRect(selectedStart, 2, Math.max(2, selectedEnd - selectedStart), rect.height - 4);
    };

    draw();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    observer?.observe(canvas);
    return () => observer?.disconnect();
  }, [buffer, start, length]);

  return (
    <div className="ht-wave-wrap" onPointerDown={onSeek} onPointerMove={event => event.buttons === 1 && onSeek(event)} onPointerUp={onSeek} onPointerCancel={onSeek}>
      <canvas ref={canvasRef} className="ht-wave-canvas" aria-label="Audio waveform; tap or drag to choose a section" />
      <div className="ht-wave-labels"><span>{formatTime(start)}</span><span>{formatTime(start + length)} / {formatTime(buffer.duration)}</span></div>
    </div>
  );
}

export const HelloTuneSettings: FC<HelloTuneSettingsProps> = ({
  isOpen,
  onClose,
  userId,
  currentTune,
  onSaved,
}) => {
  const [query, setQuery] = useState('');
  const [mood, setMood] = useState('All');
  const [draft, setDraft] = useState<TuneDraft | null>(null);
  const [clipStart, setClipStart] = useState(0);
  const [clipLength, setClipLength] = useState(20);
  const [isListening, setIsListening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playbackRef = useRef<(() => void) | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragPointerRef = useRef<number | null>(null);

  const activeTune = currentTune && isHelloTuneActive(currentTune) ? currentTune : null;
  const filteredTracks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return HELLO_TUNE_PRESETS.filter(track => {
      const matchesMood = mood === 'All' || track.mood === mood;
      const searchable = `${track.title} ${track.artist} ${track.mood} ${track.keywords}`.toLocaleLowerCase();
      return matchesMood && (!needle || searchable.includes(needle));
    });
  }, [mood, query]);

  const stopPreview = () => {
    playbackRef.current?.();
    playbackRef.current = null;
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    setPlayingId(null);
  };

  useEffect(() => () => {
    playbackRef.current?.();
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let live = true;
    setLoadError('');
    loadMyHelloTune(userId)
      .then(tune => {
        if (live) onSaved(tune);
      })
      .catch(error => {
        console.error('Hello Tune load failed:', error);
        if (live) setLoadError('Hello Tune ke liye latest database migration abhi apply nahi hui hai.');
      });
    return () => { live = false; };
  }, [isOpen, userId, onSaved]);

  useEffect(() => {
    if (!isOpen) {
      stopPreview();
      setDraft(null);
      recognitionRef.current?.stop();
      setIsListening(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const previewBuffer = (buffer: AudioBuffer, id: string, start = 0, length = 12) => {
    stopPreview();
    try {
      playbackRef.current = playHelloTuneBuffer(buffer, start, Math.min(length, buffer.duration - start), false, 0.85);
      setPlayingId(id);
      previewTimerRef.current = window.setTimeout(() => {
        playbackRef.current?.();
        playbackRef.current = null;
        setPlayingId(null);
      }, Math.max(1, Math.min(length, buffer.duration - start)) * 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview play nahi ho paya');
    }
  };

  const selectPreset = async (track: HelloTunePreset) => {
    setIsLoading(true);
    stopPreview();
    try {
      const buffer = await renderHelloTunePreset(track.id);
      const length = Math.min(20, Math.floor(buffer.duration));
      setDraft({
        source: { kind: 'preset', trackId: track.id },
        title: track.title,
        artist: track.artist,
        mood: track.mood,
        colors: track.colors,
        buffer,
      });
      setClipLength(length);
      setClipStart(findBestStart(buffer, length));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gana load nahi ho paya');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error('Audio file 20 MB se chhoti honi chahiye');
      return;
    }
    const allowedExtension = /\.(mp3|m4a|aac|wav|ogg|opus|webm)$/i.test(file.name);
    if (!file.type.startsWith('audio/') && !allowedExtension) {
      toast.error('MP3 ya supported audio file choose karo');
      return;
    }

    setIsLoading(true);
    stopPreview();
    try {
      const buffer = await decodeHelloTuneFile(file);
      if (buffer.duration < 1) throw new Error('Audio kam se kam 1 second ka hona chahiye');
      if (buffer.duration > MAX_AUDIO_SECONDS) throw new Error('Audio 10 minute se chhota hona chahiye');
      const length = Math.min(20, Math.floor(buffer.duration));
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'My Hello Tune';
      setDraft({
        source: { kind: 'file', file },
        title,
        artist: 'Your upload',
        mood: 'My audio',
        colors: ['#7C5CFF', '#FF3D7F'],
        buffer,
      });
      setClipLength(length);
      setClipStart(findBestStart(buffer, length));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Audio file khul nahi payi');
    } finally {
      setIsLoading(false);
    }
  };

  const startVoiceSearch = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast.error('Voice search is browser mein available nahi hai');
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = 'hi-IN';
    recognition.interimResults = false;
    recognition.onresult = result => {
      const transcript = result.results[0]?.[0]?.transcript?.trim();
      if (transcript) setQuery(transcript);
    };
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Voice search nahi ho payi; search box use karo');
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      toast.error('Voice search start nahi ho payi');
    }
  };

  const playSavedTune = async () => {
    if (!activeTune) return;
    if (playingId === 'saved') {
      stopPreview();
      return;
    }
    stopPreview();
    try {
      playbackRef.current = await playCallerHelloTune(activeTune);
      setPlayingId('saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Tune preview play nahi ho paya');
    }
  };

  const handleSeek = (event: PointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    if (event.type === 'pointerdown') {
      dragPointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (dragPointerRef.current !== event.pointerId) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setClipStart(Math.max(0, Math.min(draft.buffer.duration - clipLength, position * draft.buffer.duration - clipLength / 2)));
    if (event.type === 'pointerup' || event.type === 'pointercancel') dragPointerRef.current = null;
  };

  const handleSave = async () => {
    if (!draft || !userId) {
      toast.error('Login session nahi mili; dobara sign in karke try karo');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveMyHelloTune(userId, {
        trackId: draft.source.kind === 'preset' ? draft.source.trackId : undefined,
        file: draft.source.kind === 'file' ? draft.source.file : undefined,
        title: draft.title,
        artist: draft.artist,
        startSeconds: clipStart,
        durationSeconds: clipLength,
      });
      onSaved(saved);
      setDraft(null);
      stopPreview();
      toast.success('Hello Tune set ho gayi — 28 din baad automatically expire hogi');
      onClose();
    } catch (error) {
      console.error('Hello Tune save failed:', error);
      toast.error(error instanceof Error ? error.message : 'Hello Tune save nahi ho payi');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!userId) return;
    if (!window.confirm('Current Hello Tune aur uploaded audio dono remove ho jayenge. Continue?')) return;
    setIsSaving(true);
    try {
      await removeMyHelloTune(userId);
      onSaved(null);
      stopPreview();
      toast.success('Hello Tune hata di');
    } catch (error) {
      console.error('Hello Tune remove failed:', error);
      toast.error(error instanceof Error ? error.message : 'Hello Tune remove nahi hui');
    } finally {
      setIsSaving(false);
    }
  };

  const chooseBestPart = () => {
    if (!draft) return;
    setClipStart(findBestStart(draft.buffer, clipLength));
    toast.success('Gane ka best section select kiya');
  };

  const setLength = (seconds: number) => {
    if (!draft) return;
    const nextLength = Math.max(1, Math.min(seconds, Math.floor(draft.buffer.duration)));
    setClipLength(nextLength);
    setClipStart(Math.max(0, Math.min(clipStart, draft.buffer.duration - nextLength)));
    stopPreview();
  };

  const availableClipLengths = draft
    ? [15, 20, 30].filter(seconds => seconds <= Math.floor(draft.buffer.duration))
    : [];
  if (draft && availableClipLengths.length === 0) availableClipLengths.push(Math.floor(draft.buffer.duration));

  return (
    <div className="ht-root" role="dialog" aria-modal="true" aria-label="Hello Tune settings">
      <style>{`
        .ht-root{--ht-bg:#0e0820;--ht-card:#1a1233;--ht-stroke:#2b2050;--ht-text:#f7f3ff;--ht-muted:#a99fd2;--ht-pink:#ff3d7f;--ht-purple:#7c5cff;position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;background:radial-gradient(ellipse at 75% 2%,rgba(124,92,255,.18),transparent 33%),radial-gradient(ellipse at 10% 30%,rgba(255,61,127,.08),transparent 35%),var(--ht-bg);color:var(--ht-text);font-family:inherit;overflow:hidden}
        .ht-header{height:62px;flex:0 0 62px;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--ht-stroke);background:rgba(14,8,32,.88);backdrop-filter:blur(18px)}
        .ht-icon-button{width:40px;height:40px;border:1px solid var(--ht-stroke);border-radius:14px;background:rgba(255,255,255,.035);color:var(--ht-text);display:grid;place-items:center;flex:0 0 auto}
        .ht-heading{min-width:0;flex:1}.ht-heading strong{display:block;font-size:16px}.ht-heading span{display:block;color:var(--ht-muted);font-size:11px;margin-top:2px}
        .ht-content{width:min(100%,560px);margin:0 auto;flex:1;overflow-y:auto;padding:16px 16px calc(32px + env(safe-area-inset-bottom));scrollbar-width:thin;scrollbar-color:#493978 transparent}
        .ht-current{display:flex;align-items:center;gap:12px;padding:14px;margin:2px 0 18px;border:1px solid rgba(124,92,255,.36);border-radius:18px;background:linear-gradient(115deg,rgba(124,92,255,.17),rgba(255,61,127,.08))}
        .ht-current-art,.ht-art{width:48px;height:48px;flex:0 0 48px;border-radius:14px;display:grid;place-items:center;color:white;background:linear-gradient(135deg,var(--art-a,#7c5cff),var(--art-b,#ff3d7f));box-shadow:0 8px 20px rgba(6,4,19,.28)}
        .ht-current-copy{min-width:0;flex:1}.ht-current-copy strong,.ht-current-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ht-current-copy strong{font-size:13px}.ht-current-copy span{color:var(--ht-muted);font-size:11px;margin-top:4px}
        .ht-overline{font-size:11px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:#c7b8ff;margin:18px 0 10px}
        .ht-search{display:flex;align-items:center;gap:9px;background:rgba(255,255,255,.055);border:1px solid var(--ht-stroke);border-radius:15px;padding:0 11px;height:48px}
        .ht-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--ht-text);font:inherit;font-size:13px}.ht-search input::placeholder{color:#8478aa}
        .ht-moods{display:flex;gap:7px;overflow-x:auto;padding:12px 0 4px;scrollbar-width:none}.ht-moods::-webkit-scrollbar{display:none}
        .ht-chip{white-space:nowrap;border:1px solid var(--ht-stroke);border-radius:999px;background:rgba(255,255,255,.035);padding:7px 12px;color:#c7bde1;font-size:11px}
        .ht-chip-active{color:white;border-color:transparent;background:linear-gradient(110deg,var(--ht-purple),var(--ht-pink));box-shadow:0 5px 14px rgba(124,92,255,.22)}
        .ht-upload{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:13px;border-radius:16px;border:1px dashed rgba(199,184,255,.42);color:var(--ht-text);background:rgba(124,92,255,.08)}
        .ht-upload-icon{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:rgba(124,92,255,.2);color:#d7ccff}
        .ht-upload strong{display:block;font-size:12px}.ht-upload small{display:block;color:var(--ht-muted);font-size:10px;margin-top:3px}
        .ht-track{display:flex;align-items:center;gap:11px;padding:11px 3px;border-bottom:1px solid rgba(169,159,210,.12)}
        .ht-track-copy{flex:1;min-width:0}.ht-track-copy strong,.ht-track-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ht-track-copy strong{font-size:12px}.ht-track-copy span{color:var(--ht-muted);font-size:10px;margin-top:4px}
        .ht-track-use{border:1px solid var(--ht-stroke);border-radius:12px;padding:8px 10px;background:rgba(255,255,255,.04);color:#d9ceff;font-size:10px;font-weight:700}
        .ht-empty{padding:26px 12px;text-align:center;color:var(--ht-muted);font-size:12px}
        .ht-error{margin:10px 0;padding:11px 13px;border:1px solid rgba(255,61,127,.32);border-radius:13px;background:rgba(255,61,127,.08);color:#ffc3d7;font-size:11px;line-height:1.5}
        .ht-trim{position:fixed;inset:0;z-index:95;background:rgba(14,8,32,.98);display:flex;flex-direction:column;overflow-y:auto}
        .ht-trim-content{width:min(100%,560px);margin:0 auto;flex:1;padding:16px 16px calc(26px + env(safe-area-inset-bottom))}
        .ht-trim-hero{display:flex;align-items:center;gap:13px;margin:12px 0 18px}.ht-trim-hero .ht-art{width:56px;height:56px;flex-basis:56px}.ht-trim-hero strong{display:block;font-size:15px}.ht-trim-hero span{display:block;color:var(--ht-muted);font-size:11px;margin-top:4px}
        .ht-wave-wrap{position:relative;padding:14px 12px 24px;border:1px solid var(--ht-stroke);border-radius:18px;background:rgba(255,255,255,.035);touch-action:none;user-select:none}
        .ht-wave-canvas{display:block;width:100%;height:84px}.ht-wave-labels{position:absolute;bottom:7px;left:13px;right:13px;display:flex;justify-content:space-between;color:#a99fd2;font-size:9px}
        .ht-lengths{display:flex;gap:8px;margin:14px 0}.ht-length{flex:1;border:1px solid var(--ht-stroke);border-radius:12px;background:rgba(255,255,255,.035);color:#c8bddf;padding:10px 6px;font-size:11px;font-weight:700}.ht-length-active{border-color:transparent;color:white;background:linear-gradient(110deg,#7c5cff,#ff3d7f)}
        .ht-best{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--ht-stroke);border-radius:13px;padding:11px;background:rgba(255,255,255,.035);color:#d3c9ee;font-size:11px}
        .ht-set{position:sticky;bottom:0;width:min(100%,560px);margin:20px auto 0;border:0;border-radius:15px;padding:14px;background:linear-gradient(110deg,#7c5cff,#ff3d7f);color:white;font-weight:800;font-size:13px;box-shadow:0 9px 22px rgba(124,92,255,.2);display:flex;align-items:center;justify-content:center;gap:8px}
        .ht-set:disabled{opacity:.55}
        .ht-no-results{padding:28px 12px;text-align:center;color:var(--ht-muted);font-size:12px}
      `}</style>

      <header className="ht-header">
        <button type="button" className="ht-icon-button" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <div className="ht-heading"><strong>Hello Tune</strong><span>Caller ko ring ke waqt ye tune sunai degi</span></div>
        <button type="button" className="ht-icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </header>

      <main className="ht-content">
        {loadError && <div className="ht-error">{loadError}</div>}
        {activeTune && (
          <>
            <div className="ht-overline">Abhi set hai</div>
            <div className="ht-current">
              <div className="ht-current-art"><Music size={20} /></div>
              <div className="ht-current-copy">
                <strong>{activeTune.title}</strong>
                <span>{activeTune.artist} · {remainingDays(activeTune.expiresAt)} din baaki</span>
              </div>
              <button type="button" className="ht-icon-button" onClick={playSavedTune} aria-label="Preview current tune">
                {playingId === 'saved' ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <button type="button" className="ht-icon-button" onClick={handleRemove} disabled={isSaving} aria-label="Remove current tune">
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          </>
        )}

        <div className="ht-overline">Apna gana lagao</div>
        <button type="button" className="ht-upload" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
          <span className="ht-upload-icon">{isLoading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}</span>
          <span><strong>Gallery se audio upload karo</strong><small>MP3, M4A, AAC, WAV · max 20 MB</small></span>
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.webm" hidden onChange={handleUpload} />

        <div className="ht-overline">Pixelgram ke demo tunes</div>
        <div className="ht-search">
          <Search size={17} color="#a99fd2" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Gana, mood ya artist search karo..." />
          <button type="button" className="ht-icon-button" style={{ width: 34, height: 34, borderRadius: 11 }} onClick={startVoiceSearch} aria-label="Search by voice">
            <Mic size={15} color={isListening ? '#ff3d7f' : '#c7b8ff'} />
          </button>
        </div>
        <div className="ht-moods">
          {HELLO_TUNE_MOODS.map(item => (
            <button key={item} type="button" className={`ht-chip ${mood === item ? 'ht-chip-active' : ''}`} onClick={() => setMood(item)}>{item}</button>
          ))}
        </div>

        <div>
          {filteredTracks.map(track => (
            <div key={track.id} className="ht-track">
              <div className="ht-art" style={{ '--art-a': track.colors[0], '--art-b': track.colors[1] } as CSSProperties}>
                <Music size={17} />
              </div>
              <div className="ht-track-copy"><strong>{track.title}</strong><span>{track.artist} · {track.mood}</span></div>
              <button
                type="button"
                className="ht-icon-button"
                style={{ width: 36, height: 36, borderRadius: 12 }}
                aria-label={`Preview ${track.title}`}
                onClick={async () => {
                  if (playingId === track.id) {
                    stopPreview();
                    return;
                  }
                  setIsLoading(true);
                  try {
                    const buffer = await renderHelloTunePreset(track.id);
                    previewBuffer(buffer, track.id);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Preview play nahi ho paya');
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                {playingId === track.id ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button type="button" className="ht-track-use" onClick={() => void selectPreset(track)}>Use</button>
            </div>
          ))}
          {filteredTracks.length === 0 && <div className="ht-no-results">Is search mein koi demo tune nahi mili.</div>}
        </div>
        <div className="ht-error" style={{ borderColor: 'rgba(124,92,255,.24)', background: 'rgba(124,92,255,.055)', color: '#c8bddf' }}>
          Ye 10 built-in demo tunes synthesize ki gayi melodies hain; commercial/film songs ke liye apni audio file upload karo.
        </div>
      </main>

      {draft && (
        <section className="ht-trim" aria-label="Choose a song clip">
          <header className="ht-header">
            <button type="button" className="ht-icon-button" onClick={() => { stopPreview(); setDraft(null); }} aria-label="Back to tune list"><ArrowLeft size={19} /></button>
            <div className="ht-heading"><strong>Clip choose karo</strong><span>Caller ko sirf selected section sunai dega</span></div>
            <button type="button" className="ht-icon-button" onClick={() => { stopPreview(); setDraft(null); }} aria-label="Close clip editor"><X size={18} /></button>
          </header>
          <div className="ht-trim-content">
            <div className="ht-trim-hero">
              <div className="ht-art" style={{ '--art-a': draft.colors[0], '--art-b': draft.colors[1] } as CSSProperties}><Music size={20} /></div>
              <div><strong>{draft.title}</strong><span>{draft.artist} · {formatTime(draft.buffer.duration)}</span></div>
            </div>
            <div className="ht-overline">Waveform par tap/drag karke start chuno</div>
            <Waveform buffer={draft.buffer} start={clipStart} length={clipLength} onSeek={handleSeek} />
            <div className="ht-lengths">
              {availableClipLengths.map(seconds => (
                <button key={seconds} type="button" className={`ht-length ${clipLength === seconds ? 'ht-length-active' : ''}`} onClick={() => setLength(seconds)}>
                  {seconds} sec
                </button>
              ))}
            </div>
            <button type="button" className="ht-best" onClick={chooseBestPart}><Sparkles size={15} /> Gane ka best part select karo</button>
            <button
              type="button"
              className="ht-best"
              style={{ marginTop: 9 }}
              onClick={() => {
                if (playingId === 'draft') {
                  stopPreview();
                  return;
                }
                previewBuffer(draft.buffer, 'draft', clipStart, clipLength);
              }}
            >
              {playingId === 'draft' ? <Pause size={15} /> : <Play size={15} />}
              {playingId === 'draft' ? 'Preview roko' : 'Selected clip preview karo'}
            </button>
            <button type="button" className="ht-set" onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Check size={16} /> Hello Tune set karo · 28 din</>}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
