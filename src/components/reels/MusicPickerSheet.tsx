import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Bookmark, Play, Pause, Loader2, Music2, MapPin, ChevronDown, Check } from 'lucide-react';
import {
  searchMusic,
  getTrendingMusic,
  formatMusicDuration,
  getDefaultMusicLocale,
  detectMusicLocale,
  setManualMusicLocale,
  POPULAR_REGIONS,
  type MusicLocale,
  type MusicTrack,
} from '@/services/music';
import { getSavedSongs, saveSong, unsaveSong } from '@/services/savedSongs';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** User ne gana "Add" kiya — trimmer khulega */
  onSelect: (track: MusicTrack) => void;
}

type Tab = 'discover' | 'saved';

const MusicPickerSheet: React.FC<Props> = ({ open, onClose, onSelect }) => {
  const [tab, setTab] = useState<Tab>('discover');
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [saved, setSaved] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<MusicLocale>(() => getDefaultMusicLocale());
  const [locationLoading, setLocationLoading] = useState(false);
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Detect location once per picker session. GPS coordinates are never stored;
  // only the country/state label and music terms are cached.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLocationLoading(true);
    detectMusicLocale()
      .then((detected) => {
        if (active) setLocale(detected);
      })
      .finally(() => {
        if (active) setLocationLoading(false);
      });
    getSavedSongs().then(setSaved);
    return () => {
      active = false;
    };
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const ac = new AbortController();
    if (!q) {
      setLoading(true);
      getTrendingMusic(ac.signal, locale)
        .then((list) => {
          if (!ac.signal.aborted) setTracks(list);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
      return () => ac.abort();
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchMusic(q, ac.signal, locale)
        .then((list) => {
          if (!ac.signal.aborted) setTracks(list);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 280);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, open, locale]);

  // Stop preview audio when sheet closes
  useEffect(() => {
    if (open) return;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, [open]);

  const savedIds = useMemo(() => new Set(saved.map((s) => s.id)), [saved]);
  const list = tab === 'saved' ? saved : tracks;

  const togglePreview = (track: MusicTrack) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(track.previewUrl);
    audio.play().catch(() => toast.error('Preview play nahi ho paya'));
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(track.id);
  };

  const toggleSave = async (track: MusicTrack) => {
    if (savedIds.has(track.id)) {
      await unsaveSong(track.id);
      setSaved((prev) => prev.filter((s) => s.id !== track.id));
      toast.success('Song removed from saved');
    } else {
      await saveSong(track);
      setSaved((prev) => [track, ...prev]);
      toast.success('Song saved 🎵');
    }
  };

  const handleAdd = (track: MusicTrack) => {
    audioRef.current?.pause();
    setPlayingId(null);
    onSelect(track);
  };

  const handleSelectRegion = (reg: typeof POPULAR_REGIONS[0]) => {
    const newLoc: MusicLocale = {
      countryCode: reg.countryCode,
      countryName: reg.countryName,
      regionName: reg.regionName,
      localTerms: reg.regionName ? [`${reg.regionName} latest songs`, `${reg.regionName} hit songs`] : [`${reg.countryName} latest songs`],
      source: 'location',
    };
    setManualMusicLocale(newLoc);
    setLocale(newLoc);
    setShowRegionModal(false);
    toast.success(`Music region set to ${reg.name} 🎵`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-white/10">
            <X className="w-5 h-5 text-white" />
          </button>
          <h2 className="flex-1 text-base font-bold text-white">Add music</h2>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/55" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTab('discover');
            }}
            placeholder="Search songs, artists, singers…"
            className="w-full h-10 pl-9 pr-9 rounded-full bg-white/10 text-sm text-white placeholder:text-white/45 outline-none focus:ring-2 focus:ring-primary/40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Region & Location Selector */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowRegionModal(true)}
            className="flex items-center gap-1.5 text-xs text-white/80 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full active:scale-95 transition-all max-w-[280px]"
          >
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate font-medium">
              {locationLoading
                ? 'Finding music near you…'
                : `${locale.regionName ? `${locale.regionName}, ` : ''}${locale.countryName}`}
            </span>
            <ChevronDown className="w-3 h-3 text-white/50 shrink-0 ml-0.5" />
          </button>

          <span className="text-[11px] text-white/40 font-medium">
            {query.trim() ? `${list.length} results` : 'Trending'}
          </span>
        </div>

        <div className="flex gap-2">
          {(['discover', 'saved'] as Tab[]).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                tab === tb ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-white/55'
              }`}
            >
              {tb === 'discover' ? (query.trim() ? 'All Results' : 'For you') : `Saved${saved.length ? ` · ${saved.length}` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-24">
        {loading && list.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-white/55" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-8">
            <Music2 className="w-8 h-8 text-white/55" />
            <p className="text-sm text-white/55">
              {tab === 'saved' ? 'Abhi koi saved song nahi hai.' : 'Koi gana nahi mila. Dusra naam search karo.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/8">
            {list.map((track) => (
              <li key={track.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                <button
                  onClick={() => togglePreview(track)}
                  className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0"
                >
                  {track.artwork ? (
                    <img src={track.artwork} alt={track.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music2 className="w-5 h-5 text-white/55" />
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                    {playingId === track.id ? (
                      <Pause className="w-4 h-4 text-white" />
                    ) : (
                      <Play className="w-4 h-4 text-white" />
                    )}
                  </span>
                </button>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleAdd(track)}>
                  <p className="text-sm font-semibold text-white truncate">{track.title}</p>
                  <p className="text-xs text-white/55 truncate">
                    {track.artist} · {formatMusicDuration(track.durationMs)}
                  </p>
                </div>

                <button onClick={() => toggleSave(track)} className="p-2 shrink-0">
                  <Bookmark
                    className={`w-5 h-5 ${savedIds.has(track.id) ? 'fill-primary text-primary' : 'text-white/55'}`}
                  />
                </button>

                <button
                  onClick={() => handleAdd(track)}
                  className="shrink-0 h-8 px-4 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[hsl(var(--p1))] to-[hsl(var(--p2))] active:scale-95 transition-transform"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Region Selector Modal */}
      {showRegionModal && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowRegionModal(false)}
        >
          <div
            className="w-full max-w-lg bg-zinc-900 border-t border-white/10 rounded-t-3xl overflow-hidden p-5 space-y-4 max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Select Music Region / State
              </h3>
              <button onClick={() => setShowRegionModal(false)} className="p-1 rounded-full text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-1.5 flex-1 pr-1">
              {POPULAR_REGIONS.map((reg) => {
                const isSelected =
                  reg.regionName
                    ? locale.regionName === reg.regionName
                    : locale.countryCode === reg.countryCode && !locale.regionName;
                return (
                  <button
                    key={reg.id}
                    onClick={() => handleSelectRegion(reg)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors ${
                      isSelected ? 'bg-primary/20 text-white font-semibold' : 'bg-white/5 text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-sm">{reg.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicPickerSheet;
