import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FC } from 'react';
import { ArrowLeft, Check, Loader2, Music, Pause, Play, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  decodeHelloTuneFile,
  isHelloTuneActive,
  loadMyHelloTune,
  playCallerHelloTune,
  removeMyHelloTune,
  saveMyHelloTune,
  type HelloTuneRecord,
} from '@/services/helloTunes';
import {
  canListDeviceSongs,
  deviceSongSrc,
  deviceSongToFile,
  filesToSongs,
  listDeviceSongs,
  type DeviceSong,
} from '@/services/deviceMusic';

interface HelloTuneSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentTune: HelloTuneRecord | null;
  onSaved: (tune: HelloTuneRecord | null) => void;
}

type TuneDraft = {
  file: File;
  title: string;
  artist: string;
  buffer: AudioBuffer;
};

type SongsState = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

/** Hello Tune hamesha 30 second ki hoti hai */
const CLIP_SECONDS = 30;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 10 * 60;

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function remainingDays(expiresAt: string) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000)));
}

/**
 * Selected gaane ka player — WebAudio se chalta hai, isliye aage/peeche karna
 * hamesha sahi jagah se bajata hai (seek ke baad naya source exact offset se start).
 */
function useBufferPlayer(buffer: AudioBuffer | null) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const duration = buffer?.duration ?? 0;

  const stopSource = useCallback(() => {
    const src = sourceRef.current;
    sourceRef.current = null;
    if (src) {
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
    }
  }, []);

  const currentPos = useCallback(() => {
    const ctx = ctxRef.current;
    if (!sourceRef.current || !ctx) return offsetRef.current;
    return Math.min(duration, offsetRef.current + (ctx.currentTime - startedAtRef.current));
  }, [duration]);

  const playFrom = useCallback((from: number) => {
    if (!buffer) return;
    stopSource();
    if (!ctxRef.current) {
      const w = window as Window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext || w.webkitAudioContext;
      if (!Ctor) {
        toast.error('Is phone me audio play support nahi hai');
        return;
      }
      ctxRef.current = new Ctor();
    }
    const ctx = ctxRef.current;
    const start = Math.max(0, Math.min(from, Math.max(0, buffer.duration - 0.1)));
    void ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (sourceRef.current !== src) return;
      sourceRef.current = null;
      offsetRef.current = buffer.duration;
      setPos(buffer.duration);
      setPlaying(false);
    };
    src.start(0, start);
    sourceRef.current = src;
    startedAtRef.current = ctx.currentTime;
    offsetRef.current = start;
    setPos(start);
    setPlaying(true);
  }, [buffer, stopSource]);

  const pause = useCallback(() => {
    const at = currentPos();
    stopSource();
    offsetRef.current = at;
    setPos(at);
    setPlaying(false);
  }, [currentPos, stopSource]);

  const seek = useCallback((to: number) => {
    const target = Math.max(0, Math.min(to, Math.max(0, duration - 0.1)));
    if (sourceRef.current) {
      playFrom(target);
    } else {
      offsetRef.current = target;
      setPos(target);
    }
  }, [duration, playFrom]);

  const toggle = useCallback(() => {
    if (sourceRef.current) pause();
    else playFrom(offsetRef.current >= duration - 0.2 ? 0 : offsetRef.current);
  }, [duration, pause, playFrom]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setPos(currentPos()), 200);
    return () => window.clearInterval(timer);
  }, [playing, currentPos]);

  // Naya gaana -> sab reset
  useEffect(() => {
    stopSource();
    offsetRef.current = 0;
    setPos(0);
    setPlaying(false);
  }, [buffer, stopSource]);

  useEffect(() => () => {
    stopSource();
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, [stopSource]);

  return { playing, pos, duration, seek, toggle, pause, getPos: currentPos };
}

export const HelloTuneSettings: FC<HelloTuneSettingsProps> = ({
  isOpen,
  onClose,
  userId,
  currentTune,
  onSaved,
}) => {
  const [songs, setSongs] = useState<DeviceSong[]>([]);
  const [songsState, setSongsState] = useState<SongsState>('idle');
  const [query, setQuery] = useState('');
  const [listPlayingId, setListPlayingId] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TuneDraft | null>(null);
  const [confirmStart, setConfirmStart] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [savedPlaying, setSavedPlaying] = useState(false);
  const listAudioRef = useRef<HTMLAudioElement | null>(null);
  const listUrlRef = useRef<string | null>(null);
  const savedStopRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNative = canListDeviceSongs();

  const player = useBufferPlayer(draft?.buffer ?? null);

  const stopListAudio = useCallback(() => {
    const audio = listAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    listAudioRef.current = null;
    if (listUrlRef.current) URL.revokeObjectURL(listUrlRef.current);
    listUrlRef.current = null;
    setListPlayingId(null);
  }, []);

  const stopSaved = useCallback(() => {
    savedStopRef.current?.();
    savedStopRef.current = null;
    setSavedPlaying(false);
  }, []);

  const loadSongs = useCallback(async () => {
    if (!canListDeviceSongs()) return;
    setSongsState('loading');
    try {
      const list = await listDeviceSongs();
      setSongs(list);
      setSongsState('ready');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      setSongsState(code === 'PERMISSION_DENIED' ? 'denied' : 'error');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (isNative && songsState === 'idle') void loadSongs();
  }, [isOpen, isNative, songsState, loadSongs]);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let live = true;
    setLoadError('');
    loadMyHelloTune(userId)
      .then(tune => { if (live) onSaved(tune); })
      .catch(error => {
        console.error('Hello Tune load failed:', error);
        if (live) setLoadError('Hello Tune ke liye latest database migration abhi apply nahi hui hai.');
      });
    return () => { live = false; };
  }, [isOpen, userId, onSaved]);

  useEffect(() => {
    if (!isOpen) {
      stopListAudio();
      stopSaved();
      setDraft(null);
      setConfirmStart(null);
    }
  }, [isOpen, stopListAudio, stopSaved]);

  useEffect(() => () => { stopListAudio(); stopSaved(); }, [stopListAudio, stopSaved]);

  const filteredSongs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return songs;
    return songs.filter(song => `${song.title} ${song.artist} ${song.fileName}`.toLocaleLowerCase().includes(needle));
  }, [songs, query]);

  if (!isOpen) return null;

  const activeTune = currentTune && isHelloTuneActive(currentTune) ? currentTune : null;

  const toggleListSong = (song: DeviceSong) => {
    if (listPlayingId === song.id) {
      stopListAudio();
      return;
    }
    stopListAudio();
    stopSaved();
    let src = '';
    if (song.file) {
      src = URL.createObjectURL(song.file);
      listUrlRef.current = src;
    } else {
      src = deviceSongSrc(song);
    }
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.addEventListener('ended', () => setListPlayingId(null));
    listAudioRef.current = audio;
    setListPlayingId(song.id);
    void audio.play().catch(() => {
      setListPlayingId(null);
      toast.error('Gaana play nahi hua — "Select" dabake try karo');
    });
  };

  const selectSong = async (song: DeviceSong) => {
    if (selectingId) return;
    stopListAudio();
    stopSaved();
    setSelectingId(song.id);
    try {
      if (song.size > MAX_AUDIO_BYTES) throw new Error('Gaana 20 MB se chhota hona chahiye');
      const file = await deviceSongToFile(song);
      if (file.size > MAX_AUDIO_BYTES) throw new Error('Gaana 20 MB se chhota hona chahiye');
      const buffer = await decodeHelloTuneFile(file);
      if (buffer.duration < 1) throw new Error('Gaana kam se kam 1 second ka hona chahiye');
      if (buffer.duration > MAX_AUDIO_SECONDS) throw new Error('Gaana 10 minute se chhota hona chahiye');
      setConfirmStart(null);
      setDraft({ file, buffer, title: song.title || 'My Hello Tune', artist: song.artist || 'Phone se' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gaana khul nahi paya');
    } finally {
      setSelectingId(null);
    }
  };

  const handlePickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files ? filesToSongs(event.target.files) : [];
    event.target.value = '';
    if (!picked.length) return;
    setSongs(prev => [...picked, ...prev]);
    if (!isNative) setSongsState('ready');
    if (picked.length === 1 && picked[0]) void selectSong(picked[0]);
  };

  const playSavedTune = async () => {
    if (!activeTune) return;
    if (savedPlaying) {
      stopSaved();
      return;
    }
    stopListAudio();
    try {
      savedStopRef.current = await playCallerHelloTune(activeTune);
      setSavedPlaying(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Tune play nahi hui');
    }
  };

  const handleRemove = async () => {
    if (!userId) return;
    if (!window.confirm('Current Hello Tune hata dein?')) return;
    setIsSaving(true);
    try {
      await removeMyHelloTune(userId);
      onSaved(null);
      stopSaved();
      toast.success('Hello Tune hata di');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Hello Tune remove nahi hui');
    } finally {
      setIsSaving(false);
    }
  };

  const clipLength = draft ? Math.min(CLIP_SECONDS, Math.floor(draft.buffer.duration)) || 1 : CLIP_SECONDS;
  const clampStart = (value: number) => (draft ? Math.max(0, Math.min(Math.floor(value), Math.floor(draft.buffer.duration - clipLength))) : 0);

  const handleSave = async () => {
    if (!draft || confirmStart === null) return;
    if (!userId) {
      toast.error('Login session nahi mili; dobara sign in karo');
      return;
    }
    player.pause();
    setIsSaving(true);
    try {
      const saved = await saveMyHelloTune(userId, {
        file: draft.file,
        title: draft.title,
        artist: draft.artist,
        startSeconds: confirmStart,
        durationSeconds: clipLength,
      });
      onSaved(saved);
      setDraft(null);
      setConfirmStart(null);
      toast.success(`Hello Tune set ho gayi (${formatTime(confirmStart)} se) — 30 din tak`);
      onClose();
    } catch (error) {
      console.error('Hello Tune save failed:', error);
      toast.error(error instanceof Error ? error.message : 'Hello Tune save nahi ho payi');
    } finally {
      setIsSaving(false);
    }
  };

  const closeEditor = () => {
    player.pause();
    setDraft(null);
    setConfirmStart(null);
  };

  const startHere = clampStart(player.pos);

  return (
    <div className="ht-root" role="dialog" aria-modal="true" aria-label="Hello Tune settings">
      <style>{`
        .ht-root{--ht-bg:#f8f7fb;--ht-card:#ffffff;--ht-stroke:#e4e0f2;--ht-text:#16121f;--ht-muted:#6f6a80;--ht-pink:#e11d48;--ht-purple:#7c5cff;--ht-ov1:rgba(17,12,40,.04);--ht-ov2:rgba(17,12,40,.06);--ht-scrim:rgba(248,247,251,.92);position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;background:var(--ht-bg);color:var(--ht-text);font-family:inherit;overflow:hidden}
        .dark .ht-root{--ht-bg:#0e0820;--ht-card:#1a1233;--ht-stroke:#2b2050;--ht-text:#f7f3ff;--ht-muted:#a99fd2;--ht-pink:#ff3d7f;--ht-ov1:rgba(255,255,255,.04);--ht-ov2:rgba(255,255,255,.07);--ht-scrim:rgba(14,8,32,.92)}
        .ht-header{height:62px;flex:0 0 62px;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--ht-stroke);background:var(--ht-scrim);backdrop-filter:blur(18px)}
        .ht-icon-button{width:40px;height:40px;border:1px solid var(--ht-stroke);border-radius:14px;background:var(--ht-ov1);color:var(--ht-text);display:grid;place-items:center;flex:0 0 auto}
        .ht-heading{min-width:0;flex:1}.ht-heading strong{display:block;font-size:16px}.ht-heading span{display:block;color:var(--ht-muted);font-size:11px;margin-top:2px}
        .ht-content{width:min(100%,560px);margin:0 auto;flex:1;overflow-y:auto;padding:16px 16px calc(32px + env(safe-area-inset-bottom))}
        .ht-current{display:flex;align-items:center;gap:12px;padding:14px;margin:2px 0 18px;border:1px solid rgba(124,92,255,.36);border-radius:18px;background:linear-gradient(115deg,rgba(124,92,255,.17),rgba(255,61,127,.08))}
        .ht-art{width:44px;height:44px;flex:0 0 44px;border-radius:13px;display:grid;place-items:center;color:white;background:linear-gradient(135deg,#7c5cff,#ff3d7f)}
        .ht-copy{min-width:0;flex:1}.ht-copy strong,.ht-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ht-copy strong{font-size:13px}.ht-copy span{color:var(--ht-muted);font-size:11px;margin-top:3px}
        .ht-overline{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--ht-purple);margin:16px 0 10px}
        .ht-search{display:flex;align-items:center;gap:9px;background:var(--ht-ov2);border:1px solid var(--ht-stroke);border-radius:14px;padding:0 12px;height:44px;margin-bottom:6px}
        .ht-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--ht-text);font:inherit;font-size:13px}.ht-search input::placeholder{color:var(--ht-muted)}
        .ht-pick{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;border-radius:14px;border:1px dashed rgba(124,92,255,.5);color:var(--ht-text);background:rgba(124,92,255,.08);font-size:13px;font-weight:700;margin-top:10px}
        .ht-song{display:flex;align-items:center;gap:11px;padding:10px 2px;border-bottom:1px solid var(--ht-stroke)}
        .ht-select{border:0;border-radius:12px;padding:9px 14px;background:linear-gradient(110deg,#7c5cff,#ff3d7f);color:white;font-size:12px;font-weight:800;min-width:72px;display:flex;align-items:center;justify-content:center}
        .ht-select:disabled{opacity:.6}
        .ht-note{padding:22px 10px;text-align:center;color:var(--ht-muted);font-size:13px;line-height:1.5}
        .ht-error{margin:10px 0;padding:11px 13px;border:1px solid rgba(255,61,127,.32);border-radius:13px;background:rgba(255,61,127,.08);color:var(--ht-pink);font-size:12px}
        .ht-editor{position:fixed;inset:0;z-index:95;background:var(--ht-bg);display:flex;flex-direction:column;overflow-y:auto}
        .ht-editor-body{width:min(100%,560px);margin:0 auto;padding:24px 18px calc(28px + env(safe-area-inset-bottom))}
        .ht-hero{display:flex;align-items:center;gap:13px;margin-bottom:28px}.ht-hero .ht-art{width:60px;height:60px;flex-basis:60px;border-radius:16px}
        .ht-range{width:100%;accent-color:#7c5cff;height:28px}
        .ht-times{display:flex;justify-content:space-between;font-size:12px;color:var(--ht-muted);margin-top:2px}
        .ht-controls{display:flex;align-items:center;justify-content:center;gap:22px;margin:22px 0}
        .ht-skip{border:1px solid var(--ht-stroke);border-radius:14px;background:var(--ht-ov1);color:var(--ht-text);padding:12px 14px;font-size:13px;font-weight:800}
        .ht-play{width:68px;height:68px;border:0;border-radius:999px;display:grid;place-items:center;color:white;background:linear-gradient(135deg,#7c5cff,#ff3d7f);box-shadow:0 10px 24px rgba(124,92,255,.3)}
        .ht-clip{text-align:center;font-size:13px;color:var(--ht-muted);margin-bottom:16px}.ht-clip b{color:var(--ht-text)}
        .ht-set{width:100%;border:0;border-radius:15px;padding:15px;background:linear-gradient(110deg,#7c5cff,#ff3d7f);color:white;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px}
        .ht-set:disabled{opacity:.55}
        .ht-confirm{margin-top:4px;padding:14px;border-radius:15px;border:1px solid var(--ht-stroke);background:var(--ht-ov1)}
        .ht-confirm p{font-size:13px;margin:0 0 12px;line-height:1.5}
        .ht-cancel{flex:1;border:1px solid var(--ht-stroke);border-radius:15px;background:transparent;color:var(--ht-text);font-weight:700;font-size:14px}
      `}</style>

      <header className="ht-header">
        <button type="button" className="ht-icon-button" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <div className="ht-heading"><strong>Hello Tune</strong><span>Phone ka koi bhi gaana chuno</span></div>
        <button type="button" className="ht-icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </header>

      <main className="ht-content">
        {loadError && <div className="ht-error">{loadError}</div>}
        {activeTune && (
          <>
            <div className="ht-overline">Abhi set hai</div>
            <div className="ht-current">
              <div className="ht-art"><Music size={19} /></div>
              <div className="ht-copy">
                <strong>{activeTune.title}</strong>
                <span>{formatTime(activeTune.startSeconds)} se · {remainingDays(activeTune.expiresAt)} din baaki</span>
              </div>
              <button type="button" className="ht-icon-button" onClick={playSavedTune} aria-label="Current tune suno">
                {savedPlaying ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <button type="button" className="ht-icon-button" onClick={handleRemove} disabled={isSaving} aria-label="Current tune hatao">
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          </>
        )}

        <div className="ht-overline">Phone ke gaane {songs.length > 0 && `(${songs.length})`}</div>
        {songs.length > 5 && (
          <div className="ht-search">
            <Search size={16} color="var(--ht-muted)" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Gaana search karo..." aria-label="Gaana search karo" />
          </div>
        )}

        {songsState === 'loading' && <div className="ht-note"><Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />Phone ke gaane dhoondh rahe hain...</div>}
        {songsState === 'denied' && (
          <div className="ht-note">
            Gaane dikhane ke liye Music/Audio permission chahiye.
            <button type="button" className="ht-pick" onClick={() => void loadSongs()}><RefreshCw size={16} /> Permission do</button>
          </div>
        )}
        {songsState === 'error' && (
          <div className="ht-note">
            Phone ke gaane load nahi hue.
            <button type="button" className="ht-pick" onClick={() => void loadSongs()}><RefreshCw size={16} /> Dobara try karo</button>
          </div>
        )}
        {songsState === 'ready' && songs.length === 0 && <div className="ht-note">Phone me koi gaana (MP3) nahi mila.</div>}
        {songsState === 'ready' && songs.length > 0 && filteredSongs.length === 0 && <div className="ht-note">Is naam ka koi gaana nahi mila.</div>}

        <div>
          {filteredSongs.map(song => (
            <div key={song.id} className="ht-song">
              <button
                type="button"
                className="ht-icon-button"
                style={{ width: 42, height: 42, borderRadius: 13 }}
                onClick={() => toggleListSong(song)}
                aria-label={listPlayingId === song.id ? `${song.title} roko` : `${song.title} suno`}
              >
                {listPlayingId === song.id ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <div className="ht-copy">
                <strong>{song.title}</strong>
                <span>{[song.artist, song.durationMs ? formatTime(song.durationMs / 1000) : ''].filter(Boolean).join(' · ') || song.fileName}</span>
              </div>
              <button type="button" className="ht-select" onClick={() => void selectSong(song)} disabled={!!selectingId}>
                {selectingId === song.id ? <Loader2 size={15} className="animate-spin" /> : 'Select'}
              </button>
            </div>
          ))}
        </div>

        {(!isNative || songsState === 'denied' || songsState === 'error' || (songsState === 'ready' && songs.length === 0)) && (
          <button type="button" className="ht-pick" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Phone se gaane chuno
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus" multiple hidden onChange={handlePickFiles} />
      </main>

      {draft && (
        <section className="ht-editor" aria-label="Gaane me jagah chuno">
          <header className="ht-header">
            <button type="button" className="ht-icon-button" onClick={closeEditor} aria-label="Wapas gaano ki list"><ArrowLeft size={19} /></button>
            <div className="ht-heading"><strong>Jagah chuno</strong><span>Jahan se acha lage wahan se lagao</span></div>
          </header>
          <div className="ht-editor-body">
            <div className="ht-hero">
              <div className="ht-art"><Music size={24} /></div>
              <div className="ht-copy">
                <strong style={{ fontSize: 16 }}>{draft.title}</strong>
                <span>{draft.artist} · {formatTime(player.duration)}</span>
              </div>
            </div>

            <input
              className="ht-range"
              type="range"
              min={0}
              max={Math.max(1, Math.floor(player.duration))}
              step={1}
              value={Math.floor(player.pos)}
              onChange={event => { setConfirmStart(null); player.seek(Number(event.target.value)); }}
              aria-label="Gaane me aage-peeche karo"
            />
            <div className="ht-times"><span>{formatTime(player.pos)}</span><span>{formatTime(player.duration)}</span></div>

            <div className="ht-controls">
              <button type="button" className="ht-skip" onClick={() => { setConfirmStart(null); player.seek(player.getPos() - 10); }}>-10s</button>
              <button type="button" className="ht-play" onClick={player.toggle} aria-label={player.playing ? 'Roko' : 'Chalao'}>
                {player.playing ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: 3 }} />}
              </button>
              <button type="button" className="ht-skip" onClick={() => { setConfirmStart(null); player.seek(player.getPos() + 10); }}>+10s</button>
            </div>

            <div className="ht-clip">Caller ko <b>{formatTime(startHere)} – {formatTime(startHere + clipLength)}</b> sunai dega</div>

            {confirmStart === null ? (
              <button type="button" className="ht-set" onClick={() => setConfirmStart(clampStart(player.getPos()))} disabled={isSaving}>
                <Check size={17} /> Yahan se lagao ({formatTime(startHere)})
              </button>
            ) : (
              <div className="ht-confirm">
                <p>"{draft.title}" <b>{formatTime(confirmStart)}</b> se Hello Tune lagayein? 30 din baad apne aap hat jayegi.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="ht-cancel" onClick={() => setConfirmStart(null)} disabled={isSaving}>Cancel</button>
                  <button type="button" className="ht-set" style={{ flex: 1 }} onClick={() => void handleSave()} disabled={isSaving}>
                    {isSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Check size={16} /> Confirm</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
